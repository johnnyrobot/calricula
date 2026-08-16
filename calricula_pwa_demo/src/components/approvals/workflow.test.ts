import { describe, expect, it } from "vitest";

import {
  canConfirmApprovalAction,
  getApprovalDecision,
  getCourseSubmissionAvailability,
  getReviewStatuses,
} from "./workflow";

describe("approval workflow policy", () => {
  it("builds a queue for each demo role", () => {
    expect(getReviewStatuses("faculty")).toEqual([]);
    expect(getReviewStatuses("chair")).toEqual([
      "Department Review",
      "Curriculum Committee",
    ]);
    expect(getReviewStatuses("articulation")).toEqual([
      "Articulation Review",
    ]);
    expect(getReviewStatuses("admin")).toEqual([
      "Department Review",
      "Curriculum Committee",
      "Articulation Review",
    ]);
  });

  it("exposes only the transition belonging to the current review stage", () => {
    expect(
      getApprovalDecision("Department Review", "chair")?.advanceTo,
    ).toBe("Curriculum Committee");
    expect(
      getApprovalDecision("Curriculum Committee", "chair")?.advanceTo,
    ).toBe("Articulation Review");
    expect(
      getApprovalDecision("Articulation Review", "articulation")?.advanceTo,
    ).toBe("Approved");
    expect(getApprovalDecision("Articulation Review", "chair")).toBeNull();
    expect(getApprovalDecision("Draft", "admin")).toBeNull();
  });

  it.each([
    ["faculty", "Draft", null],
    ["faculty", "Department Review", null],
    ["faculty", "Curriculum Committee", null],
    ["faculty", "Articulation Review", null],
    ["faculty", "Approved", null],
    ["chair", "Draft", null],
    ["chair", "Department Review", "Curriculum Committee"],
    ["chair", "Curriculum Committee", "Articulation Review"],
    ["chair", "Articulation Review", null],
    ["chair", "Approved", null],
    ["articulation", "Draft", null],
    ["articulation", "Department Review", null],
    ["articulation", "Curriculum Committee", null],
    ["articulation", "Articulation Review", "Approved"],
    ["articulation", "Approved", null],
    ["admin", "Draft", null],
    ["admin", "Department Review", "Curriculum Committee"],
    ["admin", "Curriculum Committee", "Articulation Review"],
    ["admin", "Articulation Review", "Approved"],
    ["admin", "Approved", null],
  ] as const)(
    "limits %s at %s to the next legal review transition",
    (role, status, target) => {
      expect(getApprovalDecision(status, role)?.advanceTo ?? null).toBe(target);
    },
  );

  it("allows a Faculty persona or the record owner to submit a draft", () => {
    const course = {
      status: "Draft",
      createdBy: "11111111-1111-4111-8111-111111111111",
    } as const;

    expect(
      getCourseSubmissionAvailability(course, {
        id: "22222222-2222-4222-8222-222222222222",
        role: "faculty",
      }),
    ).toEqual({ allowed: true, reason: null });
    expect(
      getCourseSubmissionAvailability(course, {
        id: course.createdBy,
        role: "admin",
      }),
    ).toEqual({ allowed: true, reason: null });
  });

  it("explains why a non-owner reviewer cannot submit a draft", () => {
    const availability = getCourseSubmissionAvailability(
      {
        status: "Draft",
        createdBy: "11111111-1111-4111-8111-111111111111",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "chair",
      },
    );

    expect(availability.allowed).toBe(false);
    expect(availability.reason).toMatch(/Faculty persona or this record's owner/);
  });

  it("rejects submission when the course is no longer a draft", () => {
    expect(
      getCourseSubmissionAvailability(
        {
          status: "Department Review",
          createdBy: "11111111-1111-4111-8111-111111111111",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "faculty",
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "Only a draft course can be submitted for department review.",
    });
  });

  it("requires an active demo persona before draft submission", () => {
    expect(
      getCourseSubmissionAvailability(
        {
          status: "Draft",
          createdBy: "11111111-1111-4111-8111-111111111111",
        },
        null,
      ),
    ).toEqual({
      allowed: false,
      reason: "Choose an active demo persona before submitting this draft.",
    });
  });

  it("requires a substantive note when returning a course", () => {
    expect(canConfirmApprovalAction("return", "   ")).toBe(false);
    expect(canConfirmApprovalAction("return", "Revise the hours table.")).toBe(
      true,
    );
    expect(canConfirmApprovalAction("advance", "")).toBe(true);
  });
});
