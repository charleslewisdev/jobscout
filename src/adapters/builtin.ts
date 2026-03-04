import * as cheerio from "cheerio";

import type { RawJobListing, SalaryUnit } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

const UNIT_TEXT_MAP: Record<string, SalaryUnit> = {
  hour: "hourly",
  year: "annual",
  month: "monthly",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Delay between detail page fetches to avoid hammering the server */
const DETAIL_FETCH_DELAY_MS = 500;

/** Minimum results on a page before we stop paginating */
const MIN_RESULTS_PER_PAGE = 10;

interface JobLocationJsonLd {
  address?: {
    addressLocality?: string;
    addressRegion?: string;
  };
}

interface JobPostingJsonLd {
  "@type"?: string;
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: JobLocationJsonLd | JobLocationJsonLd[];
  baseSalary?: {
    value?: {
      minValue?: string;
      maxValue?: string;
      unitText?: string;
    };
  };
  datePosted?: string;
  employmentType?: string;
}

interface SearchResult {
  url: string;
  title: string;
}

/**
 * Built In Portland adapter — scrapes builtin.com job listings.
 *
 * Two-phase scrape following Mac's List pattern:
 * 1. Fetch paginated search pages, extract job card links
 * 2. Fetch each detail page, extract JSON-LD structured data (with HTML fallback)
 *
 * Config:
 *   - baseUrl: Site base URL (default "https://builtin.com")
 *   - searchPath: Search page path (default "/jobs/portland")
 *   - maxPages: Max search pages to fetch (default 5)
 */
export class BuiltInAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const baseUrl =
      (this.config.config.baseUrl as string) || "https://builtin.com";
    const searchPath =
      (this.config.config.searchPath as string) || "/jobs/portland";
    const maxPages =
      (this.config.config.maxPages as number) || 5;

    // Phase 1: Collect job links from search pages
    const jobLinks: SearchResult[] = [];

    for (let page = 0; page < maxPages; page++) {
      const searchUrl = page === 0
        ? `${baseUrl}${searchPath}`
        : `${baseUrl}${searchPath}?page=${page}`;

      try {
        if (page > 0) {
          await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
        }

        const response = await fetch(searchUrl, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!response.ok) {
          logger.warn(
            { status: response.status, url: searchUrl },
            "Built In: search page non-OK response"
          );
          break;
        }

        const html = await response.text();

        // Detect Cloudflare challenge pages
        if (html.length < 5000 && (html.includes("cf-challenge") || html.includes("_cf_chl"))) {
          logger.warn(
            { page, responseLen: html.length },
            "Built In: Cloudflare challenge detected, stopping"
          );
          break;
        }

        const results = this.parseSearchPage(html, baseUrl);

        if (results.length === 0 && page === 0) {
          logger.warn(
            { responseLen: html.length, hasJobCards: html.includes('data-id="job-card"') },
            "Built In: no results from first search page"
          );
        }

        if (results.length < MIN_RESULTS_PER_PAGE) {
          jobLinks.push(...results);
          break;
        }

        jobLinks.push(...results);
      } catch (err) {
        logger.warn({ err, page }, "Built In: search page fetch failed");
        break;
      }
    }

    if (jobLinks.length === 0) {
      logger.info("Built In: no job links found on search pages");
      return [];
    }

    logger.debug(
      { count: jobLinks.length },
      "Built In: found job links"
    );

    // Phase 2: Fetch each detail page
    const listings: RawJobListing[] = [];

    for (const job of jobLinks) {
      try {
        if (listings.length > 0) {
          await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
        }

        const detailResp = await fetch(job.url, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!detailResp.ok) {
          logger.debug(
            { status: detailResp.status, url: job.url },
            "Built In: detail page non-OK"
          );
          continue;
        }

        const detailHtml = await detailResp.text();
        const listing = this.parseDetailPage(detailHtml, job.url);
        if (listing) {
          listings.push(listing);
        }
      } catch (err) {
        logger.debug(
          { err, url: job.url },
          "Built In: detail page fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: listings.length },
      "Built In: fetch complete"
    );
    return listings;
  }

  private parseSearchPage(
    html: string,
    baseUrl: string
  ): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    // Primary: data-id="job-card" elements
    $('[data-id="job-card"]').each((_i, el) => {
      const $el = $(el);
      const titleLink = $el.find('[data-id="job-card-title"] a').first();
      const href = titleLink.attr("href") || "";
      const title = titleLink.text().trim();

      if (!href || !title) return;

      const url = href.startsWith("http")
        ? href
        : `${baseUrl}${href}`;

      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      results.push({ url, title });
    });

    // Fallback: extract from inline JSON ItemList if no cards found
    if (results.length === 0) {
      const itemListMatch = html.match(/"@type"\s*:\s*"ItemList"[^}]*"itemListElement"\s*:\s*\[([^\]]+)\]/);
      if (itemListMatch) {
        try {
          const items = JSON.parse(`[${itemListMatch[1]}]`) as Array<{
            name?: string;
            url?: string;
          }>;
          for (const item of items) {
            if (!item.url || !item.name) continue;
            if (seenUrls.has(item.url)) continue;
            seenUrls.add(item.url);
            results.push({ url: item.url, title: item.name });
          }
          if (results.length > 0) {
            logger.info(
              { count: results.length },
              "Built In: used ItemList JSON fallback for search results"
            );
          }
        } catch {
          // JSON parse failed, skip fallback
        }
      }
    }

    return results;
  }

  private parseDetailPage(
    html: string,
    sourceUrl: string
  ): RawJobListing | null {
    const $ = cheerio.load(html);

    // Try JSON-LD first (most reliable)
    const jsonLd = this.extractJsonLd($);
    if (jsonLd) {
      // jobLocation can be a single object or array — use the first entry
      const jobLoc = Array.isArray(jsonLd.jobLocation)
        ? jsonLd.jobLocation[0]
        : jsonLd.jobLocation;
      const location = [
        jobLoc?.address?.addressLocality,
        jobLoc?.address?.addressRegion,
      ]
        .filter(Boolean)
        .join(", ");

      let salaryRaw: string | undefined;
      let salaryMin: number | undefined;
      let salaryMax: number | undefined;
      let salaryUnit: SalaryUnit | undefined;

      if (jsonLd.baseSalary?.value) {
        const { minValue, maxValue, unitText } = jsonLd.baseSalary.value;
        if (minValue && maxValue) {
          salaryRaw = `$${minValue}-$${maxValue}/${unitText?.toLowerCase() ?? ""}`;
        } else if (minValue) {
          salaryRaw = `$${minValue}/${unitText?.toLowerCase() ?? ""}`;
        }

        const parsedMin = parseFloat(minValue || "");
        const parsedMax = parseFloat(maxValue || "");
        salaryMin = Number.isFinite(parsedMin) ? parsedMin : undefined;
        salaryMax = Number.isFinite(parsedMax) ? parsedMax : undefined;
        salaryUnit = unitText
          ? UNIT_TEXT_MAP[unitText.toLowerCase()]
          : undefined;
      }

      // JSON-LD description is HTML — extract text for description, keep HTML
      let description = this.extractDescription($);
      let descriptionHtml: string | undefined;
      if (!description && jsonLd.description) {
        descriptionHtml = jsonLd.description;
        description = cheerio.load(jsonLd.description).text().trim();
      }

      return {
        sourceUrl,
        title: jsonLd.title || $("h1").first().text().trim() || "",
        company: jsonLd.hiringOrganization?.name || undefined,
        location: location || undefined,
        salaryRaw,
        salaryMin,
        salaryMax,
        salaryUnit,
        description,
        descriptionHtml,
        employmentType: jsonLd.employmentType || undefined,
        postedDate: jsonLd.datePosted
          ? new Date(jsonLd.datePosted)
          : undefined,
      };
    }

    // Fallback: scrape from HTML directly
    const title = $("h1").first().text().trim();
    if (!title) return null;

    const company = $('[data-id="company-title"]').first().text().trim();
    const description = this.extractDescription($) || "";

    return {
      sourceUrl,
      title,
      company: company || undefined,
      description,
    };
  }

  private extractJsonLd(
    $: cheerio.CheerioAPI
  ): JobPostingJsonLd | null {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      try {
        const text = $(scripts[i]).html();
        if (!text) continue;
        const data = JSON.parse(text);
        if (data["@type"] === "JobPosting") {
          return data as JobPostingJsonLd;
        }
        // Handle @graph array (Built In wraps JobPosting in @graph)
        if (Array.isArray(data["@graph"])) {
          const posting = data["@graph"].find(
            (item: Record<string, unknown>) => item["@type"] === "JobPosting"
          );
          if (posting) return posting as JobPostingJsonLd;
        }
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }
    return null;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    const selectors = [
      ".job-description",
      "#job-description",
      '[itemprop="description"]',
    ];
    for (const sel of selectors) {
      const text = $(sel).text().trim();
      if (text) return text;
    }
    return "";
  }
}
