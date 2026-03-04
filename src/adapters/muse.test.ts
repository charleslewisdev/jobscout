import { afterEach, describe, expect, it, vi } from "vitest";

import { MuseAdapter } from "./muse.js";

const SAMPLE_RESULT = {
  id: 12345,
  name: "Senior Software Engineer",
  type: "external",
  publication_date: "2026-02-28T12:00:00Z",
  short_name: "senior-software-engineer-at-acme-corp",
  company: {
    id: 100,
    name: "Acme Corp",
    short_name: "acme-corp",
  },
  locations: [{ name: "Portland, OR" }],
  levels: [{ name: "Senior Level", short_name: "senior" }],
  categories: [{ name: "Software Engineering" }],
  refs: {
    landing_page:
      "https://www.themuse.com/jobs/acmecorp/senior-software-engineer",
  },
  contents: "<p>We are looking for a <b>Senior Software Engineer</b> to join our team.</p>",
};

const SAMPLE_RESULT_2 = {
  id: 67890,
  name: "Barista",
  type: "external",
  publication_date: "2026-02-27T09:00:00Z",
  short_name: "barista-at-coffee-house",
  company: {
    id: 200,
    name: "Coffee House",
    short_name: "coffee-house",
  },
  locations: [
    { name: "Portland, OR" },
    { name: "Seattle, WA" },
  ],
  levels: [{ name: "Entry Level", short_name: "entry" }],
  categories: [{ name: "Food & Beverage" }],
  refs: {
    landing_page:
      "https://www.themuse.com/jobs/coffeehouse/barista",
  },
  contents: "<div>Make great coffee in a fun environment.</div>",
};

const SAMPLE_RESPONSE = {
  page: 0,
  page_count: 1,
  total: 2,
  results: [SAMPLE_RESULT, SAMPLE_RESULT_2],
};

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(
  overrides: Record<string, unknown> = {}
) {
  return new MuseAdapter({
    id: "themuse",
    name: "The Muse",
    type: "api",
    isEnabled: true,
    config: {
      location: "Portland, OR",
      maxPages: 5,
      ...overrides,
    },
  });
}

function mockFetchJson(data: unknown, ok = true) {
  fetchSpy.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  } as Response);
}

