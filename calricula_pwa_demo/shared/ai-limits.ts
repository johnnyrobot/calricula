/**
 * The output bounds every AI task is held to, in one place.
 *
 * These are not tidiness constants. The Worker validates model output against
 * them and the browser re-validates the Worker's response against them again
 * (`src/lib/ai/schemas.ts`), so a bound that differs by one between the two
 * sides does not fail loudly — it fails as `AI_OUTPUT_REJECTED` on a response
 * the Worker considered perfectly valid. Holding both sides to the same object
 * makes that agreement structural instead of coincidental.
 *
 * Only bounds that *both* sides express live here. A limit one side alone
 * enforces (the Worker's 7-character TOP code, the browser's bound on the
 * server-injected citation metadata) stays where it is used; routing it
 * through this module would add a hop without adding an agreement.
 *
 * `scripts/ai-eval-fixtures.mjs` keeps its own copy because `ai:evaluate`
 * runs under plain Node and cannot import TypeScript. It is pinned to this
 * file in `src/lib/ai/eval-catalog-parity.test.ts`.
 *
 * `min`/`max` bound item counts; every other field bounds a string length.
 */

export const AI_OUTPUT_LIMITS = {
  chat: { message: 12_000 },
  "catalog-description": { description: 1_600 },
  slos: { slo: 350, min: 1, max: 6 },
  "content-outline": {
    topic: 500,
    contactHours: 500,
    maxTopics: 20,
    maxRelatedSlos: 6,
    maxSloNumber: 6,
  },
  "top-code": { min: 1, max: 3, title: 200, rationale: 700 },
  "program-narrative": {
    goalsAndObjectives: 3_000,
    catalogDescription: 2_000,
    requirementsJustification: 3_000,
    laborMarketAnalysis: 3_000,
  },
  "compliance-explanation": {
    explanation: 3_000,
    recommendation: 600,
    supports: 500,
    min: 1,
    max: 8,
  },
} as const;

export type AiOutputLimits = typeof AI_OUTPUT_LIMITS;
