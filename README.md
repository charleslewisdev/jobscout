# JobScout

Automated job matching tool that scans job postings from multiple sources and matches them against candidate profiles using LLM-powered analysis. Self-hosted, designed for homelab deployment.

## Features

- **Multi-source ingestion** — pulls listings from 10 job boards via APIs, RSS, and web scraping
- **LLM matching** — Claude AI scores each posting against candidate profiles with structured reasoning
- **Smart dedup** — URL exact match + fuzzy title/company/location hashing prevents duplicates
- **Pre-filtering** — keyword and location heuristics skip irrelevant postings before LLM calls
- **Web dashboard** — React UI for browsing matches, managing candidates, and dismissing postings
- **Scheduled pipeline** — configurable cron schedule for hands-off operation
- **Docker-ready** — multi-stage build, SQLite volume mount, unRAID template included

## Quick Start

```bash
git clone https://github.com/charleslewisdev/jobscout.git
cd jobscout
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY
npm install
npm run db:migrate
npm run dev
```

The web UI will be available at `http://localhost:3080`.

### Candidate Profiles

Place JSON profile files in the `seeds/` directory. Each profile describes a candidate's skills, experience, and preferences. The pipeline matches postings against all active profiles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript (strict ESM) |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| LLM | Anthropic API (Claude Haiku for screening) |
| Scraping | Cheerio, Puppeteer (via Chrome CDP), FlareSolverr |
| Scheduling | node-cron |
| Validation | Zod |
| Logging | Pino (structured JSON) |
| Frontend | React 19, Vite, Tailwind CSS, TanStack Query |
| Auth | JWT (bcrypt, HTTP-only cookies) |

## Architecture

```
Scheduler (cron) → Source Adapters → Dedup → Pre-filter → LLM Matching → Store
```

1. **Source adapters** fetch listings and normalize to a common format
2. **Dedup** checks URL exact match + fuzzy title/company/location hash
3. **Pre-filter** runs keyword/location heuristics — postings with zero potential matches skip LLM
4. **LLM matching** sends each (posting × profile) pair to Claude for structured scoring
5. Results stored in SQLite, surfaced via the web dashboard

## Source Adapters

| Source | Method | Adapter |
|--------|--------|---------|
| Craigslist | FlareSolverr scrape | `craigslist.ts` |
| Adzuna | REST API | `adzuna.ts` |
| Mac's List | HTML scrape | `macslist.ts` |
| NEOGOV | RSS | `neogov.ts` |
| USAJobs | REST API | `usajobs.ts` |
| Careerjet | REST API | `careerjet.ts` |
| Workday | REST API | `workday.ts` |
| Poached Jobs | FlareSolverr scrape | `poached.ts` |
| The Muse | REST API | `muse.ts` |
| PDX Pipeline | HTML scrape | `pdxpipeline.ts` |

Each adapter is a single file in `src/adapters/` implementing a common interface. The pipeline orchestrator handles dedup, pre-filtering, and LLM matching.

## Docker Deployment

### Docker Compose

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up -d
```

### Manual Build

```bash
docker build -t jobscout .
docker run -d \
  --name jobscout \
  -p 3080:3080 \
  -v ./data:/app/data \
  --env-file .env \
  jobscout
```

### unRAID

An unRAID template is included (`unraid-template.xml`) for Community Applications.

### Volumes

| Path | Purpose |
|------|---------|
| `/app/data` | SQLite database |
| `/app/seeds` | Candidate profile JSON files |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for LLM matching |
| `DATABASE_URL` | No | SQLite path (default: `./data/jobscout.db`) |
| `FLARESOLVERR_URL` | No | FlareSolverr instance for scraping |
| `CHROME_CDP_URL` | No | Chrome CDP instance for browser automation |
| `SCAN_CRON` | No | Cron schedule (default: `0 */6 * * *`) |
| `MIN_CONFIDENCE_THRESHOLD` | No | Minimum match score 0-100 (default: `25`) |
| `DRY_RUN` | No | Skip LLM calls and DB writes |
| `ADZUNA_APP_ID` | No | Adzuna API credentials |
| `ADZUNA_APP_KEY` | No | |
| `USAJOBS_API_KEY` | No | USAJobs API credentials |
| `USAJOBS_EMAIL` | No | |
| `CAREERJET_AFFID` | No | Careerjet affiliate ID |
| `JWT_SECRET` | No | JWT signing key (auto-generated if empty) |
| `ADMIN_EMAIL` | No | Initial admin account email |
| `ADMIN_PASSWORD` | No | Initial admin account password |
| `PORT` | No | Server port (default: `3080`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

## Development

```bash
npm run dev              # API server in watch mode
npm run dev:client       # React dev server
npm run dev:all          # Both concurrently

npm run pipeline         # Run ingestion pipeline once
npm run pipeline:dry     # Dry run (no LLM calls, no DB writes)

npm run db:generate      # Generate migration from schema changes
npm run db:migrate       # Apply pending migrations
npm run db:studio        # Drizzle Studio (DB browser)

npm test                 # Vitest watch mode
npm run test:run         # Single test run
npm run test:coverage    # With coverage
npm run lint             # ESLint
npm run format:check     # Prettier check
```

## Project Structure

```
src/
  adapters/       # Source adapters (one file per job board)
  matching/       # Pre-filter + LLM matching engine
  db/             # Drizzle schema, migrations, connection
  utils/          # Logging, config, hashing
  scheduler.ts    # node-cron orchestration
  pipeline.ts     # Adapter → dedup → prefilter → LLM → store
  index.ts        # Entry point
shared/
  types.ts        # TypeScript interfaces shared between API and client
client/           # React web dashboard
seeds/            # Candidate profile JSON files
data/             # SQLite database (gitignored)
```

## License

[MIT](LICENSE)
