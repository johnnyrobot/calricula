# Architecture candidates review — 2026-08-07

Closes the eight-candidate review opened by `/improve-codebase-architecture`,
scoped around the nine candidates already closed by
[`2026-08-02-architecture-deepening.md`](./2026-08-02-architecture-deepening.md)
and around ADR-0001/0002.

Each candidate was settled by an explicit question round before any code moved,
then implemented test-first. Two changed shape materially during questioning and
one was deliberately not implemented at all — the pattern is the point, and it
is the same one the 2026-08-02 review recorded.

Range: `9b4b2ab..d650b92`. Reasoning lives in the commit messages and is not
repeated here.

## What landed

| # | Candidate | Commits |
| --- | --- | --- |
| 1 | 54-Hour Rule had three implementations | `460aeeb`, `4837dce` |
| 5 | Two spawn sites bypassed `childEnvironment()` | `e683986`, `2c64252` |
| 4 | `save()` was a 132-line React closure | `4a7a4be` |
| 3 | The Worker's task catalog lived inside `handleRequest` | `500095d`, `4967315` |
| 2 | One AI task contract, five implementations | `f1e0535`, `2ed0c6d` |
| 6 | No repository verb meant "every course" | `2e7809f` |
| 7 | The AI barrel exposed storage, not readiness | `33f6819` |
| 8 | Repository roles are documentation-only | `ed1de9a` (ADR amendment, no refactor) |

Plus `d650b92`, which repairs a release-input gap that candidate 2 introduced —
see below.

## Findings that were not refactors

Three candidates turned up defects rather than shape problems. They are the
reason the review was worth running.

**Candidate 6 — silent truncation, live.** `page()` clamps `pageSize` to 100
(`repository.ts:99`). The registrar dashboard and the approval queue both
requested 250 and were handed 100, with no error and nothing indicating rows
were dropped. The dashboard rendered "Outlines in progress — X of N" with `N`
from the uncapped total and `X` counted over the returned hundred. Invisible at
the seeded 22 courses; reachable because the demo creates courses locally. Now
pinned by a test that asserts the truncation, next to the verb that replaces it.

**Candidate 6 — the fan-out was quadratic.** `listCourses` already reads the
whole table, filters and sorts before slicing, so the screen's
`pageCount - 1` parallel refetch ran a full table scan per page to rebuild what
the first call had computed and discarded.

**Candidate 2, then `d650b92` — a broken release path.** `shared/` was added as
runtime source read by both the Worker and the browser, but
`RELEASE_INPUT_DIRECTORIES` never listed it. `verify-fresh-checkout` copies
exactly that enumeration into a canonical checkout and rebuilds there, so
`release:verify:fresh-checkout` was broken for four commits. Eight green
`npm run verify` runs passed over it, because `verify` does not exercise the
release scripts. The fix is one list entry; the guard that now fails when any
source-bearing directory is unenumerated is the actual remedy.

## Claims that did not survive checking

Recorded so they are not re-derived. Every one came from a prior handoff or an
in-repo comment, and each was believed until read against the code.

1. **"The Worker's modules cannot be imported from the default vitest project."**
   Stated in the handoff and asserted in a comment at
   `src/lib/ai/eval-catalog-parity.test.ts`. False: `exclude: ['worker/**']`
   stops worker *tests* from running there, not worker modules from being
   imported. A probe test imported `worker/catalog.ts` and `worker/tasks.ts` and
   ran a validator. Candidate 2 was planned around a constraint that did not
   exist — the third catalog copy could simply be deleted rather than
   parity-tested.
2. **"`useRepositoryRevision` has no production caller."** It is used at
   `hooks.ts:48`, inside `useRepositoryQuery`.
3. **"`DemoProvider` runs an untested duplicate of `useRepositoryReady`."** It
   does strictly more — retry and an error state the hook never had — and lives
   at `src/components/shell/`, not `src/contexts/`. `useRepositoryReady` was the
   one genuinely unused thing, and was deleted.
