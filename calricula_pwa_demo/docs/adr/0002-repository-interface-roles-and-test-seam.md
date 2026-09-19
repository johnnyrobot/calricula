# ADR-0002 — The repository is segmented by caller role, and its Dexie handle is a test-only seam

**Status:** Accepted — 2026-08-02
**Implemented by:** `6834d95`, `b05d737`, `3b97f13`, `6e94f9f`
(`src/lib/data/contracts.ts`, `src/lib/data/repository.ts`)

## Context

`CurriculumRepository` declared 47 methods in one flat list that mirrored the 18-table
Dexie schema. Two consequences followed.

First, the deep verbs were unfindable. `saveCourseAggregate` writes a course and all of
its children in one transaction; `transitionCourse` runs the approval workflow;
`exportBackup` / `importBackup` round-trip the whole demo. They sat between
`listNotifications` and `getReferences` with nothing distinguishing them.

Second, `database` was a public field on `DexieCurriculumRepository`, and
`repository.test.ts` reached tables through it in 21 places — so the interface under test
was routinely bypassed by the tests meant to hold it.

An architecture review (candidate C5) proposed collapsing the interface into roughly six
aggregate verbs — save, transition, copy, cascade, backup, seed — absorbing the "thin
table reads" into them.

## Decision

**The proposed collapse was not implemented, because a call-site census contradicted its
premise.** 33 of the 47 methods have real production callers spanning courses, programs,
notifications, dashboard, personas, AI persistence and backup. `listNotifications`,
`getDashboard`, `getReferences` and `setActivePersona` are not thin reads that some
aggregate verb can absorb; folding them into six verbs would produce a stringly-typed god
method, not a deeper interface.

What the census did support, and what was done instead:

1. **Delete what nothing calls.** 14 methods had no production caller. Five of them
   (`updateCourse`, `replaceCourseSLOs`, `replaceCourseContent`,
   `replaceCourseRequisites`, `setCourseCCNJustification`) were a second, line-for-line
   implementation of work `saveCourseAggregate` already does — two copies of the TOP/CB03
   canonicalization, the requisite cycle check and the CCN non-match validation, free to
   drift apart. Two (`getRevision`, `subscribe`) forwarded to the invalidation bus the
   caller can reach directly. Seven had no caller at all. 47 → 33 methods,
   `repository.ts` 2291 → 1900 lines.

2. **Segment the survivors by caller role.** `CurriculumReads`, `CourseAuthoring`,
   `ProgramAuthoring`, `NotificationInbox`, `AIPersistence` (itself
   `AIConversationPersistence` + `AIArtifactPersistence`), `DemoAdministration`.
   `CurriculumRepository` extends all of them, so the union and every call site are
   unchanged; what is new is that a module can depend on the role it uses.

3. **Make the Dexie handle private, reachable only through
   `unsafeDatabaseForTests()`.** The name is the decision: going around the interface is
   possible, marked, and greppable.

4. **Validate aggregates on the way out.** Writes were already Zod-parsed; reads were not.
   `CourseAggregateSchema` and `ProgramAggregateSchema` parse in the two private aggregate
   funnels, so `getCourse`, `getProgram` and the aggregates returned from saves all check.

## Alternatives considered

1. **The review's six aggregate verbs.** Rejected on evidence — see above. Recorded here
   so the next review does not re-propose it without redoing the census.
2. **Keep the 14 uncalled methods.** Rejected. `deleteProgram`, `deleteComment` and the AI
   delete verbs are working, tested capability with no UI, but an interface that lists
   verbs no screen calls teaches a reader the wrong map. They are one `git revert` away if
   a screen ever wants them.
3. **A test-only accessor as a free function.** Rejected: a function outside the class
   cannot read a private field without a type cast, and a cast in production code to serve
   tests is worse than a named method.
4. **Rewrite all 21 seam call sites onto public verbs.** Rejected. Eleven of them arrange
   states no public verb can produce — a `schemaVersion` 1 record to migrate from, a newer
   `schemaVersion` the repository must refuse, a course row forced into each status so the
   workflow matrix can try every edge from it, bulk fixtures exceeding the prune caps.
   Adding read verbs to serve those would widen the interface in order to narrow the test
   surface.
