---
paths:
  - "docs/INTERFACE_AGREEMENT.md"
  - "SPEC.md"
  - "docs/SRS.md"
  - "docs/api.md"
  - "**/*.sol"
---
# interface-agreement.md — universal rule, every project type
# Auto-installed by /init for every project.
# Loaded into agent context whenever current_user_role ∈ {SE, SC, QA, BA, PM, Designer}.

---

## IA-1 — Interface Agreement First. No Code Before Sign-Off.

Before writing a single line of production code, produce and get
sign-off on `docs/INTERFACE_AGREEMENT.md` (template at
`~/.claude/skills/astra/templates/INTERFACE_AGREEMENT.md`).

The agreement covers six universal sections:
- A. **Access Reference Map** — what to call, with what, authorized by whom
- B. **Actor / Signer Matrix** — identities and the roles they need
- C. **Entity State Machine** — valid states and transitions
- D. **Identifier Convention** — the single field that identifies each entity
- E. **Event / Webhook → Consumer Map** — every signal and its consumer
- F. **Error Catalog** — every error a consumer might receive

`interface-agreement-gate.sh` blocks Phase-4 work (build, run,
`src/**` edits) until **all three sign-offs** (producer + consumer +
QA) are present and **no template placeholders** remain.

If you find yourself starting to code and the agreement is missing —
**stop**. Run `/interface-agreement` first.

---

## IA-2 — Adapt the Template to Project Type

| Section | Contract | Backend / API | Frontend | Fullstack |
|---------|----------|---------------|----------|-----------|
| A | function → args → signer | endpoint → request → auth | component → props → data source | both |
| B | wallet → on-chain roles | service identity → DB/API roles | user role → UI permission | both |
| C | entity → on-chain transitions | resource → DB transitions | UI state → user action | both |
| D | on-chain identifier per role | primary key per resource | route param / form field | both |
| E | event → indexer → endpoint | webhook → subscriber → consumer | DOM event → handler → state | both |
| F | custom error + selector | HTTP status + body shape + code | UI error state + recovery | both |

The agent picks examples per project type from `foundry.toml` /
`next.config.*` / `package.json` deps / `Cargo.toml`.

---

## IA-3 — Three-Role Sign-Off Minimum

The agreement is signed by at LEAST three roles:
- **Producer** — the role that builds the interface (SC engineer / SE
  backend / designer).
- **Consumer** — the role that calls into it (middleware engineer /
  frontend engineer / mobile engineer).
- **QA** — the role that tests against it.

Add more rows if PM / CTO / BA need to agree.

**Never tick a sign-off checkbox on behalf of a missing party.** This
is the same role-violation as SE closing QA-owned bugs. Wait for each
person to confirm individually.

---

## IA-4 — When to Re-Sign

Any of the following requires re-signing the agreement:
- A new entity is added to the system.
- An existing function/endpoint changes signature.
- A role / permission topology changes.
- A new error path is introduced.
- A state-machine transition is added or removed.

The framework's `abi-doc-consistency.sh` (for contracts) and
`backend-pattern-lint.sh` hooks catch some of these. The agent
catches the rest at design time.

---

## IA-5 — The Source-of-Truth Hierarchy

When disagreement happens during QA:

```
1. Deployed/compiled artifact (ABI / OpenAPI / type definitions)
2. INTERFACE_AGREEMENT.md
3. Other docs (README, design specs)
4. Bug reports
```

If a bug report says "X should work like this" and the agreement
says otherwise, the agreement wins. If the agreement says one thing
and the deployed artifact says another, the artifact wins — and the
agreement must be re-signed.

---

## See also

- `~/.claude/skills/astra/templates/INTERFACE_AGREEMENT.md`
- `~/.claude/skills/astra/scripts/hooks/interface-agreement-gate.sh`
- `~/.claude/skills/astra/agents/interface-agreement.md`
- Contract-specific rules: `templates/contract/.claude/rules/blockchain-*.md`
