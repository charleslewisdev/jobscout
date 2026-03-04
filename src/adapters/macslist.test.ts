import { afterEach, describe, expect, it, vi } from "vitest";

import { MacsListAdapter } from "./macslist.js";

// Simplified version of the real search page structure
const SEARCH_PAGE_HTML = `
<html><body>
<div id="ctl00_MainContent_lvJob">
  <a href="/job/abc123/barista/portland/or">Barista</a>
  <p>Friendly coffee shop seeks experienced barista</p>
  <a href="/job/def456/event-coordinator/portland/or">Event Coordinator</a>
  <p>Plan and execute community events</p>
</div>
</body></html>
`;

const DETAIL_PAGE_WITH_JSONLD = `
<html><head>
<script type="application/ld+json">
{
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "title": "Barista",
  "hiringOrganization": { "@type": "Organization", "name": "Nossa Familia Coffee" },
  "jobLocation": {
    "@type": "Place",
    "address": { "@type": "PostalAddress", "addressLocality": "Portland", "addressRegion": "OR" }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": { "@type": "QuantitativeValue", "minValue": "18.00", "maxValue": "22.00", "unitText": "HOUR" }
  },
  "datePosted": "2026-02-20T10:00:00.0000000",
  "employmentType": "Full-Time"
}
</script>
</head><body>
<h1>Barista</h1>
<div class="job-description">
  <p>We are looking for an experienced barista to join our SE Portland cafe.</p>
</div>
</body></html>
`;

const DETAIL_PAGE_NO_JSONLD = `
<html><body>
<h1>Event Coordinator</h1>
<a href="/employerjoblist/xyz/789">TEKsystems</a>
<div class="job-description">
  <p>Plan and execute corporate events in the Portland metro area.</p>
</div>
</body></html>
`;

const EMPTY_SEARCH_PAGE = `
<html><body>
<div id="ctl00_MainContent_lvJob">
  <p>No results found.</p>
</div>
</body></html>
`;

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter() {
  return new MacsListAdapter({
    id: "macslist",
    name: "Mac's List",
    type: "scrape",
    isEnabled: true,
    config: {
      baseUrl: "https://jobs.macslist.org",
      searchPath: "/search/-/portland,%20or",
    },
  });
}

function mockFetchHtml(html: string, ok = true) {
  fetchSpy.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    text: async () => html,
  } as Response);
}

describe("MacsListAdapter", () => {
  it("extracts job links from search page and fetches details", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
  });

  it("parses JSON-LD structured data from detail pages", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].title).toBe("Barista");
    expect(listings[0].company).toBe("Nossa Familia Coffee");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].salaryRaw).toBe("$18.00-$22.00/hour");
    expect(listings[0].salaryMin).toBe(18);
    expect(listings[0].salaryMax).toBe(22);
    expect(listings[0].salaryUnit).toBe("hourly");
    expect(listings[0].employmentType).toBe("Full-Time");
    expect(listings[0].sourceUrl).toBe(
      "https://jobs.macslist.org/job/abc123/barista/portland/or"
    );
  });

  it("extracts description from HTML body", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toContain("experienced barista");
  });

  it("falls back to HTML scraping when no JSON-LD present", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[1].title).toBe("Event Coordinator");
    expect(listings[1].company).toBe("TEKsystems");
    expect(listings[1].description).toContain("corporate events");
  });

  it("handles empty search results page", async () => {
    mockFetchHtml(EMPTY_SEARCH_PAGE);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles search page network error gracefully", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("skips detail pages that fail and continues", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    fetchSpy.mockRejectedValueOnce(new Error("Detail page error"));
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Event Coordinator");
  });

  it("deduplicates job links from search page", async () => {
    const duplicateLinksHtml = `
    <html><body>
      <a href="/job/abc123/barista/portland/or">Barista</a>
      <a href="/job/abc123/barista/portland/or">Barista (duplicate link)</a>
    </body></html>`;

    mockFetchHtml(duplicateLinksHtml);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
  });

  it("handles search page returning non-OK status", async () => {
    mockFetchHtml("Server Error", false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });
});
