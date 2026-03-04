import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import type { CandidateProfile } from "@shared/types.js";

import type { AppDb } from "./db/index.js";
import { candidates } from "./db/schema.js";
import { logger } from "./utils/logger.js";

export interface LoadedCandidate {
  id: string;
  name: string;
  profile: CandidateProfile;
}

export async function loadCandidates(
  seedDir: string,
  db: AppDb
): Promise<LoadedCandidate[]> {
  const loaded: LoadedCandidate[] = [];

  let files: string[];
  try {
    files = fs
      .readdirSync(seedDir)
      .filter((f) => f.endsWith(".json"));
  } catch {
    logger.warn({ seedDir }, "Cannot read seed directory");
    return [];
  }

  for (const file of files) {
    try {
      const raw = fs.readFileSync(
        path.join(seedDir, file),
        "utf-8"
      );
      const profile = JSON.parse(raw) as CandidateProfile;
      const name = profile.identity?.name;

      if (!name) {
        logger.warn({ file }, "Skipping profile without name");
        continue;
      }

      // Check if candidate already exists
      const existing = db
        .select()
        .from(candidates)
        .where(eq(candidates.name, name))
        .get();

      let id: string;
      if (existing) {
        id = existing.id;
        db.update(candidates)
          .set({
            profileData: profile,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(candidates.id, id))
          .run();
      } else {
        id = crypto.randomUUID();
        db.insert(candidates)
          .values({
            id,
            name,
            profileData: profile,
            isActive: true,
          })
          .run();
      }

      loaded.push({ id, name, profile });
      logger.debug({ name, file }, "Loaded candidate profile");
    } catch (err) {
      logger.warn({ err, file }, "Skipping malformed profile");
    }
  }

  logger.info(
    { count: loaded.length },
    "Candidate profiles loaded"
  );
  return loaded;
}

/**
 * Load all active candidates from the database.
 * This picks up candidates created via the API, not just seed files.
 */
export function getActiveCandidates(db: AppDb): LoadedCandidate[] {
  const rows = db
    .select({
      id: candidates.id,
      name: candidates.name,
      profileData: candidates.profileData,
    })
    .from(candidates)
    .where(eq(candidates.isActive, true))
    .all();

  return rows
    .filter((row) => row.profileData != null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      profile: row.profileData as CandidateProfile,
    }));
}
