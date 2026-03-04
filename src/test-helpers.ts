import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { CandidateProfile, RawJobListing } from "@shared/types.js";

import * as schema from "./db/schema.js";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  return db;
}

export function makePosting(
  overrides: Partial<RawJobListing> = {}
): RawJobListing {
  return {
    sourceUrl: "https://example.com/job/123",
    title: "Warehouse Worker",
    company: "Test Company",
    location: "Portland, OR",
    description:
      "A test job posting for a warehouse worker position.",
    ...overrides,
  };
}

export function makeProfile(
  overrides: Partial<CandidateProfile> = {}
): CandidateProfile {
  return {
    identity: { name: "Test Candidate" },
    compensation: { minimumPay: 17, payUnit: "hourly" },
    benefits: { required: [], niceToHave: [] },
    schedule: { remotePreference: "onsite" },
    location: { acceptableAreas: ["Portland"] },
    experience: { skills: ["warehouse"], yearsOfExperience: 2 },
    preferences: {
      targetRoles: ["warehouse worker"],
      targetIndustries: ["warehouse", "logistics"],
    },
    dealbreakers: ["commission-only", "MLM"],
    ...overrides,
  };
}
