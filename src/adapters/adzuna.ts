import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

interface AdzunaResult {
  title?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
}

interface AdzunaResponse {
  count?: number;
  results?: AdzunaResult[];
}

const BASE_URL = "https://api.adzuna.com/v1/api/jobs/us/search";

export class AdzunaAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const appId = this.config.config.appId as string;
    const appKey = this.config.config.appKey as string;
    const location =
      (this.config.config.location as string) ||
      "Portland, Oregon";
    const resultsPerPage =
      (this.config.config.resultsPerPage as number) || 50;
    const maxPages =
      (this.config.config.maxPages as number) || 5;
    const keywords =
      (this.config.config.keywords as string[]) || [];

    // If keywords are provided, run a search per keyword and dedup by URL
    // Otherwise fall back to a generic location search
    const searchTerms =
      keywords.length > 0 ? keywords : [""];

    const allListings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of searchTerms) {
      const keywordListings = await this.fetchKeyword({
        appId,
        appKey,
        location,
        keyword,
        resultsPerPage,
        maxPages,
      });

      for (const listing of keywordListings) {
        if (!seenUrls.has(listing.sourceUrl)) {
          seenUrls.add(listing.sourceUrl);
          allListings.push(listing);
        }
      }

      logger.debug(
        {
          keyword: keyword || "(all)",
          fetched: keywordListings.length,
          newUnique: allListings.length,
        },
        "Adzuna: keyword search complete"
      );
    }

    logger.info(
      { source: this.name, total: allListings.length },
      "Adzuna: fetch complete"
    );
    return allListings;
  }

  private async fetchKeyword(opts: {
    appId: string;
    appKey: string;
    location: string;
    keyword: string;
    resultsPerPage: number;
    maxPages: number;
  }): Promise<RawJobListing[]> {
    const listings: RawJobListing[] = [];
    let page = 1;

    try {
      while (page <= opts.maxPages) {
        const url = new URL(`${BASE_URL}/${page}`);
        url.searchParams.set("app_id", opts.appId);
        url.searchParams.set("app_key", opts.appKey);
        url.searchParams.set("where", opts.location);
        url.searchParams.set(
          "results_per_page",
          String(opts.resultsPerPage)
        );
        if (opts.keyword) {
          url.searchParams.set("what", opts.keyword);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          logger.warn(
            { status: response.status, keyword: opts.keyword },
            "Adzuna: non-OK response"
          );
          return listings;
        }

        const data = (await response.json()) as AdzunaResponse;
        const results = data.results || [];

        for (const result of results) {
          listings.push(mapToListing(result));
        }

        if (results.length < opts.resultsPerPage) break;
        page++;
      }
    } catch (err) {
      logger.warn(
        { err, keyword: opts.keyword },
        "Adzuna: fetch failed"
      );
    }

    return listings;
  }
}

function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

function mapToListing(result: AdzunaResult): RawJobListing {
  const hasSalary = result.salary_min != null || result.salary_max != null;
  const salaryRaw = hasSalary
    ? `$${result.salary_min ?? "?"}-$${result.salary_max ?? "?"}`
    : undefined;

  const rawDesc = result.description || "";

  return {
    title: result.title || "",
    sourceUrl: result.redirect_url || "",
    company: result.company?.display_name,
    location: result.location?.display_name,
    description: stripHtmlTags(rawDesc),
    descriptionQuality: "snippet",
    salaryRaw,
    salaryMin: result.salary_min ?? undefined,
    salaryMax: result.salary_max ?? undefined,
    salaryUnit: hasSalary ? "annual" : undefined,
    postedDate: result.created
      ? new Date(result.created)
      : undefined,
  };
}
