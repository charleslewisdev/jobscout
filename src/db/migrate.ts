import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDb } from "./index.js";

export function runMigrations(db: AppDb) {
  migrate(db, { migrationsFolder: "./src/db/migrations" });
}
