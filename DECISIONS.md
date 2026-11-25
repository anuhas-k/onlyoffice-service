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
