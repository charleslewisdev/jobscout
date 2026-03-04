import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { parseSalaryRaw } from "../utils/salary.js";
import { BaseAdapter } from "./base.js";

/** Delay between search page fetches to be respectful */
const PAGE_FETCH_DELAY_MS = 3000;

/** Delay between detail page fetches to avoid getting blocked */
const DETAIL_FETCH_DELAY_MS = 200;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Craigslist adapter using plain HTTP + Cheerio.
 *
 * Two-phase scrape:
 * 1. Fetch search pages to collect job URLs and metadata
 * 2. Fetch each detail page to get full posting description from #postingbody
 *
 * Config:
 *   - region: CL subdomain (default "portland")
 *   - categories: CL category slugs (default ["jjj"] = all jobs)
 */
export class CraigslistAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const region =
      (this.config.config.region as string) || "portland";
    const categories =
      (this.config.config.categories as string[]) || ["jjj"];

    // Phase 1: Collect listings from search pages
    const allListings: RawJobListing[] = [];

    for (const category of categories) {
      if (allListings.length > 0) {
        await new Promise((r) => setTimeout(r, PAGE_FETCH_DELAY_MS));
      }

      const searchUrl = `https://${region}.craigslist.org/search/${category}`;

      try {
        const response = await fetch(searchUrl, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!response.ok) {
          logger.warn(
            { status: response.status, url: searchUrl },
            "Craigslist: search page non-OK response"
          );
          continue;
        }

        const html = await response.text();
        const listings = this.parseSearchPage(html, region);
        allListings.push(...listings);

        logger.debug(
          { category, count: listings.length },
          "Craigslist: fetched category"
        );
      } catch (err) {
        logger.warn(
          { err, category, url: searchUrl },
          "Craigslist: failed to fetch category"
        );
      }
    }

    if (allListings.length === 0) {
      logger.info("Craigslist: no listings found");
      return [];
    }

    // Phase 2: Fetch detail pages for full descriptions
    let enriched = 0;
    for (const listing of allListings) {
      try {
        if (enriched > 0) {
          await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
        }

        const response = await fetch(listing.sourceUrl, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!response.ok) {
          logger.debug(
            { status: response.status, url: listing.sourceUrl },
            "Craigslist: detail page non-OK"
          );
          continue;
        }

        const html = await response.text();
        const { description, descriptionHtml } = this.parseDetailPage(html);
        if (description) {
          listing.description = description;
          listing.descriptionHtml = descriptionHtml;
          enriched++;
        }
      } catch (err) {
        logger.debug(
          { err, url: listing.sourceUrl },
          "Craigslist: detail page fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: allListings.length, enriched },
      "Craigslist: fetch complete"
    );
    return allListings;
  }

  private parseSearchPage(
    html: string,
    region: string
  ): RawJobListing[] {
    const $ = cheerio.load(html);
    const listings: RawJobListing[] = [];

    // Modern CL uses ol.cl-static-search-results > li.cl-static-search-result
    // Fallback to older selectors if needed
    const results = $("li.cl-static-search-result");

    if (results.length === 0) {
      // Try older selector pattern
      const oldResults = $(".result-info");
      if (oldResults.length > 0) {
        return this.parseOldFormat($, oldResults, region);
      }
      logger.debug("Craigslist: no results found in HTML");
      return [];
    }

    results.each((_i, el) => {
      const $el = $(el);
      const link = $el.find("a").first();
      const href = link.attr("href") || "";
      const title = $el.find(".title").text().trim() ||
        link.text().trim();
      const price = $el.find(".price").text().trim();
      const location = $el.find(".location").text().trim();

      if (!title || !href) return;

      const sourceUrl = href.startsWith("http")
        ? href
        : `https://${region}.craigslist.org${href}`;

      // CL uses "$0" as a placeholder for jobs with no listed price
      const salaryRaw = price && price !== "$0" ? price : undefined;
      const parsed = salaryRaw ? parseSalaryRaw(salaryRaw) : {};

      listings.push({
        sourceUrl,
        title,
        location: location || undefined,
        salaryRaw,
        salaryMin: parsed.min,
        salaryMax: parsed.max,
        salaryUnit: parsed.unit,
        description: title, // CL search pages have minimal description
      });
    });

    return listings;
  }

  private parseDetailPage(html: string): {
    description: string;
    descriptionHtml: string | undefined;
  } {
    const $ = cheerio.load(html);
    const $body = $("#postingbody");

    if ($body.length === 0) {
      return { description: "", descriptionHtml: undefined };
    }

    // Remove the QR code print div
    $body.find(".print-information").remove();

    const descriptionHtml = $body.html()?.trim();
    const description = $body.text().trim();

    return {
      description: description || "",
      descriptionHtml: descriptionHtml || undefined,
    };
  }

  private parseOldFormat(
    $: cheerio.CheerioAPI,
    results: cheerio.Cheerio<Element>,
    region: string
  ): RawJobListing[] {
    const listings: RawJobListing[] = [];

    results.each((_i, el) => {
      const $el = $(el);
      const link = $el.find("a.result-title");
      const href = link.attr("href") || "";
      const title = link.text().trim();
      const price = $el.find(".result-price").text().trim();
      const hood = $el.find(".result-hood").text().trim();
      const dateStr = $el.find("time.result-date").attr("datetime");

      if (!title || !href) return;

      const sourceUrl = href.startsWith("http")
        ? href
        : `https://${region}.craigslist.org${href}`;

      // CL uses "$0" as a placeholder for jobs with no listed price
      const salaryRaw = price && price !== "$0" ? price : undefined;
      const parsed = salaryRaw ? parseSalaryRaw(salaryRaw) : {};

      listings.push({
        sourceUrl,
        title,
        location: hood ? hood.replace(/[()]/g, "").trim() : undefined,
        salaryRaw,
        salaryMin: parsed.min,
        salaryMax: parsed.max,
        salaryUnit: parsed.unit,
        description: title,
        postedDate: dateStr ? new Date(dateStr) : undefined,
      });
    });

    return listings;
  }
}
