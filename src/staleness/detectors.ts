/**
 * Source-specific job expiry detectors.
 *
 * Each detector inspects an HTTP response from a job posting URL and returns
 * a conservative verdict: "active", "expired", or "unknown". The key principle
 * is to never mark a job as expired unless we're sure.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpiryVerdict = "active" | "expired" | "unknown";

export interface DetectorResult {
  /** Conservative verdict: only "expired" when we're certain */
  verdict: ExpiryVerdict;
  /** Human-readable reason for logging */
  reason: string;
}

/**
 * Inspects an HTTP response for a job posting URL and returns an expiry verdict.
 *
 * **Note:** Detectors may consume the response body via `response.text()`,
 * so callers should not read the body afterward.
 */
export type ExpiryDetector = (
  url: string,
  response: Response,
) => Promise<DetectorResult>;

// ---------------------------------------------------------------------------
// Default detector (fallback for unknown domains)
// ---------------------------------------------------------------------------

export const defaultDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404 || status === 410) {
    return { verdict: "expired", reason: `HTTP ${status}` };
  }

  if (status === 200 || status === 301 || status === 302) {
    return {
      verdict: "unknown",
      reason: "Cannot determine from status alone",
    };
  }

  if (status === 403 || status === 429 || status >= 500) {
    return { verdict: "unknown", reason: "Site unavailable or blocking" };
  }

  return { verdict: "unknown", reason: `Unhandled HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Workday detector
// ---------------------------------------------------------------------------

export const workdayDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404) {
    return { verdict: "expired", reason: "Workday posting removed" };
  }

  if (status === 200) {
    return { verdict: "active", reason: "Workday posting still accessible" };
  }

  return { verdict: "unknown", reason: `Workday HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// NEOGOV detector
// ---------------------------------------------------------------------------

const NEOGOV_CLOSED_PATTERNS = [
  /this recruitment has closed/i,
  /recruitment closed/i,
  /application period\s*.*closed/i,
];

export const neogovDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404) {
    return { verdict: "expired", reason: "NEOGOV posting not found" };
  }

  if (status === 200) {
    const body = await response.text();

    for (const pattern of NEOGOV_CLOSED_PATTERNS) {
      if (pattern.test(body)) {
        return { verdict: "expired", reason: "NEOGOV recruitment closed" };
      }
    }

    return { verdict: "active", reason: "NEOGOV posting still open" };
  }

  return { verdict: "unknown", reason: `NEOGOV HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Mac's List detector
// ---------------------------------------------------------------------------

const MACSLIST_EXPIRED_PATTERNS = [
  /this job is no longer available/i,
  /job has been removed/i,
  /this listing has expired/i,
  /no longer accepting applications/i,
];

export const macslistDetector: ExpiryDetector = async (
  url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404) {
    return { verdict: "expired", reason: "Mac's List posting not found" };
  }

  if (status === 200) {
    const body = await response.text();

    // Check if we were redirected to the home/search page
    const finalUrl = response.url || url;
    if (
      finalUrl.endsWith("/jobs") ||
      finalUrl.endsWith("/jobs/") ||
      finalUrl === "https://jobs.macslist.org/" ||
      finalUrl === "https://jobs.macslist.org"
    ) {
      return {
        verdict: "expired",
        reason: "Mac's List redirected to search page",
      };
    }

    for (const pattern of MACSLIST_EXPIRED_PATTERNS) {
      if (pattern.test(body)) {
        return { verdict: "expired", reason: "Mac's List posting expired" };
      }
    }

    return { verdict: "active", reason: "Mac's List posting still available" };
  }

  return { verdict: "unknown", reason: `Mac's List HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Adzuna detector
// ---------------------------------------------------------------------------

export const adzunaDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404 || status === 410) {
    return { verdict: "expired", reason: "Adzuna posting removed" };
  }

  // Adzuna often blocks automated requests (403). Don't treat as expired.
  return { verdict: "unknown", reason: `Adzuna HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Careerjet detector
// ---------------------------------------------------------------------------

const CAREERJET_EXPIRED_PATTERNS = [
  /this job is no longer available/i,
  /this job ad is no longer active/i,
  /job has expired/i,
  /offer is no longer available/i,
];

export const careerjetDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404) {
    return { verdict: "expired", reason: "Careerjet posting not found" };
  }

  if (status === 200) {
    const body = await response.text();

    for (const pattern of CAREERJET_EXPIRED_PATTERNS) {
      if (pattern.test(body)) {
        return { verdict: "expired", reason: "Careerjet posting expired" };
      }
    }

    return { verdict: "active", reason: "Careerjet posting still available" };
  }

  return { verdict: "unknown", reason: `Careerjet HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Craigslist detector
// ---------------------------------------------------------------------------

const CRAIGSLIST_EXPIRED_PATTERNS = [
  /this posting has been deleted/i,
  /this posting has been flagged/i,
  /this posting has expired/i,
  /the posting has expired/i,
];

export const craigslistDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404 || status === 410) {
    return { verdict: "expired", reason: "Craigslist posting removed" };
  }

  if (status === 200) {
    const body = await response.text();

    for (const pattern of CRAIGSLIST_EXPIRED_PATTERNS) {
      if (pattern.test(body)) {
        return { verdict: "expired", reason: "Craigslist posting expired" };
      }
    }

    return { verdict: "active", reason: "Craigslist posting still available" };
  }

  return { verdict: "unknown", reason: `Craigslist HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Built In detector
// ---------------------------------------------------------------------------

const BUILTIN_EXPIRED_PATTERNS = [
  /this job is no longer available/i,
  /job has been removed/i,
  /no longer accepting applications/i,
  /this position has been filled/i,
];

export const builtinDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404) {
    return { verdict: "expired", reason: "Built In posting not found" };
  }

  if (status === 200) {
    const body = await response.text();

    for (const pattern of BUILTIN_EXPIRED_PATTERNS) {
      if (pattern.test(body)) {
        return { verdict: "expired", reason: "Built In posting expired" };
      }
    }

    return { verdict: "active", reason: "Built In posting still available" };
  }

  return { verdict: "unknown", reason: `Built In HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// The Muse detector
// ---------------------------------------------------------------------------

export const museDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404 || status === 410) {
    return { verdict: "expired", reason: "Muse posting removed" };
  }

  // Conservative: don't assume active or expired from other statuses
  return { verdict: "unknown", reason: `Muse HTTP ${status}` };
};

