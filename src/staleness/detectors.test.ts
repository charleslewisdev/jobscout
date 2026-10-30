import { describe, expect, it } from "vitest";

import {
  adzunaDetector,
  careerjetDetector,
  defaultDetector,
  type DetectorResult,
  getDetector,
  isFetchAllowed,
  macslistDetector,
  neogovDetector,
  workdayDetector,
} from "./detectors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock Response with the given status and optional body/URL. */
function mockResponse(
  status: number,
  body = "",
  responseUrl?: string,
): Response {
  const res = new Response(body, { status });
  if (responseUrl) {
    Object.defineProperty(res, "url", { value: responseUrl });
  }
  return res;
}

// ---------------------------------------------------------------------------
// defaultDetector
// ---------------------------------------------------------------------------

describe("defaultDetector", () => {
  it("returns expired for 404", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "HTTP 404",
    });
  });

  it("returns expired for 410 Gone", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(410));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "HTTP 410",
    });
  });

  it("returns unknown for 200", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(200));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Cannot determine from status alone");
  });

  it("returns unknown for 301 redirect", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(301));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 302 redirect", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(302));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 403 Forbidden", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(403));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Site unavailable or blocking");
  });

  it("returns unknown for 429 rate limit", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(429));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Site unavailable or blocking");
  });

  it("returns unknown for 500 server error", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(500));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Site unavailable or blocking");
  });

  it("returns unknown for 503 server error", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(503));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Site unavailable or blocking");
  });

  it("returns unknown for unhandled status codes", async () => {
    const result = await defaultDetector("https://example.com/job/1", mockResponse(418));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Unhandled HTTP 418");
  });
});

// ---------------------------------------------------------------------------
// workdayDetector
// ---------------------------------------------------------------------------

