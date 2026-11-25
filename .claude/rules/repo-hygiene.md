---
paths:
  - "README.md"
  - "CONTRIBUTING.md"
  - "CODE_OF_CONDUCT.md"
  - "SECURITY.md"
  - "LICENSE*"
  - ".gitignore"
---
# repo-hygiene.md — the five files every repo ships with (v7.9.122)
# Auto-installed for every project.
# Loaded whenever current_user_role ∈ {SE, SE-*, TL, CTO, DevOps}.
#
# Source: user 2026-08-14 — "when SE side project setup must need create
# first README, Code of conduct, Contributing, license, Security … also
# give choice SE what license use".

---

## RH — Repo hygiene (HARD BLOCK)

### RH-A — The five files

Before the first commit, an SE-owned repo has all five of these at the
project root:

| File | Answers |
|------|---------|
| `README.md` | What is this, and how do I run it? |
| `LICENSE` | What am I allowed to do with it? |
| `CONTRIBUTING.md` | How do I propose a change that will be accepted? |
| `CODE_OF_CONDUCT.md` | What behaviour is expected of people here? |
| `SECURITY.md` | Where do I send a vulnerability instead of filing a public issue? |

`/init` scaffolds all five for SE-family roles. `LICENSE.md` and
`LICENSE.txt` are accepted in place of `LICENSE`.

### RH-B — Placeholders are not content

The scaffolder fills in everything it can resolve (project name, year,
copyright holder, security contact, stack commands) and leaves a
`{{TOKEN}}` behind for anything it cannot. A file that still contains a
`{{TOKEN}}` counts as **missing**, not as present.

The one that most often survives is `{{ONE_LINE_DESCRIPTION}}` in
`README.md` — it is only auto-filled when `SPEC.md` §1 already has a real
problem statement. Write it by hand otherwise. One sentence, plain
language, no marketing.

### RH-C — Enforcement

`se-repo-hygiene-gate.sh` (PreToolUse, Bash) refuses `git commit` and
`git push` for SE-family roles when any of the five is missing, empty, or
still carries a `{{TOKEN}}`.

- Fires only inside ASTRA-initialized projects (`.astra/` present).
- Skipped entirely for non-SE roles — QA does not own repo hygiene.
- Fails open if `scripts/oss-scaffold.sh` is not installed.
- **No env-var bypass.**

Fix, from the project root:

```bash
bash "$HOME/.claude/skills/astra/scripts/oss-scaffold.sh" --list
bash "$HOME/.claude/skills/astra/scripts/oss-scaffold.sh" --license MIT
```

Re-running is safe — existing files are never overwritten without
`--force`.

### RH-D — Choosing the license

The license is the SE's call, made once, at `/init`. It is not a default
to be accepted without thought: it decides what anyone else may do with
the code, and changing it later requires the agreement of every
contributor.

| ID | Use when |
|----|----------|
| `MIT` | Permissive default. Anyone may use it, including commercially. |
| `Apache-2.0` | Same as MIT plus an explicit patent grant. Preferred when patents are in play or the consumer is an enterprise. |
| `BSD-3-Clause` | Permissive, and forbids using your name to endorse derivatives. |
| `GPL-3.0` | Strong copyleft. Anyone distributing a derivative must release its source. |
| `AGPL-3.0` | GPL-3.0 extended to network use — a hosted service built on it must publish source. |
| `MPL-2.0` | File-level copyleft. Modified files stay open; the larger work need not. |
| `Unlicense` | Public domain dedication. No conditions at all. |
| `Proprietary` | Client work and closed source. Writes an all-rights-reserved notice, not an OSS license. |

**Pick `Proprietary` for client engagements.** Dropping an MIT `LICENSE`
into a repo the client owns gives away rights that are not ours to give.
When in doubt on a paid engagement, ask the PM before choosing.

`GPL-3.0`, `AGPL-3.0`, and `MPL-2.0` texts are fetched from the canonical
source on first use and cached in `~/.astra/licenses/`. ASTRA will not
write a truncated or paraphrased license file — if the fetch fails it
refuses and tells you how to download it.

### RH-E — Keep them true

These files are documentation, and documentation drifts:

- A new required env var means the `README.md` config table changes in
  the same commit.
- A changed test or lint command means `CONTRIBUTING.md` changes with it.
- A new release line means the `SECURITY.md` supported-versions table
  changes with it.
- A `SECURITY.md` pointing at a mailbox nobody reads is worse than none —
  verify the address resolves to a real person.
