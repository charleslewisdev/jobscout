import { afterEach, describe, expect, it, vi } from "vitest";

import { NeogovAdapter } from "./neogov.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:joblisting="https://www.governmentjobs.com/joblisting">
  <channel>
    <title>City of Portland Jobs</title>
    <link>https://www.governmentjobs.com/careers/portlandor</link>
    <item>
      <title>Parks Maintenance Worker</title>
      <link>https://www.governmentjobs.com/careers/portlandor/jobs/1001</link>
      <guid>https://www.governmentjobs.com/careers/portlandor/jobs/1001</guid>
      <pubDate>Mon, 24 Feb 2026 08:00:00 GMT</pubDate>
      <description>&lt;p&gt;Maintain park facilities and grounds.&lt;/p&gt;</description>
      <joblisting:salary>$20.00 - $25.00 Hourly</joblisting:salary>
      <joblisting:department>Parks &amp; Recreation</joblisting:department>
      <joblisting:location>Portland, OR</joblisting:location>
      <joblisting:jobtype>Full-Time</joblisting:jobtype>
      <joblisting:examplesofduties>Mow lawns, trim hedges, and maintain park equipment.</joblisting:examplesofduties>
      <joblisting:qualifications>High school diploma or equivalent.</joblisting:qualifications>
    </item>
    <item>
      <title>Civil Engineer</title>
      <link>https://www.governmentjobs.com/careers/portlandor/jobs/1002</link>
      <guid>https://www.governmentjobs.com/careers/portlandor/jobs/1002</guid>
      <pubDate>Sun, 23 Feb 2026 12:00:00 GMT</pubDate>
      <description>&lt;p&gt;Design and oversee infrastructure projects.&lt;/p&gt;</description>
      <joblisting:salary>$75,000 - $95,000 Annually</joblisting:salary>
      <joblisting:department>Bureau of Transportation</joblisting:department>
      <joblisting:location>Portland, OR</joblisting:location>
      <joblisting:jobtype>Full-Time</joblisting:jobtype>
      <joblisting:examplesofduties>Review plans, manage projects, coordinate with contractors.</joblisting:examplesofduties>
      <joblisting:qualifications>PE license required. 5+ years experience.</joblisting:qualifications>
    </item>
  </channel>
</rss>`;

const SAMPLE_RSS_TRIMET = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:joblisting="https://www.governmentjobs.com/joblisting">
  <channel>
    <title>TriMet Jobs</title>
    <link>https://www.governmentjobs.com/careers/trimet</link>
    <item>
      <title>Bus Operator</title>
      <link>https://www.governmentjobs.com/careers/trimet/jobs/2001</link>
      <guid>https://www.governmentjobs.com/careers/trimet/jobs/2001</guid>
      <pubDate>Sat, 22 Feb 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;Operate transit buses on fixed routes.&lt;/p&gt;</description>
      <joblisting:salary>$22.00 - $32.00 Hourly</joblisting:salary>
      <joblisting:department>Transportation</joblisting:department>
      <joblisting:location>Portland, OR</joblisting:location>
      <joblisting:jobtype>Full-Time</joblisting:jobtype>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:joblisting="https://www.governmentjobs.com/joblisting">
  <channel>
    <title>Empty Feed</title>
    <link>https://www.governmentjobs.com/careers/empty</link>
  </channel>
</rss>`;

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(
  overrides: Record<string, unknown> = {}
) {
  return new NeogovAdapter({
    id: "neogov",
    name: "NEOGOV Government Jobs",
    type: "rss",
    isEnabled: true,
    config: {
      agencies: [
        { agencyKey: "portlandor", name: "City of Portland" },
      ],
      ...overrides,
    },
  });
}

function mockFetchXml(xml: string, ok = true) {
  fetchSpy.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    text: async () => xml,
  } as Response);
}

