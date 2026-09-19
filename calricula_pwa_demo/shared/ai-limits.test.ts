import { describe, expect, it } from "vitest";

import { AI_OUTPUT_LIMITS } from "./ai-limits";

describe("shared AI output limits", () => {
  it("bounds every task the AI routes expose", () => {
    expect(Object.keys(AI_OUTPUT_LIMITS).sort()).toEqual([
      "catalog-description",
      "chat",
      "compliance-explanation",
      "content-outline",
      "program-narrative",
      "slos",
      "top-code",
    ]);
  });

  it("carries the bounds the Worker and the browser both enforce", () => {
    expect(AI_OUTPUT_LIMITS.chat.message).toBe(12_000);
    expect(AI_OUTPUT_LIMITS["catalog-description"].description).toBe(1_600);
    expect(AI_OUTPUT_LIMITS.slos).toEqual({ slo: 350, min: 1, max: 6 });
    expect(AI_OUTPUT_LIMITS["top-code"]).toEqual({
      min: 1,
      max: 3,
      title: 200,
      rationale: 700,
    });
  });

  it("keeps every count range non-empty and every length positive", () => {
    const offenders: string[] = [];
    for (const [task, limits] of Object.entries(AI_OUTPUT_LIMITS)) {
      for (const [field, value] of Object.entries(limits)) {
        if (!Number.isInteger(value) || value <= 0) {
          offenders.push(`${task}.${field} = ${value}`);
        }
      }
      const { min, max } = limits as { min?: number; max?: number };
      if (min !== undefined && max !== undefined && min > max) {
        offenders.push(`${task}: min ${min} exceeds max ${max}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
