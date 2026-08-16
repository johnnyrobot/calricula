import { describe, expect, it } from "vitest";

import {
  auditCourse,
  checkCBCodes,
  checkCourseContent,
  checkRequisites,
  checkSLOs,
  wouldCreateRequisiteCycle,
} from "./rules";

describe("deterministic course compliance rules", () => {
  it("checks Bloom distribution and flags weak SLO verbs", () => {
    const results = checkSLOs([
      {
        id: "slo-1",
        outcomeText: "Understand the major concepts.",
        bloomLevel: "Understand",
      },
      {
        id: "slo-2",
        outcomeText: "Apply the documented procedure.",
        bloomLevel: "Apply",
      },
      {
        id: "slo-3",
        outcomeText: "Evaluate evidence and defend a conclusion.",
        bloomLevel: "Evaluate",
      },
    ]);

    expect(
      results.find(({ ruleId }) => ruleId === "SLO-001")?.status,
    ).toBe("pass");
    expect(
      results.find(({ ruleId }) => ruleId === "SLO-002")?.status,
    ).toBe("pass");
    expect(
      results.find(({ ruleId }) => ruleId === "SLO-003-1")?.status,
    ).toBe("warn");
  });

  it("checks topic count, hours, and stale SLO links", () => {
    const results = checkCourseContent(
      [
        {
          topic: "One",
          hoursAllocated: 27,
          linkedSloIds: ["slo-1"],
        },
        {
          topic: "Two",
          hoursAllocated: 27,
          linkedSloIds: ["missing"],
        },
      ],
      { lectureHours: 3 },
      [{ id: "slo-1", outcomeText: "Analyze evidence", bloomLevel: "Analyze" }],
    );

    expect(
      results.find(({ ruleId }) => ruleId === "CONTENT-001")?.status,
    ).toBe("warn");
    expect(
      results.find(({ ruleId }) => ruleId === "CONTENT-002")?.status,
    ).toBe("pass");
    expect(
      results.find(({ ruleId }) => ruleId === "CONTENT-004")?.status,
    ).toBe("fail");
  });

  it("requires a documented basis for prerequisites and corequisites", () => {
    const missing = checkRequisites(
      [
        {
          type: "Prerequisite",
          requisiteCourseId: "course-2",
          validationType: "Content Review",
          contentReview: "",
        },
      ],
      "course-1",
    );
    expect(
      missing.find(({ ruleId }) => ruleId === "REQ-001-1")?.status,
    ).toBe("warn");

    const complete = checkRequisites([
      {
        type: "Corequisite",
        requisiteText: "Concurrent enrollment in MATH 101",
        validationType: "Sequential",
      },
    ]);
    expect(
      complete.find(({ ruleId }) => ruleId === "REQ-001-1")?.status,
    ).toBe("pass");
  });

  it("detects a prospective requisite cycle", () => {
    const graph = [
      { courseId: "B", requisiteCourseId: "C" },
      { courseId: "C", requisiteCourseId: "A" },
    ];
    expect(wouldCreateRequisiteCycle("A", "B", graph)).toBe(true);
    expect(wouldCreateRequisiteCycle("D", "B", graph)).toBe(false);
    expect(wouldCreateRequisiteCycle("A", "A", [])).toBe(true);
  });

  it("checks CB required values and dependencies", () => {
    const results = checkCBCodes({
      topCode: "1701.00",
      cbCodes: {
        CB04: "N",
        CB05: "A",
        CB08: "B",
        CB09: "C",
        CB21: "Y",
        CB03: "0707.00",
      },
    });
    expect(
      results.find(({ ruleId }) => ruleId === "CB-DEP-001")?.status,
    ).toBe("fail");
    expect(
      results.find(({ ruleId }) => ruleId === "CB-DEP-002")?.status,
    ).toBe("fail");
    expect(
      results.find(({ ruleId }) => ruleId === "CB-DEP-003")?.status,
    ).toBe("fail");
    expect(
      results.find(({ ruleId }) => ruleId === "CB-DEP-004")?.status,
    ).toBe("warn");
  });

  it("produces a stable audit summary and calculated-hour payload", () => {
    const audit = auditCourse({
      course: {
        id: "course-1",
        title: "Introduction to Computer Science",
        catalogDescription:
          "An introduction to computational problem solving, algorithm design, programming methods, data structures, testing practices, software quality, documentation, collaboration, and responsible computing through hands-on exercises and projects.",
        units: "3",
        lectureHours: "3",
        outsideOfClassHours: "6",
        topCode: "0707.00",
        cbCodes: {
          CB04: "D",
          CB05: "A",
          CB08: "N",
          CB09: "E",
        },
      },
      slos: [
        {
          id: "slo-1",
          outcomeText: "Analyze computational problems.",
          bloomLevel: "Analyze",
        },
        {
          id: "slo-2",
          outcomeText: "Apply structured programming methods.",
          bloomLevel: "Apply",
        },
        {
          id: "slo-3",
          outcomeText: "Evaluate program correctness.",
          bloomLevel: "Evaluate",
        },
      ],
      contentItems: [
        { topic: "Algorithms", hoursAllocated: 11 },
        { topic: "Data types", hoursAllocated: 11 },
        { topic: "Control flow", hoursAllocated: 11 },
        { topic: "Functions", hoursAllocated: 11 },
        { topic: "Testing", hoursAllocated: 10 },
      ],
      requisites: [],
    });

    expect(audit.failed).toBe(0);
    expect(audit.warnings).toBeGreaterThan(0);
    expect(audit.overallStatus).toBe("warn");
    expect(audit.passed + audit.failed + audit.warnings).toBe(
      audit.totalChecks,
    );
    expect(audit.calculatedHours.totalStudentLearningHours).toBe(162);
    expect(audit.resultsByCategory["Title 5"]?.length).toBeGreaterThan(0);
  });
});
