import type { RawJobListing, SalaryUnit } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

interface UsajobsRemuneration {
  MinimumRange?: string;
  MaximumRange?: string;
  RateIntervalCode?: string;
}

interface UsajobsPositionSchedule {
  Name?: string;
}

interface UsajobsMatchedObject {
  MatchedObjectId?: string;
  MatchedObjectDescriptor?: {
    PositionURI?: string;
    PositionTitle?: string;
    OrganizationName?: string;
    PositionLocationDisplay?: string;
    PositionLocation?: Array<{ LocationName?: string }>;
    PositionRemuneration?: UsajobsRemuneration[];
    PositionSchedule?: UsajobsPositionSchedule[];
    PositionStartDate?: string;
    QualificationSummary?: string;
  };
}

interface UsajobsResponse {
  SearchResult?: {
    SearchResultCount?: number;
    SearchResultCountAll?: number;
    SearchResultItems?: UsajobsMatchedObject[];
  };
}

const BASE_URL = "https://data.usajobs.gov/api/search";

/** Delay between requests to respect rate limits */
const REQUEST_DELAY_MS = 1000;

export class UsajobsAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const apiKey = this.config.config.apiKey as string;
    const userEmail = this.config.config.userEmail as string;
    const location =
      (this.config.config.location as string) || "Portland, Oregon";
    const resultsPerPage =
      (this.config.config.resultsPerPage as number) || 50;
    const maxPages = (this.config.config.maxPages as number) || 3;
    const datePostedDays =
      (this.config.config.datePostedDays as number) || 7;
    const keywords = (this.config.config.keywords as string[]) || [];

    const searchTerms = keywords.length > 0 ? keywords : [""];

    const allListings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < searchTerms.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      const keyword = searchTerms[i];
      const keywordListings = await this.fetchKeyword({
        apiKey,
        userEmail,
        location,
        keyword,
        resultsPerPage,
        maxPages,
        datePostedDays,
      });

      let newUnique = 0;
      for (const listing of keywordListings) {
        if (!seenUrls.has(listing.sourceUrl)) {
          seenUrls.add(listing.sourceUrl);
          allListings.push(listing);
          newUnique++;
        }
      }

      logger.debug(
        {
          keyword: keyword || "(all)",
          fetched: keywordListings.length,
          newUnique,
        },
        "USAJobs: keyword search complete"
      );
    }

    logger.info(
      { source: this.name, total: allListings.length },
      "USAJobs: fetch complete"
    );
    return allListings;
  }

  private async fetchKeyword(opts: {
    apiKey: string;
    userEmail: string;
    location: string;
    keyword: string;
    resultsPerPage: number;
    maxPages: number;
    datePostedDays: number;
  }): Promise<RawJobListing[]> {
    const listings: RawJobListing[] = [];
    let page = 1;

    try {
      while (page <= opts.maxPages) {
        if (page > 1) {
          await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        }

        const url = new URL(BASE_URL);
        url.searchParams.set("LocationName", opts.location);
        url.searchParams.set(
          "ResultsPerPage",
          String(opts.resultsPerPage)
        );
        url.searchParams.set("Page", String(page));
        url.searchParams.set(
          "DatePosted",
          String(opts.datePostedDays)
        );
        if (opts.keyword) {
          url.searchParams.set("Keyword", opts.keyword);
        }

        const response = await fetch(url.toString(), {
          headers: {
            "Authorization-Key": opts.apiKey,
            "User-Agent": opts.userEmail,
            Host: "data.usajobs.gov",
          },
        });

        if (!response.ok) {
          logger.warn(
            { status: response.status, keyword: opts.keyword },
            "USAJobs: non-OK response"
          );
          return listings;
        }

        const data = (await response.json()) as UsajobsResponse;
        const results =
          data.SearchResult?.SearchResultItems || [];

        for (const result of results) {
          listings.push(mapToListing(result));
        }

        if (results.length < opts.resultsPerPage) break;
        page++;
      }
    } catch (err) {
      logger.warn(
        { err, keyword: opts.keyword },
        "USAJobs: fetch failed"
      );
    }

    return listings;
  }
}

const RATE_UNIT_MAP: Record<string, SalaryUnit> = {
  "Per Year": "annual",
  "Per Hour": "hourly",
  "Per Month": "monthly",
};

function mapToListing(result: UsajobsMatchedObject): RawJobListing {
  const desc = result.MatchedObjectDescriptor;
  const remuneration = desc?.PositionRemuneration?.[0];

  let salaryRaw: string | undefined;
  let salaryMin: number | undefined;
  let salaryMax: number | undefined;
  let salaryUnit: SalaryUnit | undefined;

  if (remuneration?.MinimumRange || remuneration?.MaximumRange) {
    const min = remuneration.MinimumRange || "?";
    const max = remuneration.MaximumRange || "?";
    const rate = remuneration.RateIntervalCode || "";
    const rateMap: Record<string, string> = {
      "Per Year": "/yr",
      "Per Hour": "/hr",
      "Per Month": "/mo",
    };
    const rateSuffix = rateMap[rate] || (rate ? ` ${rate}` : "");
    salaryRaw = `$${min}-$${max}${rateSuffix}`;

    const parsedMin = parseFloat(remuneration.MinimumRange || "");
    const parsedMax = parseFloat(remuneration.MaximumRange || "");
    salaryMin = Number.isFinite(parsedMin) ? parsedMin : undefined;
    salaryMax = Number.isFinite(parsedMax) ? parsedMax : undefined;
    salaryUnit = RATE_UNIT_MAP[rate];
  }

  return {
    sourceUrl: desc?.PositionURI || "",
    externalId: result.MatchedObjectId || undefined,
    title: desc?.PositionTitle || "",
    company: desc?.OrganizationName || undefined,
    location: desc?.PositionLocationDisplay || undefined,
    salaryRaw,
    salaryMin,
    salaryMax,
    salaryUnit,
    description: desc?.QualificationSummary || "",
    employmentType: desc?.PositionSchedule?.[0]?.Name || undefined,
    postedDate: desc?.PositionStartDate
      ? new Date(desc.PositionStartDate)
      : undefined,
  };
}
