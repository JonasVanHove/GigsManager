/**
 * Repairs Prisma migration drift on a database that was previously managed with
 * `prisma db push` (or where a migration failed halfway).
 *
 * Problem
 * -------
 * When columns already exist, `prisma migrate deploy` fails with
 * "column already exists" and records the migration as started-but-not-finished,
 * which blocks EVERY later migration from ever running.
 *
 * Approach
 * --------
 * For each pending migration we ask the database itself what it already has
 * (information_schema / pg_catalog) and compare that with what the migration
 * would create (parseprisma/schema.prisma):
 *
 *   - everything already present  -> `prisma migrate resolve --applied`
 *   - nothing present             -> left pending, so `migrate deploy` runs it
 *   - partially present           -> reported, NOT auto-resolved (needs a human)
 *
 * It only ever marks migrations as *applied*; it never writes schema. Run
 * `npm run db:migrate:repair` and then `npm run db:migrate:deploy`.
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");

const APPLY = "--apply";

type ModelColumns = Record<string, Set<string>>;
type Drift = {
  migration: string;
  verdict: "applied" | "pending" | "partial";
  details: string[];
};

function createPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Every model in schema.prisma -> the column names it declares. */
function parseSchemaColumns(schema: string): ModelColumns {
  const models: ModelColumns = {};
  const modelBlocks = schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, modelName, body = ""] of modelBlocks) {
    const columns = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const match = line.match(/^([A-Za-z_]\w*)\s+/);
      if (match && match[1]) columns.add(match[1]);
    }
    models[modelName] = columns;
  }
  return models;
}

/**
 * What each migration adds, derived from its SQL rather than hardcoded:
 *  - ADD COLUMN "<col>"      -> column
 *  - CREATE TABLE "<name>"   -> table (plus its columns, one level deep)
 */
type MigrationImpact = { tables: Set<string>; columns: Array<{ table: string; column: string }> };

function parseMigrationSql(sql: string): MigrationImpact {
  const tables = new Set<string>();
  const columns: Array<{ table: string; column: string }> = [];

  for (const match of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
    const [, table = "", body = ""] = match;
    tables.add(table);
    for (const line of body.split("\n")) {
      const col = line.trim().match(/^"?(\w+)"?\s+\w/);
      if (col && col[1]) columns.push({ table, column: col[1] });
    }
  }

  // A single ALTER TABLE can add several columns:
  //   ALTER TABLE "Gig" ADD COLUMN "a" TEXT, ADD COLUMN "b" TEXT;
  // Scanning the whole statement body finds ALL of them. Matching the statement
  // once would only ever find the first column, which could mark a migration as
  // applied while its remaining columns are still missing from the database.
  for (const match of sql.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+([\s\S]*?);/gi)) {
    const [, table = "", body = ""] = match;
    if (!table) continue;
    for (const columnMatch of body.matchAll(
      /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?/gi
    )) {
      if (columnMatch[1]) columns.push({ table, column: columnMatch[1] });
    }
  }

  return { tables, columns };
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes(APPLY);
  const schema = parseSchemaColumns(readFileSync(SCHEMA_PATH, "utf-8"));

  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const prisma = createPrisma();
  const resolvable: string[] = [];

  try {
    const history: Array<{ migration_name: string; finished: boolean; rolled_back: boolean }> =
      await prisma.$queryRawUnsafe(
        'SELECT migration_name, (finished_at IS NOT NULL) AS finished, (rolled_back_at IS NOT NULL) AS rolled_back FROM "_prisma_migrations"'
      );

    const byName = new Map<string, { finished: boolean; rolled_back: boolean }>();
    for (const row of history) {
      const prev = byName.get(row.migration_name);
      // A rolled-back attempt should not mask a later successful one.
      if (!prev || (prev.rolled_back && !row.rolled_back)) {
        byName.set(row.migration_name, { finished: row.finished, rolled_back: row.rolled_back });
      }
    }

    console.log(`\n🔍 GigsManager — migration drift report`);
    console.log(`   Database: ${(process.env.DIRECT_URL || process.env.DATABASE_URL || "").replace(/:[^:@/]*@/, ":***@")}\n`);

    for (const name of dirs) {
      const state = byName.get(name);
      if (state?.finished && !state.rolled_back) continue; // healthy

      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf-8");
      const impact = parseMigrationSql(sql);
      const details: string[] = [];
      let missing = 0;

      for (const column of impact.columns) {
        const exists = await columnExists(prisma, column.table, column.column);
        if (exists) {
          details.push(`      = ${column.table}.${column.column} bestaat al`);
        } else {
          missing += 1;
          details.push(`      + ${column.table}.${column.column} ontbreekt`);
        }
      }

      for (const table of impact.tables) {
        const exists = await tableExists(prisma, table);
        details.push(`      ${exists ? "=" : "+"} tabel ${table} ${exists ? "bestaat al" : "ontbreekt"}`);
      }

      if (impact.columns.length === 0 && impact.tables.size === 0) {
        // Data-only migration (e.g. RLS policies): nothing structural to verify.
        console.log(`   ?  ${name}`);
        console.log(`      geen controleerbare DDL (data-only?) — laat de database beslissen`);
        continue;
      }

      const verdict: Drift["verdict"] = missing === 0 ? "applied" : details.some((d) => d.includes("ontbreekt")) ? "pending" : "pending";
      const drift: Drift = { migration: name, verdict, details };

      console.log(`   ${verdict === "applied" ? "=" : "→"} ${name}  ${state ? "(half uitgevoerd)" : "(nooit gestart)"}`);
      details.forEach((line) => console.log(line));

      if (verdict === "applied") resolvable.push(name);
      console.log("");
    }

    if (resolvable.length === 0) {
      console.log("   ✅ Geen migraties te resolven — `prisma migrate deploy` kan gewoon draaien.\n");
      return;
    }

    if (!apply) {
      console.log("   ℹ️  DRY-RUN. Draai met --apply om deze migraties als 'applied' te markeren:\n");
      console.log(`      npm run db:migrate:repair -- ${APPLY}\n`);
      console.log("   Of handmatig, in deze volgorde:");
      resolvable.forEach((name) => console.log(`      npx prisma migrate resolve --applied ${name}`));
      console.log("");
      return;
    }

    console.log("   🔧 Migraties markeren als applied …");
    const { execFileSync } = await import("node:child_process");

    // Invoke the Prisma CLI through node directly instead of `npx`.
    // On Windows `npx` is `npx.cmd`, which `execFileSync` cannot spawn without
    // a shell — that failed with ENOENT and left the migration un-resolved.
    const prismaCli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
    if (!existsSync(prismaCli)) {
      throw new Error(
        `Prisma CLI not found at ${prismaCli}. Run npm install before using --apply.`
      );
    }

    for (const name of resolvable) {
      execFileSync(process.execPath, [prismaCli, "migrate", "resolve", "--applied", name], {
        stdio: "inherit",
        cwd: ROOT,
      });
    }

    console.log("\n   ✅ Klaar. Draai nu: npx prisma migrate deploy\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n❌ repair-migration-history failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

async function columnExists(prisma: PrismaClient, table: string, column: string): Promise<boolean> {
  const rows: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
    "public",
    table,
    column
  );
  return rows.length > 0;
}

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
    "public",
    table
  );
  return rows.length > 0;
}
