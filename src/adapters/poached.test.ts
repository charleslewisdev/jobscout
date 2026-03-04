import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PoachedAdapter } from "./poached.js";

let mockGetRenderedHtml: ReturnType<typeof vi.fn>;
let mockIsAvailable: ReturnType<typeof vi.fn>;

vi.mock("../utils/chrome-cdp.js", () => ({
  ChromeCDP: vi.fn().mockImplementation(function () {
    return {
      getRenderedHtml: (...args: unknown[]) =>
        (mockGetRenderedHtml as Function)(...args),
      isAvailable: () => (mockIsAvailable as Function)(),
    };
  }),
}));

// Stub setTimeout to resolve delays immediately in tests
const originalSetTimeout = globalThis.setTimeout;
beforeEach(() => {
  vi.stubGlobal(
    "setTimeout",
    (fn: (...args: unknown[]) => void, _ms?: number) =>
      originalSetTimeout(fn, 0)
  );
});

// ─── HTML Fixtures ───

const SEARCH_PAGE_HTML = `
<html><body>
<div class="job-listings">
  <a href="/jobs/line-cook-at-ox-restaurant-1234">Line Cook at Ox Restaurant</a>
  <a href="/jobs/bartender-at-departure-5678">Bartender at Departure</a>
  <a href="/jobs/all/portland+or">All Portland Jobs</a>
  <a href="/jobs/line-cook-at-ox-restaurant-1234">Line Cook at Ox Restaurant</a>
</div>
</body></html>
`;

const DETAIL_PAGE_JSON_LD = `
<html><head>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Line Cook",
  "description": "Join our kitchen team at Ox Restaurant.",
  "hiringOrganization": { "name": "Ox Restaurant" },
  "jobLocation": {
    "address": {
      "addressLocality": "Portland",
      "addressRegion": "OR"
    }
  },
  "baseSalary": {
    "value": {
      "minValue": "18",
      "maxValue": "22",
      "unitText": "HOUR"
    }
  },
  "datePosted": "2026-02-25",
  "employmentType": "FULL_TIME"
}
</script>
</head><body>
<h1>Line Cook</h1>
<div class="job-description">
  <p>Join our kitchen team at Ox Restaurant. We are looking for an experienced line cook.</p>
</div>
</body></html>
`;

const DETAIL_PAGE_HTML_ONLY = `
<html><body>
<h1>Bartender</h1>
<div class="company-name">Departure</div>
<div class="job-description">
  <p>Mix craft cocktails at Portland's premier rooftop bar.</p>
</div>
</body></html>
`;

const DETAIL_PAGE_NO_TITLE = `
<html><body>
<div class="job-description">Some description without a title</div>
</body></html>
`;

const EMPTY_SEARCH_HTML = `
<html><body>
<div class="job-listings">
  <a href="/jobs/all/portland+or">All Portland Jobs</a>
</div>
</body></html>
`;

const SEARCH_WITH_ABSOLUTE_URLS = `
<html><body>
<div class="job-listings">
  <a href="https://poachedjobs.com/jobs/sous-chef-9999">Sous Chef</a>
</div>
</body></html>
`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new PoachedAdapter({
    id: "poached",
    name: "Poached Jobs",
    type: "scrape",
    isEnabled: true,
    config: {
      baseUrl: "https://poachedjobs.com",
      location: "portland+or",
      chromeCdpUrl: "http://localhost:9222",
      ...overrides,
    },
  });
}

