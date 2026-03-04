import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let db: ReturnType<typeof createDb> | null = null;

function createDb(url?: string) {
  const dbPath = url || process.env.DATABASE_URL || "./data/jobscout.db";
  const sqlite = new Database(dbPath);

  // Performance PRAGMAs
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("cache_size = -20000"); // 20MB
  sqlite.pragma("mmap_size = 268435456"); // 256MB

  return drizzle(sqlite, { schema });
}

export function getDb(url?: string) {
  if (!db) {
    db = createDb(url);
  }
  return db;
}

export type AppDb = ReturnType<typeof getDb>;