describe("workdayDetector", () => {
  const url = "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Careers/job/123";

  it("returns expired for 404", async () => {
    const result = await workdayDetector(url, mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Workday posting removed",
    });
  });

  it("returns active for 200", async () => {
    const result = await workdayDetector(url, mockResponse(200, "<html>job details</html>"));
    expect(result).toEqual<DetectorResult>({
      verdict: "active",
      reason: "Workday posting still accessible",
    });
  });

  it("returns unknown for 403", async () => {
    const result = await workdayDetector(url, mockResponse(403));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 500", async () => {
    const result = await workdayDetector(url, mockResponse(500));
    expect(result.verdict).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// neogovDetector
// ---------------------------------------------------------------------------

describe("neogovDetector", () => {
  const url = "https://www.governmentjobs.com/careers/multnomah/jobs/12345";

  it("returns expired for 404", async () => {
    const result = await neogovDetector(url, mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "NEOGOV posting not found",
    });
  });

  it('returns expired when body contains "This recruitment has closed"', async () => {
    const html = `<html><body>
      <div class="notice">This recruitment has closed.</div>
    </body></html>`;
    const result = await neogovDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "NEOGOV recruitment closed",
    });
  });

  it('returns expired when body contains "Recruitment Closed"', async () => {
    const html = `<html><body>
      <span class="status">Recruitment Closed</span>
    </body></html>`;
    const result = await neogovDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
    expect(result.reason).toBe("NEOGOV recruitment closed");
  });

  it('returns expired when body contains "Application Period Closed"', async () => {
    const html = `<html><body>
      <div>Application Period: Closed</div>
    </body></html>`;
    const result = await neogovDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it("returns active for 200 with open posting", async () => {
    const html = `<html><body>
      <h1>Administrative Assistant</h1>
      <div>Application Period: Open until filled</div>
    </body></html>`;
    const result = await neogovDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "active",
      reason: "NEOGOV posting still open",
    });
  });

  it("returns unknown for 403", async () => {
    const result = await neogovDetector(url, mockResponse(403));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 500", async () => {
    const result = await neogovDetector(url, mockResponse(500));
    expect(result.verdict).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// macslistDetector
// ---------------------------------------------------------------------------

describe("macslistDetector", () => {
  const url = "https://jobs.macslist.org/jobs/12345";

  it("returns expired for 404", async () => {
    const result = await macslistDetector(url, mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Mac's List posting not found",
    });
  });

  it('returns expired when body contains "This job is no longer available"', async () => {
    const html = `<html><body>
      <div class="alert">This job is no longer available.</div>
    </body></html>`;
    const result = await macslistDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Mac's List posting expired",
    });
  });

  it('returns expired when body contains "job has been removed"', async () => {
    const html = `<html><body><p>This job has been removed from our site.</p></body></html>`;
    const result = await macslistDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it('returns expired when body contains "this listing has expired"', async () => {
    const html = `<html><body><p>Sorry, this listing has expired.</p></body></html>`;
    const result = await macslistDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it('returns expired when body contains "no longer accepting applications"', async () => {
    const html = `<html><body><p>This position is no longer accepting applications.</p></body></html>`;
    const result = await macslistDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it("returns expired when redirected to /jobs search page", async () => {
    const html = `<html><body>Search results</body></html>`;
    const result = await macslistDetector(
      url,
      mockResponse(200, html, "https://jobs.macslist.org/jobs"),
    );
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Mac's List redirected to search page",
    });
  });

  it("returns expired when redirected to /jobs/ with trailing slash", async () => {
    const result = await macslistDetector(
      url,
      mockResponse(200, "<html></html>", "https://jobs.macslist.org/jobs/"),
    );
    expect(result.verdict).toBe("expired");
  });

  it("returns expired when redirected to home page", async () => {
    const result = await macslistDetector(
      url,
      mockResponse(200, "<html></html>", "https://jobs.macslist.org/"),
    );
    expect(result.verdict).toBe("expired");
  });

  it("returns active for 200 with valid job posting", async () => {
    const html = `<html><body>
      <h1>Software Engineer</h1>
      <div class="description">Great opportunity...</div>
    </body></html>`;
    const result = await macslistDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "active",
      reason: "Mac's List posting still available",
    });
  });

  it("returns unknown for 403", async () => {
    const result = await macslistDetector(url, mockResponse(403));
    expect(result.verdict).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// adzunaDetector
// ---------------------------------------------------------------------------

describe("adzunaDetector", () => {
  const url = "https://www.adzuna.com/details/12345";

  it("returns expired for 404", async () => {
    const result = await adzunaDetector(url, mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Adzuna posting removed",
    });
  });

  it("returns expired for 410 Gone", async () => {
    const result = await adzunaDetector(url, mockResponse(410));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Adzuna posting removed",
    });
  });

  it("returns unknown for 200 (conservative)", async () => {
    const result = await adzunaDetector(url, mockResponse(200, "<html>job</html>"));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 403 (blocking, not expired)", async () => {
    const result = await adzunaDetector(url, mockResponse(403));
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toBe("Adzuna HTTP 403");
  });

  it("returns unknown for 500", async () => {
    const result = await adzunaDetector(url, mockResponse(500));
    expect(result.verdict).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// careerjetDetector
// ---------------------------------------------------------------------------

describe("careerjetDetector", () => {
  const url = "https://jobviewtrack.com/en/job/abc123";

  it("returns expired for 404", async () => {
    const result = await careerjetDetector(url, mockResponse(404));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Careerjet posting not found",
    });
  });

  it('returns expired when body contains "This job is no longer available"', async () => {
    const html = `<html><body>
      <div class="expired-notice">This job is no longer available</div>
    </body></html>`;
    const result = await careerjetDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "expired",
      reason: "Careerjet posting expired",
    });
  });

  it('returns expired when body contains "this job ad is no longer active"', async () => {
    const html = `<html><body><p>This job ad is no longer active.</p></body></html>`;
    const result = await careerjetDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it('returns expired when body contains "job has expired"', async () => {
    const html = `<html><body><p>This job has expired.</p></body></html>`;
    const result = await careerjetDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it('returns expired when body contains "offer is no longer available"', async () => {
    const html = `<html><body><p>Sorry, this offer is no longer available.</p></body></html>`;
    const result = await careerjetDetector(url, mockResponse(200, html));
    expect(result.verdict).toBe("expired");
  });

  it("returns active for 200 with valid job content", async () => {
    const html = `<html><body>
      <h1>Data Analyst</h1>
      <div class="job-description">Exciting role...</div>
    </body></html>`;
    const result = await careerjetDetector(url, mockResponse(200, html));
    expect(result).toEqual<DetectorResult>({
      verdict: "active",
      reason: "Careerjet posting still available",
    });
  });

  it("returns unknown for 403", async () => {
    const result = await careerjetDetector(url, mockResponse(403));
    expect(result.verdict).toBe("unknown");
  });

  it("returns unknown for 500", async () => {
    const result = await careerjetDetector(url, mockResponse(500));
    expect(result.verdict).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// getDetector — domain matching
// ---------------------------------------------------------------------------

describe("getDetector", () => {
  describe("exact domain match", () => {
    it("returns neogovDetector for www.governmentjobs.com", () => {
      const detector = getDetector("https://www.governmentjobs.com/careers/multnomah/jobs/12345");
      expect(detector).toBe(neogovDetector);
    });

    it("returns workdayDetector for multco.wd1.myworkdayjobs.com", () => {
      const detector = getDetector(
        "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Careers/job/123",
      );
      expect(detector).toBe(workdayDetector);
    });

    it("returns macslistDetector for jobs.macslist.org", () => {
      const detector = getDetector("https://jobs.macslist.org/jobs/12345");
      expect(detector).toBe(macslistDetector);
    });

    it("returns adzunaDetector for www.adzuna.com", () => {
      const detector = getDetector("https://www.adzuna.com/details/12345");
      expect(detector).toBe(adzunaDetector);
    });

    it("returns careerjetDetector for jobviewtrack.com", () => {
      const detector = getDetector("https://jobviewtrack.com/en/job/abc123");
      expect(detector).toBe(careerjetDetector);
    });

    it("returns adzunaDetector for adzuna.com (without www)", () => {
      const detector = getDetector("https://adzuna.com/details/12345");
      expect(detector).toBe(adzunaDetector);
    });

    it("returns careerjetDetector for www.careerjet.com", () => {
      const detector = getDetector("https://www.careerjet.com/jobad/us12345");
      expect(detector).toBe(careerjetDetector);
    });
  });

  describe("Workday pattern matching (*.wd*.myworkdayjobs.com)", () => {
    it("matches oregon.wd5.myworkdayjobs.com", () => {
      const detector = getDetector(
        "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/456",
      );
      expect(detector).toBe(workdayDetector);
    });

    it("matches stateofwa.wd12.myworkdayjobs.com", () => {
      const detector = getDetector(
        "https://stateofwa.wd12.myworkdayjobs.com/en-US/WaJobs/job/789",
      );
      expect(detector).toBe(workdayDetector);
    });

    it("matches company.wd.myworkdayjobs.com (no number after wd)", () => {
      const detector = getDetector(
        "https://company.wd.myworkdayjobs.com/en-US/Jobs/job/1",
      );
      expect(detector).toBe(workdayDetector);
    });

    it("does not match plain myworkdayjobs.com", () => {
      const detector = getDetector("https://myworkdayjobs.com/job/1");
      expect(detector).toBe(defaultDetector);
    });

    it("does not match wd1.myworkdayjobs.com (no org prefix)", () => {
      const detector = getDetector("https://wd1.myworkdayjobs.com/job/1");
      expect(detector).toBe(defaultDetector);
    });
  });

  describe("fallback to defaultDetector", () => {
    it("returns defaultDetector for unknown domains", () => {
      const detector = getDetector("https://indeed.com/job/12345");
      expect(detector).toBe(defaultDetector);
    });

    it("returns defaultDetector for invalid URLs", () => {
      const detector = getDetector("not-a-url");
      expect(detector).toBe(defaultDetector);
    });

    it("returns defaultDetector for empty string", () => {
      const detector = getDetector("");
      expect(detector).toBe(defaultDetector);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: unknown verdicts are never treated as expired
// ---------------------------------------------------------------------------

describe("isFetchAllowed", () => {
  it.each([
    "https://portland.craigslist.org/mlt/lab/d/warehouse-worker/123.html",
    "https://builtin.com/job/engineer/111",
    "https://www.builtin.com/job/engineer/111",
  ])("blocks %s", (url) => {
    expect(isFetchAllowed(url)).toBe(false);
  });

  it("allows other hosts and leaves invalid URLs to the fetch path", () => {
    expect(isFetchAllowed("https://jobs.macslist.org/job/1")).toBe(true);
    expect(isFetchAllowed("not a url")).toBe(true);
  });
});

describe("conservative detection principle", () => {
  it("unknown verdicts never have verdict=expired", async () => {
    // Collect all unknown results from various detectors and status codes
    const unknownScenarios = [
      defaultDetector("https://example.com/job", mockResponse(200)),
      defaultDetector("https://example.com/job", mockResponse(301)),
      defaultDetector("https://example.com/job", mockResponse(403)),
      defaultDetector("https://example.com/job", mockResponse(429)),
      defaultDetector("https://example.com/job", mockResponse(500)),
      workdayDetector("https://multco.wd1.myworkdayjobs.com/job/1", mockResponse(403)),
      neogovDetector("https://www.governmentjobs.com/job/1", mockResponse(403)),
      adzunaDetector("https://www.adzuna.com/details/1", mockResponse(200)),
      adzunaDetector("https://www.adzuna.com/details/1", mockResponse(403)),
      careerjetDetector("https://jobviewtrack.com/job/1", mockResponse(403)),
    ];

    const results = await Promise.all(unknownScenarios);
    for (const result of results) {
      expect(result.verdict).not.toBe("expired");
    }
  });
});
