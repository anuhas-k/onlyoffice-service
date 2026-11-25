---
paths:
  - "AGENTS.md"
  - "SPEC.md"
---
# session-guide.md — the main session's guide (moved out of CLAUDE.md, FCT-R)
# CLAUDE.md loads into every agent; this loads only when a session reads AGENTS.md or SPEC.md —
# the main session does at start (identity gate, resume); a factory builder reads its build pack
# and never pays for the role menus, Jira, voice triggers or question style below.

## Role-Based Context Loading

When a user identifies their role, load and surface the following:

```
PM / CEO        → show: SPEC.md priorities, decisions needed, phase status
                   → multi-session epics: docs/WAYFINDER.md — open decisions + destination, resolved one at a time (pm.md Step 1.5)
                   → v7.9.114-117 read-only auditable evidence: qa/RTM_COVERAGE.md · qa/ISO25010_COVERAGE.md ·
                     qa/WCAG_COVERAGE.md (frontend only) · qa/ASVS_L1_COVERAGE.md · qa/TEST_DESIGN_TECHNIQUES.md ·
                     qa/API_COVERAGE.md — attach to procurement / security questionnaires.
CTO             → show: tech decisions pending, debt score, architecture reviews
Head of Eng     → show: team blockers, delivery health, hiring gaps
EM              → show: sprint status, task list, velocity, open blockers
TL              → show: task list, phase plan, technical blockers
BA              → show: requirements gaps, RTM status, SRS completeness
                   → owns docs/GLOSSARY.md (ubiquitous language). Run the Step 2.5 domain-modeling pass:
                     challenge every domain term → one word that IS the code name. Seeded from interface-agreement
                     Section D identifiers. SE/QA name everything from it (templates/.claude/rules/ubiquitous-language.md
                     UBL-A..E; skill /glossary). Same "cite it first" wiring as docs/PATTERNS.md.
                   → v7.9.115+ owns docs/SRS.md → FR-N / NFR-N identifiers that qa/TEST_CASES.md `req:` tags must resolve to.
                     Coverage script: `bun qa/scripts/rtm-srs-coverage.ts --update` writes qa/RTM_COVERAGE.md. Untested FR/NFR OR
                     orphan `req:` refs HARD BLOCK /qa-signoff and Edit qa/HANDOFF.md.
                   → v7.9.116+ owns qa/TEST_PLAN.md 29119-2 §7 structure (9 required headings). Fill §1-8; QA fills §9 sign-off.
SE / SD / JD    → show: their assigned tasks, implementation context
                   → cite docs/GLOSSARY.md FIRST (with docs/PATTERNS.md): names come from the glossary — module/
                     table/column/endpoint/test/bug names use the agreed term; a missing concept is ADDED to the
                     glossary, never given a synonym (UBL-C). Coining a synonym for an existing term = naming-drift
                     (SCR-B S3). Rule: templates/.claude/rules/ubiquitous-language.md.
                   → BEFORE building a non-trivial change (SE-N medium/large, or any one-way-door: schema
                     shape, public API name, auth model) run /grill-with-docs — the adversarial interview
                     pointed at this repo that writes docs/GLOSSARY.md + ADRs (docs/decisions/) inline as
                     terms/decisions resolve, then feeds /spec. For a decision that isn't a codebase change,
                     /grill (alias /grill-me). Trivial/small fixes skip it (ceremony-scaling SE-N). Don't
                     start cutting seams on a change whose design tree still has open branches.
                   → at coding time (Phase 4 IMPLEMENT) cite templates/.claude/rules/codebase-design.md (CBD-A..D)
                     when cutting a file/class/function or choosing a seam: deep module = a lot of behaviour behind
                     a small interface; a pass-through / thin wrapper / growing-interface manager is shallow
                     (SCR-B S3). decomposition.md draws boundaries at design; CBD sets interface depth as you write.
                   → ported skills: /review (pre-land diff review), /codex (OpenAI second opinion, 3 modes), /careful (destructive command guard), /freeze (scope edits to one dir), /unfreeze, /guard (careful + freeze combined), /verify (run + observe), /run (launch app), /health (code-quality dashboard)
                   → v7.9.123+ LOAD BEFORE WRITING CODE (Phase 4, not at sign-off):
                     templates/.claude/rules/injection-and-credential-safety.md (INJ-A..K + INJ-Z).
                     SAV-A..N is what QA VERIFIES; INJ is what you WRITE. Every rule names the real
                     ASTRA defect behind it, so it is arguable with evidence rather than on authority:
                     • INJ-A/B/C  no value in a SQL statement; whitelist+quoteIdent for identifiers;
                                  bounded-integer coercion where the driver cannot bind; %I/%L in plpgsql
                     • INJ-D/E    CSP measured against the BUILT artefact (RSC ships inline scripts; a
                                  hash beside 'unsafe-inline' silently kills hydration); one inventory
                                  of raw-HTML sinks, never user data in any of them
                     • INJ-F/G    NIST SP 800-63B — 12 chars, breach-list on NORMALISED forms, no
                                  composition rules; enforced where a HUMAN chooses, never in the hasher
                     • INJ-H/I/J  no request-derived import()/fetch() target; argv arrays + quoted "$1";
                                  one redactor at one exit for every printed byte
                     • INJ-K      prove the control is ENFORCING (rolbypassrls makes RLS inert)
                     • INJ-Z      install the five ratchets, and sabotage each ONE CLAUSE AT A TIME
QA              → show: TEST_CASES.md status, bugs, sign-off checklist
                   → ported skills: /qa-only (report-only, never edits), /browse-snapshot (a11y-tree + @refs + diff), /canary (post-deploy monitor), /benchmark (perf regression), /design-review (visual QA), /setup-browser-cookies, /verify, /run
                   → if API docs exist: launch QA Intake Questionnaire immediately (skip office-hours)
                   → if no API docs: "Waiting for API docs — SE-Backend must write docs/api.md"
                   → if docs/QA_HANDOFF.md missing OR §9 unsigned: refuse to start automation;
                     file a bug against FE (category="fe_handoff_doc"). See docs/FE_TO_QA_HANDOFF.md.
                   → v7.9.114-117 world-standard hard gates (load automatically; every /qa-signoff fires them):
                     • templates/.claude/rules/qa-flow-immutability.md (QFI-A..D) — retest via qa-retest.sh, NEVER rewrite blessed specs
                       whose knowledge file is ≤ 30 d fresh; every spec needs a companion qa/knowledge/<slug>.md; every spec must
                       be declared in qa/flows/dependencies.json; new screens auto-register as ui-audit-* scenario nodes.
                     • templates/.claude/rules/iso25010-quality-characteristics.md (QSC-A..H) — ISO/IEC 25010:2023, 8 characteristics
                       (FUN/PER/COM/INT/REL/SEC/MAI/FLE); every TC carries an `iso25010:` tag; 7-of-8 minimum. Exempt per-char in
                       qa/TEST_PLAN.md `## ISO/IEC 25010 exemptions` with reason + reviewer + date.
                     • templates/.claude/rules/rtm-srs-link.md (RTM-A..D) — every TC carries `req: FR-N | NFR-N` matching docs/SRS.md;
                       every FR/NFR must have ≥ 1 TC OR a `<!-- rtm-untest-ack: ... -->` next to it. Orphan `req:` refs block sign-off.
                     • templates/.claude/rules/iso-29119-test-process.md (TPS-A..F) — qa/TEST_PLAN.md must contain all 9 required
                       §7 headings (Introduction / Test Items and Risks / Test Strategy / Deliverables / Tasks and Resources /
                       Environmental Needs / Communication / Risk Register / Sign-off). ≥ 3 placeholder literals = block.
                     • templates/.claude/rules/security-asvs-l1.md (SAV-A..N + SAV-Z) — OWASP ASVS 4.0.3 L1, 14 V-chapters,
                       populated via `bash scripts/run-security-checklist.sh --asvs`. Every chapter present, every unticked check
                       justified with `SKIP:<reason ≥ 15 chars>`, ≥ 40 ticked baseline. Chapter-level ack in .astra/asvs-l1-ack.txt.
                       Level opt-in in .astra/asvs-level.txt (L1 default / L2 / L3 / OFF: <reason + reviewer + date>).
                     • templates/.claude/rules/injection-and-credential-safety.md (INJ-A..K + INJ-Z) — the
                       WRITE-side counterpart to SAV. QA's job here is INJ-Z: the five ratchets exist, run in
                       CI, and each has been broken on purpose ONE CLAUSE AT A TIME with the catching test
                       recorded. A guard with no sabotage record is unverified, and a guard with no preflight
                       reports clean when it cannot see its subject.
                     Coverage reports auto-generated: qa/RTM_COVERAGE.md · qa/ISO25010_COVERAGE.md · qa/WCAG_COVERAGE.md (frontend
                     only) · qa/ASVS_L1_COVERAGE.md. Regenerate any with the matching `--update` flag on its coverage script.
