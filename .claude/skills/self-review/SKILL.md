---
name: self-review
description: Perform a code quality review before creating a PR. Use after the project's checks pass and before opening a PR or merging.
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

Load `writing-tests` when the diff touches adapters or test files, and `claude-api` when it touches `src/matching/**`.

## Step 3: Code Quality Review

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

After all blocking issues are fixed, report the review results. The author decides whether to open a PR or merge.