describe("MuseAdapter", () => {
  it("parses API response into RawJobListing[]", async () => {
    mockFetchJson(SAMPLE_RESPONSE);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
    expect(listings[0].title).toBe("Senior Software Engineer");
    expect(listings[0].sourceUrl).toBe(
      "https://www.themuse.com/jobs/acmecorp/senior-software-engineer"
    );
    expect(listings[0].descriptionQuality).toBe("full");
    expect(listings[0].postedDate).toEqual(
      new Date("2026-02-28T12:00:00Z")
    );
  });

  it("maps company, location, description, employment type correctly", async () => {
    mockFetchJson({
      page: 0,
      page_count: 1,
      total: 1,
      results: [SAMPLE_RESULT],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].company).toBe("Acme Corp");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].description).toBe(
      "We are looking for a Senior Software Engineer to join our team."
    );
    expect(listings[0].descriptionHtml).toBe(
      "<p>We are looking for a <b>Senior Software Engineer</b> to join our team.</p>"
    );
    expect(listings[0].employmentType).toBe("Senior Level");
  });

  it("joins multiple locations with comma", async () => {
    mockFetchJson({
      page: 0,
      page_count: 1,
      total: 1,
      results: [SAMPLE_RESULT_2],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].location).toBe("Portland, OR; Seattle, WA");
  });

  it("paginates across multiple pages", async () => {
    const page0 = {
      page: 0,
      page_count: 3,
      total: 5,
      results: [
        {
          ...SAMPLE_RESULT,
          id: 1,
          refs: {
            landing_page: "https://www.themuse.com/jobs/acmecorp/job-1",
          },
        },
        {
          ...SAMPLE_RESULT,
          id: 2,
          refs: {
            landing_page: "https://www.themuse.com/jobs/acmecorp/job-2",
          },
        },
      ],
    };
    const page1 = {
      page: 1,
      page_count: 3,
      total: 5,
      results: [
        {
          ...SAMPLE_RESULT,
          id: 3,
          refs: {
            landing_page: "https://www.themuse.com/jobs/acmecorp/job-3",
          },
        },
        {
          ...SAMPLE_RESULT,
          id: 4,
          refs: {
            landing_page: "https://www.themuse.com/jobs/acmecorp/job-4",
          },
        },
      ],
    };
    const page2 = {
      page: 2,
      page_count: 3,
      total: 5,
      results: [
        {
          ...SAMPLE_RESULT,
          id: 5,
          refs: {
            landing_page: "https://www.themuse.com/jobs/acmecorp/job-5",
          },
        },
      ],
    };

    mockFetchJson(page0);
    mockFetchJson(page1);
    mockFetchJson(page2);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(listings).toHaveLength(5);

    // Verify correct page params were sent
    const url0 = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url0.searchParams.get("page")).toBe("0");
    const url1 = new URL(fetchSpy.mock.calls[1][0] as string);
    expect(url1.searchParams.get("page")).toBe("1");
    const url2 = new URL(fetchSpy.mock.calls[2][0] as string);
    expect(url2.searchParams.get("page")).toBe("2");
  });

  it("stops paginating when page >= page_count", async () => {
    const page0 = {
      page: 0,
      page_count: 1,
      total: 2,
      results: [SAMPLE_RESULT, SAMPLE_RESULT_2],
    };

    mockFetchJson(page0);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // Should only fetch page 0 since page_count is 1
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(listings).toHaveLength(2);
  });

  it("respects maxPages config", async () => {
    // page_count says 10, but maxPages is 2
    mockFetchJson({
      page: 0,
      page_count: 10,
      total: 100,
      results: [SAMPLE_RESULT],
    });
    mockFetchJson({
      page: 1,
      page_count: 10,
      total: 100,
      results: [SAMPLE_RESULT_2],
    });

    const adapter = makeAdapter({ maxPages: 2 });
    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(2);
  });

  it("handles API errors gracefully (returns partial results)", async () => {
    // First page succeeds
    mockFetchJson({
      page: 0,
      page_count: 3,
      total: 6,
      results: [SAMPLE_RESULT],
    });
    // Second page fails
    mockFetchJson({ error: "Server Error" }, false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // Should return results from the successful first page
    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Senior Software Engineer");
  });

  it("handles network errors gracefully", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles empty results", async () => {
    mockFetchJson({
      page: 0,
      page_count: 0,
      total: 0,
      results: [],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles missing optional fields gracefully", async () => {
    const minimalResult = {
      id: 99999,
      name: "Mystery Job",
      refs: {
        landing_page: "https://www.themuse.com/jobs/mystery/job",
      },
      contents: "Some description text",
    };

    mockFetchJson({
      page: 0,
      page_count: 1,
      total: 1,
      results: [minimalResult],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Mystery Job");
    expect(listings[0].company).toBeUndefined();
    expect(listings[0].location).toBeUndefined();
    expect(listings[0].employmentType).toBeUndefined();
    expect(listings[0].postedDate).toBeUndefined();
  });

  it("sends correct query params", async () => {
    mockFetchJson({
      page: 0,
      page_count: 0,
      total: 0,
      results: [],
    });

    const adapter = makeAdapter();
    await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://www.themuse.com/api/public/jobs"
    );
    expect(url.searchParams.get("location")).toBe(
      "Portland, OR"
    );
    expect(url.searchParams.get("page")).toBe("0");
  });

  it("strips HTML tags for plain text description", async () => {
    const htmlResult = {
      ...SAMPLE_RESULT,
      contents:
        "<h1>Job Title</h1><p>We need a <strong>great</strong> person with <em>skills</em>.</p><ul><li>Item 1</li><li>Item 2</li></ul>",
    };

    mockFetchJson({
      page: 0,
      page_count: 1,
      total: 1,
      results: [htmlResult],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).not.toContain("<");
    expect(listings[0].description).toContain("great");
    expect(listings[0].description).toContain("skills");
    // HTML is preserved in descriptionHtml
    expect(listings[0].descriptionHtml).toContain("<strong>");
  });

  it("adds rate limiting delay between pages", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    mockFetchJson({
      page: 0,
      page_count: 2,
      total: 2,
      results: [SAMPLE_RESULT],
    });
    mockFetchJson({
      page: 1,
      page_count: 2,
      total: 2,
      results: [SAMPLE_RESULT_2],
    });

    const adapter = makeAdapter();
    await adapter.fetch();

    // setTimeout should have been called for rate limiting between pages
    const delayCalls = setTimeoutSpy.mock.calls.filter(
      (call) => typeof call[1] === "number" && call[1] > 0
    );
    expect(delayCalls.length).toBeGreaterThanOrEqual(1);

    setTimeoutSpy.mockRestore();
  });
});
