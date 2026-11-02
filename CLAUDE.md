# JobScout

Automated job matching tool — scans Portland-area job postings from multiple sources and matches them against candidate profiles using LLM-powered analysis. Self-hosted homelab tool for helping friends/family find work.

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
npm run build                 # TypeScript compile and client build
npm start                     # Run compiled output
```

## External Services (on unRAID)

- **Chrome CDP** — For JS-rendered pages (Poached Jobs). HTTP URL at `CHROME_CDP_URL`

## Development Lifecycle

### Starting a session

Run `/start-session` at the beginning of every session.

### Working on a ticket

1. **Orient** → `/start-session`
2. **Implement** on a feature branch
3. **Write tests** → `writing-tests` for conventions
4. **Verify** → run the Lifecycle Gates checks below
5. **Self-review** → `self-review`
6. **Complete** → open a PR

### Lifecycle Gates

**Before creating a PR:**

- All tests pass: `npm run test:run`
- Lint clean: `npm run lint`
- TypeScript compiles: `npx tsc --noEmit`
- Self-review completed
