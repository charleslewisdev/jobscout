import * as cheerio from "cheerio";

import type { RawJobListing, SalaryUnit } from "@shared/types.js";

import { ChromeCDP } from "../utils/chrome-cdp.js";
import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

const UNIT_TEXT_MAP: Record<string, SalaryUnit> = {
  hour: "hourly",
  year: "annual",
  month: "monthly",
};

/** Delay between CDP requests (be respectful of the target site) */
const PAGE_FETCH_DELAY_MS = 3000;

interface JobPostingJsonLd {
  "@type"?: string;
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: {
    address?: {
      addressLocality?: string;
      addressRegion?: string;
    };
  };
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

/**
 * Poached Jobs adapter for Portland hospitality/restaurant jobs.
 *
 * Uses Chrome CDP since the site is a JavaScript SPA (Ember.js).
 *
 * Config:
 *   - baseUrl: site URL (default "https://poachedjobs.com")
 *   - location: URL-encoded location slug (default "portland+or")
 *   - chromeCdpUrl: Chrome CDP HTTP URL (default from env CHROME_CDP_URL)
 */
export class PoachedAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const baseUrl =
      (this.config.config.baseUrl as string) || "https://poachedjobs.com";
    const location =
      (this.config.config.location as string) || "portland+or";
    const chromeCdpUrl =
      (this.config.config.chromeCdpUrl as string) ||
      process.env.CHROME_CDP_URL ||
      "http://localhost:9222";

    const cdp = new ChromeCDP(chromeCdpUrl);

    // Check if Chrome CDP is reachable
    const available = await cdp.isAvailable();
    if (!available) {
      logger.warn(
        { url: chromeCdpUrl },
        "Poached: Chrome CDP not available, skipping"
      );
      return [];
    }

    // 1. Fetch search page via Chrome CDP
    const searchUrl = `${baseUrl}/jobs/all/${location}`;
    const searchHtml = await cdp.getRenderedHtml(searchUrl, {
      waitForSelector: 'a[href*="/jobs/"]',
    });

    if (!searchHtml) {
      logger.warn(
        { url: searchUrl },
        "Poached: Chrome CDP returned no HTML for search page"
      );
      return [];
    }

    // 2. Parse search page to extract job detail links
    const jobLinks = this.parseSearchPage(searchHtml, baseUrl);

    if (jobLinks.length === 0) {
      logger.info("Poached: no job links found on search page");
      return [];
    }

    logger.debug(
      { count: jobLinks.length },
      "Poached: found job links"
    );

    // 3. Fetch each detail page via Chrome CDP
    const listings: RawJobListing[] = [];

    for (const detailUrl of jobLinks) {
      try {
        // Delay between requests to be respectful
        await new Promise((r) => setTimeout(r, PAGE_FETCH_DELAY_MS));

        const detailHtml = await cdp.getRenderedHtml(detailUrl, {
          waitForSelector:
            '.job-description, [itemprop="description"], script[type="application/ld+json"]',
        });
        if (!detailHtml) {
          logger.debug(
            { url: detailUrl },
            "Poached: Chrome CDP returned no HTML for detail page"
          );
          continue;
        }

        const listing = this.parseDetailPage(detailHtml, detailUrl);
        if (listing) {
          listings.push(listing);
        }
      } catch (err) {
        logger.debug(
          { err, url: detailUrl },
          "Poached: detail page fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: listings.length },
      "Poached: fetch complete"
    );
    return listings;
  }

  /** Extract unique job detail URLs from the search results page */
  private parseSearchPage(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const links: string[] = [];

    // Look for links pointing to individual job pages
    $('a[href*="/jobs/"]').each((_i, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      // Skip the search page links themselves (e.g., /jobs/all/...)
      if (href.includes("/jobs/all/")) return;

      const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;

      // Dedup by URL to avoid fetching the same detail page twice
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        links.push(fullUrl);
      }
    });

    return links;
  }

  /** Parse a detail page, trying JSON-LD first then falling back to HTML */
  private parseDetailPage(
    html: string,
    sourceUrl: string
  ): RawJobListing | null {
    const $ = cheerio.load(html);

    // Try JSON-LD first (most reliable structured data)
    const jsonLd = this.extractJsonLd($);
    if (jsonLd) {
      const location = [
        jsonLd.jobLocation?.address?.addressLocality,
        jsonLd.jobLocation?.address?.addressRegion,
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

      // Prefer HTML description (richer formatting) over JSON-LD plain text
      const description =
        this.extractDescription($) ||
        jsonLd.description ||
        "";

      const descriptionHtml = this.extractDescriptionHtml($) || undefined;

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

    // Try to find company name near the title area
    const company =
      $(".company-name").first().text().trim() ||
      $('[class*="company"]').first().text().trim() ||
      $("h2").first().text().trim() ||
      undefined;

    const description = this.extractDescription($) || "";
    const descriptionHtml = this.extractDescriptionHtml($) || undefined;

    return {
      sourceUrl,
      title,
      company: company || undefined,
      description,
      descriptionHtml,
    };
  }

  /** Extract JSON-LD JobPosting data from script tags */
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
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }
    return null;
  }

  /** Extract plain-text description from common HTML selectors */
  private extractDescription($: cheerio.CheerioAPI): string {
    const selectors = [
      ".job-description",
      "#job-description",
      '[class*="description"]',
      '[itemprop="description"]',
    ];
    for (const sel of selectors) {
      const text = $(sel).text().trim();
      if (text) return text;
    }
    return "";
  }

  /** Extract HTML description content for richer display */
  private extractDescriptionHtml($: cheerio.CheerioAPI): string {
    const selectors = [
      ".job-description",
      "#job-description",
      '[class*="description"]',
      '[itemprop="description"]',
    ];
    for (const sel of selectors) {
      const html = $(sel).html()?.trim();
      if (html) return html;
    }
    return "";
  }
}
