import { afterEach, describe, expect, it, vi } from "vitest";

import { CareerjetAdapter } from "./careerjet.js";

const SAMPLE_JOB = {
  url: "https://www.careerjet.com/job/12345",
  title: "Office Manager",
  company: "Portland Coffee Roasters",
  locations: "Portland, OR",
  salary: "$50,000 - $60,000/year",
  description: "Manage daily office operations and support team.",
  date: "2026-02-25",
};

const SAMPLE_RESPONSE = {
  type: "JOBS",
  hits: 2,
  pages: 1,
  jobs: [
    SAMPLE_JOB,
    {
      url: "https://www.careerjet.com/job/12346",
      title: "Administrative Assistant",
      company: "TriMet",
      locations: "Portland, OR",
      salary_min: 40000,
      salary_max: 48000,
      salary_type: "Y",
      salary_currency_code: "USD",
      description: "Provide administrative support to the operations team.",
      date: "2026-02-24",
    },
  ],
};

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new CareerjetAdapter({
    id: "careerjet",
    name: "Careerjet",
    type: "api",
    isEnabled: true,
    config: {
      apiKey: "test-api-key",
      location: "Portland, OR",
      pageSize: 50,
      maxPages: 3,
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

describe("CareerjetAdapter", () => {
  it("parses API response into RawJobListing[]", async () => {
    mockFetchJson(SAMPLE_RESPONSE);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    expect(listings[0].title).toBe("Office Manager");
    expect(listings[0].sourceUrl).toBe(
      "https://www.careerjet.com/job/12345"
    );
    expect(listings[0].company).toBe("Portland Coffee Roasters");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].salaryRaw).toBe("$50,000 - $60,000/year");
    // First listing only has salary text string — parsed via parseSalaryRaw fallback
    expect(listings[0].salaryMin).toBe(50000);
    expect(listings[0].salaryMax).toBe(60000);
    expect(listings[0].salaryUnit).toBe("annual");
    expect(listings[0].description).toBe(
      "Manage daily office operations and support team."
    );
    expect(listings[0].descriptionQuality).toBe("snippet");
    expect(listings[0].postedDate).toEqual(new Date("2026-02-25"));

    // Second listing uses structured salary fields
    expect(listings[1].title).toBe("Administrative Assistant");
    expect(listings[1].company).toBe("TriMet");
    expect(listings[1].salaryRaw).toBe("$40,000-$48,000/yr");
    expect(listings[1].salaryMin).toBe(40000);
    expect(listings[1].salaryMax).toBe(48000);
    expect(listings[1].salaryUnit).toBe("annual");
  });

  it("sends correct query params and auth header", async () => {
    mockFetchJson({ type: "JOBS", hits: 0, jobs: [] });
    const adapter = makeAdapter();
    await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [urlStr, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = new URL(urlStr);

    // v4 endpoint
    expect(url.origin + url.pathname).toBe(
      "https://search.api.careerjet.net/v4/query"
    );

    // Query params
    expect(url.searchParams.get("locale_code")).toBe("en_US");
    expect(url.searchParams.get("location")).toBe("Portland, OR");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("sort")).toBe("date");
    expect(url.searchParams.get("user_ip")).toBe("127.0.0.1");
    expect(url.searchParams.get("user_agent")).toBe("JobScout/1.0");
    // No keywords param when no keyword provided
    expect(url.searchParams.has("keywords")).toBe(false);

    // Basic Auth header
    const headers = init.headers as Record<string, string>;
    const expectedAuth =
      "Basic " + Buffer.from("test-api-key:").toString("base64");
    expect(headers["Authorization"]).toBe(expectedAuth);
    expect(headers["Accept"]).toBe("application/json");
  });

  it("includes keywords param when keyword is provided", async () => {
    mockFetchJson({ type: "JOBS", hits: 0, jobs: [] });
    const adapter = makeAdapter({ keywords: ["accounting"] });
    await adapter.fetch();

    const urlStr = fetchSpy.mock.calls[0][0] as string;
    const url = new URL(urlStr);
    expect(url.searchParams.get("keywords")).toBe("accounting");
  });

  it("paginates through multiple pages", async () => {
    const page1 = {
      type: "JOBS",
      hits: 60,
      pages: 2,
      jobs: Array.from({ length: 50 }, (_, i) => ({
        url: `https://www.careerjet.com/job/${i}`,
        title: `Job ${i}`,
        company: "Company",
        locations: "Portland, OR",
        description: "Description",
      })),
    };
    const page2 = {
      type: "JOBS",
      hits: 60,
      pages: 2,
      jobs: Array.from({ length: 10 }, (_, i) => ({
        url: `https://www.careerjet.com/job/${50 + i}`,
        title: `Job ${50 + i}`,
        company: "Company",
        locations: "Portland, OR",
        description: "Description",
      })),
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
    expect(url1.searchParams.get("page")).toBe("1");
    expect(url2.searchParams.get("page")).toBe("2");
  });

  it("handles non-OK response gracefully", async () => {
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

  it("bails out of remaining keywords on connection error", async () => {
    // Node's fetch wraps connection errors in TypeError with .cause
    const innerError = new Error("connect ECONNREFUSED 193.164.202.146:443");
    (innerError as NodeJS.ErrnoException).code = "ECONNREFUSED";
    const connError = new TypeError("fetch failed", { cause: innerError });
    fetchSpy.mockRejectedValueOnce(connError);

    const adapter = makeAdapter({ keywords: ["admin", "analyst", "clerk"] });
    const listings = await adapter.fetch();

    // Should only attempt one fetch (first keyword) then bail
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(listings).toEqual([]);
  });

  it("handles empty results", async () => {
    mockFetchJson({ type: "JOBS", hits: 0, jobs: [] });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("deduplicates listings across keyword searches", async () => {
    const sharedJob = {
      url: "https://www.careerjet.com/job/999",
      title: "Shared Job",
      company: "Company",
      locations: "Portland, OR",
      description: "Description",
    };

    const response1 = { type: "JOBS", hits: 1, jobs: [sharedJob] };
    const response2 = { type: "JOBS", hits: 1, jobs: [sharedJob] };

    mockFetchJson(response1);
    mockFetchJson(response2);

    const adapter = makeAdapter({ keywords: ["admin", "office"] });
    const listings = await adapter.fetch();

    // Same URL appears in both keyword searches, should only appear once
    expect(listings).toHaveLength(1);
    expect(listings[0].sourceUrl).toBe(
      "https://www.careerjet.com/job/999"
    );
  });

  it("handles missing optional fields gracefully", async () => {
    const minimalJob = {
      url: "https://www.careerjet.com/job/minimal-1",
      title: "Minimal Job",
      description: "Basic description",
    };

    mockFetchJson({ type: "JOBS", hits: 1, jobs: [minimalJob] });

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
    expect(listings[0].postedDate).toBeUndefined();
  });

  it("stops paginating at maxPages", async () => {
    const fullPage = {
      type: "JOBS",
      hits: 200,
      pages: 4,
      jobs: Array.from({ length: 50 }, (_, i) => ({
        url: `https://www.careerjet.com/job/${i}`,
        title: `Job ${i}`,
        description: "Description",
      })),
    };

    // Mock 3 full pages (maxPages = 3 default)
    mockFetchJson(fullPage);
    mockFetchJson({
      type: "JOBS",
      hits: 200,
      pages: 4,
      jobs: Array.from({ length: 50 }, (_, i) => ({
        url: `https://www.careerjet.com/job/${50 + i}`,
        title: `Job ${50 + i}`,
        description: "Description",
      })),
    });
    mockFetchJson({
      type: "JOBS",
      hits: 200,
      pages: 4,
      jobs: Array.from({ length: 50 }, (_, i) => ({
        url: `https://www.careerjet.com/job/${100 + i}`,
        title: `Job ${100 + i}`,
        description: "Description",
      })),
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // Should stop after 3 pages even though all pages are full
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(listings).toHaveLength(150);
  });

  it("strips HTML tags from descriptions", async () => {
    mockFetchJson({
      type: "JOBS",
      hits: 1,
      jobs: [
        {
          url: "https://www.careerjet.com/job/99",
          title: "Event Coordinator",
          description:
            "Looking for a <b>coordinator</b> with <b>event planning</b> skills.",
        },
      ],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe(
      "Looking for a coordinator with event planning skills."
    );
    expect(listings[0].description).not.toContain("<b>");
  });

  it("formats structured salary fields correctly", async () => {
    mockFetchJson({
      type: "JOBS",
      hits: 2,
      jobs: [
        {
          url: "https://example.com/1",
          title: "Hourly Job",
          description: "Desc",
          salary_min: 18,
          salary_max: 25,
          salary_type: "H",
          salary_currency_code: "USD",
        },
        {
          url: "https://example.com/2",
          title: "Monthly Job",
          description: "Desc",
          salary_min: 4000,
          salary_max: 5500,
          salary_type: "M",
          salary_currency_code: "USD",
        },
      ],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].salaryRaw).toBe("$18-$25/hr");
    expect(listings[0].salaryMin).toBe(18);
    expect(listings[0].salaryMax).toBe(25);
    expect(listings[0].salaryUnit).toBe("hourly");

    expect(listings[1].salaryRaw).toBe("$4,000-$5,500/mo");
    expect(listings[1].salaryMin).toBe(4000);
    expect(listings[1].salaryMax).toBe(5500);
    expect(listings[1].salaryUnit).toBe("monthly");
  });
});
