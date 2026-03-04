import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdxPipelineAdapter } from "./pdxpipeline.js";

const SAMPLE_LISTINGS = [
  {
    id: 101,
    date: "2026-02-28T09:00:00",
    link: "https://www.pdxpipeline.com/job/barista-at-stumptown-coffee/",
    title: { rendered: "Barista" },
    content: {
      rendered:
        "<p>Join our team at Stumptown Coffee. We brew the best coffee in Portland.</p>",
    },
    meta: {
      _company_name: "Stumptown Coffee",
      _job_location: "Portland, OR",
      _application: "https://stumptown.com/careers/barista",
      _company_website: "https://stumptown.com",
      _remote_position: 0,
      _job_salary: "18-22",
      _job_salary_currency: "USD",
      _job_salary_unit: "HOUR",
      _filled: 0,
    },
    "job-types": [10],
  },
  {
    id: 102,
    date: "2026-02-27T14:30:00",
    link: "https://www.pdxpipeline.com/job/graphic-designer/",
    title: { rendered: "Graphic Designer" },
    content: {
      rendered:
        "<p>Creative agency seeking a talented graphic designer for branding projects.</p>",
    },
    meta: {
      _company_name: "PDX Creative",
      _job_location: "Portland, OR",
      _application: "mailto:jobs@pdxcreative.com",
      _company_website: "https://pdxcreative.com",
      _remote_position: 1,
      _job_salary: "",
      _job_salary_currency: "",
      _job_salary_unit: "",
      _filled: 0,
    },
    "job-types": [11],
  },
];

const SAMPLE_JOB_TYPES = [
  { id: 10, name: "Full-Time", slug: "full-time" },
  { id: 11, name: "Part-Time", slug: "part-time" },
  { id: 12, name: "Freelance", slug: "freelance" },
];

// Stub setTimeout to resolve immediately
const originalSetTimeout = globalThis.setTimeout;
beforeEach(() => {
  vi.stubGlobal(
    "setTimeout",
    (fn: (...args: unknown[]) => void, _ms?: number) =>
      originalSetTimeout(fn, 0)
  );
});

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
  vi.unstubAllGlobals();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new PdxPipelineAdapter({
    id: "pdxpipeline",
    name: "PDX Pipeline",
    type: "api",
    isEnabled: true,
    config: {
      baseUrl: "https://www.pdxpipeline.com",
      perPage: 20,
      maxPages: 3,
      ...overrides,
    },
  });
}

function mockFetchJson(data: unknown, ok = true, headers?: Record<string, string>) {
  fetchSpy.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
    headers: new Headers(headers ?? {}),
  } as Response);
}

describe("PdxPipelineAdapter", () => {
  it("parses WP REST API response into RawJobListing[]", async () => {
    // First call: job types taxonomy
    mockFetchJson(SAMPLE_JOB_TYPES);
    // Second call: first page of listings
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    expect(listings[0].title).toBe("Barista");
    expect(listings[0].company).toBe("Stumptown Coffee");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].sourceUrl).toBe(
      "https://www.pdxpipeline.com/job/barista-at-stumptown-coffee/"
    );
    expect(listings[0].descriptionQuality).toBe("full");
    expect(listings[0].postedDate).toEqual(new Date("2026-02-28T09:00:00"));

    expect(listings[1].title).toBe("Graphic Designer");
    expect(listings[1].company).toBe("PDX Creative");
  });

  it("maps salary fields from meta", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // First listing has salary with structured fields
    expect(listings[0].salaryRaw).toBe("18-22 USD/HOUR");
    expect(listings[0].salaryMin).toBe(18);
    expect(listings[0].salaryMax).toBe(22);
    expect(listings[0].salaryUnit).toBe("hourly");
    // Second listing has empty salary
    expect(listings[1].salaryRaw).toBeUndefined();
    expect(listings[1].salaryMin).toBeUndefined();
    expect(listings[1].salaryMax).toBeUndefined();
  });

  it("maps employment type from job-types taxonomy", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].employmentType).toBe("Full-Time");
    expect(listings[1].employmentType).toBe("Part-Time");
  });

  it("paginates through multiple pages", async () => {
    const page1 = SAMPLE_LISTINGS;
    const page2 = [
      {
        id: 103,
        date: "2026-02-26T10:00:00",
        link: "https://www.pdxpipeline.com/job/cook/",
        title: { rendered: "Line Cook" },
        content: { rendered: "<p>Kitchen work.</p>" },
        meta: {
          _company_name: "Restaurant",
          _job_location: "Portland",
          _application: "",
          _company_website: "",
          _remote_position: 0,
          _job_salary: "",
          _job_salary_currency: "",
          _job_salary_unit: "",
          _filled: 0,
        },
        "job-types": [],
      },
    ];

    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(page1, true, { "X-WP-TotalPages": "2" });
    mockFetchJson(page2, true, { "X-WP-TotalPages": "2" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(3);
    // 1 taxonomy + 2 pages = 3 fetch calls
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("stops at maxPages even if more pages exist", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "10" });
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "10" });

    const adapter = makeAdapter({ maxPages: 2 });
    const listings = await adapter.fetch();

    // 1 taxonomy + 2 pages = 3 fetch calls
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(listings).toHaveLength(4);
  });

  it("skips filled listings", async () => {
    const listingsWithFilled = [
      {
        ...SAMPLE_LISTINGS[0],
        meta: { ...SAMPLE_LISTINGS[0].meta, _filled: 1 },
      },
      SAMPLE_LISTINGS[1],
    ];

    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(listingsWithFilled, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Graphic Designer");
  });

  it("handles API error gracefully", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson({ code: "rest_no_route" }, false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles network error gracefully", async () => {
    // Taxonomy call succeeds but listings call fails
    mockFetchJson(SAMPLE_JOB_TYPES);
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles empty results", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson([], true, { "X-WP-TotalPages": "0" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("strips HTML tags from description for plain text", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe(
      "Join our team at Stumptown Coffee. We brew the best coffee in Portland."
    );
    expect(listings[0].description).not.toContain("<p>");
    expect(listings[0].descriptionHtml).toContain("<p>");
  });

  it("sends correct query params", async () => {
    mockFetchJson(SAMPLE_JOB_TYPES);
    mockFetchJson([], true, { "X-WP-TotalPages": "0" });

    const adapter = makeAdapter();
    await adapter.fetch();

    // Check job listings request (second call)
    const listingsUrl = new URL(fetchSpy.mock.calls[1][0] as string);
    expect(listingsUrl.pathname).toBe("/wp-json/wp/v2/job-listings");
    expect(listingsUrl.searchParams.get("per_page")).toBe("20");
    expect(listingsUrl.searchParams.get("page")).toBe("1");
    expect(listingsUrl.searchParams.get("orderby")).toBe("date");
    expect(listingsUrl.searchParams.get("order")).toBe("desc");
  });

  it("handles taxonomy fetch failure gracefully", async () => {
    mockFetchJson({}, false); // taxonomy fails
    mockFetchJson(SAMPLE_LISTINGS, true, { "X-WP-TotalPages": "1" });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // Should still work, just without employment type mapping
    expect(listings).toHaveLength(2);
    expect(listings[0].employmentType).toBeUndefined();
  });
});
