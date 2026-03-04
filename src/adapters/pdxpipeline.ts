import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { parseSalaryRaw } from "../utils/salary.js";
import { BaseAdapter } from "./base.js";

// ---------------------------------------------------------------------------
// WP REST API response types
// ---------------------------------------------------------------------------

interface WpJobListing {
  id?: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  meta?: {
    _company_name?: string;
    _job_location?: string;
    _application?: string;
    _company_website?: string;
    _remote_position?: number;
    _job_salary?: string;
    _job_salary_currency?: string;
    _job_salary_unit?: string;
    _filled?: number;
  };
  "job-types"?: number[];
}

interface WpTaxonomyTerm {
  id: number;
  name: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delay between page fetches to be respectful */
const PAGE_FETCH_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class PdxPipelineAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const baseUrl =
      (this.config.config.baseUrl as string) ||
      "https://www.pdxpipeline.com";
    const perPage = (this.config.config.perPage as number) || 20;
    const maxPages = (this.config.config.maxPages as number) || 5;

    // Load job type taxonomy for employment type mapping
    const jobTypeMap = await this.fetchJobTypes(baseUrl);

    const listings: RawJobListing[] = [];
    let page = 1;

    try {
      while (page <= maxPages) {
        const url = new URL(`${baseUrl}/wp-json/wp/v2/job-listings`);
        url.searchParams.set("per_page", String(perPage));
        url.searchParams.set("page", String(page));
        url.searchParams.set("orderby", "date");
        url.searchParams.set("order", "desc");

        const response = await fetch(url.toString());
        if (!response.ok) {
          logger.warn(
            { status: response.status, page },
            "PDX Pipeline: non-OK response"
          );
          break;
        }

        const data = (await response.json()) as WpJobListing[];

        for (const item of data) {
          const listing = mapToListing(item, jobTypeMap);
          if (listing) {
            listings.push(listing);
          }
        }

        // Check total pages from WP header
        const totalPages = parseInt(
          response.headers.get("X-WP-TotalPages") || "0",
          10
        );
        if (page >= totalPages) break;

        page++;

        await new Promise((resolve) =>
          setTimeout(resolve, PAGE_FETCH_DELAY_MS)
        );
      }
    } catch (err) {
      logger.warn({ err }, "PDX Pipeline: fetch failed");
    }

    logger.info(
      { source: this.name, total: listings.length },
      "PDX Pipeline: fetch complete"
    );
    return listings;
  }

  private async fetchJobTypes(
    baseUrl: string
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
      const url = `${baseUrl}/wp-json/wp/v2/job-types?per_page=100`;
      const response = await fetch(url);
      if (!response.ok) return map;

      const terms = (await response.json()) as WpTaxonomyTerm[];
      for (const term of terms) {
        map.set(term.id, term.name);
      }
    } catch (err) {
      logger.warn({ err }, "PDX Pipeline: failed to fetch job types taxonomy");
    }
    return map;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtmlTags(text: string): string {
  return text
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function mapToListing(
  item: WpJobListing,
  jobTypeMap: Map<number, string>
): RawJobListing | null {
  const title = item.title?.rendered;
  const url = item.link;

  if (!title || !url) return null;

  // Skip filled positions
  if (item.meta?._filled) return null;

  const rawContent = item.content?.rendered || "";
  const description = stripHtmlTags(rawContent);

  // Build salary string from meta fields
  const salary = item.meta?._job_salary;
  const currency = item.meta?._job_salary_currency;
  const unit = item.meta?._job_salary_unit;
  const salaryRaw =
    salary ? `${salary}${currency ? ` ${currency}` : ""}${unit ? `/${unit}` : ""}` : undefined;
  const parsed = salaryRaw ? parseSalaryRaw(salaryRaw) : {};

  // Map job type IDs to names
  const jobTypeIds = item["job-types"] || [];
  const employmentType =
    jobTypeIds.length > 0 ? jobTypeMap.get(jobTypeIds[0]) : undefined;

  return {
    title,
    sourceUrl: url,
    company: item.meta?._company_name || undefined,
    location: item.meta?._job_location || undefined,
    description,
    descriptionHtml: rawContent || undefined,
    descriptionQuality: "full",
    employmentType,
    salaryRaw,
    salaryMin: parsed.min,
    salaryMax: parsed.max,
    salaryUnit: parsed.unit,
    postedDate: item.date ? new Date(item.date) : undefined,
  };
}
