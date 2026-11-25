# TASK-002 — Docker Compose stack + Document Server config + verification spike
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** infra
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-001, NFR-014, TBD-006 (ASM-001…004)
**Skills:** clean-code, docker-engineer, devops-engineer
**Sabotage:** none — container wiring and a written verification record; no security rule in code
**Status, dependencies, drop:** see `STATUS.md` → TASK-002

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-001, NFR-014, TBD-006 (ASM-001…004)
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D8 Packaging; § D2 Facts (retries, URL expiry, forgotten files); § Consequences
- `SPEC.md` § Risk Register (R1 private-IP download); § Performance Constraints (20-connection limit)
- `docs/SRS.md` § 2.6 Assumptions ASM-001…004; § 6.3 TBD-006

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `docker-compose.yml` — editing-service, documentserver (pinned tag, JWT_ENABLED=true), postgres:16, three volumes, healthchecks | ADR D8 | `scripts/stack-smoke.sh` |
| 2 | `docker/documentserver/local.json` — callback retries 6, private-IP download allowed | ADR D2.2, Risk R1 | `scripts/stack-smoke.sh` |
| 3 | `Dockerfile` for editing-service (Node 20, non-root) | ADR D8 | `scripts/stack-smoke.sh` |
| 4 | Spike: verify ASM-001…004 on the pinned DS version; record results + pinned version | SRS TBD-006 | `docs/decisions/002-documentserver-verification.md` |

## Files — owned exclusively by this task
- `docker-compose.yml` (create)
- `Dockerfile` (create)
- `.dockerignore` (create)
- `docker/documentserver/local.json` (create)
- `scripts/stack-smoke.sh` (create)
- `scripts/dev-up.sh` (edit — health path `/healthz`, ports 3000/5432/8080)
- `docs/decisions/002-documentserver-verification.md` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `docker-compose.yml`: test first · green · committed
- [ ] Unit 2 — `docker/documentserver/local.json`: test first · green · committed
- [ ] Unit 3 — `Dockerfile` for editing-service: test first · green · committed
- [ ] Unit 4 — Spike: verify ASM-001…004 on the pinned DS version; record results + pinned version: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-002` → read `.astra/pack/TASK-002.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-002` → `task.py done TASK-002` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- `docker compose up` brings all three containers to running/healthy within 3 min on a cold start
- DS image is pinned to an exact version (no `latest`)
- ADR-002 states, with evidence, the result for each of ASM-001…004; any FAIL is raised to the SE before TASK-009 starts

## Out of scope
- `/healthz` route (TASK-006)
- CI pipeline
