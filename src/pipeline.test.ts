import { describe, expect, it, vi } from "vitest";

import { createTestDb, makePosting, makeProfile } from "./test-helpers.js";
import { candidates as candidatesTable, jobPostings, matchResults, sources } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { BaseAdapter } from "./adapters/base.js";
import { runPipeline } from "./pipeline.js";

import type { RawJobListing, SourceConfig } from "@shared/types.js";

class MockAdapter extends BaseAdapter {
  private listings: RawJobListing[];

  constructor(config: SourceConfig, listings: RawJobListing[]) {
    super(config);
    this.listings = listings;
  }

  async fetch(): Promise<RawJobListing[]> {
    return this.listings;
  }
}

class FailingAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    throw new Error("Adapter failed");
  }
}

function makeAdapter(
  id: string,
  listings: RawJobListing[]
): MockAdapter {
  return new MockAdapter(
    {
      id,
      name: `Test ${id}`,
      type: "api",
      isEnabled: true,
      config: {},
    },
    listings
  );
}

/**
 * Create a mock Anthropic client. The `pay` parameter controls the pay score,
 * which heavily influences the computed confidence (35% weight).
 * Default scores: pay=80, rolefit=65, schedule=70, growth=60
 * Default confidence: 80×0.35 + 65×0.35 + 70×0.15 + 60×0.15 = 70
 */
function makeMockClient(pay = 80) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              categoryScores: {
                pay,
                schedule: 70,
                rolefit: 65,
                growth: 60,
              },
              summary: "Good match.",
              flags: [],
            }),
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as never;
}

function makeMockLowScoreClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              categoryScores: { pay: 10, schedule: 10, rolefit: 10, growth: 10 },
              summary: "Poor match.",
              flags: ["below minimum pay"],
            }),
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as never;
}

