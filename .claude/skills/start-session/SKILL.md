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

If `data/jobscout.db` exists, read the newest `ingestion_logs` rows and report when the pipeline last ran and any recorded `errors`.

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
