import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProgramView } from "./ProgramView";

const programId = "60000000-0000-4000-8000-000000000001";
const departmentId = "60000000-0000-4000-8000-000000000002";

function course(
  id: string,
  courseNumber: string,
  title: string,
) {
  return {
    id,
    subjectCode: "CIS",
    courseNumber,
    title,
  };
}

const aggregate = {
  program: {
    id: programId,
    title: "Computer Science",
    type: "AS",
    catalogDescription: "Prepares students for software development.",
    totalUnits: "7",
    status: "Draft",
    topCode: "0707.00",
    cipCode: "11.0701",
    programNarrative: "Students progress from foundations to application.",
    isHighUnitMajor: false,
    departmentId,
    createdBy: "60000000-0000-4000-8000-000000000003",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
  courses: [
    {
      id: "60000000-0000-4000-8000-000000000004",
      programId,
      courseId: "60000000-0000-4000-8000-000000000005",
      requirementType: "Required Core",
      sequence: 2,
      unitsApplied: "4",
      course: course(
        "60000000-0000-4000-8000-000000000005",
        "110",
        "Programming Logic",
      ),
    },
    {
      id: "60000000-0000-4000-8000-000000000006",
      programId,
      courseId: "60000000-0000-4000-8000-000000000007",
      requirementType: "Required Core",
      sequence: 1,
      unitsApplied: "3",
      course: course(
        "60000000-0000-4000-8000-000000000007",
        "101",
        "Introduction to Programming",
      ),
    },
  ],
  comments: [
    {
      id: "60000000-0000-4000-8000-000000000008",
      entityType: "Program",
      entityId: programId,
      authorId: "60000000-0000-4000-8000-000000000003",
      section: "Narrative",
      content: "Clarify the transfer pathway.",
      resolved: false,
      resolvedAt: null,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  ],
  history: [],
};

const referenceState = {
  data: {
    divisions: [],
    departments: [
      {
        id: departmentId,
        divisionId: "60000000-0000-4000-8000-000000000009",
        code: "CIS",
        name: "Computer Information Systems",
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
    ],
    topCodes: [],
    ccnStandards: [],
  },
  error: null,
  loading: false,
  refresh: vi.fn(),
};

type ViewState = {
  data?: unknown;
  error?: Error | null;
  loading?: boolean;
};

function viewProps(state: ViewState = { data: aggregate }) {
  const data = (state.data ?? null) as {
    program: { departmentId: string };
  } | null;
  return {
    aggregate: data as never,
    department:
      referenceState.data.departments.find(
        (item) => item.id === data?.program.departmentId,
      ) ?? null,
    error: state.error ?? null,
    loading: state.loading ?? false,
  };
}

describe("ProgramView", () => {

  it("renders loading, failure, and not-found states", () => {
    const { rerender } = render(
      <ProgramView {...viewProps({ data: null, loading: true })} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening program record",
    );

    rerender(
      <ProgramView
        {...viewProps({ data: null, error: new Error("Program read failed.") })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Program read failed.");

    rerender(<ProgramView {...viewProps({ data: null })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Program not found");
    expect(screen.getByRole("link", { name: "View programs" })).toHaveAttribute(
      "href",
      "/programs",
    );
  });

  it("renders the catalog, comments, and sorted ordered requirements", () => {
    render(<ProgramView {...viewProps()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Computer Science",
    );
    expect(
      screen.getByText("CIS — Computer Information Systems"),
    ).toBeVisible();
    expect(screen.getByTestId("edit-program")).toHaveAttribute(
      "href",
      `/programs/edit?id=${programId}`,
    );
    expect(screen.getByText("Draft")).toHaveAttribute("data-status", "draft");
    expect(screen.getByText("7")).toBeVisible();
    expect(
      screen.getByText("Prepares students for software development."),
    ).toBeVisible();
    expect(
      screen.getByText("Clarify the transfer pathway."),
    ).toBeVisible();

    const requirements = screen.getByRole("region", {
      name: "Required Core",
    });
    const items = within(requirements).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("CIS 101");
    expect(items[1]).toHaveTextContent("CIS 110");
  });

  it("hides editing for approved programs and marks high-unit records", () => {
    render(<ProgramView {...viewProps({ data: {
        ...aggregate,
        program: {
          ...aggregate.program,
          status: "Approved",
          isHighUnitMajor: true,
        },
      } })} />);

    expect(screen.queryByTestId("edit-program")).not.toBeInTheDocument();
    expect(screen.getByText("Approved")).toHaveAttribute(
      "data-status",
      "approved",
    );
    expect(screen.getByText(/marked as a high-unit major/i)).toBeVisible();
  });

  it("provides explicit fallbacks for incomplete authoring records", () => {
    render(<ProgramView {...viewProps({ data: {
        ...aggregate,
        program: {
          ...aggregate.program,
          departmentId: "60000000-0000-4000-8000-000000000099",
          catalogDescription: null,
          programNarrative: null,
          topCode: null,
          cipCode: null,
        },
        courses: [],
        comments: [],
      } })} />);

    expect(screen.getByText("Department unavailable")).toBeVisible();
    expect(
      screen.getByText("No catalog description has been entered."),
    ).toBeVisible();
    expect(
      screen.getByText("No course requirements have been assigned."),
    ).toBeVisible();
    expect(
      screen.getByText("No program narrative has been entered."),
    ).toBeVisible();
    expect(screen.getAllByText("Not assigned")).toHaveLength(2);
  });
});
