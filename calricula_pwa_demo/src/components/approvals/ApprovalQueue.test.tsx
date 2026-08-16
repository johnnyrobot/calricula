import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useActivePersona = vi.hoisted(() => vi.fn());
const useCourse = vi.hoisted(() => vi.fn());
const useAllCourses = vi.hoisted(() => vi.fn());
const useReferences = vi.hoisted(() => vi.fn());
const actionPanel = vi.hoisted(() => vi.fn());

vi.mock("../../lib/data", () => ({
  useActivePersona,
  useCourse,
  useAllCourses,
  useReferences,
}));

vi.mock("./ApprovalActionPanel", () => ({
  ApprovalActionPanel: (props: {
    actor: { fullName: string };
    aggregate: { course: { title: string } };
    onComplete: () => void;
  }) => {
    actionPanel(props);
    return (
      <div>
        <p>
          Action panel for {props.aggregate.course.title} by{" "}
          {props.actor.fullName}
        </p>
        <button onClick={props.onComplete} type="button">
          Complete review
        </button>
      </div>
    );
  },
}));

import { ApprovalQueue } from "./ApprovalQueue";

const chair = {
  id: "70000000-0000-4000-8000-000000000001",
  email: "chair@example.invalid",
  fullName: "Demo Department Chair",
  role: "chair",
  departmentId: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
};
const faculty = {
  ...chair,
  id: "70000000-0000-4000-8000-000000000002",
  email: "faculty@example.invalid",
  fullName: "Demo Faculty Author",
  role: "faculty",
};

function course(
  id: string,
  courseNumber: string,
  title: string,
  status:
    | "Draft"
    | "Department Review"
    | "Curriculum Committee"
    | "Articulation Review"
    | "Approved",
) {
  return {
    id,
    lineageId: id,
    subjectCode: "CIS",
    courseNumber,
    title,
    catalogDescription: `${title} description`,
    units: "3",
    minimumUnits: null,
    maximumUnits: null,
    lectureHours: "3",
    labHours: "0",
    activityHours: "0",
    tbaHours: "0",
    outsideOfClassHours: "6",
    totalStudentLearningHours: "162",
    topCode: "0707.00",
    status,
    version: 1,
    effectiveTerm: null,
    ccnCode: null,
    cId: null,
    cbCodes: {},
    transferability: {},
    geApplicability: {},
    lmiData: null,
    departmentId: "70000000-0000-4000-8000-000000000010",
    createdBy: faculty.id,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    approvedAt: null,
  };
}

const departmentReview = course(
  "70000000-0000-4000-8000-000000000003",
  "101",
  "Introduction to Programming",
  "Department Review",
);
const curriculumReview = course(
  "70000000-0000-4000-8000-000000000004",
  "110",
  "Programming Logic",
  "Curriculum Committee",
);
const articulationReview = course(
  "70000000-0000-4000-8000-000000000005",
  "120",
  "Web Development",
  "Articulation Review",
);
const draft = course(
  "70000000-0000-4000-8000-000000000006",
  "130",
  "Data Structures",
  "Draft",
);

function queryState<T>(data: T) {
  return {
    data,
    error: null,
    loading: false,
    refresh: vi.fn(),
  };
}

describe("ApprovalQueue", () => {
  beforeEach(() => {
    useActivePersona.mockReset();
    useCourse.mockReset();
    useAllCourses.mockReset();
    useReferences.mockReset();
    actionPanel.mockReset();

    useActivePersona.mockReturnValue(queryState(chair));
    useAllCourses.mockReturnValue(
      queryState([
          departmentReview,
          curriculumReview,
          articulationReview,
          draft,
        ]),
    );
    useReferences.mockReturnValue(
      queryState({
        divisions: [],
        departments: [
          {
            id: "70000000-0000-4000-8000-000000000010",
            divisionId: "70000000-0000-4000-8000-000000000011",
            code: "CIS",
            name: "Computer Information Systems",
            createdAt: "2026-07-29T00:00:00.000Z",
            updatedAt: "2026-07-29T00:00:00.000Z",
          },
        ],
        topCodes: [],
        ccnStandards: [],
      }),
    );
    useCourse.mockImplementation((id: string | null) =>
      queryState(
        id
          ? {
              course: [
                departmentReview,
                curriculumReview,
                articulationReview,
              ].find((item) => item.id === id),
              slos: [{ id: "slo-1" }],
              comments: [
                { id: "comment-1", resolved: false },
                { id: "comment-2", resolved: true },
              ],
              content: [],
              requisites: [],
              history: [],
              ccnJustification: null,
            }
          : null,
      ),
    );
  });

  it("shows loading and data-source failure states", () => {
    useActivePersona.mockReturnValue({
      ...queryState(null),
      loading: true,
    });
    const { unmount } = render(<ApprovalQueue />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing the approval docket",
    );
    unmount();

    useActivePersona.mockReturnValue({
      ...queryState(null),
      error: new Error("Persona settings could not be read."),
    });
    render(<ApprovalQueue />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Persona settings could not be read.",
    );
  });

  it("requires an active persona", () => {
    useActivePersona.mockReturnValue(queryState(null));
    render(<ApprovalQueue />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No active demo persona",
    );
  });

  it("explains that faculty have no reviewer docket", () => {
    useActivePersona.mockReturnValue(queryState(faculty));
    render(<ApprovalQueue />);

    expect(
      screen.getByRole("heading", {
        name: "Faculty authoring has no approval queue",
      }),
    ).toBeVisible();
    expect(screen.getByText("0 records assigned")).toBeVisible();
    expect(screen.queryByTestId("approval-card")).not.toBeInTheDocument();
  });

  it("filters chair work to the two chair stages and opens a selected review", () => {
    render(<ApprovalQueue />);

    expect(screen.getByText("2 records assigned")).toBeVisible();
    expect(screen.getAllByTestId("approval-card")).toHaveLength(2);
    expect(screen.getByText("Introduction to Programming")).toBeVisible();
    expect(screen.getByText("Programming Logic")).toBeVisible();
    expect(screen.queryByText("Web Development")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Select a record to review" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", {
        name: /CIS 101.*Introduction to Programming/s,
      }),
    );
    expect(useCourse).toHaveBeenLastCalledWith(departmentReview.id);
    expect(screen.getByTestId("review-course")).toHaveTextContent(
      "Introduction to Programming description",
    );
    expect(screen.getByTestId("review-course")).toHaveTextContent("1");
    expect(actionPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: chair,
        aggregate: expect.objectContaining({
          course: departmentReview,
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete review" }));
    expect(
      screen.getByRole("heading", { name: "Select a record to review" }),
    ).toBeVisible();
  });

  it("renders empty role queues without implying a workflow failure", () => {
    useAllCourses.mockReturnValue(
      queryState([draft]),
    );
    render(<ApprovalQueue />);
    expect(
      screen.getByText(
        "No courses are waiting at this role's review stage.",
      ),
    ).toBeVisible();
  });

  it("surfaces a selected course read failure", () => {
    useCourse.mockImplementation((id: string | null) =>
      id
        ? {
            ...queryState(null),
            error: new Error("The course was reset in another tab."),
          }
        : queryState(null),
    );
    render(<ApprovalQueue />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /CIS 101.*Introduction to Programming/s,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The course was reset in another tab.",
    );
  });
});
