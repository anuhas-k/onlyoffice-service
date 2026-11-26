# Software Requirements Specification
Project: word-editor-zkp — ONLYOFFICE editing service (prototype)
Version: 0.2 (draft)
Author: BA (prepared in session with anuhas, SE)
Date: 2026-11-26
Status: v0.1 approved 2026-11-25; v0.2 reworded for WOPI (DEC-001 draft) and awaiting re-sign
Standards: ISO/IEC/IEEE 29148:2018 · ISO/IEC 25010:2023 · EARS · Gherkin · MoSCoW

---

## 1. Introduction

### 1.1 Purpose
This SRS turns the approved `SPEC.md` (2026-11-25) and `docs/decisions/001-onlyoffice-editing-service.md`
(ADR D1–D8) into testable requirements. It is written for the SE who builds the service, QA who
tests it, and the Bethel team who will later integrate it. Every SPEC acceptance check (AC-1…AC-16)
traces to at least one requirement here.

### 1.2 Scope
The system is an **editing service** that lets users of the Bethel platform open a Word, Excel or
fillable-PDF file in the browser inside a self-hosted ONLYOFFICE Document Server, co-edit it live,
and turn every save into an immutable, encrypted, fingerprinted version. Version fingerprints are
grouped into hourly per-tenant Merkle roots. A small test UI exercises the whole flow.

**Explicitly out of scope:** Microsoft 365 for the web / WOPI / CSPP and per-tenant engine routing;
the desktop agent and desktop-Word conflict-resolution UI; an own presence service; on-chain
anchoring, wallets and smart contracts (roots are computed only); real Bethel storage and auth;
several Document Servers or load balancing; Redis; customer-managed keys and confidential VMs;
mouse-pointer tracking; an audit-log UI; rate limiting (prototype has one trusted tester).

### 1.3 Definitions, acronyms, abbreviations
| Term | Definition |
|------|-----------|
| Document Server (DS) | The self-hosted ONLYOFFICE engine that renders the editor in the browser and merges co-editors' changes. |
| Editing service | The system specified here. Owns files, versions, sessions, locks and keys. |
| Session | One live editing of one file in the DS, shared by all its co-editors, identified by one WOPI lock id. |
| Lock id | The identifier the DS sends with every WOPI lock and save request for a session (`X-WOPI-Lock`). |
| Access token | A signed credential bound to one file, one user and one mode, used on every WOPI call. |
| Lock | The record that a file is being edited, by which holder type, until when (lease). |
| Lease | The time a lock stays valid without renewal: 30 minutes. |
| Holder type | Which engine holds a lock: ONLYOFFICE (now); desktop or M365 (later). |
| WOPI | The HTTP protocol the DS uses to read and write a file on the host: CheckFileInfo, GetFile, PutFile and lock operations. |
| Milestone version | The version saved when all users have closed the file (the save committed when the last editor leaves; DEC-001). |
| Checkpoint version | A version saved by a force-save while the session stays live (a save while the session stays live). |
| Recovered version | A version rebuilt from a DS "forgotten" file after the service missed a save. |
| Conflict version | A save whose base version is no longer the head; stored beside the head, never merged. |
| Forgotten file | A document the DS kept because it could not deliver the save (listed by its command service). |
| Download token | A 5-minute signed credential bound to one file + one version, used to fetch old-version content. |
| Data key | The per-file AES-256-GCM key that encrypts that file's versions; itself encrypted by the master key. |
| Crypto-shredding | Deleting a file by destroying its data key, so no version can be decrypted again. |
| Leaf | The salted fingerprint of one milestone version: SHA-256(salt ‖ content hash ‖ version id). |
| Merkle root | One hash summarising all leaves of one tenant in one hour; a proof shows a leaf belongs to it. |
| Tenant | An organisation; users and files belong to exactly one tenant. |
| Outbox | A durable list of post-save work (e.g. anchoring) written in the same commit as the version. |

### 1.4 References
- `SPEC.md` — approved 2026-11-25 (AC-1…AC-16, scope, security, risks).
- `docs/decisions/001-onlyoffice-editing-service.md` — ADR D1–D8.
- `docs/source/Collaborative Editing Dual-Engine Design (Microsoft 365 for the web + ONLYOFFICE self-hosted).pdf`
- ONLYOFFICE Docs API — command service, server config; WOPI pages (links in ADR-001 §Sources, ADR-003, `demo-wopi/ADD-WOPI-GUIDE.md`).
- `docs/decisions/003-wopi-primary-editing-path.md` and DEC-001 (draft): editing moves to WOPI; this SRS was reworded to match.

### 1.5 Overview
§2 describes context, users and constraints. §3 holds the requirements: functional (3.1, EARS),
externally imposed interfaces (3.2), quality (3.3, ISO 25010), data rules (3.4), user stories (3.5).
§4 holds behavioural models. §6 lists verification, open issues and the RTM pointer.

---

## 2. Overall Description

### 2.1 Product perspective
A standalone service that Bethel will call over HTTP. In the prototype it also plays the parts
Bethel will own later (upload, list, delete, dev login). It sits between three parties:

```
 Browser (test UI + editor iframe) ──► Editing service ──► Encrypted version store (local disk)
          │                                 ▲   │
          └──────── editor websocket ───────┼─► Document Server (ONLYOFFICE)
                                            │   │
                     WOPI calls ────────────┘◄──┘  command service (info/drop/forcesave)
```

### 2.2 Product functions
1. Run the whole stack from one command and report health.
2. Upload, list, inspect and delete files (prototype stand-in for Bethel).
3. Open a file in the browser editor, alone or with co-editors, never as a download.
4. Turn saves into immutable encrypted versions without loss or duplication.
5. Control who edits: locks with leases, revocation, view-only fallbacks.
6. Destroy a file irrecoverably by destroying its key.
7. Compute hourly per-tenant Merkle roots and proofs over milestone versions.

### 2.3 User classes and characteristics
| User class | Description | Technical skill / access level |
|-----------|-------------|--------------------------------|
| Editor (end user) | Opens, edits and co-edits files of their tenant. | Novice; tenant-scoped token. |
| Tester / operator | Runs the stack, uses the test UI, revokes users, inspects versions and roots. | Expert; same tenant-scoped token in the prototype. |
| Document Server | Machine actor: reads and writes the file over WOPI. | Per-user access token (JWT secret only for commands we send it). |
| Bethel platform (later) | Supplies storage and identity through the storage seam and token verifier. | Not present in the prototype. |

