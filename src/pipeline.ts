import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

import type { CandidateProfile, RawJobListing } from "@shared/types.js";

import type { BaseAdapter } from "./adapters/base.js";
import type { AppDb } from "./db/index.js";
import {
  candidates as candidatesTable,
  jobPostings,
  matchResults,
  sources,
} from "./db/schema.js";
import { dedup } from "./matching/dedup.js";
import { evaluateMatch } from "./matching/llm.js";
import { prefilterAgainstAllProfiles } from "./matching/prefilter.js";
import { logger } from "./utils/logger.js";

/** A RawJobListing tagged with the adapter's sourceId for DB attribution */
type TaggedListing = RawJobListing & { _sourceId: string };

export interface PipelineResult {
  totalFetched: number;
  totalNew: number;
  totalDuplicate: number;
  totalPrefiltered: number;
  totalMatched: number;
  matchesByCandidate: Record<
    string,
    { count: number; topScore: number }
  >;
  errors: string[];
  durationMs: number;
}

export interface PipelineOptions {
  db: AppDb;
  adapters: BaseAdapter[];
  candidates: Array<{
    id: string;
    name: string;
    profile: CandidateProfile;
  }>;
  anthropicClient: Anthropic;
  dryRun?: boolean;
  minConfidence?: number;
  scheduledRun?: boolean;
}

