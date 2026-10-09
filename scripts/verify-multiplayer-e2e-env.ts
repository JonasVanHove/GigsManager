import fs from "node:fs";
import dotenv from "dotenv";

const envFile = ".env.test.local";
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

const required = [
  "E2E_ENVIRONMENT",
  "E2E_ALLOW_MUTATIONS",
  "E2E_ISOLATED_DATABASE",
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_ACCOUNT_A_EMAIL",
  "E2E_ACCOUNT_A_PASSWORD",
  "E2E_ACCOUNT_B_EMAIL",
  "E2E_ACCOUNT_B_PASSWORD",
  "E2E_ACCOUNT_C_EMAIL",
  "E2E_ACCOUNT_C_PASSWORD",
] as const;

const missing = required.filter((name) => !process.env[name]?.trim());
const failures: string[] = missing.map((name) => `missing ${name}`);

const environment = process.env.E2E_ENVIRONMENT;
if (environment !== "local" && environment !== "isolated") {
  failures.push("E2E_ENVIRONMENT must be local or isolated");
}
if (process.env.E2E_ALLOW_MUTATIONS !== "1") {
  failures.push("E2E_ALLOW_MUTATIONS must be 1");
}
if (process.env.E2E_ISOLATED_DATABASE !== "1") {
  failures.push("E2E_ISOLATED_DATABASE must be 1");
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL");
    return "";
  }
}

function databaseHostname(value: string, name: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    failures.push(`${name} must be a valid PostgreSQL URL`);
    return "";
  }
}

function isLocalHost(host: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? hostname(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : "";
const baseHost = process.env.PLAYWRIGHT_BASE_URL
  ? hostname(process.env.PLAYWRIGHT_BASE_URL)
  : "";
const databaseHost = process.env.DATABASE_URL
  ? databaseHostname(process.env.DATABASE_URL, "DATABASE_URL")
  : "";
const directHost = process.env.DIRECT_URL
  ? databaseHostname(process.env.DIRECT_URL, "DIRECT_URL")
  : "";
const forbiddenHosts = ["gigsmanager.app", "gigsmanager.netlify.app"];

for (const host of [supabaseHost, baseHost]) {
  if (forbiddenHosts.some((forbidden) => host === forbidden || host.endsWith(`.${forbidden}`))) {
    failures.push("production host detected in E2E configuration");
  }
}

if (environment === "local") {
  if (supabaseHost && !isLocalHost(supabaseHost)) {
    failures.push("local E2E mode requires NEXT_PUBLIC_SUPABASE_URL to use localhost");
  }
  if (databaseHost && !isLocalHost(databaseHost)) {
    failures.push("local E2E mode requires DATABASE_URL to use localhost");
  }
  if (directHost && !isLocalHost(directHost)) {
    failures.push("local E2E mode requires DIRECT_URL to use localhost");
  }
  if (baseHost && !isLocalHost(baseHost)) {
    failures.push("local E2E mode requires PLAYWRIGHT_BASE_URL to use localhost");
  }
} else if (supabaseHost && !isLocalHost(supabaseHost)) {
  const projectRef = supabaseHost.split(".")[0];
  const database = process.env.DATABASE_URL || "";
  const direct = process.env.DIRECT_URL || "";
  if (!database.includes(projectRef) || !direct.includes(projectRef)) {
    failures.push("DATABASE_URL and DIRECT_URL do not contain the Supabase project reference");
  }
}

if (failures.length > 0) {
  console.error("Multiplayer E2E preflight failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  console.error(`Create ${envFile} from .env.test.example or set equivalent process variables.`);
  process.exit(1);
}

console.log(`Multiplayer E2E preflight passed: ${environment} configuration detected; secret values withheld.`);
