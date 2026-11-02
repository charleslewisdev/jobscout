---
paths: ["src/adapters/**"]
---

Each source is a single file in `src/adapters/` implementing a common interface. Adapters normalize raw data into `RawJobListing` objects. The pipeline orchestrator handles dedup, pre-filtering, and LLM matching — adapters just fetch and normalize.

Craigslist and Built In were removed because their terms ban automated access. Read a site's terms before adding it.
