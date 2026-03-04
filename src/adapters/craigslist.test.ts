import { afterEach, describe, expect, it, vi } from "vitest";

import { CraigslistAdapter } from "./craigslist.js";

// Sample HTML matching modern Craigslist search results
const SEARCH_RESULTS_HTML = `
<html><body>
<ol class="cl-static-search-results">
  <li class="cl-static-search-result">
    <a href="/mlt/lab/d/warehouse-worker/123.html">
      <span class="title">Warehouse Worker Needed</span>
    </a>
    <span class="price">$20/hr</span>
    <span class="location">Portland</span>
  </li>
  <li class="cl-static-search-result">
    <a href="https://portland.craigslist.org/mlt/lab/d/barista/456.html">
      <span class="title">Barista - Coffee Shop Downtown</span>
    </a>
    <span class="price">$18/hr</span>
    <span class="location">Pearl District</span>
  </li>
</ol>
</body></html>
`;

const DETAIL_PAGE_HTML = `
<html><body>
<section id="postingbody">
  <div class="print-information print-qrcode-container">
    <p class="print-qrcode-label">QR Code Link to This Post</p>
  </div>
We are hiring a warehouse worker for our Portland location.<br>
<br>
Requirements:<br>
- Must be able to lift 50 lbs<br>
- Reliable transportation
</section>
</body></html>
`;

const DETAIL_PAGE_HTML_2 = `
<html><body>
<section id="postingbody">
  <div class="print-information print-qrcode-container">
    <p class="print-qrcode-label">QR Code Link to This Post</p>
  </div>
Looking for an experienced barista for our downtown coffee shop.
</section>
</body></html>
`;

const DETAIL_PAGE_NO_BODY = `
<html><body>
<h1>Post not found</h1>
</body></html>
`;

const EMPTY_RESULTS_HTML = `
<html><body>
<ol class="cl-static-search-results"></ol>
</body></html>
`;

const OLD_FORMAT_HTML = `
<html><body>
<div class="result-info">
  <a class="result-title" href="/mlt/lab/d/cook/789.html">Line Cook</a>
  <span class="result-price">$22/hr</span>
  <span class="result-hood">(SE Portland)</span>
  <time class="result-date" datetime="2026-02-25T10:00:00Z"></time>
</div>
</body></html>
`;

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new CraigslistAdapter({
    id: "craigslist-pdx",
    name: "Craigslist Portland",
    type: "scrape",
    isEnabled: true,
    config: {
      region: "portland",
      categories: ["jjj"],
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

describe("CraigslistAdapter", () => {
  it("parses modern search results and fetches detail pages", async () => {
    mockFetchHtml(SEARCH_RESULTS_HTML); // search page
    mockFetchHtml(DETAIL_PAGE_HTML);    // detail page 1
    mockFetchHtml(DETAIL_PAGE_HTML_2);  // detail page 2

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
    expect(listings[0].title).toBe("Warehouse Worker Needed");
    expect(listings[0].sourceUrl).toBe(
      "https://portland.craigslist.org/mlt/lab/d/warehouse-worker/123.html"
    );
    expect(listings[0].salaryRaw).toBe("$20/hr");
    expect(listings[0].salaryMin).toBe(20);
    expect(listings[0].salaryMax).toBe(20);
    expect(listings[0].salaryUnit).toBe("hourly");
    expect(listings[0].location).toBe("Portland");
    // Description comes from detail page, not title
    expect(listings[0].description).toContain("warehouse worker");
    expect(listings[0].description).toContain("lift 50 lbs");
    // QR code div should be removed
    expect(listings[0].description).not.toContain("QR Code");
    expect(listings[0].descriptionHtml).toBeDefined();
  });

  it("handles absolute URLs in href", async () => {
    mockFetchHtml(SEARCH_RESULTS_HTML);
    mockFetchHtml(DETAIL_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_HTML_2);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // Second listing has absolute URL
    expect(listings[1].sourceUrl).toBe(
      "https://portland.craigslist.org/mlt/lab/d/barista/456.html"
    );
  });

  it("handles multiple categories", async () => {
    mockFetchHtml(SEARCH_RESULTS_HTML); // search cat 1
    mockFetchHtml(SEARCH_RESULTS_HTML); // search cat 2
    // 4 detail pages (2 per category)
    mockFetchHtml(DETAIL_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_HTML_2);
    mockFetchHtml(DETAIL_PAGE_HTML);
    mockFetchHtml(DETAIL_PAGE_HTML_2);

    const adapter = makeAdapter({ categories: ["jjj", "lab"] });
    const listings = await adapter.fetch();

    // 2 results per category × 2 categories = 4
    expect(listings).toHaveLength(4);
    // 2 search + 4 detail = 6
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it("returns empty array when search page returns non-OK status", async () => {
    mockFetchHtml("Server Error", false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("handles empty results page", async () => {
    mockFetchHtml(EMPTY_RESULTS_HTML);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toEqual([]);
  });

  it("falls back to old format selectors", async () => {
    mockFetchHtml(OLD_FORMAT_HTML);  // search page
    mockFetchHtml(DETAIL_PAGE_HTML); // detail page

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Line Cook");
    expect(listings[0].salaryRaw).toBe("$22/hr");
    expect(listings[0].salaryMin).toBe(22);
    expect(listings[0].salaryMax).toBe(22);
    expect(listings[0].salaryUnit).toBe("hourly");
    expect(listings[0].location).toBe("SE Portland");
    expect(listings[0].postedDate).toEqual(
      new Date("2026-02-25T10:00:00Z")
    );
  });

  it("keeps title as description when detail page has no #postingbody", async () => {
    mockFetchHtml(SEARCH_RESULTS_HTML);
    mockFetchHtml(DETAIL_PAGE_NO_BODY);
    mockFetchHtml(DETAIL_PAGE_NO_BODY);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe("Warehouse Worker Needed");
    expect(listings[0].descriptionHtml).toBeUndefined();
  });

  it("keeps title as description when detail page fetch fails", async () => {
    mockFetchHtml(SEARCH_RESULTS_HTML);
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));
    mockFetchHtml(DETAIL_PAGE_HTML_2);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    // First listing failed, keeps title
    expect(listings[0].description).toBe("Warehouse Worker Needed");
    // Second listing succeeded
    expect(listings[1].description).toContain("experienced barista");
  });
});
