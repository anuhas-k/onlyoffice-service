# Bug Report
<!-- Auto-rendered from qa/bugs.json — DO NOT EDIT bug entries here. -->
<!-- Edit qa/bugs.json instead; the bugs.json hook + render command rebuild this file. -->

| Field | Value |
|-------|-------|
| Project | <!-- filled from SPEC.md or init args --> |
| Version | <!-- filled from SPEC.md --> |
| QA Engineer | ${current_user_name} <!-- substituted from AGENTS.md current_user_name --> |
| Environment | <!-- filled from .env.test BASE_URL --> |
| Created | <!-- filled with current date --> |

---

## Bug Summary

| Metric | Count |
|--------|-------|
| Total bugs | 0 |
| Critical (S1) | 0 |
| High (S2) | 0 |
| Medium (S3) | 0 |
| Low (S4) | 0 |
| Investigating | 0 |
| Open | 0 |
| Fixed | 0 |
| Verified | 0 |
| Retracted | 0 |

---

## Severity Guide

- **S1 Critical:** system crash, data loss, security breach, auth bypass
- **S2 High:** major feature broken, no workaround
- **S3 Medium:** feature works but incorrectly, workaround exists
- **S4 Low:** cosmetic issue, typo, minor UI problem

## Status Workflow (v7.1 — hardened post-Project A)

```
INVESTIGATING        ← default for new candidate bugs
       │
       │  evidence_checklist all 5 keys = true
       ▼
     OPEN            ← logged, not yet assigned
       │
       ▼
   IN_PROGRESS       ← developer working on it
       │
       ▼
     FIXED           ← developer says fixed, waiting QA re-test
       │
       ▼
    VERIFIED         ← QA confirmed fixed

   Side exits from any state:
   ↳ DEFERRED        ← agreed to fix in future sprint
   ↳ RETRACTED       ← turned out to be invalid (test bug, doc bug, misread)
                       requires retracted_reason + retracted_at + retracted_by
```

A bug cannot be moved out of `INVESTIGATING` until the 5-item evidence
checklist (below) is all-true. This is enforced by `qa-bugs-lint.sh`.

---

## Pre-Filing Evidence Checklist (HARD — all 5 must be ✓ before status = OPEN)

This is the Project A retro §3 fix. BUG-007 shipped invalid because the agent
filed before reproducing with explicit conditions. Every candidate bug must
clear this checklist before leaving `INVESTIGATING`:

```json
"evidence_checklist": {
  "explicit_sender":         false,   // Reproduced with literal address (not $ENV that might be empty)
  "two_path_repro":          false,   // Same failure via 2 independent paths (cast + forge, OR direct + gateway, OR script + UI)
  "doc_vs_source_check":     false,   // Cross-checked doc claim vs source vs deployed bytecode (selector match, function exists)
  "differential_known_good": false,   // Same call with a KNOWN-GOOD sender confirms the gate behaves correctly for that sender
  "literal_doc_text":        false    // If doc-vs-code: confirmed the doc claim by literal text match (no paraphrasing)
}
```

If you cannot tick all 5 honestly, **status MUST remain `INVESTIGATING`**.
The qa-bugs-lint hook will reject any OPEN/FIXED/VERIFIED entry whose
checklist isn't fully true.

---

## bugs.json schema (v7.1)

```json
{
  "id": "BUG-001",
  "title": "Admin direct read returns NotAuthorized",
  "type": "BUG",                       // BUG | DOC | ABI_MISMATCH | SCRIPT
  "severity": "S2",
  "status": "INVESTIGATING",           // see workflow above
  "verified": false,                   // true once you've probed live
  "plain_summary": "Admin calling getDeedByNumber gets 'not authorized'.",
  "business_impact": "Admin operators cannot read deed data via direct call.",
  "steps_plain": [
    "Connect to RPC as the admin wallet (deployer)",
    "cast call $DEED_MANAGER_PROXY 'getDeedByNumber(string)(bytes)' 'DEED-001' --from $ADMIN_WALLET --rpc-url $RPC",
    "Observe revert: 0x2fc0b41c"
  ],
  "evidence_checklist": {
    "explicit_sender":         false,
    "two_path_repro":          false,
    "doc_vs_source_check":     false,
    "differential_known_good": false,
    "literal_doc_text":        false
  },
  "filed_by": "${current_user_name}",
  "filed_at": "2026-06-13",
  "fixed_by": null,
  "fixed_at": null,
  "verified_by": null,
  "verified_at": null,
  "retracted_reason": null,
  "retracted_at": null,
  "retracted_by": null
}
```

---

## Bugs (rendered from bugs.json)

<!-- AUTO-GENERATED FROM bugs.json — DO NOT EDIT BELOW THIS LINE -->
<!-- Regenerate with: astra bugs render --target qa/BUG_REPORT.md -->

_No bugs logged yet. Add entries to `qa/bugs.json` (status=INVESTIGATING) and run the render command._

<!-- /AUTO-GENERATED -->

---

## QA Sign-Off

- [ ] All S1/S2 bugs: VERIFIED fixed (or RETRACTED with reason)
- [ ] All deferred bugs approved by PM
- [ ] Regression suite passed after last fix
- [ ] Pass rate >= 90%
- [ ] Sign-off by: ${current_user_name} (from AGENTS.md, never free-text)
