import { describe, expect, it } from "vitest";

import {
  AI_COMPLIANCE_SOURCE_PACK,
  AIOutputValidationError,
  validateAISessionData,
  validateAITaskOutput,
  type AITaskOutputMap,
} from "./schemas";
import type { AITask } from "./types";

const complianceSourceId = "title5-course-standards" as const;
const complianceSource = AI_COMPLIANCE_SOURCE_PACK[complianceSourceId];

const WORKER_COMPLIANCE_SOURCE_FIXTURE = {
  "title5-course-standards": {
    sourceTitle: "California Code of Regulations, title 5, section 55002",
    sourceSection: "§ 55002(a)(1)(C), Units",
    excerpt:
      "Course outlines of record shall record the total number of hours in each instructional category specified in governing board policy.",
    url: "https://govt.westlaw.com/calregs/Document/I825A4A90BB1811F0933DFD2696D93541?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:839c8f4f1bd8d44f1f78137ccf4a812a9c59b819a2da959326bac342e52c78e6",
  },
  "title5-credit-hour": {
    sourceTitle: "California Code of Regulations, title 5, section 55002.5",
    sourceSection: "§ 55002.5(a), Credit Hour Definition",
    excerpt:
      "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
    url: "https://govt.westlaw.com/calregs/Document/IECE98DC0507C11EE80669BF4F3976CB1?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
  },
  "pcah-current-edition": {
    sourceTitle:
      "California Community Colleges Program and Course Approval Handbook, 8th Edition",
    sourceSection: "p. 44, Criteria for the Course Outline of Record",
    excerpt:
      "The Chancellor’s Office review and chaptering processes require the submission of a COR that meets the standards for courses established in Title 5, § 55002.",
    url: "https://www.cccco.edu/-/media/CCCCO-Website/docs/curriculum/program-course-approval-handbook-8th-edition.pdf",
    checksum:
      "sha256:ecbcd9235e013f4b823d5d6605ca1681b9425955f28ce89a20848be7f8d766ee",
  },
  "ccn-current-guidance": {
    sourceTitle: "California Education Code section 66725.5",
    sourceSection: "§ 66725.5(a)(2), Common Course Numbering System",
    excerpt:
      "ensure that comparable courses across all community colleges have the same course number.",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=66725.5.&lawCode=EDC",
    checksum:
      "sha256:bb02261c81bbc8d2fd535db18876b40f482e7cfa9bb74d6d3e3a1bf0a510a0a6",
  },
} as const;

const validOutputs: { [Task in AITask]: AITaskOutputMap[Task] } = {
  chat: { message: "Review the local policy before relying on this draft." },
  "catalog-description": {
    description: "An introduction to evidence-based curriculum design.",
  },
  slos: {
    slos: [
      "Evaluate evidence in a curriculum proposal.",
      "Create a measurable student learning outcome.",
    ],
  },
  "content-outline": {
    topics: [
      {
        sequence: 1,
        topic: "Curriculum foundations",
        contactHours: 9,
        relatedSloNumbers: [1],
      },
      {
        sequence: 2,
        topic: "Evidence and revision",
        contactHours: 9,
        relatedSloNumbers: [1, 2],
      },
    ],
  },
  "top-code": {
    suggestions: [
      {
        code: "0707.00",
        title: "Computer Information Systems",
        rationale: "The record centers on information systems.",
        confidence: 0.82,
      },
    ],
  },
  "program-narrative": {
    goalsAndObjectives: "Prepare students for applied analysis.",
    catalogDescription: "A focused program in applied analysis.",
    requirementsJustification: "The sequenced courses build required skills.",
    laborMarketAnalysis: "",
  },
  "compliance-explanation": {
    explanation: "Review the recorded instructional hours.",
    recommendations: ["Confirm the hour calculation locally."],
    citations: [
      {
        sourceId: complianceSourceId,
        ...complianceSource,
        supports: "The source describes required instructional-hour records.",
      },
    ],
    humanReviewRequired: true,
  },
};

