# JobScout

Automated job matching tool — scans Portland-area job postings from multiple sources and matches them against candidate profiles using LLM-powered analysis. Self-hosted homelab tool for helping friends/family find work.

## Tech Stack

- **Runtime**: Node.js 22, TypeScript (strict), ESM modules
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **LLM**: Anthropic API (Claude Haiku for bulk screening, Sonnet for optional re-evaluation)
- **Ingestion**: Cheerio (HTML scraping), rss-parser (RSS feeds), REST API adapters
- **Scheduling**: node-cron for periodic ingestion runs
- **Logging**: Pino (structured JSON logging)
- **Validation**: Zod (LLM response parsing, config validation)
- **Frontend** (Phase 2): React 19, Vite, Tailwind CSS, TanStack Query, React Router
- **Deployment**: Docker on unRAID, SQLite volume mount

## Quick Reference

```bash
# Development
npm run dev                   # Watch mode with tsx
npm run pipeline              # Run ingestion pipeline once
npm run pipeline:dry          # Dry run (no LLM calls, no DB writes)

# Database
npm run db:generate           # Generate migration from schema changes
npm run db:migrate            # Apply pending migrations
npm run db:studio             # Open Drizzle Studio (DB browser)

# Quality
npm test                      # Vitest watch mode
npm run test:run              # Single run
npm run test:coverage         # With coverage
npm run lint                  # ESLint
npm run format:check          # Prettier check

# Build
npm run build                 # TypeScript compile
npm start                     # Run compiled output
```

## Core Architecture

### Pipeline Flow

```
Scheduler (cron) → Source Adapters → Dedup → Pre-filter → LLM Matching → Store
```

1. **Source adapters** fetch listings and normalize to `RawJobListing`
2. **Dedup** checks URL exact match + fuzzy title/company/location hash
3. **Pre-filter** runs keyword/location heuristics against all active profiles — postings with zero potential matches skip LLM
4. **LLM matching** sends each (posting × profile) pair to Claude Haiku for structured scoring
5. Results stored in SQLite, surfaced via CLI (Phase 1) or web dashboard (Phase 2)

### Source Adapter Pattern

Each source is a single file in `src/adapters/` implementing a common interface. Adapters normalize raw data into `RawJobListing` objects. The pipeline orchestrator handles dedup, pre-filtering, and LLM matching — adapters just fetch and normalize.

### Data Sources

| Source | Type | Adapter |
|--------|------|---------|
| Craigslist Portland | FlareSolverr scrape | `craigslist.ts` |
| Adzuna API | REST API | `adzuna.ts` |
| Mac's List | HTML scrape | `macslist.ts` |
| NEOGOV Government Jobs | RSS | `neogov.ts` |
| USAJobs | REST API | `usajobs.ts` |
| Careerjet | REST API | `careerjet.ts` |
| Workday Government Jobs | REST API (POST) | `workday.ts` |
| Poached Jobs | FlareSolverr scrape | `poached.ts` |

### External Services (on unRAID)

- **FlareSolverr** — For JS-rendered pages. HTTP API at `FLARESOLVERR_URL`
- **Chrome CDP** — For complex browser automation. WebSocket at `CHROME_CDP_URL`

## Database

Uses Drizzle ORM with better-sqlite3. Schema in `src/db/schema.ts`. Migrations via drizzle-kit.

**Key tables**: candidates, job_postings, match_results, dismissals, sources, ingestion_logs

**PRAGMAs applied**: WAL mode, NORMAL sync, foreign_keys ON, busy_timeout 5000, 20MB cache, 256MB mmap

## Skill Directory

| Area | Skill | What it covers |
|------|-------|----------------|
| **Session start** | `start-session` | Branch context, plan docs, brain query, structured briefing |
| **Testing** | `writing-tests` | Vitest conventions, adapter testing, LLM mock patterns |
| **Code review** | `self-review` | Quality checklist, automated checks |
| **LLM integration** | `claude-developer-platform` | Anthropic API patterns, structured output |
| **Database** | Drizzle docs + `sqlite-raw-performance` | Schema design, query patterns, migrations |
| **Docker** | `docker-best-practices` | Container build, deployment to unRAID |
| **Git workflow** | `git-preferences` | Branch naming, commit conventions |

## Development Lifecycle

### Starting a session

Run `/start-session` at the beginning of every session.

### Working on a ticket

1. **Orient** → `/start-session`
2. **Pick up ticket** → `work-ticket` (branch creation, plan review, implementation)
3. **Write tests** → `writing-tests` for conventions
4. **Verify** → `superpowers:verification-before-completion`
5. **Self-review** → `self-review`
6. **Complete** → `superpowers:finishing-a-development-branch`

### Lifecycle Gates

**Before creating a PR:**
- All tests pass: `npm run test:run`
- Lint clean: `npm run lint`
- TypeScript compiles: `npx tsc --noEmit`
- Self-review completed

## Environment Variables

Required: `ANTHROPIC_API_KEY`
Database: `DATABASE_URL` (default: `./data/jobscout.db`)
Auth: `JWT_SECRET` (recommended), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (first deploy)
Sources: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `USAJOBS_API_KEY`, `USAJOBS_EMAIL`, `CAREERJET_AFFID`
External: `FLARESOLVERR_URL`, `CHROME_CDP_URL`
Pipeline: `SCAN_CRON`, `MIN_CONFIDENCE_THRESHOLD`, `DRY_RUN`
Logging: `LOG_LEVEL`

## Project Structure

```
src/
  adapters/       # Source adapters (one file per source)
  matching/       # Pre-filter + LLM matching engine
  db/             # Drizzle schema, migrations, connection
  utils/          # Shared utilities (logging, config, hashing)
  scheduler.ts    # node-cron orchestration
  pipeline.ts     # Adapter → dedup → prefilter → LLM → store
  index.ts        # Entry point
shared/
  types.ts        # TypeScript interfaces shared across src/ and client/
client/           # React app (Phase 2)
seeds/            # Sample candidate profiles as JSON
data/             # SQLite database (gitignored, Docker volume)
```
