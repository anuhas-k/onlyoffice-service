---
name: review
description: Code review — production bugs, security (OWASP), and completeness check on current diff
argument-hint: "[scope]"
---
# /review — Code Review Command

## What This Does

Runs a structured code review on the current diff (or `$ARGUMENTS` scope).

## Review Checklist

### Correctness
- [ ] Logic matches the spec/ticket requirement
- [ ] All edge cases handled (null, empty, max values)
- [ ] No off-by-one errors in loops or pagination
- [ ] Async operations awaited; error paths handled

### Security
- [ ] No user input in queries without parameterization
- [ ] Authorization checked — not just authentication
- [ ] No secrets hardcoded or logged
- [ ] No XSS vectors in rendered output

### Performance
- [ ] No N+1 queries inside loops
- [ ] List endpoints are paginated
- [ ] No blocking calls in hot paths

### Tests
- [ ] New code has corresponding tests
- [ ] Tests cover the happy path AND error paths
- [ ] No tests deleted or skipped without explanation

### Quality
- [ ] No commented-out code
- [ ] No magic numbers (use named constants)
- [ ] Function names describe what they do
- [ ] No TODOs without linked issue numbers

## Severity Levels

- **CRITICAL** — data loss, security hole, crash in prod → fix before merge
- **HIGH** — correctness failure under load → fix before merge
- **MEDIUM** — tech debt creating future HIGH → create issue, OK to merge
- **LOW** — style / readability → PR comment, optional

## Output Format

```markdown
## Review: [feature/branch]

### Findings
| Severity | File | Line | Issue |
|----------|------|------|-------|
| HIGH | src/auth.ts | 42 | ... |

### Must Fix Before Merge
1. ...

### Verdict: APPROVE / REQUEST CHANGES
```