### 2.4 Operating environment
- The editing engine is ONLYOFFICE Document Server, a pinned version, run as its own container (imposed by the design, ADR D8).
- The stack runs under Docker Compose on one host.
- Browsers: current stable Chrome and Firefox (TBD-005).

### 2.5 Design and implementation constraints
| Constraint | Description | Impact (what it rules out) |
|-----------|-------------|----------------------------|
| Imposed tech | The DS is configured, never modified or rebuilt. | No patches to editor behaviour; only its documented config. |
| Imposed protocol | The DS dictates the WOPI request shapes, lock semantics and its own timing (no save on the Save button, no editor-left signal, unlock about 2 minutes after a drop; measured on 8.2.2). | The service must add its own close detection and force-save (§3.2, FR-030). |
| Licensing | Community Edition: ≤ 20 concurrent connections (verify on pinned version). | Load and co-edit tests stay ≤ 20 editors. |
| Security trade-off (ADR D1) | Plaintext exists in the DS container and the service's memory/temp files while a file is open. | The zero-knowledge property does not hold during editing; must be stated, not hidden. |
| Seam | All storage access goes through one storage gateway (ADR D1). | No other component may read or write version blobs directly. |

### 2.6 Assumptions and dependencies
| ID | Assumption | If wrong — impact |
|----|-----------|-------------------|
| ASM-001 | The DS can be configured to download from private Docker-network addresses. | Opening fails end-to-end; first task must prove it (Risk R1). |
| ASM-002 | The DS delivers a 10 MB save to PutFile within the request timeout. | Saves fail; a larger timeout or a size cap is needed. |
| ASM-003 | The DS keeps unsaved WOPI documents available through its forgotten-files commands (7.5+). **Untested under WOPI.** | AC-8 recovery is impossible; FR-038 stays on hold. |
| ASM-004 | The DS retries a failed PutFile. **Untested.** | A failed save is lost unless the host retries or recovers it. |
| ASM-005 | One trusted tester uses the prototype. | Rate limiting would be required before shared use. |

| ID | Dependency | Type | Owner | Risk if unavailable |
|----|-----------|------|-------|---------------------|
| DEP-001 | ONLYOFFICE Document Server (pinned Docker image) | External | ONLYOFFICE | No editing at all. |
| DEP-002 | PostgreSQL 16 | External | Docker Hub | No sessions, versions or saves (DS retries). |
| DEP-003 | Master key and JWT secrets supplied via environment | Internal | Operator | Service must refuse to start. |
| DEP-004 | Bethel storage + identity | External (later) | Bethel | None for prototype; behind the seam. |

---

## 3. Specific Requirements

### 3.1 Functional Requirements

> One EARS sentence per FR. "Reject" means: no state is created or changed and the caller gets a
> named error. Priority is MoSCoW for this prototype. Traces cite SPEC AC-n and ADR Dn.

#### Group A — Stack and health

#### FR-001 — Single-command start
**Requirement (EARS):** The system shall start the editing service, the Document Server and the database together from one command.
**So that:** anyone can run the prototype without manual setup.
**Priority:** Must · **Verification:** Demonstration · **Traces to:** AC-1, D8
```gherkin
Scenario: cold start
  Given a host with Docker and no running stack
  When the operator runs the single start command
  Then all three components are running within 3 minutes
```

#### FR-002 — Healthy report
**Requirement (EARS):** WHEN health is requested and both the database and the Document Server are reachable, the system shall report healthy with each component marked ok.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-1
```gherkin
Scenario: all components up
  Given the stack has started
  When health is requested
  Then the response is success and shows database ok and Document Server ok
```

#### FR-003 — Unhealthy report
**Requirement (EARS):** IF the database or the Document Server is unreachable, THEN the system shall report unhealthy and name the failed component.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-1, Fault Isolation Matrix
```gherkin
Scenario: Document Server down
  Given the Document Server is stopped
  When health is requested
  Then the response is "service unavailable" and marks the Document Server as failed
  And the database is still marked ok
```

#### FR-004 — Refuse to start without secrets
**Requirement (EARS):** IF the master key or any signing secret is missing at startup, THEN the system shall refuse to start and name the missing setting without printing any secret value.
**Priority:** Must · **Verification:** Test · **Traces to:** DEP-003, Security Requirements
```gherkin
Scenario: master key missing
  Given the master key setting is empty
  When the service starts
  Then it exits with an error naming the master key setting
  And the output contains no secret value
```

#### Group B — Identity and tenant isolation

#### FR-005 — Require a user token
**Requirement (EARS):** IF a request to a user-facing operation carries no valid user token, THEN the system shall reject it as unauthenticated.
**Priority:** Must · **Verification:** Test · **Traces to:** Security Requirements
```gherkin
Scenario: missing token
  Given no user token
  When the file list is requested
  Then the request is rejected as unauthenticated

Scenario: expired or tampered token
  Given a user token with a bad signature
  When the file list is requested
  Then the request is rejected as unauthenticated
```

#### FR-006 — Tenant isolation
**Requirement (EARS):** IF a user acts on a file that belongs to another tenant, THEN the system shall reject the request as if the file did not exist.
**Priority:** Must · **Verification:** Test · **Traces to:** Security Requirements, AC-10
```gherkin
Scenario: cross-tenant read
  Given file F belongs to tenant T1
  And user U belongs to tenant T2
  When U requests F's details, versions, a session or deletion
  Then each request is rejected as "file not found"
  And F does not appear in U's file list
```

#### FR-007 — Prototype dev login
**Requirement (EARS):** WHERE the prototype dev-login feature is enabled, the system shall issue a user token for a chosen seeded user.
**Priority:** Must · **Verification:** Test · **Traces to:** SPEC Scope-In (test UI), D1 endpoint 13
```gherkin
Scenario: dev login
  Given dev login is enabled and user "alice" is seeded in tenant T1
  When the tester logs in as alice
  Then a user token naming alice and tenant T1 is returned

Scenario: dev login disabled
  Given dev login is disabled
  When anyone asks for a dev token
  Then the request is rejected
```

#### Group C — Files

