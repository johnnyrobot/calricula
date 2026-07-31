import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, ProgramAggregate } from "../../lib/domain";

const reorderProgramCourses = vi.hoisted(() => vi.fn());
const useCourses = vi.hoisted(() => vi.fn());

vi.mock("../../lib/data", () => ({
  curriculumRepository: { reorderProgramCourses },
  useCourses,
}));

import { ProgramCourseBuilder } from "./ProgramCourseBuilder";
import { flushPendingWork } from "../../lib/pwa/pending-work";

function course(
  id: string,
  courseNumber: string,
  title: string,
  units = "3",
): Course {
  return {
    id,
    lineageId: id,
    subjectCode: "CIS",
    courseNumber,
    title,
    catalogDescription: null,
    units,
    minimumUnits: null,
    maximumUnits: null,
    lectureHours: "3",
    labHours: "0",
    activityHours: "0",
    tbaHours: "0",
    outsideOfClassHours: "6",
    totalStudentLearningHours: "162",
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
    departmentId: "30000000-0000-4000-8000-000000000010",
    createdBy: "30000000-0000-4000-8000-000000000011",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    approvedAt: null,
  };
}

const first = course(
  "30000000-0000-4000-8000-000000000001",
  "101",
  "Introduction to Programming",
);
const second = course(
  "30000000-0000-4000-8000-000000000002",
  "110",
  "Programming Logic",
  "4",
);
const third = course(
  "30000000-0000-4000-8000-000000000003",
  "120",
  "Web Development",
);