export async function runPipeline(
  options: PipelineOptions
): Promise<PipelineResult> {
  const {
    db,
    adapters,
    anthropicClient,
    dryRun = false,
    minConfidence = 0,
    scheduledRun = false,
  } = options;
  const start = Date.now();

  // For scheduled runs, filter to only active candidates
  let candidates = options.candidates;
  if (scheduledRun) {
    const activeCandidateIds = new Set(
      db
        .select({ id: candidatesTable.id })
        .from(candidatesTable)
        .where(eq(candidatesTable.isActive, true))
        .all()
        .map((row) => row.id)
    );
    candidates = candidates.filter((c) => activeCandidateIds.has(c.id));
    logger.info(
      { total: options.candidates.length, active: candidates.length },
      "Pipeline: filtered to active candidates for scheduled run"
    );
  }

  const errors: string[] = [];
  const allListings: TaggedListing[] = [];

  // Ensure candidates exist in DB (upsert)
  for (const candidate of candidates) {
    const existing = db
      .select()
      .from(candidatesTable)
      .where(eq(candidatesTable.id, candidate.id))
      .get();
    if (!existing) {
      db.insert(candidatesTable)
        .values({
          id: candidate.id,
          name: candidate.name,
          profileData: candidate.profile,
          isActive: true,
        })
        .run();
    }
  }

  // Sync adapter configs into the sources table (upsert)
  for (const adapter of adapters) {
    const existing = db
      .select()
      .from(sources)
      .where(eq(sources.id, adapter.sourceId))
      .get();

    if (existing) {
      db.update(sources)
        .set({ name: adapter.name, isEnabled: adapter.isEnabled })
        .where(eq(sources.id, adapter.sourceId))
        .run();
    } else {
      db.insert(sources)
        .values({
          id: adapter.sourceId,
          name: adapter.name,
          type: adapter.type,
          config: adapter.sourceConfig,
          isEnabled: adapter.isEnabled,
        })
        .run();
    }
  }

  // 1. Fetch from all adapters
  for (const adapter of adapters) {
    try {
      const listings = await adapter.fetch();
      // Tag each listing with the adapter's sourceId
      for (const listing of listings) {
        allListings.push({ ...listing, _sourceId: adapter.sourceId });
      }
      logger.info(
        { source: adapter.name, count: listings.length },
        "Pipeline: adapter fetched"
      );

      // Update source status on success (always, even in dry-run — adapters still fetch)
      db.update(sources)
        .set({
          lastRunAt: new Date().toISOString(),
          lastRunStatus: "success",
          lastRunItems: listings.length,
          lastRunErrors: null,
        })
        .where(eq(sources.id, adapter.sourceId))
        .run();
    } catch (err) {
      const msg = `${adapter.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error(
        { err, source: adapter.name },
        "Pipeline: adapter failed"
      );

      // Update source status on failure (always, even in dry-run — adapters still fetch)
      db.update(sources)
        .set({
          lastRunAt: new Date().toISOString(),
          lastRunStatus: "error",
          lastRunItems: 0,
          lastRunErrors: err instanceof Error ? err.message : String(err),
        })
        .where(eq(sources.id, adapter.sourceId))
        .run();
    }
  }

  const totalFetched = allListings.length;

  // 2. Deduplicate (TaggedListing's _sourceId survives the spread in dedup)
  const { newListings: rawNewListings, duplicateCount } = dedup(
    allListings,
    db,
    "pipeline"
  );
  const newListings = rawNewListings as Array<
    TaggedListing & { dedupeHash: string }
  >;

  // 3. Store new job postings in DB and track IDs
  const postingIds = new Map<string, string>();
  if (!dryRun) {
    for (const listing of newListings) {
      const id = crypto.randomUUID();
      db.insert(jobPostings)
        .values({
          id,
          sourceId: listing._sourceId,
          sourceUrl: listing.sourceUrl,
          title: listing.title,
          company: listing.company,
          location: listing.location,
          description: listing.description,
          descriptionHtml: listing.descriptionHtml,
          salaryRaw: listing.salaryRaw,
          salaryMin: listing.salaryMin ?? null,
          salaryMax: listing.salaryMax ?? null,
          salaryUnit: listing.salaryUnit ?? null,
          employmentType: listing.employmentType,
          postedDate:
            listing.postedDate && !isNaN(listing.postedDate.getTime())
              ? listing.postedDate.toISOString()
              : undefined,
          dedupeHash: listing.dedupeHash,
          isActive: true,
        })
        .run();
      postingIds.set(listing.sourceUrl, id);
    }
  }

  // 4. Pre-filter and LLM match
  let totalPrefiltered = 0;
  let totalMatched = 0;
  const matchesByCandidate: Record<
    string,
    { count: number; topScore: number }
  > = {};

  for (const listing of newListings) {
    const matchingCandidates = prefilterAgainstAllProfiles(
      listing,
      candidates.map((c) => c.profile)
    );

    if (matchingCandidates.length === 0) {
      totalPrefiltered++;
      continue;
    }

    // Find the candidate objects that matched
    const candidateMatches = candidates.filter((c) =>
      matchingCandidates.some(
        (mc) => mc.identity.name === c.profile.identity.name
      )
    );

    const jobPostingId = postingIds.get(listing.sourceUrl);
    if (!jobPostingId) continue;

    for (const candidate of candidateMatches) {
      if (dryRun) continue;

      const llmResult = await evaluateMatch(
        listing,
        candidate.profile,
        anthropicClient
      );

      if (!llmResult) continue;
      if (llmResult.confidenceScore < minConfidence) {
        logger.debug(
          {
            title: listing.title,
            score: llmResult.confidenceScore,
            threshold: minConfidence,
          },
          "Pipeline: match below threshold"
        );
        continue;
      }

      db.insert(matchResults)
        .values({
          id: crypto.randomUUID(),
          jobPostingId,
          candidateId: candidate.id,
          confidenceScore: llmResult.confidenceScore,
          payScore: llmResult.categoryScores.pay,
          scheduleScore: llmResult.categoryScores.schedule,
          locationScore: llmResult.categoryScores.location,
          skillsScore: llmResult.categoryScores.skills,
          cultureScore: llmResult.categoryScores.culture,
          summary: llmResult.summary,
          flags: llmResult.flags,
          modelUsed: "claude-haiku-4-5",
          status: "new",
        })
        .run();

      totalMatched++;

      if (!matchesByCandidate[candidate.name]) {
        matchesByCandidate[candidate.name] = {
          count: 0,
          topScore: 0,
        };
      }
      matchesByCandidate[candidate.name].count++;
      matchesByCandidate[candidate.name].topScore = Math.max(
        matchesByCandidate[candidate.name].topScore,
        llmResult.confidenceScore
      );
    }
  }

  return {
    totalFetched,
    totalNew: newListings.length,
    totalDuplicate: duplicateCount,
    totalPrefiltered,
    totalMatched,
    matchesByCandidate,
    errors,
    durationMs: Date.now() - start,
  };
}