#### FR-008 — Upload creates the initial version
**Requirement (EARS):** WHEN a user uploads a file of a supported format, the system shall store it encrypted as the file's initial version.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-2, D5
```gherkin
Scenario: upload a .docx
  Given a logged-in user
  When they upload "report.docx"
  Then the file appears in their list with one version of kind "initial"
  And the stored bytes on disk are not the plaintext
```

#### FR-009 — Reject unsupported or disguised formats
**Requirement (EARS):** IF an uploaded file's extension is not supported or its content does not match its extension, THEN the system shall reject the upload as an unsupported format.
**Priority:** Must · **Verification:** Test · **Traces to:** Security Requirements (magic-byte check)
```gherkin
Scenario: unsupported extension
  When a user uploads "tool.exe"
  Then the upload is rejected as unsupported format and no file is created

Scenario: disguised content
  When a user uploads a ZIP renamed to "notes.pdf"
  Then the upload is rejected as unsupported format
```

#### FR-010 — Reject oversized uploads
**Requirement (EARS):** IF an upload exceeds the maximum upload size of 100 MB, THEN the system shall reject it as too large.
**Priority:** Must · **Verification:** Test · **Traces to:** SPEC API errors (FileTooLarge), TBD-001 (decided: 100 MB)
```gherkin
Scenario: upload over the limit
  When a user uploads a file of 100 MB + 1 byte
  Then the upload is rejected as too large and no file is created
```

#### FR-011 — File list with lock state
**Requirement (EARS):** The system shall list each of the user's tenant files with its current lock holder, or none.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-11
```gherkin
Scenario: a file is being edited
  Given alice has file F open for editing
  When bob lists files
  Then F shows as locked by an ONLYOFFICE session
```

#### FR-012 — File details
**Requirement (EARS):** WHEN a user requests a file's details, the system shall return its metadata, lock holder and current participants.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-11, D1 endpoint 3
```gherkin
Scenario: details while editing
  Given alice and bob are editing F
  When F's details are requested
  Then the lock holder and both participants are shown

Scenario: unknown file
  When details are requested for a file id that does not exist
  Then the request is rejected as "file not found"
```

#### Group D — Opening and co-editing