function aggregate(): ProgramAggregate {
  return {
    program: {
      id: "30000000-0000-4000-8000-000000000004",
      title: "Computer Science",
      type: "AS",
      catalogDescription: null,
      totalUnits: "7",
      status: "Draft",
      topCode: "0707.00",
      cipCode: "11.0701",
      programNarrative: null,
      isHighUnitMajor: false,
      departmentId: "30000000-0000-4000-8000-000000000010",
      createdBy: "30000000-0000-4000-8000-000000000011",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    courses: [
      {
        id: "30000000-0000-4000-8000-000000000005",
        programId: "30000000-0000-4000-8000-000000000004",
        courseId: first.id,
        requirementType: "Required Core",
        sequence: 1,
        unitsApplied: "3",
        course: first,
      },
      {
        id: "30000000-0000-4000-8000-000000000006",
        programId: "30000000-0000-4000-8000-000000000004",
        courseId: second.id,
        requirementType: "List A",
        sequence: 2,
        unitsApplied: "4",
        course: second,
      },
    ],
    comments: [],
    history: [],
  };
}

describe("ProgramCourseBuilder", () => {
  beforeEach(() => {
    reorderProgramCourses.mockReset();
    reorderProgramCourses.mockResolvedValue(aggregate());
    useCourses.mockReset();
    useCourses.mockReturnValue({
      data: {
        items: [first, second, third],
        total: 3,
        page: 1,
        pageSize: 100,
        pageCount: 1,
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reorders, edits, and persists the exact requirement list", async () => {
    render(<ProgramCourseBuilder aggregate={aggregate()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Move Programming Logic up",
      }),
    );
    const unitInputs = screen.getAllByLabelText("Applied units");
    fireEvent.change(unitInputs[0]!, { target: { value: "4.5" } });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    let flushed = false;
    await act(async () => {
      flushed = await flushPendingWork();
    });

    expect(flushed).toBe(true);
    expect(reorderProgramCourses).toHaveBeenCalledWith(
      aggregate().program.id,
      [
        {
          courseId: second.id,
          requirementType: "List A",
          sequence: 1,
          unitsApplied: "4.5",
        },
        {
          courseId: first.id,
          requirementType: "Required Core",
          sequence: 2,
          unitsApplied: "3",
        },
      ],
    );
    expect(screen.getByText("Course requirements saved.")).toBeVisible();
  });

  it("adds an unselected course with its requirement type and removes rows", async () => {
    render(<ProgramCourseBuilder aggregate={aggregate()} />);

    const courseSelect = screen.getByLabelText("Add a course");
    expect(
      screen.queryByRole("option", { name: /Introduction to Programming/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(courseSelect, { target: { value: third.id } });
    fireEvent.change(screen.getByLabelText("Requirement"), {
      target: { value: "GE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/CIS 120 — Web Development/)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Introduction to Programming",
      }),
    );
    await act(async () => {
      expect(await flushPendingWork()).toBe(true);
    });

    expect(reorderProgramCourses).toHaveBeenCalledWith(
      aggregate().program.id,
      [
        expect.objectContaining({
          courseId: second.id,
          requirementType: "List A",
          sequence: 1,
        }),
        expect.objectContaining({
          courseId: third.id,
          requirementType: "GE",
          sequence: 2,
          unitsApplied: "3",
        }),
      ],
    );
  });

  it("retains and exports quota-failed rows, then retries the latest snapshot", async () => {
    reorderProgramCourses.mockRejectedValueOnce(
      new DOMException("Quota exceeded.", "QuotaExceededError"),
    );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:program-requirements");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<ProgramCourseBuilder aggregate={aggregate()} />);

    fireEvent.change(screen.getAllByLabelText("Applied units")[0]!, {
      target: { value: "4.75" },
    });
    let flushed = true;
    await act(async () => {
      flushed = await flushPendingWork();
    });

    expect(flushed).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local storage is full",
    );
    expect(screen.getAllByLabelText("Applied units")[0]).toHaveValue("4.75");

    fireEvent.click(
      screen.getByRole("button", { name: "Export unsaved draft" }),
    );
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith(
      "blob:program-requirements",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(reorderProgramCourses).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    expect(reorderProgramCourses).toHaveBeenLastCalledWith(
      aggregate().program.id,
      expect.arrayContaining([
        expect.objectContaining({
          courseId: first.id,
          unitsApplied: "4.75",
        }),
      ]),
    );
  });

  it("saves edits made while an earlier write is still in flight", async () => {
    let resolveFirst: (() => void) | undefined;
    reorderProgramCourses
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(aggregate());
    render(<ProgramCourseBuilder aggregate={aggregate()} />);

    fireEvent.change(screen.getAllByLabelText("Applied units")[0]!, {
      target: { value: "3.5" },
    });
    let flushPromise: Promise<boolean> | undefined;
    act(() => {
      flushPromise = flushPendingWork();
    });
    await waitFor(() => expect(reorderProgramCourses).toHaveBeenCalledOnce());

    fireEvent.change(screen.getAllByLabelText("Applied units")[0]!, {
      target: { value: "4.25" },
    });
    await act(async () => {
      resolveFirst?.();
      expect(await flushPromise).toBe(true);
    });

    expect(reorderProgramCourses).toHaveBeenCalledTimes(2);
    expect(reorderProgramCourses).toHaveBeenLastCalledWith(
      aggregate().program.id,
      expect.arrayContaining([
        expect.objectContaining({
          courseId: first.id,
          unitsApplied: "4.25",
        }),
      ]),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("prevents any requirement mutation for approved programs", () => {
    render(<ProgramCourseBuilder aggregate={aggregate()} disabled />);

    expect(screen.getByRole("button", { name: "Save requirements" })).toBeDisabled();
    expect(screen.queryByLabelText("Add a course")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Applied units")[0]).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: "Remove Introduction to Programming",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders empty and unavailable-course states", () => {
    const empty = { ...aggregate(), courses: [] };
    const { rerender } = render(<ProgramCourseBuilder aggregate={empty} />);
    expect(
      screen.getByText("No courses are assigned to this program yet."),
    ).toBeVisible();

    const unavailable = {
      ...aggregate(),
      courses: [
        {
          ...aggregate().courses[0]!,
          course: null,
        },
      ],
    } as unknown as ProgramAggregate;
    rerender(<ProgramCourseBuilder aggregate={unavailable} key="missing" />);
    expect(screen.getByText("Course record unavailable")).toBeVisible();
  });
});
