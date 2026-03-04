import type { RawJobListing, SalaryUnit } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { parseSalaryRaw } from "../utils/salary.js";
import { BaseAdapter } from "./base.js";

interface CareerjetJob {
  url?: string;
  title?: string;
  company?: string;
  locations?: string;
  salary?: string;
  salary_min?: number;
  salary_max?: number;
  salary_type?: string; // Y=yearly, M=monthly, W=weekly, D=daily, H=hourly
  salary_currency_code?: string;
  description?: string;
  date?: string;
  site?: string;
}

interface CareerjetResponse {
  type?: string;
  hits?: number;
  pages?: number;
  jobs?: CareerjetJob[];
  message?: string;
}

const BASE_URL = "https://search.api.careerjet.net/v4/query";

/** Delay between requests to respect rate limits */
const REQUEST_DELAY_MS = 1000;

export class CareerjetAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const apiKey = this.config.config.apiKey as string;
    const location =
      (this.config.config.location as string) || "Portland, OR";
    const pageSize = (this.config.config.pageSize as number) || 50;
    const maxPages = (this.config.config.maxPages as number) || 3;
    const keywords = (this.config.config.keywords as string[]) || [];

    const searchTerms = keywords.length > 0 ? keywords : [""];

    const allListings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < searchTerms.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      const keyword = searchTerms[i];
      const result = await this.fetchKeyword({
        apiKey,
        location,
        keyword,
        pageSize,
        maxPages,
      });

      if (result === "connection_error") {
        logger.warn(
          "Careerjet: API unreachable, skipping remaining keywords"
        );
        break;
      }

      let newUnique = 0;
      for (const listing of result) {
        if (!seenUrls.has(listing.sourceUrl)) {
          seenUrls.add(listing.sourceUrl);
          allListings.push(listing);
          newUnique++;
        }
      }

      logger.debug(
        {
          keyword: keyword || "(all)",
          fetched: result.length,
          newUnique,
        },
        "Careerjet: keyword search complete"
      );
    }

    logger.info(
      { source: this.name, total: allListings.length },
      "Careerjet: fetch complete"
    );
    return allListings;
  }

  private async fetchKeyword(opts: {
    apiKey: string;
    location: string;
    keyword: string;
    pageSize: number;
    maxPages: number;
  }): Promise<RawJobListing[] | "connection_error"> {
    const listings: RawJobListing[] = [];
    let page = 1;

    // Basic Auth: API key as username, empty password
    const authHeader =
      "Basic " + Buffer.from(`${opts.apiKey}:`).toString("base64");

    try {
      while (page <= opts.maxPages) {
        if (page > 1) {
          await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        }

        const url = new URL(BASE_URL);
        url.searchParams.set("locale_code", "en_US");
        url.searchParams.set("location", opts.location);
        url.searchParams.set("page_size", String(opts.pageSize));
        url.searchParams.set("page", String(page));
        url.searchParams.set("sort", "date");
        url.searchParams.set("user_ip", "127.0.0.1");
        url.searchParams.set("user_agent", "JobScout/1.0");
        if (opts.keyword) {
          url.searchParams.set("keywords", opts.keyword);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
            Referer: "https://jobscout.local",
          },
        });

        if (!response.ok) {
          logger.warn(
            { status: response.status, keyword: opts.keyword },
            "Careerjet: non-OK response"
          );
          return listings;
        }

        const data = (await response.json()) as CareerjetResponse;
        const jobs = data.jobs || [];

        for (const job of jobs) {
          listings.push(mapToListing(job));
        }

        if (jobs.length < opts.pageSize) break;
        page++;
      }
    } catch (err) {
      // Node's fetch wraps connection errors in TypeError — actual code is on .cause
      const cause = (err as { cause?: NodeJS.ErrnoException }).cause;
      const code = cause?.code ?? (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
        logger.warn(
          { err, keyword: opts.keyword },
          "Careerjet: connection failed"
        );
        return "connection_error";
      }
      logger.warn(
        { err, keyword: opts.keyword },
        "Careerjet: fetch failed"
      );
    }

    return listings;
  }
}

const SALARY_TYPE_MAP: Record<string, SalaryUnit> = {
  H: "hourly",
  Y: "annual",
  M: "monthly",
};

function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

function mapToListing(job: CareerjetJob): RawJobListing {
  const salaryUnit = job.salary_type
    ? SALARY_TYPE_MAP[job.salary_type]
    : undefined;

  let salaryMin = job.salary_min ?? undefined;
  let salaryMax = job.salary_max ?? undefined;
  let resolvedUnit = salaryUnit;

  // Fall back to parsing the salary text string when structured fields are absent
  if (salaryMin == null && salaryMax == null && job.salary) {
    const parsed = parseSalaryRaw(job.salary);
    salaryMin = parsed.min;
    salaryMax = parsed.max;
    resolvedUnit = parsed.unit;
  }

  const rawDesc = job.description || "";

  return {
    sourceUrl: job.url || "",
    title: job.title || "",
    company: job.company || undefined,
    location: job.locations || undefined,
    salaryRaw: formatSalary(job),
    salaryMin,
    salaryMax,
    salaryUnit: resolvedUnit,
    description: stripHtmlTags(rawDesc),
    descriptionQuality: "snippet",
    postedDate: job.date ? new Date(job.date) : undefined,
  };
}

function formatSalary(job: CareerjetJob): string | undefined {
  if (job.salary) return job.salary;
  if (job.salary_min != null && job.salary_max != null) {
    const suffix: Record<string, string> = {
      Y: "/yr",
      M: "/mo",
      W: "/wk",
      D: "/day",
      H: "/hr",
    };
    const s = suffix[job.salary_type || ""] || "";
    const currency = job.salary_currency_code === "USD" ? "$" : "";
    return `${currency}${job.salary_min.toLocaleString()}-${currency}${job.salary_max.toLocaleString()}${s}`;
  }
  return undefined;
}
