# ADR-0003 — The 54-hour conventional figure is a reference, not a compliance verdict

**Status:** Accepted — 2026-08-07
**Implemented by:** `460aeeb`
(`src/components/courses/course-draft-session.ts`,
`src/components/courses/CourseEditorSections.tsx`,
`src/lib/compliance/golden-parity.test.ts`)

## Context

`CONTEXT.md` stated that `src/lib/compliance/hours.ts` was the only implementation of the
54-Hour Rule. It was not. There were three, and the two extra copies were literals in
component files:

- `course-draft-session.ts:39-48` summed five weekly fields and multiplied by a literal
  `18` to produce `totalStudentHours`, which `saveCourseAggregate` persists. Because it
  used `Number(x || 0)` rather than the module's `toFiniteNumber`, an unreadable value
  from a recovered or imported draft persisted the string `"NaN"`.
- `CourseEditorSections.tsx:149-150` divided by a literal `54` and compared the result to
  the declared units with a literal `0.25` tolerance.

The first copy mattered most: `golden-parity.test.ts` pins this module to the parent
Python compliance service, but the value the editor actually saved was produced by code
that test could not reach.

The second copy was worse than duplication — it stated a rule the domain rejects. It
rendered a `ComplianceMark` with pass/warn styling whenever
`|total / 54 − units| > 0.25`, in either direction. The parent service, which the golden
fixture records by path and sha256, warns against precisely this at
`backend/app/services/compliance_service.py:72-76`:

> 54 is the *conventional* figure many districts use for a standard 18-week term … but it
> is a local convention, not the regulatory minimum. Compliance must be evaluated against
> the 48-hour minimum, not against an exact 54-hour equality.

and again at `:346` — "We check the regulatory floor, not exact equality with 54." The
`0.25` tolerance had been borrowed from `check_minimum_hours_per_unit`, where the parent
applies it one-sided to the 48-hour floor.

`UNIT-005` in `rules.ts:374-390` was checked and is correct: it warns only when hours per
unit *exceed* the conventional figure, mirroring the parent at `:406`. The invented
two-sided rule existed solely in the editor's inline banner.

## Decision

1. **Compliance arithmetic has exactly one implementation.** It lives in
   `src/lib/compliance/`. UI code calls it; UI code does not re-derive it. The regulatory
   constants `18`, `48`, `54` and `0.25` do not appear as numeric literals under
   `src/components/`.
2. **54 is a reference, never a verdict.** The conventional figure may be displayed —
   faculty sizing a COR find the division useful — but it must not drive pass/fail
   styling, a `ComplianceMark`, or any tolerance comparison. Title 5 compliance is the
   48-hour minimum, and the deterministic audit in Section VI is the only surface that
   renders a verdict for units and hours.
3. **Field-name mismatches are mapped at the call site.** `CourseViewModel` says
   `outsideHours`; `WeeklyHoursInput` says `outsideOfClassHours`. The caller maps.
4. **`golden-parity.test.ts` pins by name the verbs the UI calls**, not only the verb they
   delegate to, so a change to the delegation cannot silently unpin the editor's path.

## Alternatives considered

1. **Widen `UNIT-005` into a two-sided test**, making the banner a render of an audit
   result. Rejected. It contradicts the parent's documented reasoning, and
   `golden-parity.test.ts` pins `UNIT-005`'s statuses to that service — this would break
   parity by design rather than by accident.
2. **Delete the readout entirely** and let the audit be the only mention of hours.
   Rejected. The division is a real affordance at the point where hours are entered.
   Keeping the arithmetic while removing the verdict costs nothing.
3. **Add a two-sided `checkConventionalUnitRelationship` verb to `hours.ts`.** Rejected —
   it would give an invented rule a canonical home and make it look sanctioned. No new
   verb was needed: `calculateConventionalUnits` already returns the figure, so `hours.ts`
   was not modified at all.
4. **Widen `WeeklyHoursInput` to accept `outsideHours` as a third alias**, as `rules.ts`
   does for snake_case. Rejected. Widening a deep module's interface to accommodate one
   caller's spelling is the opposite of deepening it.
5. **A lint rule or grep-style test forbidding `18`/`54` literals under
   `src/components/`.** Rejected as brittle — it fires on unrelated numbers, and the
   failure message would not explain the rule. This ADR is the guard.
6. **Rename `CourseViewModel`'s numeric fields, or stop typing them as strings.**
   Rejected as out of scope. The string-typed view model is a separate concern and
   collides with the pending work on `CourseEditRouteScreen`.

## Consequences

- The value the editor persists is now pinned to the parent service both transitively and
  by name.
- An unreadable hour value persists `0` instead of `"NaN"`. This is a behaviour change,
  deliberately taken and pinned by a test written before the change.
- The editor no longer renders a compliance verdict the audit does not sanction. On a
  regulated public tool this matters more than the duplication did: a district convention
  was being presented to faculty as a Title 5 result.
- `CONTEXT.md`'s single-implementation claim is true for the first time.
- `RegistrarDashboard.tsx:139-143` was checked and left alone — it consumes
  `checkMinimumHoursPerUnit` against the 48-hour minimum, through the module, and is the
  pattern the rest of the UI should follow.
- **Not swept.** Other UI surfaces may render verdicts the audit does not sanction; the
  60-unit program limit is the obvious next place to look. That sweep is queued
  separately rather than folded into this change.

## References

- `src/lib/compliance/hours.ts` — the single implementation
- `src/lib/compliance/golden-parity.test.ts` — the parity contract and its fixture
  provenance
- `src/lib/compliance/rules.ts:374-390` — `UNIT-005`, the sanctioned one-sided advisory
- `CONTEXT.md` § "Curriculum domain" — the **54-Hour Rule** entry
- `docs/adr/0002-repository-interface-roles-and-test-seam.md` — the precedent for
  recording rejected alternatives so they are not re-proposed
