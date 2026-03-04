import RssParser from "rss-parser";

import type { RawJobListing } from "@shared/types.js";

import { logger } from "../utils/logger.js";
import { parseSalaryRaw } from "../utils/salary.js";
import { BaseAdapter } from "./base.js";

interface NeogovAgency {
  agencyKey: string;
  name: string;
}

interface NeogovItem {
  title?: string;
  link?: string;
  guid?: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  salary?: string;
  department?: string;
  location?: string;
  jobType?: string;
  duties?: string;
  qualifications?: string;
}

const FEED_BASE_URL =
  "https://www.governmentjobs.com/SearchEngine/JobsFeed";

/** Delay between agency fetches to be respectful */
const AGENCY_FETCH_DELAY_MS = 1000;

const parser = new RssParser({
  customFields: {
    item: [
      ["joblisting:salary", "salary"],
      ["joblisting:department", "department"],
      ["joblisting:location", "location"],
      ["joblisting:jobtype", "jobType"],
      ["joblisting:examplesofduties", "duties"],
      ["joblisting:qualifications", "qualifications"],
    ],
  },
});

export class NeogovAdapter extends BaseAdapter {
  async fetch(): Promise<RawJobListing[]> {
    const agencies = (this.config.config.agencies as NeogovAgency[]) || [];

    const allListings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < agencies.length; i++) {
      const agency = agencies[i];
      if (i > 0) {
        await new Promise((r) => setTimeout(r, AGENCY_FETCH_DELAY_MS));
      }

      try {
        const listings = await this.fetchAgency(agency);

        for (const listing of listings) {
          if (!seenUrls.has(listing.sourceUrl)) {
            seenUrls.add(listing.sourceUrl);
            allListings.push(listing);
          }
        }

        logger.debug(
          { agency: agency.name, fetched: listings.length },
          "NEOGOV: agency fetch complete"
        );
      } catch (err) {
        logger.warn(
          { err, agency: agency.name },
          "NEOGOV: agency fetch failed"
        );
      }
    }

    logger.info(
      { source: this.name, total: allListings.length },
      "NEOGOV: fetch complete"
    );
    return allListings;
  }

  private async fetchAgency(agency: NeogovAgency): Promise<RawJobListing[]> {
    const url = `${FEED_BASE_URL}?agency=${agency.agencyKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(
        { status: response.status, agency: agency.name },
        "NEOGOV: non-OK response"
      );
      return [];
    }

    const xml = await response.text();
    const feed = await parser.parseString(xml);
    const items = (feed.items || []) as NeogovItem[];

    return items
      .filter((item) => item.link)
      .map((item) => mapToListing(item, agency.name));
  }
}

function mapToListing(item: NeogovItem, agencyName: string): RawJobListing {
  const salaryRaw = item.salary || undefined;
  const parsed = salaryRaw ? parseSalaryRaw(salaryRaw) : {};

  return {
    sourceUrl: item.link || "",
    externalId: item.guid || undefined,
    title: item.title || "",
    company: agencyName,
    location: item.location || undefined,
    salaryRaw,
    salaryMin: parsed.min,
    salaryMax: parsed.max,
    salaryUnit: parsed.unit,
    description: item.contentSnippet || item.duties || "",
    descriptionHtml: item.content || undefined,
    employmentType: item.jobType || undefined,
    postedDate: item.pubDate ? new Date(item.pubDate) : undefined,
  };
}
