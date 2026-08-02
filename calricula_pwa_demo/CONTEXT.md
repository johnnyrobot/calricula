# Context — Calricula PWA demo

The glossary for this demo. When a proposal, issue title, test name, or hypothesis names
a domain concept, use the term as defined here.

Architecture lives in `CLAUDE.md`, release and security invariants in `AGENTS.md`, the
release procedure in `README.md`, and point-in-time release status in `HANDOFF.md`. This
file does not repeat them — it fixes the vocabulary they all assume.

## Curriculum domain

These are California community-college terms of art. They mean what the regulations mean,
not a generic synonym.

- **COR — Course Outline of Record.** The governing document for a course: units, hours,
  requisites, objectives, SLOs, content outline, methods, and codes. The demo's `Course`
  aggregate *is* a COR. Never call it a "syllabus" — a syllabus is an instructor's
  per-term document and is a different thing.
- **Title 5** — the California Code of Regulations division governing community colleges.
  Cited as `§55002.5` and similar; `src/lib/compliance/citations.ts` holds the canonical
  citation strings. **PCAH** — *Program and Course Approval Handbook*, 8th edition; the
  procedural companion to Title 5.
- **54-Hour Rule** (Title 5 §55002.5). One unit is 48 minimum / 54 conventional hours of
  student work across an 18-week semester. `src/lib/compliance/hours.ts` is the only
  implementation; `golden-parity.test.ts` pins it to the parent Python service.
- **TOP code** — Taxonomy of Programs code, the statewide discipline classifier.
  **CB code** — the 27 Title 5/PCAH data-element codes (CB00–CB26) attached to a course.
  They are distinct code systems; don't blur them into "codes".
- **SLO — Student Learning Outcome.** What a student can do on completion, phrased with a
  **Bloom level** (`Remember`, `Understand`, `Apply`, `Analyze`, `Evaluate`, `Create`).
  Distinct from a course *objective*, which is narrower and not assessed at program level.
- **CCN — Common Course Numbering.** The statewide numbering alignment;
  `src/lib/compliance/ccn.ts` checks a course against the standards.
- **Articulation** — the agreement that a course transfers to a CSU/UC equivalent. The
  **Articulation Officer** is the role that owns it, and is a distinct approval stage.
- **Requisite** — `Prerequisite`, `Corequisite`, or `Advisory`, each carrying a
  **validation type** (`Content Review`, `Statutory`, `Sequential`, `Health/Safety`,
  `Recency`, `Other`). "Prereq" is fine in conversation, not in code or issue titles.
- **Program** — an `AA`, `AS`, `AAT`, `AST`, `ADT`, or `Certificate` award built from
  courses under a **requirement type** (`Required Core`, `List A`, `List B`, `GE`).

## Workflow

- **Roles** (`RoleSchema`): `faculty`, `chair`, `articulation`, `admin`. In prose these are
  Faculty, Curriculum Chair, Articulation Officer, and Admin.
- **Course status** (`CourseStatusSchema`), in order: `Draft` → `Department Review` →
  `Curriculum Committee` → `Articulation Review` → `Approved`. A **program** has the
  shorter `Draft` → `Review` → `Approved`.
- **Transition** — a status change plus its actor, timestamp, and optional comment. A
  backwards transition is a **return**, never a "rejection"; the work continues.
- **Persona** — the demo's stand-in for authentication. Switching persona changes the
  acting role. There is no login and no account.
- **Revision / lineage** — a course's version history. A revision is an immutable snapshot;
  lineage is the chain linking them.

## Local-first runtime

- **Repository** — `curriculumRepository` (`src/lib/data/repository.ts`), the single
  sanctioned write path over the Dexie/IndexedDB schema. Not "the database" and not "the
  store"; code that needs data asks the repository.
- **Invalidation revision** — the counter bumped on every mutation
  (`src/lib/data/invalidation.ts`) that the `use*` hooks re-run against. It is how the UI
  learns anything changed; there is no cache layer.
- **Route screen** — the component a route file under `src/app/**` renders. Route screens
  are the only components that reach the repository directly; everything below them takes
  data and callbacks as props.
- **Seeding / reset** — loading the fixture dataset (`src/lib/domain/fixture.ts`) into an
  empty database, and returning to it. **Backup** — the export/import JSON file, the only
  way data leaves or enters the device by user action.

## AI path

The only data that leaves the device. Terms here are load-bearing for security review.

- **Installation ID** — a random per-browser identifier in `localStorage`. It identifies a
  quota subject, not a person; the Worker only ever stores an HMAC of it.
- **Disclosure** — the data-boundary notice the user must acknowledge before any AI
  request. **Challenge** — the Turnstile verification that establishes a session.
- **Session readiness** — `ready` / `needs-disclosure` / `needs-challenge`, answered by
  `src/lib/ai/session-readiness.ts`. See ADR-0001 for why it is remembered client-side
  rather than asked of the server.
- **Session cookie** — the HMAC-signed HttpOnly `__Host-calricula_ai_session`. It is the
  authority on whether a session exists; the browser cannot read it.
- **Daily quota** — the authoritative five-attempts-per-UTC-day reservation held in the
  `DailyAiQuota` Durable Object. An **attempt** is reserved before the upstream call, so a
  failure still consumes one.
- **Free-only routing** — the enforced constraint that any provider reached is free and
  zero-data-retention (`:free` model list plus zero `max_price`). Provider **fallback** is
  permitted; free-only is not.

## Release

- **Publication package** — the exact set of tracked inputs that become a deploy, and the
  digest that `verify-fresh-checkout.mjs` requires to match a rebuild at a canonical path.
- **Gate** — `npm run release:gate`, which runs `RELEASE_GATE_STEPS` in order and only then
  writes the mode-0600 **seal** at `.release-evidence/local-gate.json`.
- **Attempt / lease / promote** — a guarded publish uploads a paused version (an
  *attempt*), records ownership under a *lease* so a half-finished publish is recoverable,
  and only then *promotes* that version to live. Raw `wrangler deploy` is never a release
  path.

## Terms this project avoids

- "Syllabus" for a COR, "rejection" for a return, "user account" for a persona, "login"
  for anything here, "the database" for the repository, "server" for the Worker when you
  mean the static assets.
