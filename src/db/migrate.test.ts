import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers.js";
import { sources } from "./schema.js";

const MIGRATION = "src/db/migrations/0004_disable_retired_sources.sql";

describe("0004_disable_retired_sources", () => {
  it("disables the removed sources and leaves the others alone", () => {
    const db = createTestDb();
    for (const id of ["craigslist-pdx", "builtin-pdx", "macslist"]) {
      db.insert(sources)
        .values({ id, name: id, type: "scrape", config: {}, isEnabled: true })
        .run();
    }

    db.$client.exec(readFileSync(MIGRATION, "utf8"));

    const enabled = (id: string) =>
      db.select().from(sources).where(eq(sources.id, id)).get()?.isEnabled;
    expect(enabled("craigslist-pdx")).toBe(false);
    expect(enabled("builtin-pdx")).toBe(false);
    expect(enabled("macslist")).toBe(true);
  });
});