QA-Mobile-iOS   → show: qa/TEST_CASES.md (iOS specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (per-project iOS registry),
                   TestFlight + App Store sign-off checklist (layer=mobile, env=testnet→mainnet)
                   → if tests/functional/ missing: agent materializes templates/mobile-ios/ on first invoke
                   → universal traps loaded from templates/.claude/rules/mobile-ios-qa.md (14 rules + selector chain)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid (accessibilityLabel maps to
                     SC 1.1.1, VoiceOver walk maps to SC 4.1.2, etc.). HARD BLOCK on /qa-signoff layer=mobile-ios when
                     qa/WCAG_CHECKLIST.md has any (SC × screen) cell missing OR any open FAIL.
                   → handoff doc from FE (docs/QA_HANDOFF.md) must be signed before automation; verify §5
                     selector map against the installed .app via run-all.sh --inspect before promoting to specs
QA-Mac-Desktop  → show: qa/TEST_CASES.md (Mac Desktop specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (per-project AX registry),
                   internal-DMG + notarized-DMG sign-off checklist (layer=desktop, env=testnet→mainnet)
                   → if tests/functional/ missing: agent materializes templates/mac-desktop/ on first invoke
                   → universal traps loaded from templates/.claude/rules/mac-desktop-qa.md (MAC-A..Q + selector chain + MAC-SCEN + MAC-LEARN)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid mapped to AX attributes:
                     AXLabel/AXTitle → SC 1.1.1 + 4.1.2, AX focus ring → 2.4.7, AX contrast walk → 1.4.3. HARD BLOCK on
                     /qa-signoff layer=mac-desktop when qa/WCAG_CHECKLIST.md has any missing cell.
                   → prereqs gate: Hammerspoon CLI installed + Accessibility permission granted before any spec runs
                   → drives via hs.axuielement (AX API), NOT coordinate clicks — see MAC-G
                   → bundle ID, not display name (MAC-L); inspect-first loop mandatory (MAC-C)
QA-Web          → show: qa/TEST_CASES.md (web specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (per-project locator registry),
                   staging + production sign-off checklist (layer=web, env=testnet→mainnet)
                   → if qa/tests/e2e/ missing: agent materializes templates/web/ on first invoke
                   → universal traps loaded from templates/.claude/rules/web-qa.md (WEB-A..Q + locator chain + WEB-SCEN + WEB-LEARN)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid. Contrast-walk populates
                     SC 1.4.3 / 1.4.11 / 2.4.7 automatically; the rest need manual attestation. HARD BLOCK on /qa-signoff layer=web
                     when qa/WCAG_CHECKLIST.md has any missing cell. Composes with the existing 6-pillar UI audit (QA-UX).
                   → if project uses AA wallet / UserOp / paymaster / broadcaster (lib/wallet.ts, lib/broadcaster.ts,
                     or @account-abstraction/userop/permissionless/@biconomy/@zerodev/@alchemy-aa in package.json):
                     ALSO load templates/.claude/rules/web-aa-userop.md (AAW-A..R) — identity layers, deterministic
                     wallet derivation, lazy CREATE2, middleware-vs-bundler split, paymaster header, bundler defenses,
                     verify-broadcast forbidden, endpoint-key sweep, NEXT_PUBLIC literal, Strict Mode guards,
                     derivation drift. Source: docs/plans/ASTRA-IMPROVEMENTS.md (Project A web frontend retro).
                   → prereqs gate: node/bun + Playwright + browsers + BASE_URL reachable before any spec runs
                   → drives via Playwright getByRole/getByLabel (a11y first), NOT CSS/XPath — see WEB-E
                   → headed mode required (WEB-D); resume mode default via storageState (WEB-O)
                   → owns the Phase-5.5 Frontend Integration Gate (qa-patterns.md QA-P)
                   → if OTP-gated auth or officer-approval flows: ALSO load
                     templates/.claude/rules/qa-round24.md (QER-A..R).
                     Source: docs/plans/ASTRA-QA-IMPROVEMENT-ROUND24.md.
                     Hooks: otp-supersession-warn, random-wallet-guard, portability-lint,
                     runtime-consistency-lint, approval-precondition-check, doc-drift-log.
                   → ALSO load templates/.claude/rules/qa-framework-fixes.md (QEF-A..S):
                     no page.pause() in committed specs, placeholders refused, hardcoded
                     credentials banned, env-example synced, retries: 0 + headless: false
                     pinned in playwright config, test.skip() must name its dependency,
                     spec lastVerified header, BUG_REPORT.md auto-rendered. Source:
                     docs/plans/FRAMEWORK_IMPROVEMENTS.md. Hooks: no-page-pause,
                     placeholder-detect, inline-credentials-detect, env-example-sync,
                     playwright-retry-guard, test-skip-reason-required,
                     spec-lastverified-header, bug-report-render-gate.
QA-Windows-Desktop → show: qa/TEST_CASES.md (Windows specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (per-project UIA registry),
                   internal + signed-MSIX sign-off checklist (layer=desktop platform=windows, env=testnet→mainnet)
                   → if tests/functional/ missing: agent materializes templates/windows-desktop/ on first invoke
                   → universal traps loaded from templates/.claude/rules/windows-desktop-qa.md (WIN-A..Z2 + selector chain + WIN-SCEN + WIN-LEARN)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid mapped to UIA:
                     AutomationName → SC 1.1.1 + 4.1.2, UIA focus rectangle → 2.4.7, Narrator walk → 4.1.2. HARD BLOCK on
                     /qa-signoff layer=windows-desktop when qa/WCAG_CHECKLIST.md has any missing cell.
                   → drives via pywinauto UIA backend, NOT WinAppDriver (deprecated 2020) — see WIN-B
                   → DPI awareness mandatory before connect (WIN-I); UIA invoke(), NOT click_input (WIN-G)
                   → from a Mac host: use Parallels Desktop / VMware Fusion / UTM — see WIN-C
QA-Linux-Desktop → show: qa/TEST_CASES.md (Linux specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (per-project AT-SPI registry),
                   AppImage + distro-signed sign-off checklist (layer=desktop platform=linux, env=testnet→mainnet)
                   → if tests/functional/ missing: agent materializes templates/linux-desktop/ on first invoke
                   → universal traps loaded from templates/.claude/rules/linux-desktop-qa.md (LIN-A..O + selector chain + LIN-SCEN + LIN-LEARN)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid mapped to AT-SPI:
                     accessible-name → SC 1.1.1 + 4.1.2, focus indicator → 2.4.7, Orca screen-reader walk → 4.1.2. HARD BLOCK on
                     /qa-signoff layer=linux-desktop when qa/WCAG_CHECKLIST.md has any missing cell.
                   → drives via dogtail + AT-SPI2 (NOT coordinate scripts) — see LIN-B
                   → prereqs gate: AT-SPI registry running, accessibility on, session type declared (LIN-C/D)
                   → Wayland needs gnome-ponytail-daemon; X11 uses xdotool fallback
QA-Electron     → show: qa/TEST_CASES.md (Electron specs), qa/bugs.json (ASTRA SSOT — no XLSX),
                   .claude/verified-selectors.json (renderer locators + main-process IPC),
                   unsigned + signed-binary sign-off checklist (layer=desktop platform=electron, env=testnet→mainnet)
                   → if qa/tests/electron/ missing: agent materializes templates/electron/ on first invoke
                   → universal traps loaded from templates/.claude/rules/electron-qa.md (ELE-A..N + ELE-SCEN + ELE-LEARN)
                   → ALSO load templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — 55 SCs × screens grid (renderer = Chromium → same
                     WEB-R contrast walk applies to the renderer view; main-process dialogs need a separate manual pass). HARD BLOCK
                     on /qa-signoff layer=electron when qa/WCAG_CHECKLIST.md has any missing cell.
                   → drives via Playwright _electron.launch (NOT Spectron — deprecated 2022) — see ELE-B
                   → renderer = web (reuses WEB-E locators); main process via app.evaluate() — ELE-G
                   → stub autoUpdater in setup (ELE-H); resume mode via --user-data-dir (ELE-N)
Heal-Selectors  → show: .astra/selector-heal-queue.jsonl (miss events from drivers),
                   .astra/selector-heal-proposals.jsonl (LLM proposals + status),
                   qa/SELECTOR_HEAL_REPORT.md (rendered review summary)
                   → universal traps loaded from templates/.claude/rules/selector-healing.md (HEAL-A..H)
                   → MODE env: ASTRA_SELECTOR_HEAL=off | propose-only (DEFAULT) | auto
                   → confidence threshold ASTRA_SELECTOR_HEAL_THRESHOLD=0.85 gates auto-apply
                   → NEVER edits spec files — only patches .claude/verified-selectors.json (HEAL-C)
                   → every applied heal preserves original_selector for rollback (HEAL-E)
                   → confidence < 0.5 files to qa/bugs.json instead of patching (HEAL-F)
SE-Frontend     → show: docs/FE_TO_QA_HANDOFF.md (the contract), docs/QA_HANDOFF.md (what you produce),
                   .claude/rules/frontend-patterns.md (FE-A..P)
                   → v7.9.123+ ALSO templates/.claude/rules/injection-and-credential-safety.md — INJ-D
                     (CSP: verify against the served HTML, never the framework's docs; 'unsafe-eval' is
                     removable, 'unsafe-inline' usually is not without nonces + dynamic rendering) and
                     INJ-E (raw-HTML sinks live in ONE inventory module; inline bootstraps are string
                     literals or they get dead-code-eliminated; scheme-check every user-supplied URL)
                   → if AA wallet / UserOp / paymaster stack (lib/wallet.ts, broadcaster.ts, @account-abstraction
                     etc. in package.json): ALSO load templates/.claude/rules/web-aa-userop.md (AAW-A..R).
                     Source: docs/plans/ASTRA-IMPROVEMENTS.md. web-aa-userop-lint.sh hook enforces at Edit time.
                   → on phase 4 completion, BEFORE QA hand-off: walk Appendix B verification checklist
                   → on any selector / endpoint / flow rename: bump docs/QA_HANDOFF.md commit SHA + re-sign §9
                   → NEVER edit docs/api.md (FE-O / AAW-N) — it's backend-owned
                   → v7.9.116+ ALSO surface templates/.claude/rules/wcag-22-aa.md (WCG-A..J) — the frontend is the primary owner
                     of every SC. `getByRole` + `aria-*` attributes populate SC 4.1.2 / 1.3.1; visible focus indicator serves 2.4.7;
                     color-contrast tokens serve 1.4.3 + 1.4.11. QA fills the qa/WCAG_CHECKLIST.md grid but the code that satisfies
                     it lives in your components. Frontend PRs touching UI SHOULD update the checklist inline.
DevOps          → show: deployment status, CI health, infra
                   → ported skills: /land-and-deploy, /setup-deploy, /document-release, /canary, /benchmark, /health, /verify, /run
                   → human-only:    /wizard (generate a resumable, per-step-verified wizard for steps only a human can do — set a secret, rotate a key, click a console)
Designer        → show: design specs, component status, a11y issues
                   → ported skills: /design-review (live execution-mode visual audit), /design-shotgun (multi-variant exploration), /design-consultation (system from scratch), /design-html (Pretext HTML/CSS generation), /plan-design-review (plan-mode counterpart)
                   → v7.9.116+ WCAG 2.2 A + AA (templates/.claude/rules/wcag-22-aa.md, WCG-A..J) is the design-side contract:
                     color-contrast tokens (SC 1.4.3 / 1.4.11), focus indicators (SC 2.4.7), target size ≥ 24 CSS px (SC 2.5.8),
                     motion/animation controls (SC 2.2.2 / 2.3.1), labels + name-role-value (SC 4.1.2). Sign-off the
                     "## Project-level exemptions" section in qa/WCAG_CHECKLIST.md for any SC that doesn't apply.

ALL ROLES (universal — no routing needed, available everywhere):
                   → safety:    /careful, /freeze, /unfreeze, /guard
                   → memory:    /context-save, /context-restore, /learn, /plan-tune
                   → output:    /make-pdf (markdown → publication PDF)
                   → browser:   /open-astra-browser, /connect-chrome, /pair-agent (remote AI agent)
                   → devex:     /devex-review (DX audit — docs + TTHW + CLI + error messages)
                   → thinking:  /grill (adversarial interview on any decision — grilling.md GRL-A..E; alias /grill-me), /grill-with-docs (the stateful grill: interview a CODEBASE change + write GLOSSARY.md + ADRs inline — run at the head of a change, before /spec), /glossary (ubiquitous language)
                   → survey:    /architecture-survey (read-only deepening survey — shallow modules + leaky seams ranked, CBD vocabulary; pairs with /retro)
```

---

## Org Hierarchy

CEO → CTO → Head of Engineering → EM → TL → [SE, BA, SD, JD] + QA + DevOps + Designer

---

## Auto-detection rules — Claude Code follows these without being asked

### If an API doc or frontend handover doc is dropped in:
→ qa-setup agent activates — NO office-hours, NO "what problem does this solve"
→ **ALWAYS asks QA Intake Questionnaire BEFORE creating any files** (Phase 0B)
→ Agent scans ALL docs (API, frontend handover, design specs, codebase, contracts)
→ Agent shows QA Intake Questionnaire with smart defaults (max 9 questions, ONE message)
→ Agent shows creation plan (files, test count, pause points for OTP/email links)
→ Agent waits for explicit "yes" BEFORE creating any files — NEVER creates files without approval
→ Verification steps (OTP, email link, magic link, 2FA) are NEVER skipped — agent pauses for user
→ Test accounts created via real register flow (API or browser UI), never mocked
→ External services tested live by default, never silently mocked

### If qa/ folder + test scripts already exist:
→ RESUME mode — skip questionnaire
→ Show: "[N] tests, [N] bugs open, [phase status]"
→ Ask only: "Continue testing?" or "Run retest on open bugs?"

### If AGENTS.md + SPEC.md + STATUS.md exist in this folder:
→ Read all three immediately
→ ALSO read these session-bridge maps when present (they hold the plan the context
  window lost — the same restore applies to EVERY role, not just dev/QA):
   • `docs/HANDOFF.md` — the last session's compaction (§3.9): "Where we are / What
     changed / Open threads / Watch out / To resume". Lead with its **To resume** line.
   • `docs/WAYFINDER.md` — the epic's open-decision map (§3.8): surface the destination
     + the next OPEN decision (DEC-NNN) to resolve. (PM owns it; any role reads it.)
   • `qa/HANDOFF.md` — if a dev→QA handoff is open, the QA risk narrative.
→ Tell me: current phase, last task completed, next action, open blockers,
  + the HANDOFF "To resume" step and any open wayfinder decision.
→ Wait for instruction

### If this is a new session with no context files AND no API doc:
→ Ask: "New project or existing project?"
→ New project: run /office-hours
→ Existing project with codebase: read src/ and summarize what you found

### When NOT to ask questions:
→ API doc present → don't ask "what problem does this solve" (that's office-hours)
→ .env.test has BASE_URL → don't ask for URL
→ STATUS.md exists → don't ask "what phase are we in"
→ qa/ folder has tests → don't ask "should I set up QA"
→ Test scripts exist → don't recreate them, resume from current state

---

## SPEC.md Required Sections (v2.0)
Every SPEC.md must include these sections before Phase 2:
1. Problem statement
2. Solution approach
3. Scope (in + out)
4. Acceptance criteria
5. Risks
6. **Fault Isolation Matrix** — "If X fails, what else still works?" (required for multi-service projects)

---

## Pipeline (new projects)
/office-hours → /ceo → /em → /cto → /hoe → /ba → /tl → /sd → /qa → /devops
- Shaping an open question before it enters the pipeline: /grill (any topic; alias /grill-me).
- A codebase change / brownfield start ("help me document my repo"): /grill-with-docs at the
  head — it grills + writes docs/GLOSSARY.md + ADRs inline, then feeds /ba (SRS) and /spec.
  (PM auto-mode assumes-and-documents rather than interviewing — grilling.md GRL-D; these are
  the user-invoked interview surfaces for when a decision needs more than an assumption.)

---

## QA flow (existing projects with API doc)
Drop API doc → qa-setup asks questionnaire → approve plan → creates files → run offline

---

## QA Critical Rules (v7.9 — distilled from 9 live QA retros across 2 verticals)
- **Live-first**: treat API doc as under test, not as truth. Probe live endpoints before writing assertions.
- **Rate-limit-aware**: auto-pace requests, 429 auto-retry, never lose results to rate limits.
- **Contract-wide assertions**: check envelope/error shape on ALL endpoints in one pass (catch systemic bugs).
- **Ephemeral accounts**: fresh test account per run. Never mutate shared fixtures.
- **IDOR security pack**: systematic User A vs User B authorization checks on every resource endpoint.
- **Selector verification**: probe live DOM before trusting doc selectors. Stale selectors = wasted tests.
- **No placeholders**: .env.test must have REAL URLs before any test runs. Auto-discover if needed.
- **Regression runner**: `node qa/scripts/regression.js` retests all open bugs before sign-off.
- **Write-gate**: declare state-modifying test actions upfront, get approval before running.
- **Headed mode always**: web tests run in visible browser (headless blocked by hook).
- **Output safety**: never `>/dev/null` test output. Always capture + display.
- **AI/LLM test corpus**: built-in injection taxonomy for chatbot/AI endpoints (security + fuzz).

---

## Phase Gate Ownership

| Phase | Gate owners | Gate condition |
|-------|------------|----------------|
| Phase 0 — Brainstorm | PM | Concept card approved. Direction chosen. Skip only if user says. |
| Phase 1 — Plan | PM + CTO + Head of Eng | Spec complete. Tech approved. Feasibility OK. |
| Phase 2 — Git Setup | DevOps | Repo, CI, and branch strategy in place. |
| Phase 3 — Task Plan | TL + Head of Eng + BA | Task plan approved. RTM complete. Every task traces to a requirement. |
| Phase 4 — Execution | SE / SD / JD | Code to spec. No scope additions. |
| Phase 5 — TDD | QA + SE + BA | Tests written first. BA validates acceptance criteria. |
| Phase 6 — Code Review | QA + CTO + BA | QA sign-off. CTO arch/perf. BA confirms requirements compliance. |
| Phase 7a — QA Sign-off → PM | QA + PM | QA HANDOFF.md complete. 0 OPEN S1/S2. bugs.json clean. PM accepts. |
| Phase 7b — External Audit (contract only) | CTO + auditor | Contract projects on mainnet path: external audit booked + report attached. Skip for app/backend. |
| Phase 7c — Production Deploy | DevOps | DevOps ships. CTO writes post-mortem if production issue. |

---

## v6 Rules — enforced by hooks (never happen again)
- Phase gates are HARD BLOCKS — missing SPEC.md, RTM.md, or HANDOFF.md blocks the next phase (phase-gate.sh v2.0)
- Smoke test proof REQUIRED before QA starts — pre-qa-smoke.sh blocks test runners without it
- Cross-agent verification REQUIRED — when parallel agents build different parts, verify they agree on field names, types, and contracts (cross-agent-verify.sh)
- Source of truth: actual files (ABI, SQL, contracts) > docs > SPEC.md — agents MUST read actual source files
- Bug pattern search MANDATORY — when fixing any bug, grep for the same pattern across the entire codebase
- Integration tests MANDATORY — unit tests + mocks are insufficient for API/DB/proxy code (Phase 5B)
- Model routing ENFORCED — conductor sets model param on every sub-agent dispatch (haiku for mechanical, sonnet for code, opus for architecture)

---

## Jira Integration

```
JIRA_HOST=<yourteam>.atlassian.net     ← set during /init or QA questionnaire Q9
JIRA_EMAIL=<your-email>@example.com    ← the Jira account email
JIRA_TOKEN=<set in .env — never commit>
JIRA_PROJECT=<PROJECT-KEY>             ← e.g., SCRUM, ABC, PROJ
```
**NEVER hardcode a default Jira instance.** Always ask during setup.

Bugs auto-sync to Jira: `node scripts/rag/jira-sync.js`
- S1 → Highest priority, due +1 day, 5 story points
- S2 → High, due +3 days, 3 points
- S3 → Medium, due +7 days, 2 points
- S4 → Low, due +14 days, 1 point
- Start date = bug reported date
- Assignee = always asked, never auto-assigned
- Triage gate: ALWAYS show bug summary + ask "File to Jira?" before any external write
- Reporter in bugs.json = description text; Jira system reporter = API token owner (different people)
- bugs.json is the source of truth; BUG_REPORT.md is rendered from it

---

## Stack

Defined in `.claude/steering/tech.md` — agents read it automatically.
PM fills it in on first run (inferred from your request, never asks questions).
Edit `.claude/steering/tech.md` directly to change the stack at any time.

---

## Voice triggers

# Ported from external framework, 2026-06-24 — anonymized.

Skills accept speech-to-text aliases for users dictating commands. The
canonical form is `/skill-name`; common voice manglings route to the
same skill.

Common aliases (extend per-skill in each `SKILL.md` description):

| Canonical | Voice aliases |
|-----------|--------------|
| `/cso` | "see-so", "see so", "security review", "vulnerability scan", "run security" |
| `/codex` | "code x", "code ex", "get another opinion" |
| `/qa` | "qa browser", "run tests", "test the API", "qa sign off" |
| `/ceo` | "see-ee-oh", "founder review", "vision check" |
| `/em` | "ee-em", "engineering manager", "build the architecture" |
| `/sc` | "smart contract", "solidity work", "foundry work" |
| `/ship` | "deploy this", "push to prod", "release it" |
| `/benchmark` | "speed test", "check performance" |
| `/autoplan` | "auto plan", "automatic review" |

Each skill declares its own voice triggers in the multi-line
`description:` frontmatter, on a final line:

```yaml
description: |
  ...what the skill does, when to use it...
  Voice triggers (speech-to-text aliases): "alias one", "alias two".
```

The router matches the user's plain-English request against the
skill's `when_to_use`, `triggers:`, and voice aliases — whichever
fires first wins.

---

## Completeness rating in AskUserQuestion

# Ported from external framework, 2026-06-24 — anonymized.

Every `AskUserQuestion` follows a 4-part structure: Re-ground, Simplify,
Recommend, Outcome framing.

### Re-ground (1-2 sentences)

State the project, the current branch (from the preamble's `_BRANCH`
echo — NOT from gitStatus or conversation history), and the current
plan/task.

> "In `astra/` on `main`. Phase 4 — building the QA seed runner."

### Simplify (plain English)

Explain so a smart 16-year-old could follow. No raw function names, no
internal jargon. Concrete examples, analogies. Gloss any term on the
Jargon glossary (below) on first use per skill invocation.

If you'd need to read the source to understand your own explanation,
it's too complex — rewrite.

### Recommend (with Completeness score)

Always include:

```
RECOMMENDATION: Choose [X] because [one-line reason].
```

Always show `Completeness: X/10` per option:

| Score | Meaning |
|-------|---------|
| 10/10 | All edge cases, full coverage — the complete implementation |
| 7/10  | Happy path covered, some edges skipped |
| 3/10  | Shortcut that defers significant work |

Calibration rule: if both options are 8+, pick the higher. If one is
≤5, flag it. Always prefer the complete option over shortcuts — with
agent compression, the delta is usually minutes.

### Outcome framing (not implementation)

Frame in user-outcome terms, not implementation terms. Three families:

- **Pain reduction** (default — diagnostic / rigor):
  > "If someone double-clicks the button, is it OK for the action to run twice?"
  > (NOT "Is this endpoint idempotent?")

- **Upside / delight** (expansion / vision):
  > "When the workflow finishes, does the user see the result instantly, or are they still refreshing a dashboard?"

- **Interrogative pressure** (founder challenge):
  > "Can you name the actual person whose career gets better if this ships?"

### Effort labelling

When an option involves effort, show both scales:

```
A) Full migration — Completeness: 10/10 (human: 2 days / agent: 30 min)
B) Targeted patch — Completeness: 6/10  (human: 4 hours / agent: 10 min)
```

### Assumption

Assume the user hasn't looked at this window in 20 minutes and doesn't have the code open.

---

## Jargon glossary

# Ported from external framework, 2026-06-24 — anonymized.

Terms below get a one-sentence gloss on first use **per skill
invocation** — even if the user's own prompt contained the term (they
often paste from someone else's plan). Terms NOT on this list are
assumed plain-English enough.

```
idempotent, idempotency, race condition, deadlock, cyclomatic complexity,
N+1, N+1 query, backpressure, memoization, eventual consistency, CAP theorem,
CORS, CSRF, XSS, SQL injection, prompt injection, DDoS, rate limit, throttle,
circuit breaker, load balancer, reverse proxy, SSR, CSR, hydration,
tree-shaking, bundle splitting, code splitting, hot reload, tombstone,
soft delete, cascade delete, foreign key, composite index, covering index,
OLTP, OLAP, sharding, replication lag, quorum, two-phase commit, saga,
outbox pattern, inbox pattern, optimistic locking, pessimistic locking,
thundering herd, cache stampede, bloom filter, consistent hashing,
virtual DOM, reconciliation, closure, hoisting, tail call, GIL, zero-copy,
mmap, cold start, warm start, green-blue deploy, canary deploy, feature flag,
kill switch, dead letter queue, fan-out, fan-in, debounce, throttle (UI),
hydration mismatch, memory leak, GC pause, heap fragmentation, stack overflow,
null pointer, dangling pointer, buffer overflow
```

Example gloss: *"race condition (two things happen at the same time and step on each other)"*.

If you see a term that genuinely needs glossing but isn't listed, note
it once in your response so it can be added.

**Terse-mode escape:** if the preamble echoes `EXPLAIN_LEVEL: terse`
OR the user's current message asks for terse output ("just the
answer", "no explanations", "brutally honest"), skip the gloss rule
entirely for that response.

---

## STATUS protocol

# Ported from external framework, 2026-06-24 — anonymized.

Every skill workflow ends with exactly one of these statuses.

### DONE

All steps completed successfully. Evidence provided for each claim.

```
STATUS: DONE
- Built and signed astra-install for darwin-arm64.
- Notarization accepted, ticket stapled.
- spctl --assess passed on a fresh VM.
```

### DONE_WITH_CONCERNS

Completed, but with issues the user should know about. List each concern.

```
STATUS: DONE_WITH_CONCERNS
- All 68 specs pass, but 3 use page.pause() (QEF-A violation).
- secret-scan flagged 1 false positive in tests/fixtures — left as-is.
```

### BLOCKED

Cannot proceed. State what's blocking and what was tried.

```
STATUS: BLOCKED
REASON: Apple notarization rejected — "executable does not have hardened runtime".
ATTEMPTED:
  1. Re-ran codesign with --options runtime — same error.
  2. Verified entitlements file path — correct.
RECOMMENDATION: Inspect the embedded chromium-daemon binary — outer
signature may not be covering it.
```

### NEEDS_CONTEXT

Missing information required to continue. State exactly what you need.

```
STATUS: NEEDS_CONTEXT
REASON: SPEC.md acceptance criteria reference "the standard signup
flow" but the project has no auth-flow.md.
RECOMMENDATION: Decide email-OTP, phone-OTP, OAuth, or magic link, or
all four. I'll generate the matrix once you pick.
```

### Escalation rules

It is always OK to stop and say "this is too hard for me" or "I'm not
confident in this result."

Bad work is worse than no work. You will NOT be penalized for escalating.

- If you've attempted a task 3 times without success — STOP and escalate.
- If you're uncertain about a security-sensitive change — STOP and escalate.
- If the scope of work exceeds what you can verify — STOP and escalate.