// ---------------------------------------------------------------------------

export const pdxpipelineDetector: ExpiryDetector = async (
  _url: string,
  response: Response,
): Promise<DetectorResult> => {
  const { status } = response;

  if (status === 404 || status === 410) {
    return { verdict: "expired", reason: "PDX Pipeline posting removed" };
  }

  // Conservative: don't assume active or expired from other statuses
  return { verdict: "unknown", reason: `PDX Pipeline HTTP ${status}` };
};

// ---------------------------------------------------------------------------
// Detector registry + lookup
// ---------------------------------------------------------------------------

const detectors: Record<string, ExpiryDetector> = {
  "www.governmentjobs.com": neogovDetector,
  "multco.wd1.myworkdayjobs.com": workdayDetector,
  "jobs.macslist.org": macslistDetector,
  "www.adzuna.com": adzunaDetector,
  "adzuna.com": adzunaDetector,
  "jobviewtrack.com": careerjetDetector,
  "www.careerjet.com": careerjetDetector,
  "portland.craigslist.org": craigslistDetector,
  "builtin.com": builtinDetector,
  "www.builtin.com": builtinDetector,
  "www.themuse.com": museDetector,
  "www.pdxpipeline.com": pdxpipelineDetector,
};

/** Pattern: *.wd*.myworkdayjobs.com */
const WORKDAY_PATTERN = /^.+\.wd\d*\.myworkdayjobs\.com$/;

/**
 * Resolves the appropriate expiry detector for a given URL.
 *
 * 1. Parses the URL hostname
 * 2. Looks up exact match in the registry
 * 3. Falls back to pattern matching for Workday domains
 * 4. Returns defaultDetector if no match
 */
export function getDetector(url: string): ExpiryDetector {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return defaultDetector;
  }

  // Exact match
  const exact = detectors[hostname];
  if (exact) {
    return exact;
  }

  // Workday pattern: *.wd*.myworkdayjobs.com
  if (WORKDAY_PATTERN.test(hostname)) {
    return workdayDetector;
  }

  return defaultDetector;
}
