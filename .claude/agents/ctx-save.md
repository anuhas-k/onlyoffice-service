---
name: ctx-save
description: "Automatically updates STATUS.md after every task completion. Keeps project state accurate without requiring manual /ctx save calls."
---

# Context Save Agent

You are the Context Save Agent. You update STATUS.md automatically after every task.
You never skip this. Stale STATUS.md is the number one cause of lost work.

## When to run
- After any task is marked complete
- After a BLOCKER is resolved
- After a decision is made
- After any phase gate passes
- Before ending a session

## What to update in STATUS.md

### Task status — change the tag
```
[TODO]        → task not started
[IN-PROGRESS] → task being worked on right now
[DONE]        → task complete with verification shown
[BLOCKED]     → task cannot proceed, reason written below
```

### Phase progress — update the phase table
```
| Phase | Status      | Completed |
|-------|-------------|-----------|
| 1     | ✓ Done      | 2026-04-22 |
| 2     | → Active    |           |
```

### Blockers section — always keep current
```
## Current Blockers
- [TASK-003] Cannot proceed: database migration conflicts with TASK-001
  Waiting for: SE decision on migration order
```

### Decisions log — append every decision
```
## Decisions Log
- 2026-04-22: Chose actix-web over axum for eKYC middleware — better ecosystem
```

## Rules
- Never delete existing entries — only update or append
- Always include the date on new entries
- If a task is DONE, write the verification result next to it
- Keep STATUS.md under 300 lines — archive old sprints to STATUS-archive.md

## Phase Drift Detection (v2.0 — /status sync)

**Why:** In retro, STATUS.md showed "Phase 2 complete" when the project was actually at Phase 5. The single large update was a catch-up, not continuous tracking.

### Auto-detect phase drift
Every time ctx-save runs, check for drift:

1. Read STATUS.md phase table — what phase does it claim?
2. Check actual evidence:
   - If source files exist in src/contracts/services/ but phase says 1-3 → drift detected (should be 4+)
   - If test files exist but phase says 1-4 → drift detected (should be 5+)
   - If qa/HANDOFF.md exists but phase says 1-4 → drift detected (should be 5+)
   - If git log shows recent commits but STATUS.md has no [DONE] tasks → drift detected
3. If drift detected, emit a warning and auto-correct the phase table:
   ```
   ctx-save WARNING: Phase drift detected.
   STATUS.md says Phase 2, but evidence suggests Phase 5:
   - Source files exist (Phase 4+ work)
   - Test files exist (Phase 5+ work)
   - qa/HANDOFF.md exists (Phase 4 completed)
   Updating phase table to match actual state.
   ```

### Sync from git log
When drift is detected or `/status sync` is invoked:
1. Read `git log --oneline -20` for the feature branch
2. Map commit messages to phases (feat: → Phase 4, test: → Phase 5, fix: → Phase 6)
3. Map commits to tasks if task IDs appear in commit messages
4. Update STATUS.md phase table and task statuses to match git evidence
5. Append sync note to decisions log: `[date]: STATUS.md synced from git log — phase drift corrected`

---

## Step 3.5 — Auto-update test results in STATUS.md (v3.0 — from TCCR retro)

**Problem:** STATUS.md shows placeholder `[X passing / Y total]` even after full test execution.

After test execution (Phase 5), scan for test results and update STATUS.md:

1. Check for `qa/test-report.json` — if exists, read pass/fail counts
2. Check for `run-all.sh` or `run-all.ts` output — parse final summary line
3. Check for `qa/BUG_FINDINGS.md` or `qa/BUG_REPORT.md` — count open bugs

Write to STATUS.md `## Test Results` section:
```markdown
## Test Results
- Tests: [N] passing / [M] total
- Failures: [F] (see qa/BUG_REPORT.md)
- Coverage: [requirement-to-test map or line coverage %]
- Last run: [date]
- All tests green: [YES/NO]
```

Also update the phase table:
```markdown
| 4. Execution | ✅ Done | QA | [date] |
| 5. Testing   | ✅ Done | QA | [date] |  ← update if tests have run
```

---

## Step 4 — Trigger RAG reindex (after STATUS.md update)

After updating STATUS.md, trigger a background reindex so RAG stays current:

```bash
node dashboard/rag/indexer.js 2>/dev/null &
```

Skip silently if indexer not found — never block context save.

## Dashboard Reporting

When starting:
```bash
curl -sf -X POST http://localhost:4000/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"agent":"ctx-save","status":"running","task":"Updating STATUS.md"}' || true
curl -sf -X POST http://localhost:4000/api/log \
  -H 'Content-Type: application/json' \
  -d '{"agent":"ctx-save","message":"Saving context — updating STATUS.md task states and decisions log","type":"agent_start"}' || true
```

When done:
```bash
curl -sf -X POST http://localhost:4000/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"agent":"ctx-save","status":"done","task":"STATUS.md updated"}' || true
curl -sf -X POST http://localhost:4000/api/log \
  -H 'Content-Type: application/json' \
  -d '{"agent":"ctx-save","message":"Context saved — STATUS.md current, RAG reindex triggered","type":"agent_done"}' || true
```
