import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Guards the SQL parser used by scripts/repair-migration-history.ts.
 *
 * A false "applied" verdict silently skips a migration, which then breaks
 * `migrate deploy` for every later migration. The multi-column ALTER TABLE case
 * is the dangerous one: an earlier version of the parser only found the first
 * column and could therefore mark a migration applied while the other ten
 * columns were still missing.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function parseMigrationSql(sql: string) {
  const tables = new Set<string>();
  const columns: Array<{ table: string; column: string }> = [];

  for (const match of sql.matchAll(
    /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi
  )) {
    const [, table = "", body = ""] = match;
    tables.add(table);
    for (const line of body.split("\n")) {
      const col = line.trim().match(/^"?(\w+)"?\s+\w/);
      if (col && col[1]) columns.push({ table, column: col[1] });
    }
  }

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

describe("migration SQL parser", () => {
  it("finds every column of a multi-column ALTER TABLE", () => {
    const { columns } = parseMigrationSql(
      `ALTER TABLE "Gig"
  ADD COLUMN "a" TEXT,
  ADD COLUMN "b" TEXT,
  ADD COLUMN "c" INTEGER;`
    );
    expect(columns.map((c) => c.column)).toEqual(["a", "b", "c"]);
    expect(columns.every((c) => c.table === "Gig")).toBe(true);
  });

  it("handles several ALTER TABLE statements", () => {
    const { columns } = parseMigrationSql(
      `ALTER TABLE "A" ADD COLUMN "x" TEXT;
ALTER TABLE "B" ADD COLUMN "y" TEXT;`
    );
    expect(columns).toEqual([
      { table: "A", column: "x" },
      { table: "B", column: "y" },
    ]);
  });

  it("collects CREATE TABLE columns", () => {
    const { tables, columns } = parseMigrationSql(
      `CREATE TABLE "Thing" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    CONSTRAINT "Thing_pkey" PRIMARY KEY ("id")
);`
    );
    expect([...tables]).toEqual(["Thing"]);
    expect(columns.map((c) => c.column)).toEqual(["id", "name"]);
  });

  it("matches the real v1.30/v1.31 migrations", () => {
    const attachments = parseMigrationSql(
      readFileSync(
        path.join(MIGRATIONS_DIR, "202610010001_gig_attachments", "migration.sql"),
        "utf-8"
      )
    );
    // GigAttachment has 12 columns plus the two Gig columns.
    expect(attachments.columns.length).toBe(14);
    expect(attachments.tables.has("GigAttachment")).toBe(true);

    const logistics = parseMigrationSql(
      readFileSync(
        path.join(MIGRATIONS_DIR, "202611010001_gig_ai_logistics", "migration.sql"),
        "utf-8"
      )
    );
    expect(logistics.columns.length).toBe(11);

    const keyTempo = parseMigrationSql(
      readFileSync(
        path.join(MIGRATIONS_DIR, "202611010002_setlist_item_key_tempo", "migration.sql"),
        "utf-8"
      )
    );
    expect(keyTempo.columns).toEqual([
      { table: "SetlistItem", column: "keySignature" },
      { table: "SetlistItem", column: "bpm" },
    ]);
  });
});
