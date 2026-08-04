import { describe, expect, it } from "vitest";

import {
  EVAL_COMPLIANCE_SOURCE_PACK,
  EVAL_TOP_CODE_CATALOG,
} from "../../../scripts/ai-eval-fixtures.mjs";

import { AI_COMPLIANCE_SOURCE_PACK, AI_TOP_CODE_CATALOG } from "./schemas";

/**
 * `scripts/ai-eval-fixtures.mjs` duplicates these catalogs because a plain Node
 * script cannot import this Zod-bearing module. That duplication is the one
 * thing standing between the evaluation rubric and the server-owned truth, so
 * it is pinned here rather than left to review.
 *
 * The Worker keeps a third copy (`worker/index.ts`), which is pinned
 * behaviourally in `tests/worker/ai-eval-parity.test.ts` — it cannot be
 * imported here because it only runs under the Workers pool.
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