4. **"9 of 12 hooks are pass-throughs."** Five are, counted at `9b4b2ab`, where
   `hooks.ts` exported exactly 12. The five that delegate to one repository
   method and do nothing else are `useRepositoryReady`, `useDashboard`,
   `useReferences`, `usePersonas` and `useActivePersona`. Of the rest,
   `useCourses`, `usePrograms` and `useNotifications` stabilise the query
   object, which is what stops a fresh object literal per render from
   re-querying forever; `useCourse` and `useProgram` suppress a stale aggregate
   when the id changes under them. Both numbers are a census of that commit,
   not a current figure — this review deleted `useRepositoryReady` and added
   `useAllCourses` and `useAllPrograms`, which stabilise, so the tree now holds
   13 hooks of which four are pass-throughs.
5. **ADR-0002's own text.** It names `AIArtifactPersistence`, which never
   shipped, and a 33-method count that was 32 when checked and is 34 now.
   Amended by `ed1de9a` rather than edited, so the August decision and the later
   correction stay separable.

## Candidate 8 was answered, not implemented

Five of six repository roles have no importer outside `contracts.ts`. That reads
like a failed decision and is not one: ADR-0002's claimed benefit is that a
reader learns the role they need instead of a flat list, which segmentation
delivers whether or not anyone imports a segment. The roles stay.

ADR-0002's Alternative 6 turned out narrower than it looked — it rejected
splitting a screen across *two or three* role imports, not a caller naming one
role — so `ContextualAssistant` now narrows from `CurriculumReads` rather than
the whole union, still in one import.

## Open follow-ups

None of these were started.

1. **The Codex Security diff scan is still owed.** `HANDOFF.md` holds the
   authoritative range and target — `f0c5854..HEAD`, resolved at scan time
   rather than pinned to a SHA — and this document deliberately does not
   restate it, so there is one place to read it and no second copy to drift.
   An automated pre-scan review found nothing and is recorded there with the
   checks it ran; it is a prior, not the scan, and closes nothing.
2. **`tests/` is not a release input.** Deliberate — Worker unit tests are not a
   build input — but it means a change there leaves the source fingerprint
   unchanged. Worth an explicit decision.
3. **`worker/index.ts:453`** reflects a client-supplied field name into a 400
   JSON response. Pre-existing since `b446c76` and outside the diff range, so it
   belongs to the owed standard scan.
4. **`makeCCNMatches`** (`CourseRouteScreens.tsx`) — the same "logic in a screen"
   shape as candidate 4, plus a two-pass confidence fallback that deserves its
   own argument.
5. **Spawn-wrapper consolidation** — there is no `spawnChild` helper to grep
   for, which is the finding. `scripts/` has 13 spawn sites, each with its own
   wrapper; 12 call `spawn` directly and `release-deploy.mjs:470` goes through
   an injectable `spawnProcess`, which is why a `spawn(` grep finds only 12.
   Seven of them accumulate child output, under five different overflow
   policies: `cloudflare-release-target.mjs:382` bounds accumulation and kills
   the child; `local-production.mjs:101` keeps a 4,000-character tail;
   `release-state.mjs:648`, `verify-fresh-checkout.mjs:49` and
   `run-lighthouse.mjs:318` accumulate uncapped and truncate only when
   formatting the error; `release-evidence.mjs:328` truncates from the head
   rather than the tail; and `release-evidence.mjs:202` never truncates at all.
   Deferred because it touches `release-deploy.mjs`, whose core is unreachable
   by tests and only runs against real Cloudflare.
6. **Verdict sweep** — candidate 1 found the editor rendering a compliance
   verdict the domain rejects. ADR-0003 named the 60-unit program limit as the
   next place to look. **There is no such limit in this demo**: it is a
   parent-app rule (root `CLAUDE.md`, "Program builder (60-unit limit)") that
   crossed the stack boundary into the ADR. `compliance/rules.ts` mentions
   programs nowhere and carries no program-unit rule, and `totalUnits` is a
   format-checked decimal string with no ceiling, so nothing renders a verdict
   about it. Corrected in ADR-0003. The sweep still has a target — which UI
   surfaces render a verdict `rules.ts` does not sanction — but that limit is
   not one of them, and a reader should not spend the search.
   `RegistrarDashboard.tsx` was checked and is correct.

## Release state

Unchanged by this review, apart from `d650b92` repairing what `f1e0535` broke.
Still not deployment-ready: no Worker bootstrapped, no gate evidence, both
security scans incomplete. `AGENTS.md` and `HANDOFF.md` remain authoritative.

No secrets or credentials appear in this document.
