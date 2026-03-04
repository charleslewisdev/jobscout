import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkdayAdapter } from "./workday.js";

const SAMPLE_LIST_RESPONSE = {
  total: 2,
  jobPostings: [
    {
      title: "Administrative Specialist",
      externalPath: "/job/Administrative-Specialist_REQ-1001",
      locationsText: "Salem, OR",
      postedOn: "2026-02-20",
      bulletFields: ["Full-time position", "State benefits included"],
    },
    {
      title: "Park Ranger",
      externalPath: "/job/Park-Ranger_REQ-1002",
      locationsText: "Portland, OR",
      postedOn: "2026-02-22",
      bulletFields: ["Seasonal position", "Outdoor work environment"],
    },
  ],
};

const SAMPLE_DETAIL_1 = {
  jobPostingInfo: {
    title: "Administrative Specialist",
    jobDescription:
      "<p>Join our team as an Administrative Specialist.</p><p>Salary Range: $3,500 - $5,200 monthly</p><p>Duties include data entry, filing, and correspondence.</p>",
    location: "Salem, OR",
    timeType: "Full time",
    startDate: "2026-02-20",
    jobReqId: "REQ-1001",
    externalUrl:
      "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/Administrative-Specialist_REQ-1001",
  },
};

const SAMPLE_DETAIL_2 = {
  jobPostingInfo: {
    title: "Park Ranger",
    jobDescription:
      "<p>Protect and manage state park resources.</p><p>Requirements: valid driver's license.</p>",
    location: "Portland, OR",
    timeType: "Full time",
    startDate: "2026-02-22",
    jobReqId: "REQ-1002",
    externalUrl:
      "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/Park-Ranger_REQ-1002",
  },
};

const DEFAULT_SITE = {
  baseUrl: "https://oregon.wd5.myworkdayjobs.com",
  org: "oregon",
  siteName: "SOR_External_Career_Site",
  name: "State of Oregon",
};

