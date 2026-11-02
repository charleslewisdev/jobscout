---
name: start-session
description: Use when starting a new coding session, beginning work on a branch, or resuming after a context reset. Gathers branch context, in-progress work, and recent history to produce a briefing before any code is written.
---

# Start Session

Orientation before action. Gather context from the current branch, git state, and recent history, then present a structured briefing.

**Announce at start:** "Using start-session to orient before we begin."

## Step 1: Gather Context

Find out:

- the branch, and whether it is main (a fresh start) or in-progress work
- uncommitted changes, which may come from a crashed session
- commits diverged from main, recent history, and stashes
- how far the branch is behind `origin/main`
- GitHub issues that match the branch topic

If `data/jobscout.db` exists, read `name`, `last_run_at`, `last_run_status`, `last_run_items` and `last_run_errors` from `sources` where `is_enabled = 1`, and report them. Dry runs update these columns too. If no row has a `last_run_at`, say run state is unavailable.

## Step 2: Present Briefing

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

## Step 3: Confirm Direction

After presenting the briefing, ask:

> Does this look right? What are we working on today?

Wait for human confirmation before proceeding to any code changes.

## What This Skill Does NOT Do

- Does not make decisions about what to work on (that's the human's call)
- Does not start coding (wait for confirmation)
