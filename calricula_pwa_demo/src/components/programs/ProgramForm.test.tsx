import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ai", () => ({
  ProgramAIControls: ({
    onApply,
  }: {
    onApply: (value: string) => void;
  }) => (
    <button onClick={() => onApply("AI narrative")} type="button">
      Apply test AI narrative
    </button>
  ),
}));

import {
  ProgramForm,
  programToDraft,
  validateProgramDraft,
} from "./ProgramForm";

const departments = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    divisionId: "22222222-2222-4222-8222-222222222222",
    code: "CS",
    name: "Computer Science",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  },
] as const;

const topCodes = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    code: "0707.00",
    title: "Computer Information Systems",
    vocational: true,
    parentCode: null,
  },
] as const;

const initialProgram = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Data Analytics",
  type: "Certificate",
  catalogDescription: "A focused certificate.",
  totalUnits: "18",
  status: "Draft",
  topCode: "0707.00",
  cipCode: "11.0301",
  programNarrative: "",
  isHighUnitMajor: false,
  departmentId: departments[0].id,
  createdBy: "55555555-5555-4555-8555-555555555555",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
} as const;

describe("program authoring validation", () => {
  it("requires a title and owning department", () => {
    const errors = validateProgramDraft(programToDraft());
    expect(errors.title).toBeTruthy();
    expect(errors.departmentId).toBeTruthy();
  });

  it("accepts canonical TOP and CIP codes", () => {
    const draft = {
      ...programToDraft(),
      title: "Computer Science",
      departmentId: "department-id",
      topCode: "0707.00",
      cipCode: "11.0701",
    };
    expect(validateProgramDraft(draft)).toEqual({});
  });

  it("rejects malformed classification codes", () => {
    const draft = {
      ...programToDraft(),
      title: "Computer Science",
      departmentId: "department-id",
      topCode: "707",
      cipCode: "110701",
    };
    const errors = validateProgramDraft(draft);
    expect(errors.topCode).toBeTruthy();
    expect(errors.cipCode).toBeTruthy();
  });

  it("shows a validation summary and does not submit an empty create form", () => {
    const submit = vi.fn();
    render(
      <ProgramForm
        departments={departments}
        mode="create"
        onSubmit={submit}
        topCodes={topCodes}
      />,
    );

    fireEvent.submit(screen.getByTestId("program-form"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Review the highlighted fields.",
    );
    expect(screen.getAllByText(/Enter a program title/)).toHaveLength(2);
    expect(screen.getAllByText(/^Select a department\.$/)).toHaveLength(2);
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Apply test AI narrative" }),
    ).not.toBeInTheDocument();
  });

  it("submits trimmed valid values and clears corrected errors", async () => {
    const submit = vi.fn();
    render(
      <ProgramForm
        departments={departments}
        mode="create"
        onSubmit={submit}
        topCodes={topCodes}
      />,
    );
    fireEvent.change(screen.getByLabelText("Program title"), {
      target: { value: "  Data Science  " },
    });
    fireEvent.change(screen.getByLabelText("Owning department"), {
      target: { value: departments[0].id },
    });
    fireEvent.change(screen.getByLabelText("TOP code"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create program" }));
    expect(screen.getAllByText(/TOP code format/)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("TOP code"), {
      target: { value: "0707.00" },
    });
    fireEvent.change(screen.getByLabelText("CIP code"), {
      target: { value: "11.0301" },
    });
    fireEvent.change(screen.getByLabelText("Catalog description"), {
      target: { value: "  Catalog copy  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create program" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Data Science",
          departmentId: departments[0].id,
          topCode: "0707.00",
          cipCode: "11.0301",
          catalogDescription: "Catalog copy",
        }),
      ),
    );
  });

  it("applies AI narrative text only while editing a mutable program", () => {
    const { rerender } = render(
      <ProgramForm
        departments={departments}
        initialProgram={initialProgram}
        mode="edit"
        onSubmit={vi.fn()}
        topCodes={topCodes}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply test AI narrative" }),
    );
    expect(screen.getByLabelText("Program narrative")).toHaveValue(
      "AI narrative",
    );

    rerender(
      <ProgramForm
        departments={departments}
        initialProgram={{ ...initialProgram, status: "Approved" }}
        mode="edit"
        onSubmit={vi.fn()}
        topCodes={topCodes}
      />,
    );
    expect(screen.getByText(/approved record is read-only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save program" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Apply test AI narrative" }),
    ).not.toBeInTheDocument();
  });

  it("publishes every local draft change and keeps it through a live-record refresh", () => {
    const onDraftChange = vi.fn();
    const { rerender } = render(
      <ProgramForm
        departments={departments}
        initialProgram={initialProgram}
        mode="edit"
        onDraftChange={onDraftChange}
        onSubmit={vi.fn()}
        topCodes={topCodes}
      />,
    );

    fireEvent.change(screen.getByLabelText("Program title"), {
      target: { value: "Locally edited analytics" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply test AI narrative" }),
    );

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Locally edited analytics",
        programNarrative: "AI narrative",
      }),
    );

    rerender(
      <ProgramForm
        departments={departments}
        initialProgram={{
          ...initialProgram,
          title: "Repository refresh title",
          updatedAt: "2026-07-30T00:01:00.000Z",
        }}
        mode="edit"
        onDraftChange={onDraftChange}
        onSubmit={vi.fn()}
        topCodes={topCodes}
      />,
    );

    expect(screen.getByLabelText("Program title")).toHaveValue(
      "Locally edited analytics",
    );
    expect(screen.getByLabelText("Program narrative")).toHaveValue(
      "AI narrative",
    );
  });

  it("renders external error and saving states", () => {
    render(
      <ProgramForm
        departments={departments}
        error="Local save failed."
        initialProgram={initialProgram}
        mode="edit"
        onSubmit={vi.fn()}
        saving
        topCodes={topCodes}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Local save failed.");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
