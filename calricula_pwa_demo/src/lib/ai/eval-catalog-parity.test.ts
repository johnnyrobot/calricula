import { describe, expect, it } from "vitest";

import {
  EVAL_COMPLIANCE_SOURCE_PACK,
  EVAL_TOP_CODE_CATALOG,
} from "../../../scripts/ai-eval-fixtures.mjs";

import {
  AI_COMPLIANCE_SOURCE_PACK,
  AI_TOP_CODE_CATALOG,
} from "../../../shared/ai-catalog";

/**
 * `scripts/ai-eval-fixtures.mjs` is the last remaining duplicate of these
 * catalogs, and it exists for a reason that has not gone away: `ai:evaluate`
 * runs it under plain Node, which cannot import TypeScript. That duplication
 * is the one thing standing between the evaluation rubric and the
 * server-owned truth, so it is pinned here rather than left to review.
 *
 * The Worker no longer keeps a copy at all — `worker/catalog.ts` reads the
 * same `shared/ai-catalog.ts` this test compares against, so the Worker is
 * pinned by construction rather than behaviourally.
 */
describe("evaluation fixture / server catalog parity", () => {
  it("duplicates the server-owned TOP catalog exactly", () => {
    expect({ ...EVAL_TOP_CODE_CATALOG }).toEqual({ ...AI_TOP_CODE_CATALOG });
  });

  it("duplicates the server-owned compliance source pack exactly", () => {
    expect(JSON.parse(JSON.stringify(EVAL_COMPLIANCE_SOURCE_PACK))).toEqual(
      JSON.parse(JSON.stringify(AI_COMPLIANCE_SOURCE_PACK)),
    );
  });

  it("keeps the source pack keyed by the same source IDs, in the same order", () => {
    expect(Object.keys(EVAL_COMPLIANCE_SOURCE_PACK)).toEqual(
      Object.keys(AI_COMPLIANCE_SOURCE_PACK),
    );
  });
});