describe("AI browser output schemas", () => {
  it.each(Object.keys(validOutputs) as AITask[])(
    "accepts the exact %s Worker contract",
    (task) => {
      expect(validateAITaskOutput(task, validOutputs[task])).toEqual(
        validOutputs[task],
      );
    },
  );

  it.each(Object.keys(validOutputs) as AITask[])(
    "rejects unexpected keys for %s",
    (task) => {
      const value = { ...validOutputs[task], injected: "not allowed" };
      expect(() => validateAITaskOutput(task, value)).toThrow(
        AIOutputValidationError,
      );
    },
  );

  it("trims accepted text but rejects empty, oversized, and duplicate SLOs", () => {
    expect(
      validateAITaskOutput("catalog-description", {
        description: "  Clear catalog copy.  ",
      }),
    ).toEqual({ description: "Clear catalog copy." });
    expect(() =>
      validateAITaskOutput("catalog-description", { description: " " }),
    ).toThrow(AIOutputValidationError);
    expect(() =>
      validateAITaskOutput("chat", { message: "x".repeat(12_001) }),
    ).toThrow(AIOutputValidationError);
    expect(() =>
      validateAITaskOutput("slos", {
        slos: ["Evaluate evidence.", "evaluate evidence."],
      }),
    ).toThrow(AIOutputValidationError);
  });

  it("enforces consecutive outline sequence, current hours, and current SLOs", () => {
    expect(() =>
      validateAITaskOutput("content-outline", validOutputs["content-outline"], {
        input: {
          contactHours: 20,
          context: { slos: [{ sequence: 1 }] },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        reason: "domain",
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "contact-hours-mismatch" }),
          expect.objectContaining({ code: "unknown-slo" }),
        ]),
      }),
    );
    expect(() =>
      validateAITaskOutput("content-outline", {
        topics: [
          {
            sequence: 2,
            topic: "Out of sequence",
            contactHours: 18,
            relatedSloNumbers: [],
          },
        ],
      }),
    ).toThrow(AIOutputValidationError);
  });

  it("rejects unknown TOP codes and mismatched catalog titles", () => {
    expect(() =>
      validateAITaskOutput("top-code", {
        suggestions: [
          {
            code: "9999.99",
            title: "Invented",
            rationale: "Not in the browser catalog.",
            confidence: 0.4,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        reason: "domain",
        issues: [
          expect.objectContaining({ code: "unknown-top-code" }),
        ],
      }),
    );
    expect(() =>
      validateAITaskOutput("top-code", {
        suggestions: [
          {
            ...validOutputs["top-code"].suggestions[0],
            title: "Wrong title",
          },
        ],
      }),
    ).toThrow(AIOutputValidationError);
  });

  it("requires human review and exact browser-owned compliance metadata", () => {
    expect(() =>
      validateAITaskOutput("compliance-explanation", {
        ...validOutputs["compliance-explanation"],
        humanReviewRequired: false,
      }),
    ).toThrow(AIOutputValidationError);
    expect(() =>
      validateAITaskOutput("compliance-explanation", {
        ...validOutputs["compliance-explanation"],
        citations: [
          {
            ...validOutputs["compliance-explanation"].citations[0],
            url: "https://attacker.invalid/source",
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        reason: "domain",
        issues: [
          expect.objectContaining({ code: "source-metadata-mismatch" }),
        ],
      }),
    );
  });

  it("matches every canonical field in the Worker compliance source fixture", () => {
    expect(AI_COMPLIANCE_SOURCE_PACK).toEqual(
      WORKER_COMPLIANCE_SOURCE_FIXTURE,
    );
    const citations = Object.entries(WORKER_COMPLIANCE_SOURCE_FIXTURE).map(
      ([sourceId, source]) => ({
        sourceId,
        ...source,
        supports: `Supports the ${sourceId} finding.`,
      }),
    );
    expect(() =>
      validateAITaskOutput("compliance-explanation", {
        explanation: "Review the finding against the canonical source pack.",
        recommendations: ["Complete a human review."],
        citations,
        humanReviewRequired: true,
      }),
    ).not.toThrow();
  });

  it("validates session output independently of drafting tasks", () => {
    expect(
      validateAISessionData({ expiresAt: "2026-07-31T01:02:03.000Z" }),
    ).toEqual({ expiresAt: "2026-07-31T01:02:03.000Z" });
    expect(() =>
      validateAISessionData({ expiresAt: "tomorrow" }),
    ).toThrowError(
      expect.objectContaining({
        task: "session",
        reason: "schema",
      }),
    );
  });
});
