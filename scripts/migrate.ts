import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import { seedDatabase } from "./seed";

const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";
const migrations = ["0000_phase0.sql"];

mkdirSync(dirname(databaseUrl), { recursive: true });

const sqlite = new Database(databaseUrl);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
`);

const hasMigration = sqlite
  .prepare("SELECT 1 FROM __migrations WHERE id = ?")
  .pluck();
const insertMigration = sqlite.prepare(
  "INSERT INTO __migrations (id) VALUES (?)",
);

for (const migration of migrations) {
  if (hasMigration.get(migration)) {
    continue;
  }

  const sql = readFileSync(join(process.cwd(), "drizzle", migration), "utf8");

  sqlite.transaction(() => {
    sqlite.exec(sql);
    insertMigration.run(migration);
  })();

  console.log(`Applied migration ${migration}`);
}

seedDatabase(sqlite);

sqlite.close();
