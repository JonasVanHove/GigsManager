import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const envTestPath = path.resolve(process.cwd(), ".env.test.local");

function question(prompt, { secret = false } = {}) {
  if (!secret || !process.stdin.isTTY) {
    return new Promise((resolve) => rl.question(prompt, resolve));
  }

  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const value = chunk.toString();
      if (value.includes("\n")) {
        process.stdin.setRawMode(false);
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value.replace(/\r?\n$/, ""));
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.on("data", onData);
  });
}

function isProductionHost(value) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    return ["gigsmanager.app", "gigsmanager.netlify.app"].some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`)
    );
  } catch {
    return false;
  }
}

function requireUrl(value, label) {
  try {
    return new URL(value.trim()).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${label} moet een geldige URL zijn.`);
  }
}

function envLine(name, value) {
  return `${name}=${String(value).trim()}\n`;
}

async function questionWithDefault(prompt, defaultValue) {
  const answer = await question(`${prompt} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

async function run() {
  console.log("\nGigsManager lokale/geisoleerde E2E-testomgeving\n");
  console.log("Gebruik lokale services of een niet-productieproject en disposable accounts.\n");

  if (fs.existsSync(envTestPath)) {
    const overwrite = await question("Er bestaat al .env.test.local. Overschrijven? (y/N): ");
    if (overwrite.trim().toLowerCase() !== "y") {
      console.log("Geannuleerd.");
      return;
    }
  }

  try {
    const environment = (await questionWithDefault(
      "1. Modus (local = localhost, isolated = niet-productie remote)",
      "local"
    )).toLowerCase();
    if (environment !== "local" && environment !== "isolated") {
      throw new Error("Modus moet local of isolated zijn.");
    }

    const localDefaults = environment === "local";
    const supabaseUrl = requireUrl(
      await questionWithDefault(
        "2. Supabase API URL",
        localDefaults ? "http://127.0.0.1:54321" : "https://<test-project-ref>.supabase.co"
      ),
      "Supabase URL"
    );
    if (isProductionHost(supabaseUrl) || /(^|[./_-])(prod|production|live)([./_-]|$)/i.test(supabaseUrl)) {
      throw new Error("Productie- of live-URL gedetecteerd; configuratie geannuleerd.");
    }

    const supabaseAnonKey = await question("3. Supabase anon/public key: ");
    const supabaseServiceKey = await question("4. Supabase service-role key: ", { secret: true });
    const databaseUrl = await questionWithDefault(
      "5. DATABASE_URL",
      localDefaults ? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" : ""
    );
    const directUrl = await questionWithDefault(
      "6. DIRECT_URL",
      localDefaults ? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" : ""
    );

    const accounts = {};
    for (const [label, suffix] of [["A (band creator)", "A"], ["B (invitee)", "B"], ["C (isolation check)", "C"]]) {
      accounts[suffix] = {
        email: await question(`Account ${label} e-mail: `),
        password: await question(`Account ${label} wachtwoord: `, { secret: true }),
      };
    }

    if (!supabaseAnonKey.trim() || !supabaseServiceKey.trim()) {
      throw new Error("Anon key en service-role key zijn verplicht.");
    }
    if (!databaseUrl.trim() || !directUrl.trim()) {
      throw new Error("DATABASE_URL en DIRECT_URL zijn verplicht.");
    }
    if (Object.values(accounts).some(({ email, password }) => !email.trim() || !password)) {
      throw new Error("Alle drie testaccounts vereisen een e-mail en wachtwoord.");
    }

    const content = [
      "# Generated locally by npm run e2e:setup; never commit this file.",
      envLine("E2E_ENVIRONMENT", environment),
      envLine("E2E_ALLOW_MUTATIONS", "1"),
      envLine("E2E_ISOLATED_DATABASE", "1"),
      envLine("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
      envLine("NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey),
      envLine("SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey),
      envLine("DATABASE_URL", databaseUrl),
      envLine("DIRECT_URL", directUrl),
      envLine("E2E_ACCOUNT_A_EMAIL", accounts.A.email),
      envLine("E2E_ACCOUNT_A_PASSWORD", accounts.A.password),
      envLine("E2E_ACCOUNT_B_EMAIL", accounts.B.email),
      envLine("E2E_ACCOUNT_B_PASSWORD", accounts.B.password),
      envLine("E2E_ACCOUNT_C_EMAIL", accounts.C.email),
      envLine("E2E_ACCOUNT_C_PASSWORD", accounts.C.password),
    ].join("");

    fs.writeFileSync(envTestPath, `${content}\n`, { encoding: "utf8", mode: 0o600 });
    console.log("\n.env.test.local is aangemaakt. Secretwaarden zijn niet weergegeven.");
    console.log("Voer daarna npm run test:e2e:multiplayer uit; de preflight controleert de configuratie opnieuw.");
  } catch (error) {
    console.error(`\nSetup geannuleerd: ${error instanceof Error ? error.message : "ongeldige invoer"}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

run();
