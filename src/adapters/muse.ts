import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { BaseAdapter } from "./base.js";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface MuseCompany {
  id?: number;
  name?: string;
  short_name?: string;
}

interface MuseLocation {
  name?: string;
}

interface MuseLevel {
  name?: string;
  short_name?: string;
}

interface MuseResult {
  id?: number;
  name?: string;
  type?: string;
  publication_date?: string;
  short_name?: string;
  company?: MuseCompany;
  locations?: MuseLocation[];
  levels?: MuseLevel[];
  categories?: { name?: string }[];
  refs?: {
    landing_page?: string;
  };
  contents?: string;
}

interface MuseResponse {
  page?: number;
  page_count?: number;
  total?: number;
  results?: MuseResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.themuse.com/api/public/jobs";

/** Delay between page fetches to respect rate limits */
const PAGE_FETCH_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class MuseAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const location =
      (this.config.config.location as string) || "Portland, OR";
    const maxPages =
      (this.config.config.maxPages as number) || 5;

    const listings: RawJobListing[] = [];
    let page = 0;

    try {
      while (page < maxPages) {
        const url = new URL(BASE_URL);
        url.searchParams.set("location", location);
        url.searchParams.set("page", String(page));

        const response = await fetch(url.toString());
        if (!response.ok) {
          logger.warn(
            { status: response.status, page },
            "Muse: non-OK response"
          );
          break;
        }

        const data = (await response.json()) as MuseResponse;
        const results = data.results || [];
        const pageCount = data.page_count ?? 0;

        for (const result of results) {
          const listing = mapToListing(result);
          if (listing) {
            listings.push(listing);
          }
        }

        // Stop if we've reached the last page
        if (page + 1 >= pageCount) break;

        page++;

        // Rate limit delay between pages
        await new Promise((resolve) =>
          setTimeout(resolve, PAGE_FETCH_DELAY_MS)
        );
      }
    } catch (err) {
      logger.warn({ err }, "Muse: fetch failed");
    }

    logger.info(
      { source: this.name, total: listings.length },
      "Muse: fetch complete"
    );
    return listings;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

function mapToListing(result: MuseResult): RawJobListing | null {
  const url = result.refs?.landing_page;
  const title = result.name;

  if (!url || !title) return null;

  const rawContents = result.contents || "";
  const description = stripHtmlTags(rawContents);

  // Join multiple locations with semicolons
  const location =
    result.locations && result.locations.length > 0
      ? result.locations
          .map((l) => l.name)
          .filter(Boolean)
          .join("; ")
      : undefined;

  // Use first level as employment type if available
  const employmentType =
    result.levels && result.levels.length > 0
      ? result.levels[0].name
      : undefined;

  return {
    title,
    sourceUrl: url,
    company: result.company?.name,
    location: location || undefined,
    description,
    descriptionHtml: rawContents || undefined,
    descriptionQuality: "full",
    employmentType,
    postedDate: result.publication_date
      ? new Date(result.publication_date)
      : undefined,
  };
}