describe("PoachedAdapter", () => {
  it("parses search page and detail pages with JSON-LD", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML) // search page
      .mockResolvedValueOnce(DETAIL_PAGE_JSON_LD) // first detail
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY); // second detail

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    // First listing (JSON-LD)
    expect(listings[0].title).toBe("Line Cook");
    expect(listings[0].company).toBe("Ox Restaurant");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].salaryRaw).toBe("$18-$22/hour");
    expect(listings[0].salaryMin).toBe(18);
    expect(listings[0].salaryMax).toBe(22);
    expect(listings[0].salaryUnit).toBe("hourly");
    expect(listings[0].employmentType).toBe("FULL_TIME");
    expect(listings[0].postedDate).toEqual(new Date("2026-02-25"));
    expect(listings[0].sourceUrl).toBe(
      "https://poachedjobs.com/jobs/line-cook-at-ox-restaurant-1234"
    );

    // Second listing (HTML fallback)
    expect(listings[1].title).toBe("Bartender");
    expect(listings[1].company).toBe("Departure");
    expect(listings[1].sourceUrl).toBe(
      "https://poachedjobs.com/jobs/bartender-at-departure-5678"
    );
  });

  it("deduplicates job links from search page", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML) // search page has duplicate link
      .mockResolvedValueOnce(DETAIL_PAGE_JSON_LD)
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY);

    const adapter = makeAdapter();
    await adapter.fetch();

    // Search page has the same link twice, but we should only fetch it once
    // 1 search + 2 unique detail pages = 3 calls
    expect(mockGetRenderedHtml).toHaveBeenCalledTimes(3);
  });

  it("skips /jobs/all/ links (search page links)", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML)
      .mockResolvedValueOnce(DETAIL_PAGE_JSON_LD)
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY);

    const adapter = makeAdapter();
    await adapter.fetch();

    // The /jobs/all/portland+or link appears in the search HTML but should
    // not be fetched as a detail page. The first call is the search page
    // itself; only the 2nd and 3rd calls should be detail page URLs.
    const detailUrls = mockGetRenderedHtml.mock.calls
      .slice(1) // skip search page call
      .map((call: unknown[]) => call[0]);
    expect(detailUrls).not.toContain(
      "https://poachedjobs.com/jobs/all/portland+or"
    );
    // Should only have 2 detail page calls (deduped from 3 links in HTML)
    expect(detailUrls).toHaveLength(2);
  });

  it("returns empty array when Chrome CDP is unavailable", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(false);
    mockGetRenderedHtml = vi.fn();

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
    expect(mockGetRenderedHtml).not.toHaveBeenCalled();
  });

  it("returns empty array when search page returns no HTML", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi.fn().mockResolvedValue(null);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("returns empty array when no job links found", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi.fn().mockResolvedValueOnce(EMPTY_SEARCH_HTML);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
    // Only the search page should be fetched
    expect(mockGetRenderedHtml).toHaveBeenCalledTimes(1);
  });

  it("skips detail pages that return no HTML", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML) // search page
      .mockResolvedValueOnce(null) // first detail fails
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY); // second succeeds

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Bartender");
  });

  it("skips detail pages that throw errors", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Bartender");
  });

  it("skips detail pages with no parseable title", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_PAGE_HTML)
      .mockResolvedValueOnce(DETAIL_PAGE_NO_TITLE) // no title -> skip
      .mockResolvedValueOnce(DETAIL_PAGE_HTML_ONLY);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Bartender");
  });

  it("handles absolute URLs in search page links", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_WITH_ABSOLUTE_URLS)
      .mockResolvedValueOnce(DETAIL_PAGE_JSON_LD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(mockGetRenderedHtml).toHaveBeenCalledWith(
      "https://poachedjobs.com/jobs/sous-chef-9999",
      expect.any(Object)
    );
  });

  it("extracts description HTML when available", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_WITH_ABSOLUTE_URLS)
      .mockResolvedValueOnce(DETAIL_PAGE_JSON_LD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].descriptionHtml).toContain(
      "<p>Join our kitchen team"
    );
  });

  it("handles search page fetch error gracefully", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(null); // search page returns null (navigation failed)

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("parses JSON-LD with only min salary", async () => {
    const detailWithMinOnly = `
    <html><head>
    <script type="application/ld+json">
    {
      "@type": "JobPosting",
      "title": "Dishwasher",
      "description": "Entry level position",
      "baseSalary": { "value": { "minValue": "15", "unitText": "HOUR" } }
    }
    </script>
    </head><body><h1>Dishwasher</h1></body></html>
    `;

    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi
      .fn()
      .mockResolvedValueOnce(SEARCH_WITH_ABSOLUTE_URLS)
      .mockResolvedValueOnce(detailWithMinOnly);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].salaryRaw).toBe("$15/hour");
    expect(listings[0].salaryMin).toBe(15);
    expect(listings[0].salaryMax).toBeUndefined();
    expect(listings[0].salaryUnit).toBe("hourly");
  });

  it("constructs correct search URL from config", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi.fn().mockResolvedValue(EMPTY_SEARCH_HTML);

    const adapter = makeAdapter({
      baseUrl: "https://poachedjobs.com",
      location: "seattle+wa",
    });
    await adapter.fetch();

    expect(mockGetRenderedHtml).toHaveBeenCalledWith(
      "https://poachedjobs.com/jobs/all/seattle+wa",
      expect.any(Object)
    );
  });

  it("passes correct waitForSelector options for search page", async () => {
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockGetRenderedHtml = vi.fn().mockResolvedValueOnce(EMPTY_SEARCH_HTML);

    const adapter = makeAdapter();
    await adapter.fetch();

    expect(mockGetRenderedHtml).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/all/"),
      expect.objectContaining({
        waitForSelector: 'a[href*="/jobs/"]',
      })
    );
  });
});
