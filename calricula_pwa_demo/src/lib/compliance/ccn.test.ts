import { describe, expect, it } from "vitest";

import { CITATION_PACK } from "./citations";
import {
  findCCNMatches,
  parseCCNCode,
  planCCNAdoption,
  validateCCNFormat,
  validateCCNNonMatchJustification,
  validateLegacyCIDFormat,
} from "./ccn";
import { checkCCNAlignment } from "./rules";

describe("CCN helpers", () => {
  it("keeps AB 1111 CCN distinct from legacy C-ID", () => {
    expect(validateCCNFormat(" math   c2210h ")).toBe(true);
    expect(validateCCNFormat("MATH 220")).toBe(false);
    expect(validateLegacyCIDFormat("MATH 220")).toBe(true);
    expect(validateLegacyCIDFormat("MATH C2210")).toBe(false);
    expect(parseCCNCode(" math c2210h ")).toEqual({
      subject: "MATH",
      courseNumber: "2210",
      specialty: "H",
      isHonors: true,
      isLabOnly: false,
      isSupport: false,
      isEmbedded: false,
      fullCode: "MATH C2210H",
    });
  });

  it("ranks domain-shaped standards deterministically", () => {
    const matches = findCCNMatches(
      {
        title: "Calculus I",
        description: "Limits derivatives and integrals",
        subjectCode: "MATH",
        units: "4",
      },
      [
        {
          id: "standard-2",
          ccnCode: "ENGL C1000",
          subjectCode: "ENGL",
          courseNumber: "C1000",
          title: "Academic Reading and Writing",
          catalogDescription: "Academic reading and writing",
          minimumUnits: "3",
        },
        {
          id: "standard-1",
          ccnCode: "MATH C2210",
          subjectCode: "MATH",
          courseNumber: "C2210",
          title: "Calculus I",
          catalogDescription: "Limits derivatives and integrals",
          minimumUnits: "4",
        },
      ],
    );

    expect(matches[0]).toMatchObject({
      standardId: "standard-1",
      ccnCode: "MATH C2210",
      unitsSufficient: true,
      alignmentStatus: "aligned",
    });
    expect(matches[0]?.confidenceScore).toBeGreaterThan(0.9);
  });

  it("plans adoption without mutating the input course", () => {
    const course = {
      units: "3",
      cbCodes: { CB05: "B", LOCAL: "kept" },
    };
    const plan = planCCNAdoption(course, {
      ccnCode: "MATH C2210",
      subjectCode: "MATH",
      title: "Calculus I",
      minimumUnits: "4",
    });

    expect(plan).toMatchObject({
      success: true,
      ccnCode: "MATH C2210",
      cbCodesUpdated: { CB05: "A", CB03: "1701.00" },
      clearNonMatchJustification: true,
    });
    expect(plan.warnings).toHaveLength(2);
    expect(plan.coursePatch?.cbCodes).toEqual({
      CB05: "A",
      CB03: "1701.00",
      LOCAL: "kept",
    });
    expect(course.cbCodes).toEqual({ CB05: "B", LOCAL: "kept" });
  });

  it("validates both original reason-code and canonical domain justification shapes", () => {
    expect(
      validateCCNNonMatchJustification({
        reasonCode: "local_need",
        justificationText:
          "This locally developed course addresses a documented regional need.",
      }),
    ).toMatchObject({
      valid: true,
      normalized: { reasonCode: "local_need" },
    });

    expect(
      validateCCNNonMatchJustification({
        ccnCode: "MATH C2210",
        justification:
          "The local course has a materially different scope from this template.",
        evidence: ["Curriculum committee comparison"],
      }),
    ).toMatchObject({
      valid: true,
      normalized: {
        ccnCode: "MATH C2210",
        evidence: ["Curriculum committee comparison"],
      },
    });

    expect(
      validateCCNNonMatchJustification({
        reasonCode: "unknown",
        justificationText: "Too short",
      }),
    ).toMatchObject({ valid: false });
  });

  it("checks adopted-template units and a real justification record", () => {
    const aligned = checkCCNAlignment(
      { ccnCode: "MATH C2210", units: "3", cbCodes: { CB05: "A" } },
      { ccnCode: "MATH C2210", minimumUnits: "4" },
      null,
    );
    expect(
      aligned.find(({ ruleId }) => ruleId === "CCN-002")?.status,
    ).toBe("warn");

    const nonMatch = checkCCNAlignment(
      { ccnCode: null },
      null,
      {
        ccnCode: "MATH C2210",
        justification:
          "The course intentionally focuses on a different locally approved scope.",
        evidence: [],
      },
    );
    expect(
      nonMatch.find(({ ruleId }) => ruleId === "CCN-003")?.status,
    ).toBe("pass");
  });

  it("ships versioned official source metadata", () => {
    expect(CITATION_PACK["title5-55002-5"]).toMatchObject({
      locator: "5 CCR § 55002.5(a)-(b)",
      verifiedOn: "2026-07-29",
      kind: "regulation",
    });
    expect(CITATION_PACK["pcah-9"].version).toContain("9th edition");
    expect(
      Object.values(CITATION_PACK).every(({ url }) => url.startsWith("https://")),
    ).toBe(true);
  });
});
