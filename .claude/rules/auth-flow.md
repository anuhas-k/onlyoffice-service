---
paths:
  - "**/*auth*"
  - "**/*auth*/**"
  - "**/*login*"
  - "**/*session*"
  - "**/*password*"
  - "**/*otp*"
  - "SPEC.md"
  - "docs/SRS.md"
  - "docs/api.md"
---
# auth-flow.md — universal authentication flow rules
# Auto-installed for every project that has user accounts (every type).
# Loaded whenever current_user_role ∈ {SE, SC, BA, PM, TL, QA}.
#
# Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md §1 (Auth Flow Template),
# §9 (Login Requirement Matrix), and the §"Updated Priority Order"
# items #1, #9, #10 which together cost 9 manual fixes + 2 sessions
# of rework on the Project A middleware project.
#
# Every project with a `users` table or a session concept MUST follow
# the flows below. No exceptions, no "build it from scratch".

---

## AF-1 — Register Flow (universal)

```
INPUT VALIDATION
  - Email required, schema (BE-Q Validation Trinity: type + format + range)
  - Phone optional, validated if present
  - Password: min length, complexity (no spaces, ≥1 digit, ≥1 letter)

EXECUTION
  1. Validate input (return 400 on any failure with NamedError)
  2. Check duplicate email (return 409 if exists)
  3. Hash password (bcrypt cost ≥ 12 or argon2id)
  4. Create user row with:
       email_verified_at = NULL
       phone_verified_at = NULL
       verified           = false    (overall approval gate, see AF-2)
  5. AUTO-SEND email OTP within the same transaction
       — do NOT return until OTP was sent
       — if SMTP fails, ROLL BACK the user row (BE-E: no half-created users)
  6. Return:
       { token, emailVerificationRequired: true, user: { id, email, role } }

RULES
  - OTP delivery is part of the contract — never "we'll send it later".
  - The token returned at register is a TEMP TOKEN — it cannot access
    protected resources until email_verified_at is set (see AF-2).
  - Per-channel OTP codes: the email OTP code is NEVER reused as the
    phone OTP code (and vice versa). One row per channel in
    verification_tokens.
```

**Violation example (Project A BUG-A6):** register returned without sending
OTP — the user got a token, hit login, was bounced back. 4 round-trips
of QA tracing "why did register succeed but login fail" before the SE
added the auto-send.

---

## AF-2 — Login Flow (universal)

```
INPUT
  - email + password OR oauth callback OR SIWE signature
  - On password failure: return 401 with rate-limit headers

EMAIL VERIFICATION GATE (MANDATORY)
  - SELECT email_verified_at FROM users WHERE email = ?
  - IF email_verified_at IS NULL:
      → return 403 Forbidden
      → AUTO-RESEND email OTP
      → return { error: 'EmailVerificationRequired', tempToken }
      → frontend redirects to OTP verify screen

APPROVAL GATE (PER LOGIN REQUIREMENT MATRIX)
  - Look up users.role
  - Find the row in the project's Login Requirement Matrix (Section H
    of INTERFACE_AGREEMENT.md)
  - IF "Approval needed" = Yes:
      → SELECT users.verified for this user
      → IF false:
          → return 403 { error: 'PendingApproval', approver: '<role>' }
      → IF true: proceed

HAPPY PATH
  - Issue access token + refresh token
  - Set last_login_at
  - Return { token, refreshToken, user: { ... } }
```

**Login Requirement Matrix template (lives in INTERFACE_AGREEMENT.md Section H):**

| Role | Email verify? | Approval needed? | Who approves? |
|------|---------------|------------------|---------------|
| admin | No  | No  | — |
| owner / end-user | Yes | No  | — |
| privileged-role-1 | Yes | Yes | admin |
| privileged-role-2 | Yes | Yes | privileged-role-1 |

**Violation example (Project A MISTAKE 17):** a `land_register` user could
register, verify email, and login *immediately* — without admin
approval. The `users.verified` flag was `false` but nothing checked it
on login. Took 2 sessions to discover via frontend integration.

---

## AF-3 — Profile Update Flow (universal)

```
RULES
  - IF the user changes their email:
      → email_verified_at = NULL
      → verified = false (if approval was required for this role)
      → AUTO-SEND email OTP to the new address
      → return { newEmailVerificationRequired: true }
  - IF the user changes their phone:
      → phone_verified_at = NULL
      → AUTO-SEND phone OTP to the new number
      → return { newPhoneVerificationRequired: true }
  - IF any other profile field changes:
      → no re-verification needed
```

**Source of truth (Project A BUG-A4):** profile screens MUST read
verification status from `users.email_verified_at` / `phone_verified_at`,
NOT from the `verification_tokens` table. `verification_tokens` is the
delivery mechanism; `users` is the truth.

---

