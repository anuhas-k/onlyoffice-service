---
paths:
  - "docs/**"
  - "README.md"
  - ".gitignore"
---
# project-structure — the ONE standard layout (v7.9.134)

Every ASTRA project has this shape. `/init` scaffolds it; every agent, skill and
hook reads from these exact paths. **Each concern lives in exactly one place** —
a second copy is drift waiting to happen, so the framework never creates one.

## Layout
```
/
├── CLAUDE.md  AGENTS.md  SPEC.md  STATUS.md        pipeline docs (always)
├── SOUL.md  DECISIONS.md  LESSONS.md               project memory (always)
├── README.md LICENSE CONTRIBUTING.md               repo hygiene — SE family (RH-A)
│   CODE_OF_CONDUCT.md SECURITY.md
├── .claude/{agents,commands,rules,skills,steering} framework config for this project
├── .astra/                                         framework state — never hand-edit
├── docs/
│   ├── source/            original inputs AS RECEIVED (BRD/SRS .docx/.pdf, design PDFs) — read-only
│   ├── SRS.md             requirements — FR-N / NFR-N (BA)
│   ├── BRD.md             business requirements (BA, when produced)
│   ├── RTM.md             requirement → TASK matrix (BA)
│   ├── api-vX.Y.md        API contract, versioned name (BE-V) — LOCKED when provided (FCT-H)
│   ├── api.md             stable pointer (symlink) to the current api-vX.Y.md
│   ├── INTERFACE_AGREEMENT.md   signed producer/consumer/QA contract (all types)
│   ├── PATTERNS.md  GLOSSARY.md  FLOW.md            generated / BA-owned references
│   ├── decisions/NNN-<topic>.md                     ADRs (design decisions)
│   ├── tasks/             ONE FILE PER TASK — the factory's execution briefs (FCT-G)
│   │   ├── README.md
│   │   └── <category>/TASK-NNN-<slug>.md            categories: foundation · data · backend ·
│   │                                                frontend · mobile · contract · infra ·
│   │                                                integration · review
│   ├── UI_SPEC.md         ┐ frontend | fullstack ONLY
│   └── FE_TO_QA_HANDOFF.md┘ (never in backend / api / contract projects)
├── src/                   application code — Phase 4, only against a ticket (TGR-A gate)
├── tests/                 tests (mirror src/)
├── scripts/               build / migration / utility scripts
├── qa/                    QA role only
└── track-bug/             SE family only
```

## Single source of truth (no duplicates — ever)

| Concern | Lives ONLY in | Never in |
|---|---|---|
| Task status + DAG edges | `STATUS.md ## Task List` (index) | task files, RTM, a second task list |
| Task detail (sources, units, files, flow, acceptance) | `docs/tasks/<category>/TASK-NNN-*.md` | STATUS.md |
| Requirements | `docs/SRS.md` (+ SPEC.md acceptance summary) | `spec/`, `docs/spec/`, task files (they cite FR ids) |
| API fields / endpoints | `docs/api-vX.Y.md` (or `docs/openapi-*.{json,yaml}`) | task files (they point to sections), code comments |
| Design decisions | `docs/decisions/` ADRs + `INTERFACE_AGREEMENT.md` | ad-hoc design docs |
| Raw client inputs | `docs/source/` | project root |

**Retired (do not recreate):** `spec/requirements.md`, `spec/design.md`, `spec/tasks.md`,
`docs/spec/*` — they duplicated SRS / IA / the STATUS DAG. `/spec` now writes into
the chain above.

## Inputs dropped in the root
Drop an SRS, BRD, API doc, OpenAPI file or `.docx/.pdf` in the project root and run
`/init` — the **intake step moves it to its canonical place first**: `*SRS*.md`→`docs/SRS.md`,
`*RTM*.md`→`docs/RTM.md`, `*BRD*/*PRD*.md`→`docs/BRD.md`, API `.md`/OpenAPI/Swagger→`docs/`
(name kept — the version stays in the name), binaries→`docs/source/`. It never
overwrites and never invents a version; anything it can't classify is listed, not moved.

## File naming
- Source: `camelCase.ts` or `kebab-case.ts` (pick one, stay consistent)
- Tests: `*.test.ts` / `*.spec.ts` (co-located or in `tests/`)
- Migrations: `YYYYMMDDHHMMSS_description.sql`
- Task files: `TASK-NNN-<kebab-slug>.md`, TASK ids global and never reused

## Module boundaries
- Each module owns its own types, services and tests
- Cross-module imports go through the module's public index file
- Shared registration points (route index, app wiring, DI container, nav config)
  are owned by ONE `integration` task — batches never edit them (FCT-G)

## What Claude must not create without asking
- New top-level directories, new config files (tsconfig, eslint, …)
- Database migrations outside a `data` task
- Files in `src/` outside the current task's `## Files`
- Any doc outside this layout (SD-4)
