import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_COMPLIANCE_SOURCE_PACK,
} from "../../lib/ai";
// Deep import on purpose: the raw session marker is not part of the
// package surface, so reaching it is visible here and greppable.
import { markAISessionReady } from "../../lib/ai/session";

import {
  buildCourseAITaskInput,
  CourseAIControls,
  unwrapCourseAITaskValue,
} from "./CourseAIControls";

const aiUiState = vi.hoisted(() => ({ online: true }));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => aiUiState.online,
}));

const course = {
  id: "11111111-1111-4111-8111-111111111111",
  lineageId: "22222222-2222-4222-8222-222222222222",
  subjectCode: "CS",
  courseNumber: "101",
  title: "Introduction to Programming",
  catalogDescription: "Programming foundations.",
  units: "4",
  minimumUnits: null,
  maximumUnits: null,
  lectureHours: "54",
  labHours: "18",
  activityHours: "0",
  tbaHours: "0",
  outsideOfClassHours: "108",
  totalStudentLearningHours: "180",
  topCode: "0707.00",
  status: "Draft",
  version: 1,
  effectiveTerm: null,
  ccnCode: null,
  cId: null,
  cbCodes: {},
  transferability: {},
  geApplicability: {},
  lmiData: null,
  departmentId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  approvedAt: null,
} as const;

describe("CourseAIControls response normalization", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    aiUiState.online = true;
    markAISessionReady();
  });

  it.each([
    ["catalog-description", { description: "Catalog copy" }, "Catalog copy"],
    ["content-outline", { topics: ["Origins", "Methods"] }, ["Origins", "Methods"]],
    ["top-code", { suggestions: [{ code: "0707.10" }] }, [{ code: "0707.10" }]],
  ] as const)("unwraps the Worker response for %s", (task, data, expected) => {
    expect(unwrapCourseAITaskValue(task, data)).toEqual(expected);
  });

  it("retains the full compliance record so citations remain visible", () => {
    const response = {
      explanation: "Review the credit-hour calculation.",
      recommendations: ["Reconcile the hours table."],
      citations: [{ sourceId: "title5-credit-hour" }],
      humanReviewRequired: true,
    };

    expect(
      unwrapCourseAITaskValue("compliance-explanation", response),
    ).toBe(response);
  });

  it("minimizes course data and exposes contact hours for output validation", () => {
    const input = buildCourseAITaskInput(course, "content-outline");
    expect(input).toMatchObject({
      title: "Introduction to Programming",
      contactHours: 72,
    });
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("createdBy");
  });

  it("builds compliance and general inputs without leaking identifiers", () => {
    expect(
      buildCourseAITaskInput(course, "compliance-explanation", {
        finding: "Review hours",
      }),
    ).toMatchObject({
      units: 4,
      totalStudentLearningHours: 180,
      lectureHours: 54,
      context: { finding: "Review hours" },
    });
    expect(buildCourseAITaskInput(course, "slos")).toMatchObject({
      title: course.title,
      topCode: course.topCode,
    });
    expect(
      buildCourseAITaskInput(
        {
          ...course,
          units: "not-a-number",
          lectureHours: "0",
          labHours: "0",
        },
        "content-outline",
      ),
    ).not.toHaveProperty("contactHours");
  });

  it("renders and applies TOP suggestions with local artifact metadata", async () => {
    const onApply = vi.fn();
    render(
      <CourseAIControls
        course={course}
        onApply={onApply}
        request={vi.fn().mockResolvedValue({
          data: {
            suggestions: [
              {
                code: "0707.00",
                title: "Computer Information Systems",
                rationale: "The course emphasizes applied programming.",
                confidence: 0.91,
              },
            ],
          },
          model: "free-model",
          requestId: "top-request",
        })}
        task="top-code"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText(/Computer Information Systems/)).toBeInTheDocument();
    expect(screen.getByText("91% confidence")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply suggestion" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", {
        name: /0707.00.*Computer Information Systems/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "0707.00",
          title: "Computer Information Systems",
        }),
      ),
    );
  });

  it("renders structured content-outline topics", async () => {
    render(
      <CourseAIControls
        course={course}
        onApply={vi.fn()}
        request={vi.fn().mockResolvedValue({
          data: {
            topics: [
              {
                sequence: 1,
                topic: "Programming foundations",
                contactHours: 72,
                relatedSloNumbers: [1],
              },
            ],
          },
          model: null,
          requestId: null,
        })}
        task="content-outline"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("Programming foundations")).toBeInTheDocument();
    expect(screen.getByText("72 contact hours")).toBeInTheDocument();
  });

  it("renders compliance recommendations and verified citations", async () => {
    const source = AI_COMPLIANCE_SOURCE_PACK["title5-credit-hour"];
    render(
      <CourseAIControls
        course={course}
        onApply={vi.fn()}
        request={vi.fn().mockResolvedValue({
          data: {
            explanation: "Review the unit calculation.",
            recommendations: ["Reconcile the hours table."],
            citations: [
              {
                sourceId: "title5-credit-hour",
                ...source,
                supports: "Defines the credit hour.",
              },
            ],
            humanReviewRequired: true,
          },
          model: null,
          requestId: null,
        })}
        task="compliance-explanation"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );

    expect(await screen.findByText("Review the unit calculation.")).toBeInTheDocument();
    expect(screen.getByText("Reconcile the hours table.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: source.sourceTitle }),
    ).toHaveAttribute(
      "href",
      source.url,
    );
    expect(screen.getByText(/Human review is required/i)).toBeInTheDocument();
  });
});
