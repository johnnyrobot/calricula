import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateProgram = vi.hoisted(() => vi.fn());
const useProgram = vi.hoisted(() => vi.fn());
const useReferences = vi.hoisted(() => vi.fn());
const programFormProps = vi.hoisted(() => vi.fn());
const builderProps = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: vi.fn() }));
const pendingWork = vi.hoisted(() => {
  let flusher: (() => Promise<boolean | void>) | null = null;
  return {
    reset: () => {
      flusher = null;
    },
    registerPendingWorkFlusher: vi.fn(
      (candidate: () => Promise<boolean | void>) => {
        flusher = candidate;
        return () => {
          if (flusher === candidate) flusher = null;
        };
      },
    ),
    flushPendingWork: vi.fn(async () => {
      if (!flusher) return true;
      try {
        return (await flusher()) !== false;
      } catch {
        return false;
      }
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("../../lib/data", () => ({
  curriculumRepository: { updateProgram },
  useProgram,
  useReferences,
}));

vi.mock("../../lib/pwa/pending-work", () => ({
  flushPendingWork: pendingWork.flushPendingWork,
  registerPendingWorkFlusher: pendingWork.registerPendingWorkFlusher,
}));

vi.mock("./ProgramForm", () => ({
  programToDraft: (program?: {
    title?: string;
    type?: string;
    departmentId?: string;
    catalogDescription?: string | null;
    topCode?: string | null;
    cipCode?: string | null;
    programNarrative?: string | null;
    isHighUnitMajor?: boolean;
  }) => ({
    title: program?.title ?? "",
    type: program?.type ?? "AA",
    departmentId: program?.departmentId ?? "",
    catalogDescription: program?.catalogDescription ?? "",
    topCode: program?.topCode ?? "",
    cipCode: program?.cipCode ?? "",
    programNarrative: program?.programNarrative ?? "",
    isHighUnitMajor: program?.isHighUnitMajor ?? false,
  }),
  ProgramForm: (props: {
    initialProgram: {
      title: string;
      type: string;
      departmentId: string;
      catalogDescription: string | null;
      topCode: string | null;
      cipCode: string | null;
      programNarrative: string | null;
      isHighUnitMajor: boolean;
    };
    onDraftChange: (draft: {
      title: string;
      type: string;
      departmentId: string;
      catalogDescription: string;
      topCode: string;
      cipCode: string;
      programNarrative: string;
      isHighUnitMajor: boolean;
    }) => void;
    onSubmit: (draft: {
      title: string;
      type: string;
      departmentId: string;
      catalogDescription: string;
      topCode: string;
      cipCode: string;
      programNarrative: string;
      isHighUnitMajor: boolean;
    }) => Promise<void>;
  }) => {
    programFormProps(props);
    const draft = {
      title: props.initialProgram.title,
      type: props.initialProgram.type,
      departmentId: props.initialProgram.departmentId,
      catalogDescription: props.initialProgram.catalogDescription ?? "",
      topCode: props.initialProgram.topCode ?? "",
      cipCode: props.initialProgram.cipCode ?? "",
      programNarrative: props.initialProgram.programNarrative ?? "",
      isHighUnitMajor: props.initialProgram.isHighUnitMajor,
    };
    return (
      <div data-testid="mock-program-form">
        <label>
          Mock program title
          <input
            defaultValue={draft.title}
            onChange={(event) =>
              props.onDraftChange({ ...draft, title: event.target.value })
            }
          />
        </label>
        <button
          onClick={() =>
            void props.onSubmit({
              ...draft,
              title: "Updated program",
              catalogDescription: " ",
              topCode: " ",
              cipCode: " ",
              programNarrative: " ",
            })
          }
          type="button"
        >
          Save mock program
        </button>
        <a href="/programs/">Back to programs</a>
      </div>
    );
  },
}));

vi.mock("./ProgramCourseBuilder", () => ({
  ProgramCourseBuilder: (props: { disabled: boolean }) => {
    builderProps(props);
    return (
      <div data-testid="mock-course-builder">
        <p>
          {props.disabled ? "Requirements locked" : "Requirements editable"}
        </p>
        <label>
          Mock applied units
          <input defaultValue="3" />
        </label>
      </div>
    );
  },
}));

import { flushPendingWork } from "../../lib/pwa/pending-work";
import { ProgramEditor } from "./ProgramEditor";

const programId = "50000000-0000-4000-8000-000000000002";
const aggregate = {
  program: {
    id: programId,
    title: "Computer Science",
    type: "AS",
    catalogDescription: "Description",
    totalUnits: "3",
    status: "Draft",
    topCode: "0707.00",
    cipCode: "11.0701",
    programNarrative: "Narrative",
    isHighUnitMajor: false,
    departmentId: "50000000-0000-4000-8000-000000000001",
    createdBy: "50000000-0000-4000-8000-000000000003",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
  courses: [
    {
      id: "50000000-0000-4000-8000-000000000004",
      programId,
      courseId: "50000000-0000-4000-8000-000000000005",
      requirementType: "Required Core",
      sequence: 1,
      unitsApplied: "3",
      course: {
        subjectCode: "CIS",
        courseNumber: "101",
        title: "Introduction to Programming",
      },
    },
  ],
  comments: [],
  history: [],
};
const references = {
  divisions: [],
  departments: [],
  topCodes: [],
  ccnStandards: [],
};

describe("ProgramEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingWork.reset();
    updateProgram.mockReset();
    updateProgram.mockResolvedValue(aggregate);
    useProgram.mockReturnValue({
      data: aggregate,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    useReferences.mockReturnValue({
      data: references,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading, error, and missing-record states", () => {
    useProgram.mockReturnValueOnce({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });
    const { rerender } = render(<ProgramEditor programId={programId} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening program record",
    );

    useProgram.mockReturnValue({
      data: null,
      error: new Error("IndexedDB read failed."),
      loading: false,
      refresh: vi.fn(),
    });
    rerender(<ProgramEditor programId={`${programId}-error`} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "IndexedDB read failed.",
    );

    useProgram.mockReturnValue({
      data: null,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    rerender(<ProgramEditor programId={`${programId}-missing`} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Program not found");
  });

  it("passes a minimal ordered-course context and editable state to children", () => {
    render(<ProgramEditor programId={programId} />);

    expect(programFormProps).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "edit",
        initialProgram: aggregate.program,
        aiContext: {
          courses: [
            {
              requirementType: "Required Core",
              sequence: 1,
              unitsApplied: "3",
              subjectCode: "CIS",
              courseNumber: "101",
              title: "Introduction to Programming",
            },
          ],
        },
      }),
    );
    expect(screen.getByTestId("mock-course-builder")).toHaveTextContent(
      "Requirements editable",
    );
  });

  it("flushes an autosave with normalized repository fields and reports Saved", async () => {
    updateProgram.mockResolvedValue(aggregate);
    render(<ProgramEditor programId={programId} />);

    fireEvent.change(screen.getByLabelText("Mock program title"), {
      target: { value: "  Updated program  " },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    let flushed = false;
    await act(async () => {
      flushed = await flushPendingWork();
    });

    expect(flushed).toBe(true);
    expect(updateProgram).toHaveBeenCalledWith(programId, {
      title: "Updated program",
      type: "AS",
      departmentId: "50000000-0000-4000-8000-000000000001",
      catalogDescription: "Description",
      topCode: "0707.00",
      cipCode: "11.0701",
      programNarrative: "Narrative",
      isHighUnitMajor: false,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("retains and exports a quota-failed draft, then retries it", async () => {
    updateProgram
      .mockRejectedValueOnce(
        new DOMException("Quota exceeded.", "QuotaExceededError"),
      )
      .mockResolvedValueOnce(aggregate);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:program-draft");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<ProgramEditor programId={programId} />);

    fireEvent.change(screen.getByLabelText("Mock program title"), {
      target: { value: "Unsaved local title" },
    });
    let flushed = true;
    await act(async () => {
      flushed = await flushPendingWork();
    });

    expect(flushed).toBe(false);
    expect(updateProgram).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local storage is full",
    );
    expect(screen.getByLabelText("Mock program title")).toHaveValue(
      "Unsaved local title",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Export unsaved draft" }),
    );
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:program-draft");

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(updateProgram).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    expect(updateProgram).toHaveBeenLastCalledWith(
      programId,
      expect.objectContaining({ title: "Unsaved local title" }),
    );
  });

  it("does not remount either editing section when live save data refreshes", () => {
    const { rerender } = render(<ProgramEditor programId={programId} />);
    fireEvent.change(screen.getByLabelText("Mock program title"), {
      target: { value: "Local program edit" },
    });
    fireEvent.change(screen.getByLabelText("Mock applied units"), {
      target: { value: "4.5" },
    });

    useProgram.mockReturnValue({
      data: {
        ...aggregate,
        program: {
          ...aggregate.program,
          title: "Repository refresh",
          updatedAt: "2026-07-29T00:01:00.000Z",
        },
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    rerender(<ProgramEditor programId={programId} />);

    expect(screen.getByLabelText("Mock program title")).toHaveValue(
      "Local program edit",
    );
    expect(screen.getByLabelText("Mock applied units")).toHaveValue("4.5");
  });

  it("blocks internal navigation when the pending draft cannot be saved", async () => {
    updateProgram.mockRejectedValue(new Error("IndexedDB transaction failed."));
    render(<ProgramEditor programId={programId} />);
    fireEvent.change(screen.getByLabelText("Mock program title"), {
      target: { value: "Pending title" },
    });

    fireEvent.click(
      screen.getByRole("link", { name: "Back to programs" }),
    );
    await waitFor(() => expect(updateProgram).toHaveBeenCalledOnce());

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  });

  it("keeps approved requirements immutable and surfaces update failures", async () => {
    useProgram.mockReturnValue({
      data: {
        ...aggregate,
        program: { ...aggregate.program, status: "Approved" },
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    updateProgram.mockRejectedValueOnce(
      new Error("Approved records are immutable."),
    );
    render(<ProgramEditor programId={programId} />);

    expect(screen.getByTestId("mock-course-builder")).toHaveTextContent(
      "Requirements locked",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save mock program" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Approved records are immutable.",
    );
  });
});
