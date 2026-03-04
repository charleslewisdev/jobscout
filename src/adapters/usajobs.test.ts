import { afterEach, describe, expect, it, vi } from "vitest";

import { UsajobsAdapter } from "./usajobs.js";

const SAMPLE_ITEM = {
  MatchedObjectId: "800001",
  MatchedObjectDescriptor: {
    PositionURI:
      "https://www.usajobs.gov/GetJob/ViewDetails/800001",
    PositionTitle: "Administrative Specialist",
    OrganizationName: "Department of Veterans Affairs",
    PositionLocationDisplay: "Portland, Oregon",
    PositionRemuneration: [
      {
        MinimumRange: "49025",
        MaximumRange: "77955",
        RateIntervalCode: "Per Year",
      },
    ],
    PositionSchedule: [{ Name: "Full-time" }],
    PositionStartDate: "2026-02-20T00:00:00Z",
    QualificationSummary:
      "Must have one year of specialized experience equivalent to GS-7.",
  },
};

const SAMPLE_RESPONSE = {
  SearchResult: {
    SearchResultCount: 2,
    SearchResultCountAll: 2,
    SearchResultItems: [
      SAMPLE_ITEM,
      {
        MatchedObjectId: "800002",
        MatchedObjectDescriptor: {
          PositionURI:
            "https://www.usajobs.gov/GetJob/ViewDetails/800002",
          PositionTitle: "Program Analyst",
          OrganizationName: "US Army",
          PositionLocationDisplay: "Portland, Oregon",
          PositionRemuneration: [
            {
              MinimumRange: "59966",
              MaximumRange: "94317",
              RateIntervalCode: "Per Year",
            },
          ],
          PositionSchedule: [{ Name: "Full-time" }],
          PositionStartDate: "2026-02-22T00:00:00Z",
          QualificationSummary:
            "Requires experience in program management and analysis.",
        },
      },
    ],
  },
};

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new UsajobsAdapter({
    id: "usajobs",
    name: "USAJobs",
    type: "api",
    isEnabled: true,
    config: {
      apiKey: "test-api-key",
      userEmail: "test@example.com",
      location: "Portland, Oregon",
      resultsPerPage: 50,
      maxPages: 3,
      datePostedDays: 7,
      ...overrides,
    },
  });
}

function mockFetchJson(data: unknown, ok = true) {
  fetchSpy.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 401,
    json: async () => data,
  } as Response);
}