#### FR-013 — Open for editing
**Requirement (EARS):** WHEN a user opens an unlocked editable file for editing, the system shall create a session with a 30-minute lease and return the editor launch details (the Document Server's editor address and a file-bound access token).
**Priority:** Must · **Verification:** Test · **Traces to:** AC-2, D4, DEC-001
```gherkin
Scenario: first editor
  Given file F has no lock
  When alice opens F for editing
  Then F is held by an ONLYOFFICE session with a lease ending 30 minutes later
  And alice receives the editor address and an access token bound to F and alice
```
#### FR-014 — No download during editing
**Requirement (EARS):** The file information the system gives the editor shall not offer the file as a browser download.
**Priority:** Must · **Verification:** Test + Demonstration · **Traces to:** AC-2
**Note:** the effect of the export-disabling property is unverified on Document Server 8.2.2; confirm by demonstration before relying on it.
```gherkin
Scenario: download disabled
  Given alice has F open in the editor
  Then the editor offers no download or "save as" to the local machine
  And the file information returned for alice's token disables export
```
#### FR-015 — Join the existing session
**Requirement (EARS):** WHEN a second user opens a file that already has an ONLYOFFICE session, the system shall add them to that session and renew its lease.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-3, D4
```gherkin
Scenario: second editor joins
  Given alice has F open for editing
  When bob opens F for editing
  Then bob receives his own access token for the same session
  And the lease on F is renewed
```
#### FR-016 — Live co-editing with names
**Requirement (EARS):** The file information the system gives the editor shall identify each user by display name, and co-editors shall see each other's changes live.
**Priority:** Must · **Verification:** Demonstration · **Traces to:** AC-3
**Note:** live co-editing latency under WOPI was not measured in the demo.
```gherkin
Scenario: see each other
  Given alice and bob have F open in two browser windows
  When alice types a sentence
  Then bob sees the text and alice's named cursor within 2 seconds
```
#### FR-017 — View-only when another engine holds the lock
**Requirement (EARS):** IF a file is locked by a different holder type, THEN the system shall open it view-only.
**Priority:** Should · **Verification:** Test · **Traces to:** D4 (desktop/M365 holders arrive later)
```gherkin
Scenario: held by desktop
  Given F's lock is held by a desktop holder
  When alice opens F for editing
  Then alice receives a view-only configuration and the lock is unchanged
```

#### FR-018 — View-only above the size limit
**Requirement (EARS):** IF a file exceeds the editing size limit for its format (25 MB for .docx, 10 MB for .xlsx), THEN the system shall open it view-only.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-13, D6
```gherkin
Scenario: large spreadsheet
  Given a 12 MB .xlsx file
  When alice opens it for editing
  Then alice receives a view-only configuration and no lock is created

Scenario: at the limit
  Given a .docx of exactly 25 MB
  When alice opens it for editing
  Then alice receives an edit configuration
```

#### FR-019 — Format modes
**Requirement (EARS):** WHERE a file's format is view-only (.pptx or an image), the system shall open it view-only.
**Priority:** Must · **Verification:** Test · **Traces to:** SPEC Scope-In (formats)
```gherkin
Scenario: slide deck
  When alice opens "deck.pptx" for editing
  Then alice receives a view-only configuration
```

#### FR-020 — PDF form filling
**Requirement (EARS):** WHERE a file is a fillable PDF, the system shall open it in form-filling mode.
**Priority:** Must · **Verification:** Demonstration · **Traces to:** SPEC Scope-In (formats)
```gherkin
Scenario: fill a form
  When alice opens "form.pdf" (with form fields) for editing
  Then she can fill its fields and the result saves as a new version
```

#### FR-021 — Refuse to open deleted files
**Requirement (EARS):** IF a user opens a deleted file, THEN the system shall reject the request as deleted.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-14, SPEC API errors (FileDeleted)
```gherkin
Scenario: open after delete
  Given F was deleted
  When alice opens F
  Then the request is rejected as "file deleted"
```

#### Group E — Content delivery and access tokens

#### FR-022 — Serve content for a valid token
**Requirement (EARS):** WHEN the file's content is requested with a valid access token, the system shall return the decrypted content of the file's current version.
**Priority:** Must · **Verification:** Test · **Traces to:** D1, DEC-001
```gherkin
Scenario: Document Server fetches the file
  Given an access token for file F and alice, issued 1 minute ago
  When the content is requested with it
  Then the plaintext bytes of F's current version are returned
  And the response names that version's id
```
#### FR-023 — Reject bad access tokens
**Requirement (EARS):** IF an access token is expired, tampered, or bound to a different file, THEN the system shall reject the request and return no content.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-10
```gherkin
Scenario: expired token
  Given an access token for F that expired
  When F's content is requested with it
  Then the request is rejected as unauthorised

Scenario: token for another file
  Given a valid access token for file A
  When file B's content is requested with it
  Then the request is rejected and no bytes of A or B are returned

Scenario: tampered token
  Given a valid access token with one character changed
  Then the request is rejected as unauthorised
```
#### FR-024 — Tokens are unforgeable and bound
**Requirement (EARS):** The system shall sign every access token so that it cannot be created or altered without the service's secret, and shall bind it to one file, one user and one mode.
**Priority:** Must · **Verification:** Test (property-based) · **Traces to:** AC-10, DEC-001
```gherkin
Scenario: no forgery
  Given many generated tokens with any single byte changed
  Then every one is rejected

Scenario: mode is bound
  Given alice holds a view-mode token for F
  When she presents it to save a new version
  Then the save is rejected as forbidden
```
#### FR-025 — Trust only accepted locks
**Requirement (EARS):** IF a request presents a lock id the service did not accept for the file in question, THEN the system shall reject any write using it.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-9, AC-10, D4
```gherkin
Scenario: lock from another file
  Given lock L was accepted for file A
  When a save for file B presents L
  Then the save is rejected as a lock mismatch and file B is unchanged
```
#### Group F — Saving over WOPI

#### FR-026 — Verify the access token on every call
**Requirement (EARS):** IF a request to a WOPI endpoint carries no valid access token, THEN the system shall reject it and create nothing.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-9, DEC-001
```gherkin
Scenario: forged save
  Given a save request with a token signed with the wrong secret
  When it arrives
  Then it is rejected as unauthorised and no version is created
```
#### FR-027 — Reject writes without the live lock
**Requirement (EARS):** IF a save request does not present the file's live lock id, THEN the system shall reject it with a lock conflict that names the current lock and create nothing.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-9, D4
```gherkin
Scenario: wrong lock id
  Given file F is locked with lock L1
  When a save presents lock L2
  Then it is rejected as a lock conflict naming L1 and no version is created

Scenario: no lock at all
  Given file F is not locked
  When a save arrives
  Then it is rejected as a lock conflict and no version is created
```
#### FR-028 — Reject bytes that are not the file type
**Requirement (EARS):** IF the saved bytes are not a valid file of the file's type, THEN the system shall reject the save and leave the head version unchanged.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-9
```gherkin
Scenario: garbage upload
  Given F is a .docx
  When a save arrives whose bytes are not a .docx
  Then it is rejected as an unsupported format and F's head is unchanged
```
#### FR-029 — Editing activity keeps the session alive
**Requirement (EARS):** WHEN the Document Server refreshes the lock, or the editing page sends a heartbeat, the system shall renew the lease and record the user as present.
**Priority:** Must · **Verification:** Test · **Traces to:** D4, DEC-001
```gherkin
Scenario: heartbeat
  When alice's page sends a heartbeat for F
  Then the lease is renewed and alice is listed as a participant
```
#### FR-030 — Final save becomes a milestone
**Requirement (EARS):** WHEN the last editor leaves a file, the system shall force-save the document, commit it as a milestone version listing the session's participants, and acknowledge the save only after the commit.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-4, D2, DEC-001
**Note:** the Document Server sends no editor-left signal and no save on the Save button (measured on 8.2.2), so the page's leave message or the presence sweeper starts this. The close-to-milestone time is unmeasured; AC-4's 10 s figure is a target to confirm.
```gherkin
Scenario: both users close
  Given alice and bob have edited F
  When both have left
  Then F has exactly one new milestone version listing alice and bob
  And the save was acknowledged only after the version was committed
```
#### FR-031 — Release the lock after a milestone
**Requirement (EARS):** WHEN the Document Server unlocks a file after a milestone version is committed, the system shall release the file's lock so the next open starts a new session.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-6, D4
```gherkin
Scenario: reopen after close
  Given F's milestone was committed and the lock released
  When alice opens F again
  Then she receives the milestone's content under a new session
```
#### FR-032 — Force-save becomes a checkpoint
**Requirement (EARS):** WHEN a save arrives with the live lock while the session continues, the system shall commit it as a checkpoint version and keep the lock unchanged.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-5, D2
```gherkin
Scenario: checkpoint
  Given alice is editing F under lock L
  When a force-save delivers a save under L
  Then a checkpoint version is committed and F is still locked under L
```
#### FR-033 — Close without changes
**Requirement (EARS):** WHEN the Document Server unlocks a file and no save arrived in the session, the system shall release the lock and create no version.
**Priority:** Must · **Verification:** Test · **Traces to:** D4
```gherkin
Scenario: open and close
  Given alice opened F and made no changes
  When the lock is released
  Then F shows no lock holder and has no new version
```
#### FR-034 — Save errors keep the lock
**Requirement (EARS):** IF a save cannot be committed, THEN the system shall keep the lock and raise an alert.
**Priority:** Must · **Verification:** Test · **Traces to:** D2
```gherkin
Scenario: commit fails
  Given F is locked under L
  When a save under L fails to commit
  Then F is still locked under L and an alert is logged
```
#### FR-035 — Ignore duplicate saves
**Requirement (EARS):** IF a save repeats one already committed (same lock id, same content), THEN the system shall acknowledge success and create no new version.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-7, D2.4
```gherkin
Scenario: repeated save
  Given a save of F under L was committed
  When the identical save arrives again
  Then it is acknowledged with success and F's version count is unchanged
```
#### FR-036 — Ignore unchanged content
**Requirement (EARS):** IF saved content is identical to the file's current head version, THEN the system shall acknowledge success and create no new version.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-7
```gherkin
Scenario: save with no real change
  Given F's head has content hash H
  When a save arrives whose content hash is H
  Then it is acknowledged with success and no version is created
```

#### FR-037 — Fail loudly so the save is retried
**Requirement (EARS):** IF a save cannot be fully committed for any reason, THEN the system shall answer with a server error and leave no partial version.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-8, D2.1, D2.2
**Note:** whether the Document Server retries a failed save under WOPI is untested.
```gherkin
Scenario: database down during a save
  Given the database is unavailable
  When a save under the live lock arrives
  Then the save is answered with a server error
  And when the same save is retried after the database returns, exactly one version is created
```
#### FR-038 — Recover forgotten saves
**Status:** ON HOLD (DEC-001): whether the Document Server keeps forgotten files for WOPI sessions is untested; do not build until a fault-injection run answers it. The text below is the callback-era requirement.
**Requirement (EARS):** WHEN the service starts, and every 5 minutes after, the system shall ingest each document the Document Server holds as forgotten as a recovered version of its file.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-8, D2.3
```gherkin
Scenario: service was down while users closed the file
  Given the editing service is stopped
  And alice closes F after editing
  When the service is restarted
  Then within 6 minutes F has a new version of kind "recovered" with alice's changes

Scenario: forgotten file already ingested
  Given a forgotten document was already recovered
  When the reconciler runs again
  Then no second version is created
```

#### FR-039 — Notify editors of a recovery
**Requirement (EARS):** WHEN a recovered version is created, the system shall record a notice for that file's last editors that the test UI shows and the log records.
**Priority:** Could · **Verification:** Test · **Traces to:** D2.3, TBD-002 (decided: test-UI notice + log)
```gherkin
Scenario: recovery notice
  Given F's last session had alice and bob
  When a recovered version of F is created
  Then a notice addressed to alice and bob is recorded
  And the test UI shows it on F and a log line records it
```

#### FR-040 — Late saves become conflicts
**Requirement (EARS):** IF a save's base version is no longer the file's head, THEN the system shall store it as a conflict version beside the head and shall not merge it.
**Priority:** Should · **Verification:** Test · **Traces to:** D4 (late save)
```gherkin
Scenario: stale save
  Given F's head moved from V1 to V2 after a session based on V1 began
  When that session's save arrives
  Then a conflict version based on V1 is stored and F's head stays V2
```

#### Group G — Locks and leases

#### FR-041 — Release abandoned locks
**Requirement (EARS):** WHEN a lock's lease has expired and the Document Server reports it no longer holds the document, the system shall release the lock within 1 minute.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-11, D4
```gherkin
Scenario: abandoned lock
  Given F's lease expired and the Document Server no longer has F's session
  When 1 minute passes
  Then F shows no lock holder
```

#### FR-042 — Keep locks the Document Server still holds
**Requirement (EARS):** WHILE the Document Server still holds a document, the system shall keep its lock even after the lease expires.
**Priority:** Must · **Verification:** Test · **Traces to:** D4 (lease is a safety net only)
```gherkin
Scenario: long session without lock refreshes
  Given F's lease expired but the Document Server still reports F's session open
  When the sweeper runs
  Then F stays locked
```

#### Group H — Revocation

#### FR-043 — Revoke mid-session
**Requirement (EARS):** WHEN a user is revoked from a file's session, the system shall refuse that user's access token on every later call and remove them from the editor.
**Priority:** Must · **Verification:** Test + Demonstration · **Traces to:** AC-12
**Note:** the time to disconnect is unmeasured under WOPI; the 10-second figure in AC-12 is a target to confirm.
```gherkin
Scenario: revoke bob
  Given alice and bob are editing F
  When the tester revokes bob
  Then bob's next call to the service is rejected as unauthorised
  And bob's editor is dropped and alice keeps editing
```
#### FR-044 — Revoked users cannot rejoin
**Requirement (EARS):** IF a revoked user tries to reconnect with their old access token or open the file again, THEN the system shall deny them access.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-12
```gherkin
Scenario: reuse old token
  Given bob was revoked from F's session
  When bob reloads the editor with his old token
  Then every call is rejected as unauthorised

Scenario: open again
  When bob asks to open F while the session lives
  Then the request is refused
```
#### FR-045 — Revoke with no session
**Requirement (EARS):** IF a revocation targets a file that has no active session, THEN the system shall reject it as no active session.
**Priority:** Must · **Verification:** Test · **Traces to:** SPEC API errors (NoActiveSession)
```gherkin
Scenario: nothing to revoke
  Given F is not open by anyone
  When the tester revokes bob from F
  Then the request is rejected as "no active session"
```

#### Group I — Versions

#### FR-046 — Version history
**Requirement (EARS):** WHEN a user requests a file's version history, the system shall list each version with its kind, time and participants, newest first, with consecutive checkpoints grouped.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-4, D1 endpoint 9
```gherkin
Scenario: history after a session
  Given F has an initial version, two checkpoints and a milestone
  When the history is requested
  Then the milestone is listed first with its participants
  And the two checkpoints are grouped together
```

#### FR-047 — Open an old version
**Requirement (EARS):** WHEN an old version is requested with a valid download token, the system shall return that version's decrypted content.
**Priority:** Should · **Verification:** Test · **Traces to:** D1 endpoint 10
```gherkin
Scenario: view version 1
  Given F has versions V1 and V2
  When V1's content is requested with a valid token for V1
  Then V1's bytes are returned, not V2's
```

#### FR-048 — Versions are immutable
**Requirement (EARS):** The system shall never change or overwrite the content of a committed version.
**Priority:** Must · **Verification:** Test + Inspection · **Traces to:** D5
```gherkin
Scenario: new save does not touch old version
  Given V1's stored content hash is H1
  When a new milestone V2 is committed
  Then V1's stored content still hashes to H1
```

#### Group J — Encryption and deletion

#### FR-049 — Encrypt per file
**Requirement (EARS):** The system shall encrypt every stored version with a data key unique to its file, itself encrypted by the master key.
**Priority:** Must · **Verification:** Test + Inspection · **Traces to:** D5, Security Requirements
```gherkin
Scenario: two files, two keys
  Given files A and B are uploaded
  Then each has its own data key
  And A's stored blobs cannot be decrypted with B's data key
```

#### FR-050 — Crypto-shred on delete
**Requirement (EARS):** WHEN a user deletes a file, the system shall destroy the file's data key.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-14, D5
```gherkin
Scenario: delete then try to read
  Given F has three versions
  When F is deleted
  Then no version of F can be decrypted, even with the master key and direct disk access

Scenario: delete while being edited (TBD-003, decided)
  Given alice and bob are editing F
  When F is deleted
  Then both are disconnected from the editor before the data key is destroyed
  And any later save for F is rejected and creates no version
```

#### FR-051 — Proofs survive deletion
**Requirement (EARS):** WHILE a file is deleted, the system shall keep its anchored leaves verifiable against their published roots.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-14, D5
```gherkin
Scenario: proof after delete
  Given milestone M of F is in batch B with root R
  When F is deleted
  Then M's leaf proof still verifies against R
  And the leaf can no longer be linked to F's content (its salt is destroyed)
```

#### Group K — Anchoring (roots only)

#### FR-052 — Record post-save work atomically
**Requirement (EARS):** WHEN a version is committed, the system shall record its post-save work in the same commit as the version.
**Priority:** Must · **Verification:** Test · **Traces to:** D2.6
```gherkin
Scenario: crash after commit
  Given a milestone is committed
  When the service stops before the anchoring worker runs
  Then after restart the milestone is still anchored in its hour's batch
```

#### FR-053 — Hourly per-tenant roots
**Requirement (EARS):** WHEN an hour ends, the system shall compute one Merkle root per tenant over that tenant's milestone leaves from that hour.
**Priority:** Must · **Verification:** Test · **Traces to:** AC-15, D5
```gherkin
Scenario: two tenants in one hour
  Given tenant T1 has 3 milestones and tenant T2 has 1 milestone in hour H
  When the batch for H runs
  Then there are exactly two roots for H, one per tenant, covering 3 and 1 leaves

Scenario: checkpoints not anchored
  Given T1 has only checkpoints in hour H
  Then no root for T1 exists for H

Scenario: batch runs twice
  When the batch for H runs a second time
  Then no second root for T1 in H is created
```

#### FR-054 — Salted leaves
**Requirement (EARS):** The system shall compute each leaf from a random per-version salt, the version's content hash and the version's id.
**Priority:** Must · **Verification:** Test · **Traces to:** D5
```gherkin
Scenario: same content, different leaf
  Given two versions with identical content
  Then their leaves differ
```

#### FR-055 — Roots and proofs on request
**Requirement (EARS):** WHEN anchor batches are requested for a tenant and time range, the system shall return each root with a proof for every leaf that verifies against it.
**Priority:** Must · **Verification:** Test (property-based) · **Traces to:** AC-15
```gherkin
Scenario: verify every proof
  Given batches exist for T1 in the requested range
  When they are requested
  Then every returned proof verifies its leaf against its root

Scenario: another tenant's batches
  Given a user of tenant T2
  When they request T1's batches
  Then the request is rejected or returns nothing of T1
```

#### Group L — Test UI

#### FR-056 — Test UI covers the flow
**Requirement (EARS):** The system shall provide a browser test UI for dev login, upload, file list with lock state, opening the editor, version history, revocation and the anchor-batch view.
**Priority:** Must · **Verification:** Demonstration · **Traces to:** SPEC Scope-In (test UI), AC-2, AC-3
```gherkin
Scenario: end-to-end walk-through
  Given the stack is running
  When a tester logs in, uploads a .docx, opens it, edits, closes it and views history
  Then each step is possible from the test UI without other tools
```

### 3.2 External Interface Requirements

| External interface | Imposed by | Mandated format / standard |
|--------------------|-----------|----------------------------|
| WOPI host endpoints: CheckFileInfo, GetFile, PutFile (`X-WOPI-Override: PUT`), lock operations with `X-WOPI-Lock`, 409 with `X-WOPI-LockFailureReason`, 501 for unsupported operations | ONLYOFFICE / Microsoft | WOPI REST documentation; `demo-wopi/ADD-WOPI-GUIDE.md` |
| Editor launch: the page form-POSTs the access token to the editor address from `/hosting/discovery` into an iframe; messages `Host_PostmessageReady` and `UI_Close` | ONLYOFFICE / Microsoft | WOPI discovery and post-message API |
| Document Server command service (`info`, `drop`, `forcesave`; `getForgottenList` / `getForgotten` on hold) | ONLYOFFICE | ONLYOFFICE command service, JWT-signed |
| Command-service signatures | ONLYOFFICE | JWT (HS256) with a shared secret; `JWT_ENABLED=true`. WOPI calls use the access token, not this JWT. |
| Proof keys (optional request signing by the DS) | WOPI | Logged only; byte order unconfirmed, do not enforce |
| Storage seam (`openForEdit`, `commitVersion`) | Bethel integration (ADR D1) | The two-operation gateway named in ADR D1; Bethel supplies the real implementation later |

All other interfaces of the editing service are an implementation decision (`docs/api.md`).

### 3.3 Non-Functional Requirements (ISO/IEC 25010:2023)

#### NFR-001 — Performance efficiency: open time
**Requirement:** From the open request to an editable document: p95 < 3 s on LAN.
**Verification:** Test (timed, ≥ 20 opens) · **Acceptance:** [ ] p95 < 3 s · **Traces to:** D6

#### NFR-002 — Performance efficiency: save time
**Requirement:** A save of a 10 MB file handled (receive → commit → acknowledge): p95 < 5 s.
**Verification:** Test (timed, ≥ 20 saves) · **Acceptance:** [ ] p95 < 5 s · **Traces to:** D6

#### NFR-003 — Performance efficiency: capacity
**Requirement:** 20 concurrent editors on one Document Server work without errors.
**Verification:** Test · **Acceptance:** [ ] 20 editors on one file, all edits visible, one milestone on close · **Traces to:** D6, Risk R3

#### NFR-004 — Reliability: zero lost saves
**Requirement:** 0 lost saves under: service restart mid-save, duplicate save, Document Server graceful restart, database outage shorter than the retry window. (Retry behaviour under WOPI is untested; see ASM-004.)
**Verification:** Test (fault injection) · **Acceptance:** [ ] each scenario ends with exactly one version holding the final content · **Traces to:** AC-7, AC-8, D2, D6

#### NFR-005 — Reliability: recovery time
**Requirement:** A save missed while the service was down appears as a version ≤ 6 min after restart.
**Verification:** Test · **Acceptance:** [ ] measured ≤ 6 min · **Traces to:** AC-8

#### NFR-006 — Reliability: fault isolation
**Requirement:** Each row of the SPEC Fault Isolation Matrix holds: what it says still works keeps working when the named part fails.
**Verification:** Test (stop each component) · **Acceptance:** [ ] all 5 rows observed · **Traces to:** SPEC Fault Isolation Matrix

#### NFR-007 — Security: no cross-file or cross-tenant leakage
**Requirement:** 0 cases where a key, token or user of one file/tenant obtains another's content.
**Verification:** Test (property-based + negative) · **Acceptance:** [ ] FR-006, FR-023, FR-025 suites pass · **Traces to:** AC-10, D6

#### NFR-008 — Security: secrets never logged
**Requirement:** No log line contains a user JWT, Document Server JWT, WOPI access token (including any URL carrying `access_token`), download token or master key.
**Verification:** Test (capture all logs over a full end-to-end run; search for every issued secret) · **Acceptance:** [ ] 0 matches · **Traces to:** AC-16

#### NFR-009 — Security: encryption at rest
**Requirement:** All version content at rest is AES-256-GCM encrypted; plaintext temp files are deleted once their commit finishes.
**Verification:** Test + Inspection · **Acceptance:** [ ] no plaintext found on the version volume; temp dir empty after each save · **Traces to:** D1, D5

#### NFR-010 — Security: input validation
**Requirement:** Every operation validates its input and rejects anything outside its defined shape.
**Verification:** Test (malformed input per operation) · **Acceptance:** [ ] each operation rejects malformed input without a server error · **Traces to:** Security Requirements

#### NFR-011 — Maintainability: storage seam
**Requirement:** Replacing local storage with Bethel requires changing only the storage gateway implementation.
**Verification:** Inspection + Test (gateway contract tests run against the local implementation) · **Acceptance:** [ ] no module except the gateway touches blob storage · **Traces to:** D1

#### NFR-012 — Maintainability: test coverage
**Requirement:** Integration tests run against a real PostgreSQL; key derivation, idempotency and Merkle proofs have property-based tests.
**Verification:** Inspection · **Acceptance:** [ ] those suites exist and pass in CI · **Traces to:** SPEC Dependencies

#### NFR-013 — Flexibility: scale-out readiness
**Requirement:** Every command-service call carries the file's shard key (the WOPI file id).
**Verification:** Test · **Acceptance:** [ ] all recorded command calls include it · **Traces to:** D7

#### NFR-014 — Compatibility
**Requirement:** The service works with the one pinned Document Server version recorded in the stack definition.
**Verification:** Demonstration · **Acceptance:** [ ] version pinned (no `latest`) and the end-to-end walk-through passes on it

#### Not applicable
- **Interaction capability (usability, accessibility):** N/A for the prototype — the test UI is a developer tool, not shipped to end users; the editor UI belongs to ONLYOFFICE. Revisit WCAG 2.2 AA when Bethel builds the real UI.
- **Safety:** N/A — no physical or life-safety effect.

### 3.4 Data Requirements

| Data rule | Type | Requirement (testable) |
|-----------|------|------------------------|
| Version immutability | Integrity | A committed version's content never changes (FR-048). |
| Save idempotency | Integrity | At most one version per (file, lock id, content hash) (FR-035). |
| One lock per file | Integrity | A file never has two locks at once. |
| Token binding | Integrity | An access token is valid for exactly one file, user and mode (FR-024). |
| One root per tenant-hour | Integrity | At most one batch per (tenant, hour) (FR-053). |
| Tenant ownership | Privacy | Every file, user and batch belongs to exactly one tenant (FR-006). |
| Checkpoint retention | Retention | Checkpoint versions are kept ≥ 30 days; automatic purge is deferred past the prototype (TBD-004). |
| Milestone retention | Retention | Milestones are kept until the file is deleted. |
| Deletion | Privacy | Deleting a file destroys its data key and leaf salts; blob deletion is best effort (FR-050). |
| File content | Confidentiality | Encrypted at rest; plaintext only in memory, the temp dir and the Document Server during a session (ADR D1). |
| Participants | Audit | Each version records the users who took part in its session. |
| Download tokens | Lifetime | Valid 5 minutes; bound to one file + one version; not stored. Access tokens: 1 hour, not stored. |

### 3.5 System Features and Use Cases

#### US-001 — Run the prototype
**Story:** As an operator, I want to start everything with one command and see its health, so that I can test without setup work.
**Priority:** Must · **Maps to:** FR-001, FR-002, FR-003, FR-004

#### US-002 — Edit without downloading
**Story:** As an editor, I want to open a file in my browser and edit it, so that the file never leaves protected storage.
**Priority:** Must · **Maps to:** FR-008–FR-014, FR-018–FR-022

#### US-003 — Co-edit live
**Story:** As an editor, I want to see my colleague's cursor and typing in the same file, so that we can work on it together.
**Priority:** Must · **Maps to:** FR-015, FR-016, FR-029

#### US-004 — Never lose or duplicate a save
**Story:** As an editor, I want every save kept exactly once even when the backend fails, so that I never redo work or see phantom versions.
**Priority:** Must · **Maps to:** FR-030–FR-040, FR-048

#### US-005 — See version history
**Story:** As an editor, I want to see who changed a file and when, and open old versions, so that I can trust and audit changes.
**Priority:** Must · **Maps to:** FR-046, FR-047

#### US-006 — Know and control who is editing
**Story:** As an operator, I want to see who holds a file and remove someone from a session, so that access changes take effect immediately.
**Priority:** Must · **Maps to:** FR-011, FR-012, FR-017, FR-041–FR-045

#### US-007 — Delete for good
**Story:** As a file owner, I want deleting a file to make every version unreadable, so that deletion is real even though versions are immutable.
**Priority:** Must · **Maps to:** FR-049, FR-050, FR-051, FR-021

#### US-008 — Prove versions existed
**Story:** As an auditor, I want hourly fingerprints with proofs per version, so that I can later show a version existed at a given time without revealing it.
**Priority:** Must · **Maps to:** FR-052–FR-055

#### US-009 — Only the right people get in
**Story:** As a security reviewer, I want forged requests, foreign tokens and other tenants rejected, so that no file leaks.
**Priority:** Must · **Maps to:** FR-005, FR-006, FR-023–FR-028, NFR-007, NFR-008

---

## 4. System Models and Diagrams

### 4.1 Lock and session state
```
            open (edit) → LOCK             UNLOCK after a committed save / no save
 Unlocked ───────────────► Locked ──────────────────────────────────────► Unlocked
    ▲                      │  ▲ │
    │                      │  │ └─ open by 2nd user / REFRESH_LOCK / heartbeat → lease renewed
    │                      │  └─── save under the live lock while editing → checkpoint, same lock
    │   lease expired AND  │
    └── DS no longer holds ┘   failed save → stays Locked, alert
```

### 4.2 Version kinds
```
initial ──► milestone (last editor leaves) ──► milestone ...
               ▲   checkpoint (save while the session is live)
               │   recovered (forgotten-file reconciler; on hold)
               └── conflict (base ≠ head; stored beside head, never merged)
```

### 4.3 Save sequence (last editor leaves)
```
page → service: leave message (UI_Close / pagehide / missed heartbeats → sweeper)
service → DS: command forcesave          (PutFile arrives in seconds; Save button sends none)
DS → service: PutFile(access token, lock id, bytes)
service: verify token → write mode? → lock id = live lock? → bytes valid? → hash
service: [one commit] version + participants + outbox entry  (duplicate → 200, no-op)
service → DS: 200 + X-WOPI-ItemVersion   — any failure before here → 500
service → DS: command drop → DS sends UNLOCK (about 2 minutes later, measured) → release lock
```

---

## 5. Other Requirements
- **Legal & licensing:** ONLYOFFICE Document Server Community Edition is AGPL-3.0 and limited to 20 connections; no modification of it is made. A commercial licence decision is needed before production.
- **Localization:** Sinhala and Tamil rendering in documents is spot-checked and findings recorded (design doc Q21–22); not a pass/fail requirement for the prototype.
- **Installation & deployment:** Docker Compose on one host; secrets come from environment variables (FR-004).
- **Documentation:** `docs/api.md` (developer-owned) before QA; README run instructions.

---

## 6. Appendices

### 6.1 Glossary
See §1.3. A `docs/GLOSSARY.md` should be seeded from it with `/glossary`.

### 6.2 Verification summary
| Req ID | Verification method | Owner |
|--------|---------------------|-------|
| FR-001 | Demonstration | QA |
| FR-002–FR-013, FR-015, FR-017–FR-019, FR-021–FR-055 | Test | SE (unit/integration) + QA |
| FR-014, FR-043 | Test + Demonstration | QA |
| FR-016, FR-020, FR-056 | Demonstration (two browser windows) | QA |
| FR-024, FR-055 | Test (property-based) | SE |
| FR-048, FR-049 | Test + Inspection | SE |
| NFR-001–NFR-003 | Test (timed / load) | QA |
| NFR-004–NFR-006 | Test (fault injection) | QA |
| NFR-007–NFR-010 | Test (+ Inspection for NFR-009) | QA / SE |
| NFR-011, NFR-012 | Inspection | SE |
| NFR-013 | Test | SE |
| NFR-014 | Demonstration | QA |

### 6.2a SPEC acceptance check → requirement
| SPEC AC | Requirements |
|---------|--------------|
| AC-1 | FR-001, FR-002, FR-003 |
| AC-2 | FR-008, FR-013, FR-014, FR-056 |
| AC-3 | FR-015, FR-016 |
| AC-4 | FR-030, FR-046 |
| AC-5 | FR-032 |
| AC-6 | FR-031 |
| AC-7 | FR-035, FR-036 |
| AC-8 | FR-037, FR-038, NFR-004, NFR-005 |
| AC-9 | FR-026, FR-027, FR-028 |
| AC-10 | FR-006, FR-023, FR-024, FR-025, NFR-007 |
| AC-11 | FR-011, FR-012, FR-041, FR-042 |
| AC-12 | FR-043, FR-044 |
| AC-13 | FR-018 |
| AC-14 | FR-021, FR-050, FR-051 |
| AC-15 | FR-053, FR-055 |
| AC-16 | NFR-008 |

### 6.3 Open issues (TBD)
| ID | Open question | Owner | Needed by |
|----|---------------|-------|-----------|
| TBD-001 | ✅ Decided 2026-11-25: maximum upload size 100 MB. | SE | — |
| TBD-002 | ✅ Decided 2026-11-25: recovery notice shown in the test UI and logged. | SE | — |
| TBD-003 | ✅ Decided 2026-11-25: delete during editing drops all users, then shreds; later saves rejected. | SE | — |
| TBD-004 | ✅ Decided 2026-11-25: no purge job in the prototype; the 30-day rule stands for production. | SE | — |
| TBD-005 | ✅ Decided 2026-11-25: current stable Chrome and Firefox. | SE | — |
| TBD-006 | Verify on the pinned DS version: private-IP access, forgotten-files and PutFile-retry behaviour under WOPI, 20-connection limit (ASM-001…004). | SE | First task (stack spike) |
| TBD-007 | Draft: confirm DEC-001 with a real Microsoft Word / Office on the web session, measured close-to-milestone time, and revoke time. | SE / TL | Before DEC-001 is accepted |

### 6.4 Requirements Traceability Matrix
`docs/RTM.md` is built after `/factory tasks` creates the task briefs (requirement → task → test).

---

## Requirements Sign-Off
Single-person prototype: anuhas (SE) signs every row in that capacity, at their explicit instruction. PM / CTO / QA / BA rows must be re-signed by those people before production.

| Role | Name | Date | Status |
|------|------|------|--------|
| SE (owner) | anuhas | 2026-11-25 | **Re-sign required** (reworded for WOPI, DEC-001 draft; last approved 2026-11-25) |
| PM (acting) | anuhas (SE) | 2026-11-25 | **Re-sign required** (reworded for WOPI, DEC-001 draft; last approved 2026-11-25) |
| CTO / TL (acting) | anuhas (SE) | 2026-11-25 | **Re-sign required** (reworded for WOPI, DEC-001 draft; last approved 2026-11-25) |
| QA (acting) | anuhas (SE) | 2026-11-25 | **Re-sign required** (reworded for WOPI, DEC-001 draft; last approved 2026-11-25) |
| BA (acting) | anuhas (SE) | 2026-11-25 | **Re-sign required** (reworded for WOPI, DEC-001 draft; last approved 2026-11-25) |
