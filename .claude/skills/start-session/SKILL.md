---
name: start-session
description: Use when starting a new coding session, beginning work on a branch, or resuming after a context reset. Gathers branch context, in-progress work, and recent history to produce a briefing before any code is written.
---

# Start Session

Orientation before action. Gather context from the current branch, git state, and recent history, then present a structured briefing.

**Announce at start:** "Using start-session to orient before we begin."

## Step 1: Detect Current State

```bash
# Branch name
git branch --show-current

# Is this main or a feature branch?
# main/master = fresh start, anything else = in-progress work

# Uncommitted changes
git status --short

# Recent commits on this branch (diverged from main)
git log main..HEAD --oneline 2>/dev/null || git log --oneline -5
```

## Step 2: Identify Context Sources

Based on the branch name, find relevant context:

### Related Issues

```bash
# Search GitHub issues related to branch topic
gh issue list --search "<branch-topic-keywords>" --state all --limit 5
```

### Recent Git Activity

```bash
# What was the last session working on?
git log --oneline -10 --format="%h %s (%ar)"

# Any stashed work?
git stash list
```

## Step 3: Check Project Health

Quick health check — catch problems before they compound:

```bash
# Are there uncommitted changes that might be from a crashed session?
git status --short

# Are we behind main?
git fetch origin main --quiet 2>/dev/null
git rev-list HEAD..origin/main --count 2>/dev/null
```

### Pipeline Health (if on main or pipeline-related branch)

```bash
# Check when pipeline last ran (quick DB query)
# Check for any adapter errors in recent logs
```

## Step 4: Present Briefing

Format the gathered information as a structured briefing:

```
## Session Briefing

**Branch**: `<branch-name>` (diverged from main by N commits)
**Status**: <fresh | in-progress | uncommitted changes detected>

### Context
- <Related issues if found>
- <Recent commit summary>

### Relevant Skills
Based on the branch topic, these skills are likely relevant:
- <skill-1>: <why>
- <skill-2>: <why>

### Suggested Next Steps
- <Based on branch state>
```

## Step 5: Confirm Direction

After presenting the briefing, ask:

> Does this look right? What are we working on today?

Wait for human confirmation before proceeding to any code changes.

## Skill Suggestions by Area

Map branch topics to relevant skills:

| Topic keywords | Skills to suggest |
|---------------|-------------------|
| adapter, source, scrape, ingest | `claude-developer-platform` (if LLM), `writing-tests` |
| match, llm, prompt, scoring | `claude-developer-platform`, `writing-tests` |
| schema, migration, database, db | `sqlite-raw-performance`, `writing-tests` |
| pipeline, scheduler, cron | `writing-tests` |
| ui, component, dashboard, page | `frontend-design`, `tailwind-css-patterns`, `tanstack-query-best-practices` |
| test, coverage, spec | `writing-tests`, `vitest` |
| docker, deploy, container | `docker-best-practices`, `unraid` |
| dedup, filter, prefilter | `writing-tests` |

## What This Skill Does NOT Do

- Does not make decisions about what to work on (that's the human's call)
- Does not start coding (wait for confirmation)
- Does not replace `work-ticket` (which handles the full ticket lifecycle)
