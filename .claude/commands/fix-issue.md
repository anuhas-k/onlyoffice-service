---
name: fix-issue
description: Fix a bug or issue — runs the full debug protocol (root cause first, no fix without diagnosis)
argument-hint: "[issue-description|issue-number]"
---
# /fix-issue — Bug Fix Protocol

## What This Does

Runs the ASTRA debug protocol on `$ARGUMENTS`.
No fix without a confirmed root cause.

## Steps

### 1 — Reproduce
- What is the exact behavior? (input → observed → expected)
- Is it deterministic or intermittent?
- What changed recently? (check git log)

### 2 — Hypotheses (max 3)
Write 3 ranked candidates:
```
H1 [80%]: most likely cause
H2 [15%]: second candidate
H3 [5%]:  long shot
```

### 3 — Instrument
Add targeted logging to validate H1. Run. Read output. Update ranking.

### 4 — Fix the root cause
Fix H1 only if confirmed. Do NOT "fix while you're in there."

### 5 — Verify
- Run the exact reproduction case — confirm behavior changed
- Run full test suite — confirm no regression
- Add a regression test for this specific case

### 6 — Document
Write to STATUS.md:
```
## Fix: [issue]
- Root cause: [confirmed H1]
- Fix: [what changed]
- Regression test: [test name]
```

## Scope Freeze
While this command is active: only files directly related to the confirmed
root cause may be modified. Any other change requires explicit approval.