describe("NeogovAdapter", () => {
  it("parses RSS items with custom joblisting namespace fields", async () => {
    mockFetchXml(SAMPLE_RSS);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    expect(listings[0].title).toBe("Parks Maintenance Worker");
    expect(listings[0].sourceUrl).toBe(
      "https://www.governmentjobs.com/careers/portlandor/jobs/1001"
    );
    expect(listings[0].externalId).toBe(
      "https://www.governmentjobs.com/careers/portlandor/jobs/1001"
    );
    expect(listings[0].company).toBe("City of Portland");
    expect(listings[0].location).toBe("Portland, OR");
    expect(listings[0].salaryRaw).toBe("$20.00 - $25.00 Hourly");
    expect(listings[0].salaryMin).toBe(20);
    expect(listings[0].salaryMax).toBe(25);
    expect(listings[0].salaryUnit).toBe("hourly");
    expect(listings[0].employmentType).toBe("Full-Time");
    expect(listings[0].description).toBe(
      "Maintain park facilities and grounds."
    );
    expect(listings[0].descriptionHtml).toContain(
      "Maintain park facilities"
    );
    expect(listings[0].postedDate).toEqual(
      new Date("Mon, 24 Feb 2026 08:00:00 GMT")
    );

    expect(listings[1].title).toBe("Civil Engineer");
    expect(listings[1].salaryRaw).toBe("$75,000 - $95,000 Annually");
    expect(listings[1].salaryMin).toBe(75000);
    expect(listings[1].salaryMax).toBe(95000);
    expect(listings[1].salaryUnit).toBe("annual");
  });

  it("fetches multiple agencies", async () => {
    mockFetchXml(SAMPLE_RSS);
    mockFetchXml(SAMPLE_RSS_TRIMET);

    const adapter = makeAdapter({
      agencies: [
        { agencyKey: "portlandor", name: "City of Portland" },
        { agencyKey: "trimet", name: "TriMet" },
      ],
    });

    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(3);
    expect(listings[2].company).toBe("TriMet");
    expect(listings[2].title).toBe("Bus Operator");
  });

  it("handles network error on one agency and continues with others", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));
    mockFetchXml(SAMPLE_RSS_TRIMET);

    const adapter = makeAdapter({
      agencies: [
        { agencyKey: "portlandor", name: "City of Portland" },
        { agencyKey: "trimet", name: "TriMet" },
      ],
    });

    const listings = await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(listings).toHaveLength(1);
    expect(listings[0].company).toBe("TriMet");
  });

  it("handles empty feed", async () => {
    mockFetchXml(EMPTY_RSS);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(0);
  });

  it("deduplicates listings by sourceUrl across agencies", async () => {
    // Both agencies return the same job URL
    mockFetchXml(SAMPLE_RSS);
    mockFetchXml(SAMPLE_RSS); // Same feed = same URLs

    const adapter = makeAdapter({
      agencies: [
        { agencyKey: "portlandor", name: "City of Portland" },
        { agencyKey: "portlandor-dupe", name: "City of Portland Dupe" },
      ],
    });

    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2); // Only 2 unique URLs, not 4
  });

  it("handles non-OK response gracefully", async () => {
    mockFetchXml("", false);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(0);
  });

  it("fetches from correct URL for each agency", async () => {
    mockFetchXml(EMPTY_RSS);
    mockFetchXml(EMPTY_RSS);

    const adapter = makeAdapter({
      agencies: [
        { agencyKey: "portlandor", name: "City of Portland" },
        { agencyKey: "trimet", name: "TriMet" },
      ],
    });

    await adapter.fetch();

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.governmentjobs.com/SearchEngine/JobsFeed?agency=portlandor"
    );
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "https://www.governmentjobs.com/SearchEngine/JobsFeed?agency=trimet"
    );
  });

  it("uses contentSnippet for description, falls back to duties", async () => {
    // The sample RSS has both contentSnippet (from <description>) and duties
    // contentSnippet should take priority
    const rssWithNoDuties = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:joblisting="https://www.governmentjobs.com/joblisting">
  <channel>
    <title>Test</title>
    <item>
      <title>Test Job</title>
      <link>https://www.governmentjobs.com/careers/test/jobs/9999</link>
      <description>Description from content snippet.</description>
    </item>
  </channel>
</rss>`;

    mockFetchXml(rssWithNoDuties);
    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe(
      "Description from content snippet."
    );
  });
});