describe("UsajobsAdapter", () => {
  it("parses API response into RawJobListing[]", async () => {
    mockFetchJson(SAMPLE_RESPONSE);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    expect(listings[0].title).toBe("Administrative Specialist");
    expect(listings[0].sourceUrl).toBe(
      "https://www.usajobs.gov/GetJob/ViewDetails/800001"
    );
    expect(listings[0].externalId).toBe("800001");
    expect(listings[0].company).toBe(
      "Department of Veterans Affairs"
    );
    expect(listings[0].location).toBe("Portland, Oregon");
    expect(listings[0].salaryRaw).toBe("$49025-$77955/yr");
    expect(listings[0].salaryMin).toBe(49025);
    expect(listings[0].salaryMax).toBe(77955);
    expect(listings[0].salaryUnit).toBe("annual");
    expect(listings[0].employmentType).toBe("Full-time");
    expect(listings[0].description).toBe(
      "Must have one year of specialized experience equivalent to GS-7."
    );
    expect(listings[0].postedDate).toEqual(
      new Date("2026-02-20T00:00:00Z")
    );

    expect(listings[1].title).toBe("Program Analyst");
    expect(listings[1].company).toBe("US Army");
  });

  it("sends correct auth headers and query params", async () => {
    mockFetchJson({
      SearchResult: { SearchResultCount: 0, SearchResultItems: [] },
    });
    const adapter = makeAdapter();
    await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [urlStr, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const url = new URL(urlStr);

    // Query params
    expect(url.searchParams.get("LocationName")).toBe(
      "Portland, Oregon"
    );
    expect(url.searchParams.get("ResultsPerPage")).toBe("50");
    expect(url.searchParams.get("Page")).toBe("1");
    expect(url.searchParams.get("DatePosted")).toBe("7");

    // Auth headers
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization-Key"]).toBe("test-api-key");
    expect(headers["User-Agent"]).toBe("test@example.com");
    expect(headers["Host"]).toBe("data.usajobs.gov");
  });

  it("includes Keyword param when keyword is provided", async () => {
    mockFetchJson({
      SearchResult: { SearchResultCount: 0, SearchResultItems: [] },
    });
    const adapter = makeAdapter({
      keywords: ["accounting"],
    });
    await adapter.fetch();

    const urlStr = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(urlStr);
    expect(url.searchParams.get("Keyword")).toBe("accounting");
  });

  it("paginates through multiple pages", async () => {
    const page1 = {
      SearchResult: {
        SearchResultCount: 50,
        SearchResultItems: Array.from({ length: 50 }, (_, i) => ({
          MatchedObjectId: `${i}`,
          MatchedObjectDescriptor: {
            PositionURI: `https://www.usajobs.gov/GetJob/ViewDetails/${i}`,
            PositionTitle: `Job ${i}`,
            OrganizationName: "Agency",
            PositionLocationDisplay: "Portland, Oregon",
            QualificationSummary: "Description",
          },
        })),
      },
    };
    const page2 = {
      SearchResult: {
        SearchResultCount: 10,
        SearchResultItems: Array.from({ length: 10 }, (_, i) => ({
          MatchedObjectId: `${50 + i}`,
          MatchedObjectDescriptor: {
            PositionURI: `https://www.usajobs.gov/GetJob/ViewDetails/${50 + i}`,
            PositionTitle: `Job ${50 + i}`,
            OrganizationName: "Agency",
            PositionLocationDisplay: "Portland, Oregon",
            QualificationSummary: "Description",
          },
        })),
      },
    };
    mockFetchJson(page1);
    mockFetchJson(page2);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(60);

    // Verify page params
    const url1 = new URL(fetchSpy.mock.calls[0][0] as string);
    const url2 = new URL(fetchSpy.mock.calls[1][0] as string);
    expect(url1.searchParams.get("Page")).toBe("1");
    expect(url2.searchParams.get("Page")).toBe("2");
  });

  it("handles 401 (bad key) gracefully", async () => {
    mockFetchJson({ error: "Unauthorized" }, false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles network error gracefully", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles empty results", async () => {
    mockFetchJson({
      SearchResult: { SearchResultCount: 0, SearchResultItems: [] },
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("deduplicates listings across keyword searches", async () => {
    const sharedItem = {
      MatchedObjectId: "999",
      MatchedObjectDescriptor: {
        PositionURI:
          "https://www.usajobs.gov/GetJob/ViewDetails/999",
        PositionTitle: "Shared Job",
        OrganizationName: "Agency",
        PositionLocationDisplay: "Portland, Oregon",
        QualificationSummary: "Description",
      },
    };

    const response1 = {
      SearchResult: {
        SearchResultCount: 1,
        SearchResultItems: [sharedItem],
      },
    };
    const response2 = {
      SearchResult: {
        SearchResultCount: 1,
        SearchResultItems: [sharedItem],
      },
    };

    mockFetchJson(response1);
    mockFetchJson(response2);

    const adapter = makeAdapter({
      keywords: ["admin", "analyst"],
    });
    const listings = await adapter.fetch();

    // Same URL appears in both keyword searches, should only appear once
    expect(listings).toHaveLength(1);
    expect(listings[0].sourceUrl).toBe(
      "https://www.usajobs.gov/GetJob/ViewDetails/999"
    );
  });

  it("handles missing optional fields gracefully", async () => {
    const minimalItem = {
      MatchedObjectId: "minimal-1",
      MatchedObjectDescriptor: {
        PositionURI:
          "https://www.usajobs.gov/GetJob/ViewDetails/minimal-1",
        PositionTitle: "Minimal Job",
        QualificationSummary: "Basic description",
      },
    };

    mockFetchJson({
      SearchResult: {
        SearchResultCount: 1,
        SearchResultItems: [minimalItem],
      },
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Minimal Job");
    expect(listings[0].company).toBeUndefined();
    expect(listings[0].location).toBeUndefined();
    expect(listings[0].salaryRaw).toBeUndefined();
    expect(listings[0].salaryMin).toBeUndefined();
    expect(listings[0].salaryMax).toBeUndefined();
    expect(listings[0].salaryUnit).toBeUndefined();
    expect(listings[0].employmentType).toBeUndefined();
    expect(listings[0].postedDate).toBeUndefined();
  });
});
