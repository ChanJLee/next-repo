import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/server/auth/schema";

const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";

declare global {
  var __appDatabase: Database.Database | undefined;
}

function createClient() {
  const client = new Database(databaseUrl);

  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");

  return client;
}

export const sqlite = globalThis.__appDatabase ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__appDatabase = sqlite;
}

export const db = drizzle(sqlite, { schema });
