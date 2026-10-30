---
name: self-review
description: Perform a code quality review before creating a PR. Invoked as part of the work-ticket lifecycle after verification-before-completion and before finishing-a-development-branch.
---

# Code Review Quality Check

Perform a code review for the current JobScout branch. Ensure code quality, identify potential bugs, and find gaps in test coverage.

## Step 1: Understand What Changed

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Review the diff to understand the scope and intent of the changes.

## Step 2: Invoke Relevant Best-Practice Skills

Based on which files changed, invoke the corresponding skills:

| Files changed | Skill to invoke |
|---|---|
| `src/adapters/**` | `writing-tests` (adapter test conventions) |
| `src/matching/**` | `claude-developer-platform`, `writing-tests` |
| `src/db/**` | `sqlite-raw-performance` |
| `shared/**` | `typescript-advanced-types` |
| `Dockerfile*`, `docker-compose*` | `docker-best-practices` |
| `client/**` | `frontend-design`, `tailwind-css-patterns` |
| Test files (`**/*.test.*`) | `writing-tests`, `vitest` |

## Step 3: Code Quality Review

### General Principles

- **DRY** — Don't repeat yourself; extract shared logic
- **YAGNI** — Don't build features that aren't needed yet
- **Single Responsibility** — Functions do one thing well
- **Readable code over comments** — Self-documenting through clear naming

### Pipeline-Specific Checks

- **Adapter robustness**: Graceful failure per-source — one adapter breaking must not block others
- **Rate limiting**: All HTTP requests respect configured delays, no unbounded concurrency
- **Error handling**: Network errors, parse failures, and empty responses handled gracefully
- **Dedup correctness**: URL exact match + fuzzy hash both working, no false negatives
- **LLM prompt quality**: Structured output enforced via Zod, fallback for malformed responses
- **Cost awareness**: Pre-filter eliminates obvious mismatches before LLM calls

### Code Hygiene

- No unused imports or variables
- No leftover console.log statements (use Pino logger)
- No hardcoded values that should be constants or config
- No commented-out code blocks
- No API keys or secrets in source files

## Step 4: Automated Testing Checklist

```bash
npm run test:run
```
Expected: All tests pass

```bash
npm run lint
```
Expected: No errors (warnings OK)

```bash
npx tsc --noEmit
```
Expected: No type errors

## Step 5: Issue Severity Guide

**Blocking (must fix before PR):**
- Test failures
- Build/lint errors
- Security issues (exposed secrets, injection vulnerabilities)
- Broken adapter functionality
- LLM response parsing failures without fallback

**Should fix (fix now or create follow-up issue):**
- Missing test coverage for new adapter or matching logic
- Unhandled edge cases in scrapers (empty pages, rate limit responses)
- Missing rate limiting on new HTTP calls

**Note for later (document but don't block):**
- Minor refactoring opportunities
- Performance optimizations
- Additional source adapters to add

## Step 6: Hand Off

After all blocking issues are fixed, report the review results and hand off to `finishing-a-development-branch` for PR creation or merge.
