import { afterEach, describe, expect, it, vi } from "vitest";

import { AdzunaAdapter } from "./adzuna.js";

const SAMPLE_RESPONSE = {
  count: 2,
  results: [
    {
      title: "Warehouse Associate",
      redirect_url: "https://adzuna.com/jobs/123",
      company: { display_name: "Acme Logistics" },
      location: { display_name: "Portland, Oregon" },
      description: "Full-time warehouse associate needed.",
      salary_min: 35000,
      salary_max: 42000,
      created: "2026-02-25T10:00:00Z",
      category: { label: "Logistics & Warehouse" },
    },
    {
      title: "Forklift Operator",
      redirect_url: "https://adzuna.com/jobs/456",
      company: { display_name: "PDX Freight" },
      location: { display_name: "Portland, Oregon" },
      description: "Experienced forklift operator for day shift.",
      salary_min: 38000,
      salary_max: 45000,
      created: "2026-02-24T14:30:00Z",
      category: { label: "Logistics & Warehouse" },
    },
  ],
};

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(
  overrides: Record<string, unknown> = {}
) {
  return new AdzunaAdapter({
    id: "adzuna",
    name: "Adzuna",
    type: "api",
    isEnabled: true,
    config: {
      appId: "test-id",
      appKey: "test-key",
      location: "Portland, Oregon",
      resultsPerPage: 50,
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

describe("AdzunaAdapter", () => {
  it("parses API response into RawJobListing[]", async () => {
    mockFetchJson(SAMPLE_RESPONSE);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
    expect(listings[0].title).toBe("Warehouse Associate");
    expect(listings[0].sourceUrl).toBe(
      "https://adzuna.com/jobs/123"
    );
    expect(listings[0].company).toBe("Acme Logistics");
    expect(listings[0].location).toBe("Portland, Oregon");
    expect(listings[0].description).toBe(
      "Full-time warehouse associate needed."
    );
    expect(listings[0].descriptionQuality).toBe("snippet");
    expect(listings[0].salaryRaw).toBe("$35000-$42000");
    expect(listings[0].salaryMin).toBe(35000);
    expect(listings[0].salaryMax).toBe(42000);
    expect(listings[0].salaryUnit).toBe("annual");
    expect(listings[0].postedDate).toEqual(
      new Date("2026-02-25T10:00:00Z")
    );
  });

  it("sends correct query params", async () => {
    mockFetchJson({ count: 0, results: [] });
    const adapter = makeAdapter();
    await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.get("app_id")).toBe("test-id");
    expect(url.searchParams.get("app_key")).toBe("test-key");
    expect(url.searchParams.get("where")).toBe(
      "Portland, Oregon"
    );
    expect(url.searchParams.get("results_per_page")).toBe("50");
  });

  it("paginates through multiple pages", async () => {
    const page1 = {
      count: 60,
      results: Array.from({ length: 50 }, (_, i) => ({
        title: `Job ${i}`,
        redirect_url: `https://adzuna.com/jobs/${i}`,
        company: { display_name: "Co" },
        location: { display_name: "Portland" },
        description: "Desc",
        created: "2026-02-25T10:00:00Z",
      })),
    };
    const page2 = {
      count: 60,
      results: Array.from({ length: 10 }, (_, i) => ({
        title: `Job ${50 + i}`,
        redirect_url: `https://adzuna.com/jobs/${50 + i}`,
        company: { display_name: "Co" },
        location: { display_name: "Portland" },
        description: "Desc",
        created: "2026-02-25T10:00:00Z",
      })),
    };
    mockFetchJson(page1);
    mockFetchJson(page2);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(60);
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

  it("strips HTML tags from descriptions", async () => {
    mockFetchJson({
      count: 1,
      results: [
        {
          title: "Community Manager",
          redirect_url: "https://adzuna.com/jobs/789",
          description:
            "Seeking a <b>Community</b> Manager with <b>social media</b> experience.",
        },
      ],
    });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe(
      "Seeking a Community Manager with social media experience."
    );
    expect(listings[0].description).not.toContain("<b>");
  });
});
