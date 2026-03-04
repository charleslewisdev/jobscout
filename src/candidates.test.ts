import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb } from "./test-helpers.js";
import { candidates } from "./db/schema.js";
import { getActiveCandidates, loadCandidates } from "./candidates.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jobscout-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeProfile(
  name: string,
  profile: Record<string, unknown>
) {
  fs.writeFileSync(
    path.join(tmpDir, `${name}.json`),
    JSON.stringify(profile)
  );
}

const VALID_PROFILE = {
  identity: { name: "Test Candidate" },
  compensation: { minimumPay: 17, payUnit: "hourly" },
  benefits: { required: [], niceToHave: [] },
  schedule: { remotePreference: "onsite" },
  location: { acceptableAreas: ["Portland"] },
  experience: { skills: ["warehouse"], yearsOfExperience: 2 },
  preferences: {
    targetRoles: ["warehouse worker"],
    targetIndustries: ["warehouse"],
  },
  dealbreakers: ["commission-only"],
};

describe("loadCandidates", () => {
  it("loads JSON profiles from seed directory", async () => {
    const db = createTestDb();
    writeProfile("candidate-1", VALID_PROFILE);

    const result = await loadCandidates(tmpDir, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Candidate");
    expect(result[0].profile.identity.name).toBe(
      "Test Candidate"
    );
  });

  it("inserts candidate into database", async () => {
    const db = createTestDb();
    writeProfile("candidate-1", VALID_PROFILE);

    await loadCandidates(tmpDir, db);

    const rows = db.select().from(candidates).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Test Candidate");
  });

  it("updates existing candidate on reload", async () => {
    const db = createTestDb();
    writeProfile("candidate-1", VALID_PROFILE);

    await loadCandidates(tmpDir, db);
    const updated = {
      ...VALID_PROFILE,
      compensation: { minimumPay: 20, payUnit: "hourly" as const },
    };
    writeProfile("candidate-1", updated);
    const result = await loadCandidates(tmpDir, db);

    const rows = db.select().from(candidates).all();
    expect(rows).toHaveLength(1);
    expect(result[0].profile.compensation.minimumPay).toBe(20);
  });

  it("loads multiple profiles", async () => {
    const db = createTestDb();
    writeProfile("candidate-1", VALID_PROFILE);
    writeProfile("candidate-2", {
      ...VALID_PROFILE,
      identity: { name: "Second Candidate" },
    });

    const result = await loadCandidates(tmpDir, db);

    expect(result).toHaveLength(2);
  });

  it("skips malformed JSON files gracefully", async () => {
    const db = createTestDb();
    writeProfile("good", VALID_PROFILE);
    fs.writeFileSync(
      path.join(tmpDir, "bad.json"),
      "not valid json {{{"
    );

    const result = await loadCandidates(tmpDir, db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Candidate");
  });

  it("returns empty array for empty directory", async () => {
    const db = createTestDb();

    const result = await loadCandidates(tmpDir, db);

    expect(result).toEqual([]);
  });
});

describe("getActiveCandidates", () => {
  it("returns candidates from database", () => {
    const db = createTestDb();
    db.insert(candidates)
      .values({
        id: "test-1",
        name: "DB Candidate",
        profileData: VALID_PROFILE,
        isActive: true,
      })
      .run();

    const result = getActiveCandidates(db);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-1");
    expect(result[0].name).toBe("DB Candidate");
    expect(result[0].profile.identity.name).toBe("Test Candidate");
  });

  it("excludes inactive candidates", () => {
    const db = createTestDb();
    db.insert(candidates)
      .values({
        id: "active-1",
        name: "Active",
        profileData: VALID_PROFILE,
        isActive: true,
      })
      .run();
    db.insert(candidates)
      .values({
        id: "inactive-1",
        name: "Inactive",
        profileData: VALID_PROFILE,
        isActive: false,
      })
      .run();

    const result = getActiveCandidates(db);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("includes both seed and API-created candidates", async () => {
    const db = createTestDb();
    writeProfile("seed-candidate", VALID_PROFILE);
    await loadCandidates(tmpDir, db);

    // Simulate API-created candidate
    db.insert(candidates)
      .values({
        id: "api-created",
        name: "API Candidate",
        profileData: {
          ...VALID_PROFILE,
          identity: { name: "API Candidate" },
        },
        isActive: true,
      })
      .run();

    const result = getActiveCandidates(db);

    expect(result).toHaveLength(2);
    const names = result.map((c) => c.name);
    expect(names).toContain("Test Candidate");
    expect(names).toContain("API Candidate");
  });

  it("returns empty array when no candidates exist", () => {
    const db = createTestDb();

    const result = getActiveCandidates(db);

    expect(result).toHaveLength(0);
  });
});
