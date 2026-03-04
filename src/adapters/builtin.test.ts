import { afterEach, describe, expect, it, vi } from "vitest";

import { BuiltInAdapter } from "./builtin.js";

const SEARCH_PAGE_HTML = `
<html><body>
<div data-id="job-card" data-builtin-track-job-id="111">
  <div data-id="job-card-title"><a href="/job/senior-engineer/111">Senior Engineer</a></div>
  <div data-id="company-title">Acme Corp</div>
</div>
<div data-id="job-card" data-builtin-track-job-id="222">
  <div data-id="job-card-title"><a href="/job/product-manager/222">Product Manager</a></div>
  <div data-id="company-title">TechCo</div>
</div>
</body></html>
`;

const SEARCH_PAGE_WITH_FEW_RESULTS = `
<html><body>
<div data-id="job-card" data-builtin-track-job-id="333">
  <div data-id="job-card-title"><a href="/job/designer/333">Designer</a></div>
  <div data-id="company-title">DesignHQ</div>
</div>
</body></html>
`;

const EMPTY_SEARCH_PAGE = `
<html><body>
<div id="content">No jobs found.</div>
</body></html>
`;

const SEARCH_PAGE_ITEMLIST_FALLBACK = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Data Analyst", "url": "https://builtin.com/job/data-analyst/444"},
    {"@type": "ListItem", "position": 2, "name": "DevOps Engineer", "url": "https://builtin.com/job/devops/555"}
  ]
}
</script>
</head><body>
<div id="content">Loading...</div>
</body></html>
`;

const CLOUDFLARE_CHALLENGE_PAGE = `<html><body><div class="cf-challenge">Please wait...</div></body></html>`;

const DETAIL_PAGE_WITH_JSONLD = `
<html><head>
<script type="application/ld+json">
{
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Engineer",
  "hiringOrganization": { "@type": "Organization", "name": "Acme Corp" },
  "jobLocation": {
    "@type": "Place",
    "address": { "@type": "PostalAddress", "addressLocality": "Portland", "addressRegion": "OR" }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": { "@type": "QuantitativeValue", "minValue": "120000", "maxValue": "160000", "unitText": "YEAR" }
  },
  "datePosted": "2026-02-15T00:00:00",
  "employmentType": "Full-Time"
}
</script>
</head><body>
<h1>Senior Engineer</h1>
<div class="job-description">
  <p>We are looking for a senior engineer to build amazing products.</p>
</div>
</body></html>
`;

const DETAIL_PAGE_WITH_GRAPH_JSONLD = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [{
    "@type": "JobPosting",
    "title": "Data Analyst",
    "description": "<p>We need a <b>data analyst</b> to join our Portland team.</p><ul><li>SQL proficiency required</li><li>Python preferred</li></ul>",
    "hiringOrganization": { "@type": "Organization", "name": "DataCo" },
    "jobLocation": [
      { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Portland", "addressRegion": "Oregon" } },
      { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Seattle", "addressRegion": "Washington" } }
    ],
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": { "@type": "QuantitativeValue", "minValue": "70000", "maxValue": "90000", "unitText": "YEAR" }
    },
    "datePosted": "2026-03-01",
    "employmentType": "FULL_TIME"
  }]
}
</script>
</head><body>
<h1>Data Analyst</h1>
</body></html>
`;

const DETAIL_PAGE_NO_JSONLD = `
<html><body>
<h1>Product Manager</h1>
<div data-id="company-title">TechCo</div>
<div class="job-description">
  <p>Lead product strategy for our Portland office.</p>
</div>
</body></html>
`;

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new BuiltInAdapter({
    id: "builtin-pdx",
    name: "Built In Portland",
    type: "scrape",
    isEnabled: true,
    config: {
      baseUrl: "https://builtin.com",
      searchPath: "/jobs/portland",
      maxPages: 5,
      ...overrides,
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

describe("BuiltInAdapter", () => {
  it("extracts job links from search page and fetches details", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML); // search page (only 2 results = early stop)
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

    expect(listings[0].title).toBe("Senior Engineer");
    expect(listings[0].company).toBe("Acme Corp");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].salaryRaw).toBe("$120000-$160000/year");
    expect(listings[0].salaryMin).toBe(120000);
    expect(listings[0].salaryMax).toBe(160000);
    expect(listings[0].salaryUnit).toBe("annual");
    expect(listings[0].employmentType).toBe("Full-Time");
    expect(listings[0].sourceUrl).toBe(
      "https://builtin.com/job/senior-engineer/111"
    );
  });

  it("extracts description from HTML body", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toContain("senior engineer");
  });

  it("falls back to HTML scraping when no JSON-LD present", async () => {
    mockFetchHtml(SEARCH_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[1].title).toBe("Product Manager");
    expect(listings[1].company).toBe("TechCo");
    expect(listings[1].description).toContain("product strategy");
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
    expect(listings[0].title).toBe("Product Manager");
  });

  it("handles search page returning non-OK status", async () => {
    mockFetchHtml("Server Error", false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("stops paginating when page has fewer than 10 results", async () => {
    mockFetchHtml(SEARCH_PAGE_WITH_FEW_RESULTS);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);

    const adapter = makeAdapter({ maxPages: 3 });
    const listings = await adapter.fetch();

    // Only 1 search page fetched (early stop), then 1 detail page
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(1);
  });

  it("falls back to ItemList JSON when no job cards found", async () => {
    mockFetchHtml(SEARCH_PAGE_ITEMLIST_FALLBACK); // search page with ItemList but no job cards
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);
    mockFetchHtml(DETAIL_PAGE_NO_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
    // Verify it fetched the URLs from the ItemList
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://builtin.com/job/data-analyst/444",
      expect.anything()
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://builtin.com/job/devops/555",
      expect.anything()
    );
  });

  it("stops on Cloudflare challenge page", async () => {
    mockFetchHtml(CLOUDFLARE_CHALLENGE_PAGE);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
    // Only 1 fetch — stopped after detecting challenge
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("parses @graph-wrapped JSON-LD with HTML description", async () => {
    mockFetchHtml(SEARCH_PAGE_WITH_FEW_RESULTS);
    mockFetchHtml(DETAIL_PAGE_WITH_GRAPH_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Data Analyst");
    expect(listings[0].company).toBe("DataCo");
    expect(listings[0].location).toBe("Portland, Oregon");
    expect(listings[0].salaryMin).toBe(70000);
    expect(listings[0].salaryMax).toBe(90000);
    expect(listings[0].salaryUnit).toBe("annual");
    expect(listings[0].employmentType).toBe("FULL_TIME");
    // Description should be stripped text from HTML
    expect(listings[0].description).toContain("data analyst");
    expect(listings[0].description).toContain("SQL proficiency required");
    // descriptionHtml should have the raw HTML
    expect(listings[0].descriptionHtml).toContain("<p>");
    expect(listings[0].descriptionHtml).toContain("<b>data analyst</b>");
  });

  it("deduplicates job links from search page", async () => {
    const duplicateLinksHtml = `
    <html><body>
    <div data-id="job-card">
      <div data-id="job-card-title"><a href="/job/engineer/111">Engineer</a></div>
    </div>
    <div data-id="job-card">
      <div data-id="job-card-title"><a href="/job/engineer/111">Engineer (duplicate)</a></div>
    </div>
    </body></html>`;

    mockFetchHtml(duplicateLinksHtml);
    mockFetchHtml(DETAIL_PAGE_WITH_JSONLD);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
  });
});