## AF-4 — OTP Rules (universal)

```
STORAGE
  - Code is generated cryptographically random (6 digits / 8 alphanums)
  - Code is stored as SHA-256 hash in verification_tokens
  - Plaintext code NEVER persisted to the DB
  - TTL: 10 minutes default; 60 minutes for first-register; configurable

PER-CHANNEL ISOLATION
  - One row per (user_id, channel) in verification_tokens
  - Channels: email, phone, totp
  - email-OTP ≠ phone-OTP — they are different codes generated
    independently, even when issued at the same time

USE-ONCE
  - First successful verification deletes the row (or marks used_at)
  - A second request with the same code returns 401 Replay

RATE LIMITING
  - Max 5 send-OTP per channel per hour per user
  - Max 10 verify-OTP per channel per hour per user
  - On limit hit: return 429 with retry-after header
```

**Violation example (Project A BUG-A3):** the email OTP and phone OTP were
the same code. A phishing site could swap channels and grab the user's
account.

---

## AF-5 — SMTP / SMS Provider Rules (universal)

These settings are non-obvious enough that "copy them exactly from a
reference project that works" is the only safe path (see SD-5
Reference Project Comparison).

```
SMTP (Nodemailer / Mailgun / SendGrid / Postmark)
  - secure: false for port 587 (STARTTLS) — common mistake to set true
  - secure: true for port 465 only
  - tls.rejectUnauthorized: false REQUIRED for many corporate
    Office365 / Outlook tenants — without it, the handshake fails
    with a generic 'connection lost' that takes hours to diagnose
  - From: '"Display Name" <email@host>' (NOT raw env var)
  - Connection timeout: 10s. Refusing to start if SMTP doesn't reach
    is better than starting degraded (BE-N External Probe).

SMS (Twilio / Vonage / AWS SNS / local gateway)
  - Phone number format: E.164 (+countrycode + national number)
  - DO NOT accept "0XX..." or "+0X..." — coerce or reject at validation
  - Country whitelist (block premium-rate numbers)
  - Throttle aggressively per phone number (5/hour) to prevent toll fraud
```

**Reference rule:** if the project has a `reference/` dir or a sibling
working project, READ its SMTP config first. Match exactly. Don't
"improve" the settings.

---

## AF-6 — Approval Workflow Pattern (Queue + List-All)

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md Updated Priority #10 (MISTAKE 18).

For every approval workflow, the SPEC + the API MUST define BOTH:

```
1. Pending queue: GET /api/v1/<resource>/pending
   - returns only items awaiting decision
   - used by the approver to see their work

2. List-all view: GET /api/v1/users?role=<role>
   - returns every item (pending + approved + rejected + suspended)
   - used by the admin dashboard for ongoing management
```

**Violation example (Project A MISTAKE 18):** the admin Citizens page
needed all users (pending + approved) but the API only had
`/admin/land-register/requests` (pending-only). Once an officer was
approved, they disappeared from the admin's view. Required a backend
patch + frontend retry.

When the BA / SE designs an approval flow, they MUST answer:
> "What does the admin see AFTER approving someone?"

If the answer involves a list-all view, that endpoint exists in api.md
BEFORE Phase 4 starts.

---

## AF-7 — DB-Layer Allowlists Use Blocklists, Not Allowlists

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md MISTAKE 16.

When writing a DB trigger / RLS policy / role check at the database
layer, prefer a **blocklist** over an allowlist:

```sql
-- BAD — rots when new roles are added
CREATE FUNCTION enforce_token_role() RETURNS trigger AS $$
BEGIN
  IF NEW.role NOT IN ('member', 'notary', 'owner') THEN
    RAISE EXCEPTION 'Role % not allowed', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

-- GOOD — future-proof
CREATE FUNCTION enforce_token_role() RETURNS trigger AS $$
BEGIN
  IF NEW.role IN ('admin') THEN
    RAISE EXCEPTION 'admin role cannot use this token type';
  END IF;
  RETURN NEW;
END;
$$;
```

The first form blocks every new role added later (Project A MISTAKE 16 —
`land_register` and `survey_office` couldn't get email OTPs because
the trigger didn't include them). The second form only blocks what
you explicitly want to block.

---

## See also

- `templates/INTERFACE_AGREEMENT.md` — Section H Login Requirement Matrix, Section G Endpoint Precondition Matrix
- `templates/.claude/rules/backend-patterns.md` — BE-Q (Validation Trinity), BE-R (Queue+List), BE-S (Shared error handler)
- `templates/.claude/rules/qa-patterns.md` — QA-P (Frontend Integration Gate)
- `templates/.claude/rules/scope-discipline.md` — SD-5 (Reference Project Comparison)
- issues/ASTRA-IMPROVEMENT-PROPOSAL.md (the source retro)
