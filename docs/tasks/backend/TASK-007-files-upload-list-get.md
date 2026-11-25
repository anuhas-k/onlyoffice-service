# TASK-007 — Files API: upload, list (with lock state), details
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-008, FR-009, FR-010, FR-011, FR-012
**Skills:** clean-code, bug-prevention, backend-engineer
**Sabotage:** none — validation and data rules proved by their refusing tests; auth/tenant rules are owned by TASK-004
**Status, dependencies, drop:** see `STATUS.md` → TASK-007

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-008, FR-009, FR-010, FR-011, FR-012
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts (`POST /files`, `GET /files`, `GET /files/:id`)
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 endpoints 1–3
- `docs/SRS.md` § 6.3 TBD-001 (100 MB upload limit)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `POST /files` multipart — extension + magic-byte check, 100 MB limit, initial version via gateway | SPEC API Contracts | `tests/modules/files/upload.test.ts` |
| 2 | `GET /files` — tenant files with lock holder or null | SPEC API Contracts | `tests/modules/files/list.test.ts` |
| 3 | `GET /files/:id` — file, lock, participants; 404 FileNotFound | SPEC API Contracts | `tests/modules/files/get.test.ts` |

## Files — owned exclusively by this task
- `src/modules/files/files.routes.ts` (create)
- `src/modules/files/files.service.ts` (create)
- `src/modules/files/formats.ts` (create — extension/magic bytes/size limits/view-only formats)
- `tests/modules/files/` (create)
- `tests/fixtures/` (create — sample .docx/.xlsx/.pdf/.pptx/.png)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `POST /files` multipart: test first · green · committed
- [ ] Unit 2 — `GET /files`: test first · green · committed
- [ ] Unit 3 — `GET /files/:id`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-007` → read `.astra/pack/TASK-007.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-007` → `task.py done TASK-007` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- `tool.exe` and a ZIP renamed `.pdf` → 400 UnsupportedFormat
- 100 MB + 1 byte → 413 FileTooLarge
- Upload → list shows one file with lock null, history has one `initial` version

## Out of scope
- Delete (TASK-019)
- Content download (TASK-009)
