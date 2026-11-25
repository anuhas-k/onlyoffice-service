# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.** A public issue tells
attackers about the flaw before there is a fix.

Report privately to **anuhas.kumarage@futurecx.com**.

If this project is hosted on GitHub, you may also use
*Security → Advisories → Report a vulnerability*, which opens a private
channel with the maintainers.

Include as much of the following as you can:

- The type of issue (injection, auth bypass, privilege escalation, SSRF,
  deserialization, secret exposure, etc.).
- Full paths of the source files involved.
- The commit or version where you observed it.
- Configuration required to reproduce.
- Step-by-step reproduction instructions, and a proof-of-concept if you have
  one.
- The impact: what an attacker gets, and what they need to start with.

You do not need a working exploit to file a report. A clear description of the
flaw is enough.

## What happens next

| Stage | Target |
|-------|--------|
| Acknowledgement of your report | within 3 business days |
| Initial assessment and severity rating | within 7 business days |
| Fix or documented mitigation for critical issues | within 30 days |
| Public disclosure | after a fix ships, coordinated with you |

We will keep you updated as the fix progresses and will credit you in the
advisory unless you prefer to stay anonymous.

## Supported versions

Security fixes are applied to the versions below. Older releases receive no
patches — upgrade before reporting against them.

| Version | Supported |
|---------|-----------|
| latest `main` | yes |
| previous minor | yes |
| everything older | no |

<!-- Replace with real version numbers once the project has releases. -->

## Scope

**In scope**

- The source code in this repository.
- Its build, release, and deployment configuration.
- Dependencies pinned by this repository, where the flaw is reachable through
  this project's code.

**Out of scope**

- Vulnerabilities in third-party services this project merely calls.
- Findings that require physical access to a developer machine, or an already
  fully compromised host.
- Automated scanner output with no demonstrated impact.
- Denial of service through sheer request volume against a test deployment.

## Safe harbour

We will not pursue or support legal action against anyone who:

- Makes a good-faith effort to follow this policy.
- Reports promptly and gives us reasonable time to fix the issue before
  disclosing it.
- Avoids privacy violations, data destruction, and service degradation.
- Only interacts with accounts they own or have explicit permission to test.

## Handling secrets

If you find a live credential, token, or private key committed to this
repository, treat it as a critical report and send it to
anuhas.kumarage@futurecx.com immediately. Do not use it, and do not post it in an
issue or pull request.
