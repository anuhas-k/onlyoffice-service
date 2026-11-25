# CLAUDE.md
# Copy this to your project root. Claude Code reads it every session — and every subagent reads it
# too, so it holds only what every session needs (FCT-R). The main session's guide (roles, auto-
# detection, pipeline, phase gates, Jira, question style, STATUS protocol) is
# .claude/rules/session-guide.md: it loads when the session reads AGENTS.md or SPEC.md, so a task
# agent that never opens them never pays for it.

---

## Framework
ASTRA v7.9.34 is installed at ~/.claude/skills/astra/
Agents are in ~/.claude/agents/ — they run automatically.
Skills are discoverable globally at ~/.claude/skills/{name}/SKILL.md
Each agent loads its relevant skills before performing work — no manual prompting needed.

---

## Session Start — Identity Check (HARD GATE — non-negotiable)

Identity verification is a **hard gate** enforced by identity-gate.sh.
Auto-Mode does NOT override it. The agent's bias toward action does NOT
override it. Inferring identity from email, git config, .env, or any
other side channel is **forbidden**. You ASK — no exceptions.

When a new session starts and AGENTS.md has empty `current_user_name`:
Ask FIRST, before any other work:
  "Welcome to [Project Name]. Who are you and what is your role?
   Name: [your name]
   Role: CEO / CTO / Head of Engineering / Engineering Manager / Tech Lead /
         Senior Engineer / Business Analyst / Senior Developer / Junior Developer /
         QA Engineer / DevOps Engineer / Designer / Product Manager / Smart Contract"

Once answered (and ONLY then):
- Write the literal answer to AGENTS.md — `current_user_name: "Full Name"`,
  `current_user_role: "<role>"`, `identity_verified: true`,
  `identity_verified_at: "<today ISO date>"`.
- Address them by name throughout the session.
- Show them only what is relevant to their role.
- Behave as their assistant, not their replacement.
- Load their role context from ~/.claude/skills/astra/skills/roles/[ROLE].md.
- Substitute `${current_user_name}` into every generated artifact's sign-off
  field — never free-text the name. Single source of truth.

If you start typing the user's name before you've asked them — stop. You're
guessing. Ask.

---

## Agent Priority Order (highest first)

When two instructions conflict, follow this order. This supersedes any
"bias toward action" or speed/efficiency rules elsewhere.

1. **Identity verification** — never inferred, always asked at session start.
2. **Workspace boundary** — never access files outside CLAUDE_PROJECT_DIR.
   Request artifacts (ABI, build output) be dropped into the current workspace
   rather than reaching cross-project.
3. **Credential handling** — never print secrets/PKs to the transcript.
   Generated wallets must redirect private keys directly to `qa/.env.qa`,
   surfacing only the address.
4. **Safety classifier rules** — denials override all auto-mode bias.
5. **Auto-Mode bias toward action** — applies only after 1–4 are satisfied.
6. **Speed/efficiency** — last priority.

---

## Resume — if AGENTS.md + SPEC.md + STATUS.md exist in this folder:
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
→ Read `.claude/rules/session-guide.md` once when you are the main session and it has not loaded
  (roles, auto-detection, pipeline, phase gates, Jira, question style, STATUS protocol). Role
  context: ~/.claude/skills/astra/skills/roles/[ROLE].md. Coding roles load
  `.claude/rules/injection-and-credential-safety.md` (INJ) before writing code; a non-trivial or
  one-way-door change starts with /grill-with-docs.

---

## Rules — always follow these
- Never skip phases on new projects
- Never write code before writing the failing test first (TDD within Phase 4)
- Run /self-eval after every phase (score ≥ 6.0 to proceed)
- Update STATUS.md after every task
- For QA: always smoke test before full suite — results MUST be in qa/HANDOFF.md
- For QA: always run full regression after any fix
- Never sign off with open S1 or S2 bugs
- All escalations: JD → SD → TL → SE
- docs/SRS.md must exist before Phase 3 task plan is finalised
- docs/RTM.md must be complete (no gaps) before Phase 4 starts
- docs/api.md must exist before Phase 5 (QA) starts
