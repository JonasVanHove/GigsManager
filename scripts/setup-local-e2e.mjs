import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envPath = path.join(root, ".env.test.local");
const accounts = [
  { email: "test-a@gigsmanager.local", password: "LocalTestPassword123!" },
  { email: "test-b@gigsmanager.local", password: "LocalTestPassword123!" },
  { email: "test-c@gigsmanager.local", password: "LocalTestPassword123!" },
];

function parseEnvOutput(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function readSupabaseEnv() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["--yes", "supabase", "status", "-o", "env"];
  const candidates = [
    process.env.SUPABASE_LOCAL_WORKDIR,
    root,
    process.env.USERPROFILE,
    process.env.HOME,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  let output = "";
  let lastError = "";

  for (const cwd of candidates) {
    try {
      output = execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      break;
    } catch (error) {
      lastError = error?.stderr?.toString?.().trim() || "";
    }
  }

  if (!output) {
    throw new Error(lastError || `supabase status -o env failed in: ${candidates.join(", ")}`);
  }

  const values = parseEnvOutput(output);
  const apiUrl = values.API_URL || values.SUPABASE_URL || "http://127.0.0.1:54321";
  const anonKey = values.ANON_KEY || values.PUBLISHABLE_KEY || values.SUPABASE_ANON_KEY;
  const serviceKey = values.SERVICE_ROLE_KEY || values.SECRET_KEY || values.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = values.DB_URL || values.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  if (!anonKey || !serviceKey) {
    throw new Error("supabase status did not expose local anon and service-role keys.");
  }
  if (!apiUrl.includes("127.0.0.1") && !apiUrl.includes("localhost")) {
    throw new Error("Refusing non-local Supabase API URL.");
  }

  return {
    apiUrl,
    anonKey,
    serviceKey,
    databaseUrl,
  };
}

function writeTestEnv(config) {
  const lines = [
    "# Generated locally by npm run e2e:local-setup; never commit this file.",
    "E2E_ENVIRONMENT=local",
    "E2E_ALLOW_MUTATIONS=1",
    "E2E_ISOLATED_DATABASE=1",
    `NEXT_PUBLIC_SUPABASE_URL=${config.apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${config.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${config.serviceKey}`,
    `DATABASE_URL=${config.databaseUrl}`,
    "DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    `E2E_ACCOUNT_A_EMAIL=${accounts[0].email}`,
    `E2E_ACCOUNT_A_PASSWORD=${accounts[0].password}`,
    `E2E_ACCOUNT_B_EMAIL=${accounts[1].email}`,
    `E2E_ACCOUNT_B_PASSWORD=${accounts[1].password}`,
    `E2E_ACCOUNT_C_EMAIL=${accounts[2].email}`,
    `E2E_ACCOUNT_C_PASSWORD=${accounts[2].password}`,
    "",
  ];
  fs.writeFileSync(envPath, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
}

function applyLocalSchema(config) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(command, ["--yes", "prisma", "db", "push"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: config.databaseUrl,
      DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
    shell: process.platform === "win32",
    stdio: "ignore",
  });
}

async function ensureAccounts(config) {
  const admin = createClient(config.apiUrl, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = [];

  for (const account of accounts) {
    const created = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (!created.error) {
      result.push(`${account.email}: created`);
      continue;
    }

    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listed.data.users.find(
      (user) => user.email?.toLowerCase() === account.email.toLowerCase()
    );
    if (!existing) {
      throw new Error(`Could not create ${account.email} in local Supabase Auth.`);
    }

    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password: account.password,
      email_confirm: true,
    });
    if (updated.error) {
      throw new Error(`Could not update ${account.email} in local Supabase Auth.`);
    }
    result.push(`${account.email}: reset`);
  }
  return result;
}

try {
  const config = readSupabaseEnv();
  writeTestEnv(config);
  applyLocalSchema(config);
  const accountResults = await ensureAccounts(config);
  console.log("Local E2E environment configured; secret values withheld.");
  console.log(`Updated ${path.basename(envPath)} and ensured ${accountResults.length} local Auth accounts.`);
} catch (error) {
  console.error(`Local E2E setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