5. **Validate every read, not just aggregates.** Rejected. `listCourses` reads every
   course row per query and re-runs on each revision bump; a Zod pass there buys catching
   a record that `getCourse` catches when the user opens it.
6. **Split route screens across role imports.** Rejected. Each screen would import two or
   three objects instead of one entry point, fragmenting the call site for no gain the
   role names do not already give a reader.

## Consequences

- Callers learn the role they need, not 33 names. The deep verbs are findable because each
  role is small enough to read.
- A corrupt or stale local record now surfaces as `RepositoryError("invalid-backup", …)`
  at the boundary, naming its recovery, instead of as `undefined` inside a screen.
- `AIPersistence` had to split the moment a real caller used it: the chat-persistence
  doubles are three-method conversation doubles, and demanding `saveAIArtifact` of them
  would have meant padding a double with a method its subject never calls. Let the
  caller's actual need name the seam — a test double refusing a role is evidence, not an
  obstacle.
- `saveAIArtifact` is now write-only: artifacts are persisted for audit and no screen reads
  them back. Deleting `listAIArtifacts` did not create this, it exposed it. Worth an
  explicit decision — either a screen reads accepted suggestions, or the artifact table
  and its prune cap are carrying weight nothing collects.
- Census caution: `getRevision`/`subscribe` were nearly reported as uncalled because
  `hooks.ts` invokes them as `curriculumRepository.subscribe.bind(...)`, with no paren
  after the name. Grep for the bare member, not the call.

## Amendment — 2026-08-07

The decision stands. This records where the text above stopped matching the code,
and settles a question it left open.

**Roles are a map, not a promise of adoption.** Five of the six have no importer
outside `contracts.ts`; only `AIConversationPersistence` has one
(`src/lib/ai/chat-persistence.ts`, which hand-rolled its own `Pick` before the
roles existed). That is not a failure of the decision, but the decision as
written invites the reading that adoption was expected. It was not. The stated
benefit — *"callers learn the role they need, not 33 names"* — is delivered by
reading `contracts.ts`, which a segmented interface makes possible and a flat
34-method union does not. A role with no importer still earns its place by
telling a reader which verbs belong together and which caller they are for.
They were not deleted for that reason.

**Alternative 6 is about arity, not vocabulary.** It rejected splitting a screen
across *two or three* role imports, fragmenting the call site. It does not
forbid a caller naming one role. `ContextualAssistant.tsx` was narrowing
`Pick<CurriculumRepository, "getCourse" | "getProgram">` from the whole union;
it now narrows from `CurriculumReads`, where both verbs live. Still one import,
so the objection does not reach it.

**Corrections to the text above.**

- *"33 methods"* (§ Decision 1, § Consequences) was 32 by the time it was
  checked, and is **34** now: `2e7809f` added `listAllCourses` and
  `listAllPrograms`. The count was never load-bearing; the shape was. Treat the
  numbers above as the census of that day, not a current figure.
- *`AIArtifactPersistence`* (§ Decision 2) never shipped. `0c3972c` settled it:
  the role is `AIConversationPersistence`, and `AIPersistence` survives only as
  an alias for it with no reference anywhere.
- *"`saveAIArtifact` is now write-only … worth an explicit decision"*
  (§ Consequences) has been decided in the direction that entry pointed at.
  There is no artifact read, write, or delete verb; `repository.test.ts` asserts
  all three are absent. The `aiArtifacts` Dexie table remains declared, and is
  still swept, backed up and cleared by `repository.ts`, because dropping it is a
  schema migration and existing installs may hold rows —
  `contracts.ts` carries that reasoning next to the interface.

## References

- `src/lib/data/contracts.ts` — the six roles and the union
- `src/lib/data/repository.ts` — `unsafeDatabaseForTests`, `validateOnRead`
- `src/lib/domain/schemas.ts` — `CourseAggregateSchema`, `ProgramAggregateSchema`
- `docs/handoffs/2026-08-02-architecture-deepening.md` § "C5"
- `CLAUDE.md` § "Data layer (`src/lib/data/`)"
