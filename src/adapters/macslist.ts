import * as cheerio from "cheerio";

import type { RawJobListing, SalaryUnit } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

const UNIT_TEXT_MAP: Record<string, SalaryUnit> = {
  hour: "hourly",
  year: "annual",
  month: "monthly",
};

const USER_AGENT = "JobScout/1.0";

/** Delay between detail page fetches to avoid hammering the server */
const DETAIL_FETCH_DELAY_MS = 500;

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

export class MacsListAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const baseUrl =
      (this.config.config.baseUrl as string) ||
      "https://jobs.macslist.org";
    const searchPath =
      (this.config.config.searchPath as string) ||
      "/search/-/portland,%20or";

    // 1. Fetch the search listing page
    let html: string;
    try {
      const response = await fetch(`${baseUrl}${searchPath}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) {
        logger.warn(
          { status: response.status, url: `${baseUrl}${searchPath}` },
          "Mac's List: search page non-OK response"
        );
        return [];
      }
      html = await response.text();
    } catch (err) {
      logger.warn({ err }, "Mac's List: search page fetch failed");
      return [];
    }

    // 2. Extract job detail page links
    const $ = cheerio.load(html);
    const jobLinks: string[] = [];

    $('a[href^="/job/"]').each((_i, el) => {
      const href = $(el).attr("href");
      if (href && !jobLinks.includes(href)) {
        jobLinks.push(href);
      }
    });

    if (jobLinks.length === 0) {
      logger.info("Mac's List: no job links found on search page");
      return [];
    }

    logger.debug(
      { count: jobLinks.length },
      "Mac's List: found job links"
    );

    // 3. Fetch each detail page and extract JSON-LD structured data
    const listings: RawJobListing[] = [];

    for (const link of jobLinks) {
      const detailUrl = `${baseUrl}${link}`;

      try {
        if (listings.length > 0) {
          await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
        }

        const detailResp = await fetch(detailUrl, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!detailResp.ok) {
          logger.debug(
            { status: detailResp.status, url: detailUrl },
            "Mac's List: detail page non-OK"
          );
          continue;
        }

        const detailHtml = await detailResp.text();
        const listing = this.parseDetailPage(detailHtml, detailUrl);
        if (listing) {
          listings.push(listing);
        }
      } catch (err) {
        logger.debug(
          { err, url: detailUrl },
          "Mac's List: detail page fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: listings.length },
      "Mac's List: fetch complete"
    );
    return listings;
  }

  private parseDetailPage(
    html: string,
    sourceUrl: string
  ): RawJobListing | null {
    const $ = cheerio.load(html);

    // Try JSON-LD first (most reliable)
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

      // Get description from the HTML body (richer than JSON-LD description)
      // JSON-LD description may contain HTML tags, so strip them as fallback
      const jsonLdDescription = jsonLd.description
        ? jsonLd.description.replace(/<\/?[^>]+(>|$)/g, "").trim()
        : "";
      const description =
        this.extractDescription($) ||
        jsonLdDescription;

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
        employmentType: jsonLd.employmentType || undefined,
        postedDate: jsonLd.datePosted
          ? new Date(jsonLd.datePosted)
          : undefined,
      };
    }

    // Fallback: scrape from HTML directly
    const title = $("h1").first().text().trim();
    if (!title) return null;

    const company = $('a[href^="/employerjoblist/"]')
      .first()
      .text()
      .trim();
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
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }
    return null;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    // Mac's List detail pages have the job description in the main content area
    // Try common patterns
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
