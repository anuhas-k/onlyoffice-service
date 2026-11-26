# Decision Log
# Every significant technical or product decision goes here.
# Run /pm decision to add a new entry interactively.
# Run /pm decisions to review open questions or revisit past calls.

---

## Why This Exists

Decisions made in Slack, meetings, or verbal conversations disappear.
When a developer asks "why did we choose X?" three weeks later, nobody remembers.
When QA finds unexpected behavior, the test was right — the spec was ambiguous.
This log makes every decision queryable, linkable, and survives context resets.

---

## Entry Format

```
## DEC-NNN — YYYY-MM-DD — [Short title]

**Decision:** One sentence: what was decided.
**Made by:** SE / PM / TL / (whoever)
**Phase:** Phase N
**Linked tasks:** TASK-xxx, TASK-yyy

**Alternatives considered:**
- Option A — reason rejected
- Option B — reason rejected

**Rationale:** Why this choice over alternatives.

**Constraints that drove it:**
- (performance SLA, legal, existing dependency, deadline)

**Revisit if:** Condition under which this decision should be reconsidered.
```

---

<!-- DECISIONS BELOW THIS LINE — newest at top -->

## DEC-001 — 2026-11-26 — Make WOPI the primary editing path (DRAFT, not accepted)

**Decision:** Build the editing service on WOPI (host endpoints plus host-side close detection and forcesave) instead of the ONLYOFFICE callback protocol, keeping the storage, crypto, versioning and anchoring work unchanged.
**Made by:** (pending TL / SE sign-off)
**Phase:** Phase 3 → 4 (plan change before TASK-001 completes)
**Linked tasks:** keep 001, 002, 004–007, 013, 019, 020; change 003, 010, 012, 014, 017; replace 011; hold 018. Full table: `docs/decisions/003-wopi-primary-editing-path.md`.

**Alternatives considered:**
- Keep the callback protocol as planned — works with ONLYOFFICE only; no route to Microsoft Word / Office on the web.
- Support both from the start — doubles the lock, key and test surface for a prototype; the callback path can stay as a fallback only if cheap.

**Rationale:** WOPI is the protocol Microsoft Word speaks, which the callback protocol cannot offer. The demo reached feature parity (open, edit, save as versions, locks, history, 57 formats). It also removes the document-key service and the download-URL SSRF check.

**Constraints that drove it:**
- Measured on Document Server 8.2.2: no PutFile on Save, no editor-left signal, UNLOCK ~2 min after `drop`. The host must build close detection and use forcesave.
- Only `.docx` saving proven; Word compatibility untested; proof-key byte order unconfirmed.
- Zero-knowledge cannot cover the editing period: the host and Document Server see plaintext (ADR-001 D1).

**Revisit if:** a real Word / Office on the web session fails against the host, the close-to-milestone time cannot reach an acceptable number, or Document Server does not retry failed PutFile.
