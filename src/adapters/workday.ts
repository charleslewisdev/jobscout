import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { parseSalaryRaw } from "../utils/salary.js";
import { BaseAdapter } from "./base.js";

interface WorkdaySiteConfig {
  baseUrl: string;
  org: string;
  siteName: string;
  name: string;
}

interface WorkdayJobPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdayListResponse {
  total?: number;
  jobPostings?: WorkdayJobPosting[];
}

interface WorkdayJobDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    timeType?: string;
    startDate?: string;
    jobReqId?: string;
    externalUrl?: string;
  };
}

/** Delay between requests to respect rate limits */
const REQUEST_DELAY_MS = 1000;

/**
 * Extract salary information from HTML job description.
 * Looks for patterns like "Salary Range: $X - $Y" or "$X - $Y" with
 * various separators.
 */
function extractSalary(html: string): string | undefined {
  // Optional trailing unit keywords (e.g., "monthly", "annually", "per year")
  // Longer alternatives first so "monthly" matches before "month", etc.
  const unitSuffix =
    /(?:\s+(?:per\s+)?(?:annually|annual|yearly|year|monthly|month|hourly|hour))?/i
      .source;

  // Try "Salary Range:" prefix first
  const salaryRangeMatch = html.match(
    new RegExp(
      `Salary\\s*Range\\s*:?\\s*\\$[\\d,]+(?:\\.\\d+)?\\s*[-–—to]+\\s*\\$[\\d,]+(?:\\.\\d+)?${unitSuffix}`,
      "i"
    )
  );
  if (salaryRangeMatch) {
    return salaryRangeMatch[0].trim();
  }

  // Try standalone dollar range pattern
  const dollarRangeMatch = html.match(
    new RegExp(
      `\\$[\\d,]+(?:\\.\\d+)?\\s*[-–—]\\s*\\$[\\d,]+(?:\\.\\d+)?${unitSuffix}`,
      "i"
    )
  );
  if (dollarRangeMatch) {
    return dollarRangeMatch[0].trim();
  }

  return undefined;
}

/** Strip HTML tags and normalize whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class WorkdayAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const sites = (this.config.config.sites as WorkdaySiteConfig[]) || [];
    const limit = (this.config.config.limit as number) || 20;
    const maxResults = (this.config.config.maxResults as number) || 100;

    const allListings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      if (i > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      try {
        const listings = await this.fetchSite(site, limit, maxResults);

        for (const listing of listings) {
          if (!seenUrls.has(listing.sourceUrl)) {
            seenUrls.add(listing.sourceUrl);
            allListings.push(listing);
          }
        }

        logger.debug(
          { site: site.name, fetched: listings.length },
          "Workday: site fetch complete"
        );
      } catch (err) {
        logger.warn(
          { err, site: site.name },
          "Workday: site fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: allListings.length },
      "Workday: fetch complete"
    );
    return allListings;
  }

  private async fetchSite(
    site: WorkdaySiteConfig,
    limit: number,
    maxResults: number
  ): Promise<RawJobListing[]> {
    const listings: RawJobListing[] = [];
    let offset = 0;
    let total = Infinity;
    let isFirstRequest = true;

    while (offset < total && listings.length < maxResults) {
      if (!isFirstRequest) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }
      isFirstRequest = false;

      const listUrl = `${site.baseUrl}/wday/cxs/${site.org}/${site.siteName}/jobs`;
      const body = {
        appliedFacets: {},
        limit,
        offset,
        searchText: "",
      };

      const response = await fetch(listUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, site: site.name },
          "Workday: non-OK response from list endpoint"
        );
        return listings;
      }

      const data = (await response.json()) as WorkdayListResponse;
      total = data.total ?? 0;
      const postings = data.jobPostings ?? [];

      if (postings.length === 0) break;

      for (const posting of postings) {
        if (listings.length >= maxResults) break;

        const listing = await this.fetchDetail(site, posting);
        listings.push(listing);
      }

      offset += postings.length;
    }

    return listings;
  }

  private async fetchDetail(
    site: WorkdaySiteConfig,
    posting: WorkdayJobPosting
  ): Promise<RawJobListing> {
    const externalPath = posting.externalPath || "";
    const detailUrl = `${site.baseUrl}/wday/cxs/${site.org}/${site.siteName}${externalPath}`;

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

    try {
      const response = await fetch(detailUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, path: externalPath },
          "Workday: detail fetch non-OK, using list data"
        );
        return this.mapFromList(site, posting, detailUrl);
      }

      const detail = (await response.json()) as WorkdayJobDetail;
      return this.mapFromDetail(site, posting, detail);
    } catch (err) {
      logger.warn(
        { err, path: externalPath },
        "Workday: detail fetch failed, using list data"
      );
      return this.mapFromList(site, posting, detailUrl);
    }
  }

  private mapFromDetail(
    site: WorkdaySiteConfig,
    posting: WorkdayJobPosting,
    detail: WorkdayJobDetail
  ): RawJobListing {
    const info = detail.jobPostingInfo;
    const descriptionHtml = info?.jobDescription || "";
    const description = stripHtml(descriptionHtml);
    const salaryRaw = extractSalary(descriptionHtml);
    const parsed = salaryRaw ? parseSalaryRaw(salaryRaw) : {};

    return {
      sourceUrl: info?.externalUrl || "",
      externalId: info?.jobReqId || undefined,
      title: info?.title || posting.title || "",
      company: site.name,
      location: info?.location || posting.locationsText || undefined,
      salaryRaw,
      salaryMin: parsed.min,
      salaryMax: parsed.max,
      salaryUnit: parsed.unit,
      description,
      descriptionHtml: descriptionHtml || undefined,
      employmentType: info?.timeType || undefined,
      postedDate: info?.startDate ? new Date(info.startDate) : undefined,
    };
  }

  private mapFromList(
    site: WorkdaySiteConfig,
    posting: WorkdayJobPosting,
    fallbackUrl: string
  ): RawJobListing {
    const description = (posting.bulletFields || []).join(" ").trim();

    return {
      sourceUrl: fallbackUrl,
      title: posting.title || "",
      company: site.name,
      location: posting.locationsText || undefined,
      description: description || "",
      postedDate: posting.postedOn ? new Date(posting.postedOn) : undefined,
    };
  }
}
