# Handoff — architecture deepening, C5 remaining

**Date:** 2026-08-02
**Branch:** `codex/calricula-pwa-demo-release`
**State:** tree clean, `npm run verify` exit 0, 553 unit tests + 174 worker tests
**Working root:** `calricula_pwa_demo/` — every path below is relative to it

This is committed rather than left in `$TMPDIR` on purpose: the two documents
this work started from live at OS temp paths and will not survive a reboot.
Everything from them that still matters is reproduced below.

## Where the work stands

A nine-candidate architecture review was worked through over two sessions.
Eight candidates are done and one remains.

| # | Candidate | Commit |
|---|---|---|
| 1 | own child-process scrubbing in one module | `0b0e595` |
| 2 | unify secret-leak patterns | `ede64a0` |
| 7 | concentrate the free-only routing policy | `08bce3e` |
| 6 | give the daily quota reservation one interface | `df28b37` |
| 9 | let one module answer AI session readiness | `5c0de4c` (see [ADR-0001](../adr/0001-client-side-ai-session-readiness.md)) |
| 8 | reach the repository only from route screens | `a447e29` |
| 3 | release records testable → publish sequence injectable → attempt lifecycle | `9df25a9`, `5c18b71`, `84d2a11` |
| 4 | deepen the course draft session out of `CourseEditor` | `fcc1d02`, `c088713` |
| **5** | **narrow the curriculum repository interface** | **not started** |

Read the commit messages for the reasoning — they carry it, and it is not
repeated here. `git log --oneline main..HEAD` lists the branch.

## C5 — narrow the curriculum repository interface

The review rated this **Strong**, estimated ~6h, and recommended its own
session. The report itself was generated to a temp path and is treated as gone;
this is its C5 content, checked against the code on 2026-08-02.

**Sites:** `src/lib/data/repository.ts` (2291 lines),
`src/lib/data/contracts.ts:190–263` (the interface),
`src/lib/data/repository.test.ts:79,266,313` (the assertions that reach past it).

**Problem as stated.** The interface mirrors the 18-table Dexie schema, so a
handful of genuinely deep aggregate methods sit hidden among many thin table
reads, and the public `database` field lets tests assert past the interface.
Writes are Zod-parsed; reads are not validated on the way out.

**Proposed shape.** Keep the aggregate verbs — save, transition, copy, cascade,
backup, seed — absorb the thin table reads into them, and make the Dexie handle
an internal seam. `fake-indexeddb` stays the single adapter. Claimed wins: the
interface becomes the test surface again, callers learn six names rather than
forty-odd, the deep methods become findable, and the read path gains validation.

**Corrections to the report's own numbers, verified:**

- It says **45 methods**. `contracts.ts:190–263` declares **47**. Count before
  quoting a reduction.
- It says `database` is a public field. Confirmed — `repository.ts:139`,
  `readonly database: CurriculumDatabase`, assigned at `:147`.

**Before you start:**

- `vitest.config.ts` sets a **90 lines / 85 branches** floor specifically for
  `src/lib/data/repository.ts`. Do not weaken it. Absorbing table reads into
  aggregate verbs changes which lines exist, so check coverage early and often
  rather than at the end.
- The three `repository.test.ts` assertions that go through `repository.database`
  are the concrete blocker for making the handle internal. Decide what replaces
  them — an exported read verb, or a test-only accessor — before moving code.
- `src/lib/data/hooks.ts` re-runs queries off the revision bumped in
  `invalidation.ts`. Any method you absorb must still bump it.

## Findings that outlived their session

1. **A test double was more permissive than production.** The quota double never
   validated `expiresAtMs`; making it faithful in `df28b37` broke 104 tests at
   once. Production was correct. When a double and production disagree, check
   which one is wrong before "fixing" production.

2. **Verify load-bearing claims from reports and subagents before acting.** Four
   claims in the source material were wrong, each found by reading the code:
   - `publishWorker`/`promoteUploadedVersion` were said to call `spawn` directly
     and be uninjectable. They call `runPausedPublisher`, which has taken a
     `spawnProcess` parameter all along. The stated blocker was ~30 minutes.
   - `cloudflare-release-target.mjs` was said to have 39 exports. It has 36.
   - `CourseEditor`'s exit paths were said to be covered by the e2e suite. They
     were not; the unit suite covered three of five and nothing covered
     `beforeunload`, `pagehide`, or unmount until `fcc1d02`.
   - "No retry" in the Worker was described as an absence rather than a guard.
     It is already guarded — `toHaveLength(1)` across all 11 upstream error
     statuses in `worker/index.test.ts`. Nothing was added.