const MULTCO_SITE = {
  baseUrl: "https://multco.wd1.myworkdayjobs.com",
  org: "multco",
  siteName: "Multco_Jobs",
  name: "Multnomah County",
};

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new WorkdayAdapter({
    id: "workday-gov",
    name: "Workday Government Jobs",
    type: "api",
    isEnabled: true,
    config: {
      sites: [DEFAULT_SITE],
      limit: 20,
      maxResults: 100,
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

describe("WorkdayAdapter", () => {
  it("parses list + detail responses into RawJobListing[]", async () => {
    mockFetchJson(SAMPLE_LIST_RESPONSE); // POST list
    mockFetchJson(SAMPLE_DETAIL_1); // GET detail 1
    mockFetchJson(SAMPLE_DETAIL_2); // GET detail 2

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    // First listing — has salary in description
    expect(listings[0].title).toBe("Administrative Specialist");
    expect(listings[0].sourceUrl).toBe(
      "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/Administrative-Specialist_REQ-1001"
    );
    expect(listings[0].externalId).toBe("REQ-1001");
    expect(listings[0].company).toBe("State of Oregon");
    expect(listings[0].location).toBe("Salem, OR");
    expect(listings[0].salaryRaw).toBe(
      "Salary Range: $3,500 - $5,200 monthly"
    );
    expect(listings[0].salaryMin).toBe(3500);
    expect(listings[0].salaryMax).toBe(5200);
    expect(listings[0].salaryUnit).toBe("monthly");
    expect(listings[0].description).toContain(
      "Join our team as an Administrative Specialist"
    );
    expect(listings[0].descriptionHtml).toContain("<p>");
    expect(listings[0].employmentType).toBe("Full time");
    expect(listings[0].postedDate).toEqual(new Date("2026-02-20"));

    // Second listing — no salary
    expect(listings[1].title).toBe("Park Ranger");
    expect(listings[1].externalId).toBe("REQ-1002");
    expect(listings[1].salaryRaw).toBeUndefined();
    expect(listings[1].salaryMin).toBeUndefined();
    expect(listings[1].salaryMax).toBeUndefined();
    expect(listings[1].salaryUnit).toBeUndefined();
    expect(listings[1].location).toBe("Portland, OR");
  });

  it("constructs correct POST body for list endpoint", async () => {
    mockFetchJson({ total: 0, jobPostings: [] });

    const adapter = makeAdapter({ limit: 10 });
    await adapter.fetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(
      "https://oregon.wd5.myworkdayjobs.com/wday/cxs/oregon/SOR_External_Career_Site/jobs"
    );
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      appliedFacets: {},
      limit: 10,
      offset: 0,
      searchText: "",
    });
  });

  it("paginates via offset until all results fetched", async () => {
    const page1 = {
      total: 3,
      jobPostings: [
        {
          title: "Job A",
          externalPath: "/job/Job-A_REQ-100",
          locationsText: "Portland, OR",
          bulletFields: ["Bullet A"],
        },
        {
          title: "Job B",
          externalPath: "/job/Job-B_REQ-101",
          locationsText: "Portland, OR",
          bulletFields: ["Bullet B"],
        },
      ],
    };
    const page2 = {
      total: 3,
      jobPostings: [
        {
          title: "Job C",
          externalPath: "/job/Job-C_REQ-102",
          locationsText: "Portland, OR",
          bulletFields: ["Bullet C"],
        },
      ],
    };

    function makeDetail(id: number) {
      return {
        jobPostingInfo: {
          title: `Job ${String.fromCharCode(65 + id)}`,
          jobDescription: "<p>Description</p>",
          location: "Portland, OR",
          timeType: "Full time",
          jobReqId: `REQ-${100 + id}`,
          externalUrl: `https://example.com/job/${100 + id}`,
        },
      };
    }

    // Page 1 list + 2 details
    mockFetchJson(page1);
    mockFetchJson(makeDetail(0));
    mockFetchJson(makeDetail(1));
    // Page 2 list + 1 detail
    mockFetchJson(page2);
    mockFetchJson(makeDetail(2));

    const adapter = makeAdapter({ limit: 2 });
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(3);

    // Verify two list POST calls were made
    const postCalls = fetchSpy.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(2);

    // Check offsets
    const body1 = JSON.parse(
      (postCalls[0][1] as RequestInit).body as string
    );
    const body2 = JSON.parse(
      (postCalls[1][1] as RequestInit).body as string
    );
    expect(body1.offset).toBe(0);
    expect(body2.offset).toBe(2);
  });

  it("handles detail fetch failure by falling back to list data", async () => {
    mockFetchJson(SAMPLE_LIST_RESPONSE); // POST list
    fetchSpy.mockRejectedValueOnce(new Error("Network error")); // detail 1 fails
    mockFetchJson(SAMPLE_DETAIL_2); // detail 2 succeeds

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);

    // First listing used fallback (list data)
    expect(listings[0].title).toBe("Administrative Specialist");
    expect(listings[0].sourceUrl).toBe(
      "https://oregon.wd5.myworkdayjobs.com/wday/cxs/oregon/SOR_External_Career_Site/job/Administrative-Specialist_REQ-1001"
    );
    expect(listings[0].description).toBe(
      "Full-time position State benefits included"
    );
    expect(listings[0].descriptionHtml).toBeUndefined();
    expect(listings[0].salaryRaw).toBeUndefined();
    expect(listings[0].employmentType).toBeUndefined();
    expect(listings[0].externalId).toBeUndefined();
    expect(listings[0].company).toBe("State of Oregon");
    expect(listings[0].location).toBe("Salem, OR");

    // Second listing used detail data
    expect(listings[1].title).toBe("Park Ranger");
    expect(listings[1].externalId).toBe("REQ-1002");
  });

  it("handles site-level failure and continues with other sites", async () => {
    // First site fails entirely
    fetchSpy.mockRejectedValueOnce(new Error("Site down"));

    // Second site succeeds
    const multcoList = {
      total: 1,
      jobPostings: [
        {
          title: "County Clerk",
          externalPath: "/job/County-Clerk_REQ-500",
          locationsText: "Portland, OR",
          bulletFields: ["Clerk duties"],
        },
      ],
    };
    const multcoDetail = {
      jobPostingInfo: {
        title: "County Clerk",
        jobDescription: "<p>Process legal documents.</p>",
        location: "Portland, OR",
        timeType: "Full time",
        jobReqId: "REQ-500",
        externalUrl:
          "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Jobs/job/County-Clerk_REQ-500",
      },
    };

    mockFetchJson(multcoList);
    mockFetchJson(multcoDetail);

    const adapter = makeAdapter({
      sites: [DEFAULT_SITE, MULTCO_SITE],
    });
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("County Clerk");
    expect(listings[0].company).toBe("Multnomah County");
  });

  it("processes multiple sites", async () => {
    // Oregon site
    const oregonList = {
      total: 1,
      jobPostings: [
        {
          title: "State Accountant",
          externalPath: "/job/State-Accountant_REQ-200",
          locationsText: "Salem, OR",
          bulletFields: ["Finance role"],
        },
      ],
    };
    const oregonDetail = {
      jobPostingInfo: {
        title: "State Accountant",
        jobDescription: "<p>Manage state financial records.</p>",
        location: "Salem, OR",
        timeType: "Full time",
        jobReqId: "REQ-200",
        externalUrl:
          "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/State-Accountant_REQ-200",
      },
    };

    // Multnomah County site
    const multcoList = {
      total: 1,
      jobPostings: [
        {
          title: "Social Worker",
          externalPath: "/job/Social-Worker_REQ-300",
          locationsText: "Portland, OR",
          bulletFields: ["Social services"],
        },
      ],
    };
    const multcoDetail = {
      jobPostingInfo: {
        title: "Social Worker",
        jobDescription:
          "<p>Provide case management services. Salary Range: $55,000 - $72,000 annually.</p>",
        location: "Portland, OR",
        timeType: "Full time",
        jobReqId: "REQ-300",
        externalUrl:
          "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Jobs/job/Social-Worker_REQ-300",
      },
    };

    mockFetchJson(oregonList);
    mockFetchJson(oregonDetail);
    mockFetchJson(multcoList);
    mockFetchJson(multcoDetail);

    const adapter = makeAdapter({
      sites: [DEFAULT_SITE, MULTCO_SITE],
    });
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(2);
    expect(listings[0].company).toBe("State of Oregon");
    expect(listings[0].title).toBe("State Accountant");
    expect(listings[1].company).toBe("Multnomah County");
    expect(listings[1].title).toBe("Social Worker");
    expect(listings[1].salaryRaw).toBe(
      "Salary Range: $55,000 - $72,000 annually"
    );
    expect(listings[1].salaryMin).toBe(55000);
    expect(listings[1].salaryMax).toBe(72000);
    expect(listings[1].salaryUnit).toBe("annual");
  });

  it("handles empty results", async () => {
    mockFetchJson({ total: 0, jobPostings: [] });

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(0);
  });

  it("respects maxResults cap", async () => {
    const listResponse = {
      total: 50,
      jobPostings: Array.from({ length: 5 }, (_, i) => ({
        title: `Job ${i}`,
        externalPath: `/job/Job-${i}_REQ-${i}`,
        locationsText: "Portland, OR",
        bulletFields: [`Bullet ${i}`],
      })),
    };

    function makeDetail(i: number) {
      return {
        jobPostingInfo: {
          title: `Job ${i}`,
          jobDescription: "<p>Description</p>",
          location: "Portland, OR",
          timeType: "Full time",
          jobReqId: `REQ-${i}`,
          externalUrl: `https://example.com/job/${i}`,
        },
      };
    }

    // With maxResults=3, should stop after 3 detail fetches
    mockFetchJson(listResponse);
    mockFetchJson(makeDetail(0));
    mockFetchJson(makeDetail(1));
    mockFetchJson(makeDetail(2));

    const adapter = makeAdapter({ maxResults: 3, limit: 5 });
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(3);
  });

  it("handles non-OK list response", async () => {
    mockFetchJson({ error: "Server Error" }, false);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(0);
  });

  it("handles detail non-OK response by falling back to list data", async () => {
    const listResponse = {
      total: 1,
      jobPostings: [
        {
          title: "Test Job",
          externalPath: "/job/Test-Job_REQ-999",
          locationsText: "Portland, OR",
          bulletFields: ["Fallback description"],
        },
      ],
    };

    mockFetchJson(listResponse);
    mockFetchJson({}, false); // detail returns non-OK

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Test Job");
    expect(listings[0].description).toBe("Fallback description");
    expect(listings[0].sourceUrl).toBe(
      "https://oregon.wd5.myworkdayjobs.com/wday/cxs/oregon/SOR_External_Career_Site/job/Test-Job_REQ-999"
    );
  });

  it("extracts salary from dollar range without Salary Range prefix", async () => {
    const listResponse = {
      total: 1,
      jobPostings: [
        {
          title: "Test Job",
          externalPath: "/job/Test_REQ-888",
          locationsText: "Portland, OR",
          bulletFields: [],
        },
      ],
    };
    const detail = {
      jobPostingInfo: {
        title: "Test Job",
        jobDescription:
          "<p>Great opportunity paying $45,000 - $60,000 per year.</p>",
        location: "Portland, OR",
        timeType: "Full time",
        jobReqId: "REQ-888",
        externalUrl: "https://example.com/job",
      },
    };

    mockFetchJson(listResponse);
    mockFetchJson(detail);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].salaryRaw).toBe("$45,000 - $60,000 per year");
    expect(listings[0].salaryMin).toBe(45000);
    expect(listings[0].salaryMax).toBe(60000);
    expect(listings[0].salaryUnit).toBe("annual");
  });

  it("strips HTML tags from description", async () => {
    const listResponse = {
      total: 1,
      jobPostings: [
        {
          title: "HTML Job",
          externalPath: "/job/HTML-Job_REQ-777",
          locationsText: "Portland, OR",
          bulletFields: [],
        },
      ],
    };
    const detail = {
      jobPostingInfo: {
        title: "HTML Job",
        jobDescription:
          "<h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p><ul><li>Item 1</li><li>Item 2</li></ul>",
        location: "Portland, OR",
        timeType: "Full time",
        jobReqId: "REQ-777",
        externalUrl: "https://example.com/job",
      },
    };

    mockFetchJson(listResponse);
    mockFetchJson(detail);

    const adapter = makeAdapter();
    const listings = await adapter.fetch();

    expect(listings[0].description).toBe(
      "Title Paragraph with bold text. Item 1 Item 2"
    );
    expect(listings[0].descriptionHtml).toContain("<strong>");
  });
});
