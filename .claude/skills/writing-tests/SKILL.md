---
name: writing-tests
description: Use when writing tests for JobScout. Covers Vitest conventions for adapter testing, LLM matching mocks, pipeline integration, and database operations with Drizzle.
---

# Writing Tests for JobScout

## Stack

- **Framework**: Vitest
- **Environment**: Node. The run covers `src/` and `shared/`; `client/` is excluded
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
    migrate.test.ts          # Migration tests
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

Adapters make HTTP requests — mock the network, not the adapter internals. Spy on `globalThis.fetch` with `vi.spyOn`, as `src/adapters/adzuna.test.ts` does, and assert on the normalized `RawJobListing` fields and on error paths such as a rejected request or a non-OK response.

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

`evaluateMatch(posting, profile, client)` takes the client as an argument, so pass a stub and leave the SDK module alone; `makeMockClient` in `src/matching/llm.test.ts` is the pattern. The stub returns what `LLMResponseSchema` validates: `categoryScores` with `pay`, `schedule`, `rolefit` and `growth`, plus `summary` and `flags`. `computeConfidence` derives `confidenceScore`, and the result stores `rolefit` as `skills` and `growth` as `culture`. Malformed responses return `null`.

## Database Tests

Use `createTestDb()` from `src/test-helpers.ts`, which applies the migrations to a fresh in-memory SQLite database. Create one per test for isolation. Drizzle builders run only when awaited or given `.run()`, so a constraint test must execute the insert.

## Pre-filter Tests

Test heuristic matching logic with various profile/posting combinations:

```typescript
describe("prefilterPosting", () => {
  it("rejects posting outside candidate's location area", () => {
    const posting = makePosting({ location: "Seattle, WA" });
    const profile = makeProfile({ location: { acceptableAreas: ["Portland", "Beaverton"] } });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("rejects posting matching a dealbreaker", () => {
    const posting = makePosting({ description: "This is a commission-only position" });
    const profile = makeProfile({ dealbreakers: ["commission-only"] });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("passes posting with no disqualifying signals", () => {
    const posting = makePosting({ location: "Portland, OR", title: "Warehouse Worker" });
    const profile = makeProfile({ location: { acceptableAreas: ["Portland"] } });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });
});
```

## Test Helpers

Use the shared helpers instead of writing new factories: `makePosting` and `makeProfile` in `src/test-helpers.ts`, and the app builders, `seed*` helpers and user fixtures in `src/test-helpers.route.ts` for route tests.

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
