# TASK-005 — StorageGateway + per-file encryption + version commit + shred primitive
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (5 units)   **Tier:** large (SE-N)
**Satisfies:** FR-048, FR-049, FR-050 (destroy-key primitive), FR-051 (salts destroyed on shred), FR-052 (outbox row in same commit), FR-054 (salt), NFR-009, NFR-011
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — envelope encryption, key wrapping and key destruction are crypto rules
**Design:** Each file gets a random 256-bit data key, stored only wrapped (AES-256-GCM under MASTER_KEY, unique nonce). Blobs: AES-256-GCM, fresh 96-bit nonce per blob, auth tag verified on read — a failed tag is an error, never partial plaintext. `commitVersion` writes blob → then, in ONE transaction, version row (+ random per-version salt) + participants + outbox row; duplicate (file, key, hash) or hash == head returns `{created:false}` with the existing id. `destroyKey` nulls the wrapped key and salts and sets destroyed_at; reads after it fail with FileDeleted. Temp plaintext files are deleted in `finally`. No other module touches the blob volume.
**Status, dependencies, drop:** see `STATUS.md` → TASK-005

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-048, FR-049, FR-050 (destroy-key primitive), FR-052 (outbox row in same commit), FR-054 (salt), NFR-009, NFR-011
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 (StorageGateway interface, stated trade-off); § D2.4, D2.6; § D5
- `SPEC.md` § Security Requirements (Sensitive data)
- `docs/SRS.md` § 3.4 Data Requirements

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Envelope crypto: data-key create/wrap/unwrap, blob encrypt/decrypt (AES-256-GCM) | ADR D5 | `tests/modules/storage/crypto.test.ts` |
| 2 | `openForEdit(fileId, userCtx)` → {versionId, stream} (decrypt) | ADR D1 | `tests/modules/storage/open.test.ts` |
| 3 | `commitVersion(fileId, baseVersionId, stream, meta)` — hash, salt, dedup, outbox row, one transaction | ADR D2.4, D2.6 | `tests/modules/storage/commit.test.ts` |
| 4 | `destroyKey(fileId)` + best-effort blob delete | ADR D5 | `tests/modules/storage/shred.test.ts` |
| 5 | Gateway contract test suite (runs against the local impl; Bethel impl reuses it) — NFR-011 | SRS NFR-011 | `tests/modules/storage/contract.test.ts` |

## Files — owned exclusively by this task
- `src/modules/storage/` (create)
- `tests/modules/storage/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Envelope crypto: data-key create/wrap/unwrap, blob encrypt/decrypt: test first · green · committed
- [ ] Unit 2 — `openForEdit(fileId, userCtx)` → {versionId, stream}: test first · green · committed
- [ ] Unit 3 — `commitVersion(fileId, baseVersionId, stream, meta)`: test first · green · committed
- [ ] Unit 4 — `destroyKey(fileId)` + best-effort blob delete: test first · green · committed
- [ ] Unit 5 — Gateway contract test suite: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-005` → read `.astra/pack/TASK-005.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-005` → `task.py done TASK-005` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- No plaintext bytes on the version volume after any commit; temp dir empty
- A tampered blob fails to decrypt with an error
- Same (file, key, hash) committed twice → one version
- After destroyKey no version decrypts even with MASTER_KEY
- After destroyKey every version's leaf salt is null (FR-051 / SRS §3.4, plan-check G5)

## Out of scope
- HTTP routes
- Merkle batching (TASK-020)