describe("runPipeline", () => {
  it("calls all registered adapters", async () => {
    const db = createTestDb();
    const adapter1 = makeAdapter("src-1", [
      makePosting({ sourceUrl: "https://a.com/1", title: "Job A" }),
    ]);
    const adapter2 = makeAdapter("src-2", [
      makePosting({ sourceUrl: "https://b.com/1", title: "Job B" }),
    ]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [adapter1, adapter2],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    expect(result.totalFetched).toBe(2);
  });

  it("deduplicates across adapter results", async () => {
    const db = createTestDb();
    const listing = makePosting({
      sourceUrl: "https://a.com/same",
    });
    const adapter1 = makeAdapter("src-1", [listing]);
    const adapter2 = makeAdapter("src-2", [listing]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [adapter1, adapter2],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    expect(result.totalNew).toBe(1);
    expect(result.totalDuplicate).toBe(1);
  });

  it("pre-filters against loaded candidates", async () => {
    const db = createTestDb();
    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        title: "Seattle Job",
        location: "Seattle, WA",
      }),
    ]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        {
          id: "c1",
          name: "Test",
          profile: makeProfile({
            location: { acceptableAreas: ["Portland"] },
          }),
        },
      ],
      anthropicClient: client,
    });

    expect(result.totalPrefiltered).toBe(1);
    expect(
      (client as any).messages.create
    ).not.toHaveBeenCalled();
  });

  it("calls LLM for surviving posting × candidate pairs", async () => {
    const db = createTestDb();
    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    const client = makeMockClient(80);

    const result = await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    expect(
      (client as any).messages.create
    ).toHaveBeenCalledTimes(1);
    expect(result.totalMatched).toBe(1);
  });

  it("stores job postings and match results in DB", async () => {
    const db = createTestDb();
    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    const client = makeMockClient(80);

    await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    const postings = db.select().from(jobPostings).all();
    expect(postings).toHaveLength(1);

    const matches = db.select().from(matchResults).all();
    expect(matches).toHaveLength(1);
    // Computed: pay(80×0.35) + rolefit(65×0.35) + sched(70×0.15) + growth(60×0.15) = 70
    expect(matches[0].confidenceScore).toBe(70);
  });

  it("skips LLM and match writes in dry-run mode", async () => {
    const db = createTestDb();
    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
      dryRun: true,
    });

    expect(
      (client as any).messages.create
    ).not.toHaveBeenCalled();
    expect(result.totalMatched).toBe(0);

    // Dry run skips DB writes entirely
    const postings = db.select().from(jobPostings).all();
    expect(postings).toHaveLength(0);
  });

  it("handles adapter failure gracefully", async () => {
    const db = createTestDb();
    const failingAdapter = new FailingAdapter({
      id: "failing",
      name: "Failing",
      type: "api",
      isEnabled: true,
      config: {},
    });
    const goodAdapter = makeAdapter("good", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [failingAdapter, goodAdapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.totalFetched).toBe(1);
  });

  it("filters matches below minimum confidence", async () => {
    const db = createTestDb();
    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    // All scores low → confidence = 10×0.35 + 10×0.35 + 10×0.15 + 10×0.15 = 10
    const client = makeMockLowScoreClient();

    await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
      minConfidence: 25,
    });

    // LLM was called but result below threshold — not stored
    expect(
      (client as any).messages.create
    ).toHaveBeenCalledTimes(1);
    const matches = db.select().from(matchResults).all();
    expect(matches).toHaveLength(0);
  });

  it("upserts sources into DB from adapters", async () => {
    const db = createTestDb();
    const adapter1 = makeAdapter("adzuna", [
      makePosting({ sourceUrl: "https://a.com/1", title: "Job A" }),
    ]);
    const adapter2 = makeAdapter("macslist", [
      makePosting({ sourceUrl: "https://b.com/1", title: "Job B" }),
    ]);
    const client = makeMockClient();

    await runPipeline({
      db,
      adapters: [adapter1, adapter2],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    const allSources = db.select().from(sources).all();
    expect(allSources).toHaveLength(2);

    const src1 = db
      .select()
      .from(sources)
      .where(eq(sources.id, "adzuna"))
      .get();
    expect(src1).toBeDefined();
    expect(src1!.name).toBe("Test adzuna");
    expect(src1!.type).toBe("api");
    expect(src1!.lastRunStatus).toBe("success");
    expect(src1!.lastRunItems).toBe(1);
    expect(src1!.lastRunErrors).toBeNull();

    const src2 = db
      .select()
      .from(sources)
      .where(eq(sources.id, "macslist"))
      .get();
    expect(src2).toBeDefined();
    expect(src2!.lastRunStatus).toBe("success");
    expect(src2!.lastRunItems).toBe(1);
  });

  it("records source errors when adapter fails", async () => {
    const db = createTestDb();
    const failingAdapter = new FailingAdapter({
      id: "broken-src",
      name: "Broken Source",
      type: "scrape",
      isEnabled: true,
      config: {},
    });
    const client = makeMockClient();

    await runPipeline({
      db,
      adapters: [failingAdapter],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    const src = db
      .select()
      .from(sources)
      .where(eq(sources.id, "broken-src"))
      .get();
    expect(src).toBeDefined();
    expect(src!.name).toBe("Broken Source");
    expect(src!.lastRunStatus).toBe("error");
    expect(src!.lastRunItems).toBe(0);
    expect(src!.lastRunErrors).toBe("Adapter failed");
  });

  it("stores correct sourceId on job postings", async () => {
    const db = createTestDb();
    const adapter1 = makeAdapter("source-a", [
      makePosting({ sourceUrl: "https://a.com/1", title: "Job A" }),
    ]);
    const adapter2 = makeAdapter("source-b", [
      makePosting({ sourceUrl: "https://b.com/1", title: "Job B" }),
    ]);
    const client = makeMockClient();

    await runPipeline({
      db,
      adapters: [adapter1, adapter2],
      candidates: [
        { id: "c1", name: "Test", profile: makeProfile() },
      ],
      anthropicClient: client,
    });

    const postings = db.select().from(jobPostings).all();
    expect(postings).toHaveLength(2);

    const postingA = postings.find((p) => p.title === "Job A");
    const postingB = postings.find((p) => p.title === "Job B");
    expect(postingA!.sourceId).toBe("source-a");
    expect(postingB!.sourceId).toBe("source-b");
  });

  it("scheduledRun filters to only active candidates", async () => {
    const db = createTestDb();

    // Pre-insert both candidates into DB with different active states
    db.insert(candidatesTable)
      .values({
        id: "active-1",
        name: "Active Candidate",
        profileData: makeProfile(),
        isActive: true,
      })
      .run();
    db.insert(candidatesTable)
      .values({
        id: "inactive-1",
        name: "Inactive Candidate",
        profileData: makeProfile(),
        isActive: false,
      })
      .run();

    const adapter = makeAdapter("src-1", [
      makePosting({
        sourceUrl: "https://a.com/1",
        location: "Portland, OR",
      }),
    ]);
    const client = makeMockClient();

    const result = await runPipeline({
      db,
      adapters: [adapter],
      candidates: [
        { id: "active-1", name: "Active Candidate", profile: makeProfile() },
        { id: "inactive-1", name: "Inactive Candidate", profile: makeProfile() },
      ],
      anthropicClient: client,
      scheduledRun: true,
    });

    // LLM should only be called for the active candidate
    expect(
      (client as any).messages.create
    ).toHaveBeenCalledTimes(1);

    // Only 1 match stored (for active candidate)
    const matches = db.select().from(matchResults).all();
    expect(matches).toHaveLength(1);
    expect(matches[0].candidateId).toBe("active-1");

    // Result should reflect only the active candidate
    expect(result.totalMatched).toBe(1);
  });
});
