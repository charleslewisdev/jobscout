---
name: writing-tests
description: Use when writing tests for JobScout. Covers Vitest conventions for adapter testing, LLM matching mocks, pipeline integration, and database operations with Drizzle.
---

# Writing Tests for JobScout

## Stack

- **Framework**: Vitest 3.x
- **Environment**: Node (not browser — pipeline-first, no React yet)
- **Database**: Drizzle ORM + better-sqlite3 (in-memory for tests)
- **Execution**: Sequential (`fileParallelism: false`) to avoid DB conflicts

## Test Location & Naming

Tests live alongside source files:

```
src/
  adapters/
    neogov.ts
    neogov.test.ts           # Adapter tests
  matching/
    prefilter.ts
    prefilter.test.ts        # Pre-filter tests
    llm.ts
    llm.test.ts              # LLM matching tests (mocked API)
  db/
    schema.test.ts           # Schema validation tests
  pipeline.test.ts           # Integration tests
```

File naming: `module-name.test.ts`

## Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ModuleName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("happy path", () => {
    it("does the expected thing", () => {
      // arrange → act → assert
    });
  });

  describe("error handling", () => {
    it("handles network failure gracefully", () => {
      // ...
    });
  });
});
```

## Adapter Testing

Adapters make HTTP requests — mock the network, not the adapter internals.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for adapter tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("NeogovAdapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("parses RSS feed into RawJobListing[]", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(SAMPLE_RSS_XML),
    });

    const adapter = new NeogovAdapter(config);
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      title: expect.any(String),
      sourceUrl: expect.stringContaining("governmentjobs"),
      description: expect.any(String),
    });
  });

  it("returns empty array on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const adapter = new NeogovAdapter(config);
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });
});
```

### Adapter Test Fixtures

Store sample responses as string constants in the test file or a `fixtures/` directory:

```typescript
const SAMPLE_RSS_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Warehouse Worker - $18/hr</title>
      <link>https://www.governmentjobs.com/careers/portlandor/jobs/123</link>
      <description>Full time warehouse position...</description>
    </item>
  </channel>
</rss>`;
```

## LLM Matching Tests

**Always mock the Anthropic API** — never make real LLM calls in tests.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

import Anthropic from "@anthropic-ai/sdk";
const mockClient = new Anthropic();
const mockCreate = vi.mocked(mockClient.messages.create);

describe("LLMMatchingEngine", () => {
  it("parses structured response into MatchResult", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          confidenceScore: 78,
          categoryScores: { pay: 80, schedule: 90, location: 70, skills: 65, culture: 80 },
          summary: "Strong schedule and location fit. Pay meets minimum.",
          flags: ["salary not explicitly listed"],
        }),
      }],
    } as any);

    const result = await matchEngine.evaluate(samplePosting, sampleProfile);

    expect(result.confidenceScore).toBe(78);
    expect(result.flags).toContain("salary not explicitly listed");
  });

  it("handles malformed LLM response gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json" }],
    } as any);

    const result = await matchEngine.evaluate(samplePosting, sampleProfile);

    expect(result).toBeNull(); // or returns a low-confidence fallback
  });
});
```

## Database Tests

Use in-memory SQLite for test isolation:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../db/schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  return db;
}

describe("JobPostings", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("inserts and retrieves a job posting", async () => {
    await db.insert(schema.jobPostings).values(sampleJobPosting);
    const result = await db.select().from(schema.jobPostings);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(sampleJobPosting.title);
  });

  it("enforces unique source_url constraint", async () => {
    await db.insert(schema.jobPostings).values(sampleJobPosting);
    expect(() =>
      db.insert(schema.jobPostings).values(sampleJobPosting)
    ).toThrow();
  });
});
```

## Pre-filter Tests

Test heuristic matching logic with various profile/posting combinations:

```typescript
describe("PreFilter", () => {
  it("rejects posting outside candidate's location area", () => {
    const posting = makePosting({ location: "Seattle, WA" });
    const profile = makeProfile({ location: { acceptableAreas: ["Portland", "Beaverton"] } });

    expect(preFilter(posting, profile)).toBe(false);
  });

  it("rejects posting matching a dealbreaker", () => {
    const posting = makePosting({ description: "This is a commission-only position" });
    const profile = makeProfile({ dealbreakers: ["commission-only"] });

    expect(preFilter(posting, profile)).toBe(false);
  });

  it("passes posting with no disqualifying signals", () => {
    const posting = makePosting({ location: "Portland, OR", title: "Warehouse Worker" });
    const profile = makeProfile({ location: { acceptableAreas: ["Portland"] } });

    expect(preFilter(posting, profile)).toBe(true);
  });
});
```

## Test Helpers

Create factory functions for test data:

```typescript
// src/test-helpers.ts (or inline in test files)
export function makePosting(overrides: Partial<RawJobListing> = {}): RawJobListing {
  return {
    sourceUrl: "https://example.com/job/123",
    title: "Test Job",
    company: "Test Company",
    location: "Portland, OR",
    description: "A test job posting",
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    identity: { name: "Test Candidate" },
    compensation: {},
    benefits: {},
    schedule: {},
    location: { acceptableAreas: ["Portland"] },
    experience: {},
    preferences: {},
    dealbreakers: [],
    ...overrides,
  };
}
```

## Running Tests

```bash
npm test                # Watch mode
npm run test:run        # Single run
npm run test:coverage   # With coverage report
```

## Key Conventions

- **Mock network, not internals** — test adapters against mocked HTTP responses
- **Always mock LLM** — never make real API calls in tests
- **In-memory DB** — fresh SQLite per test suite, no shared state
- **Sequential execution** — `fileParallelism: false` prevents DB conflicts
- **Test error paths** — every adapter and matching function should have error handling tests
- **Use Zod for assertions** — if the code validates with Zod, tests should cover parse failures