3. **An earlier release-gate failure was environmental.** A firefox spec
   (`e2e/resilience-a11y.spec.ts:552`) timed out at load average 30.79; on an
   idle machine it runs in 3.9s against a 30s budget. A second, unrelated
   `AppShell` coverage-run failure on 2026-08-01 reproduced the same way and
   passed on rerun. `retries: 0` is defensible — leave it, and rerun before
   diagnosing.

4. **A `useRouter` mock returning a fresh object each render breaks the editor
   tests.** `CourseEditor`'s exit-path effect depends on router identity, so
   `useRouter: () => ({ push })` tears the effect down and fires its flush
   cleanup on every render. Next's real router is stable, so production is
   unaffected. Both editor test files now use a stable object with a comment.

5. **C3's façade was deliberately not built, and this is the reasoning.** The
   review wanted the 36 exports of `cloudflare-release-target.mjs` collapsed into
   `publishRelease` / `recoverAttempt` / `cancelIfUnchanged`. About 13 of them are
   pure parsers and validators with direct tests in
   `cloudflare-release-target.test.mjs`; hiding them would trade that coverage for
   a shorter name list, on a path that still cannot be executed once. The user
   chose to collapse the *attempt lifecycle* instead (`84d2a11`). The full
   reasoning is in that commit message so the next review does not re-suggest it.

## Loose ends

- `docs/agents/domain.md` describes a single-context layout. `CONTEXT.md` and
  `docs/adr/` now exist; `docs/handoffs/` (this file) does not appear in its
  example tree. Add it there if handoffs become a habit.
- `HANDOFF.md` at the demo root is a **different document** — authoritative
  point-in-time *release* status, per `CLAUDE.md`. Do not merge this into it.

## Working agreements in force

- **ADHD output mode**, until the user says "stop adhd mode": lead with the
  action, number multi-step work, restate state every turn, no preamble, recap,
  or closers, concrete time estimates, lists capped at 5, matter-of-fact error
  tone.
- One candidate per commit, so any can be reverted alone.
- `npm run verify` between candidates. It takes ~8 min; run it in the background
  and do not edit `src/` while its build step runs.
- Verify load-bearing claims from reports and subagents before acting on them.
- When a scope decision has materially different readings, ask rather than
  narrow silently.

## Constraints that must not be broken

`AGENTS.md`, `README.md`, and `CLAUDE.md` are authoritative; this is the short
list, not a substitute.

- Changes stay inside `calricula_pwa_demo/`.
  `git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'`
  must be empty.
- Commit trailer, exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Never put a real personal or maintainer email in code, docs, commits, or
  config. Public repo; identity leaks through GitHub squash-merge.
- Never weaken coverage thresholds or skip tests. Accessibility stays exactly
  1.00.
- Worker secrets are never committed, logged, bundled, or returned to the
  browser, and never prefixed `NEXT_PUBLIC_`.
- `.gitignore` keeps the `!src/lib/` and `!src/lib/**` negations.
- Never use raw `wrangler deploy` as a release path.
- **Do not report this demo as deployment-ready.** No Worker bootstrapped, no
  gate evidence, security scans incomplete. Nothing in these two sessions
  changed that.

No secrets or credentials appear in this document or in the commits it lists.

## Suggested skills

1. **`/tdd`** — the primitive for C5. The design is already argued above;
   confirm the seam, then write the interface's tests before moving code.
2. **`/codebase-design`** — for the vocabulary (depth, seam, adapter, leverage,
   locality) and the deletion test. C5 is squarely depth-as-leverage.
3. **`/code-review`** — on the diff before each commit.
4. **`/domain-modeling`** — only if C5 resolves a decision worth an ADR
   (for example, what replaces `repository.database` as the test seam).
   `docs/adr/` and `CONTEXT.md` already exist; add, do not recreate.
5. Do **not** re-run `/improve-codebase-architecture` — it produced the review
   this work executed, and would re-suggest candidates already decided.

## First action

```
npm run verify        # ~8 min idle; confirms the branch is still green
```

Then open `src/lib/data/contracts.ts:190` and decide which of the 47 methods are
aggregate verbs and which are table reads to absorb. Settle the
`repository.database` question (`repository.test.ts:79,266,313`) before moving
any code.
