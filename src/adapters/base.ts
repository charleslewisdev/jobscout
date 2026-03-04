import type { RawJobListing, SourceConfig } from "@shared/types.js";

export abstract class BaseAdapter {
  constructor(protected config: SourceConfig) {}

  /** Fetch job listings from this source. Must handle its own errors gracefully. */
  abstract fetch(): Promise<RawJobListing[]>;

  /** Human-readable name for logging */
  get name(): string {
    return this.config.name;
  }

  /** Source ID for database attribution */
  get sourceId(): string {
    return this.config.id;
  }

  /** Whether this adapter is enabled */
  get isEnabled(): boolean {
    return this.config.isEnabled;
  }

  /** Source type for database attribution (api, rss, scrape) */
  get type(): string {
    return this.config.type;
  }

  /** Adapter-specific configuration for database storage */
  get sourceConfig(): Record<string, unknown> {
    return this.config.config;
  }
}
