import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Department, Program, TopCode } from "../../lib/domain";

vi.mock("../ai", () => ({
  ProgramAIControls: ({
    onApply,
  }: {
    onApply: (value: string) => void;
  }) => (
    <button onClick={() => onApply("AI-assisted narrative")} type="button">
      Apply AI narrative
    </button>
  ),
}));

import { ProgramForm } from "./ProgramForm";

const department = {
  id: "10000000-0000-4000-8000-000000000001",
  divisionId: "10000000-0000-4000-8000-000000000002",
  code: "CIS",
  name: "Computer Information Systems",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
} satisfies Department;

const topCode = {
  id: "10000000-0000-4000-8000-000000000003",
  code: "0707.00",
  title: "Computer Software Development",
  vocational: true,
  parentCode: null,
} satisfies TopCode;

const program = {
  id: "10000000-0000-4000-8000-000000000004",
  title: "Computer Science",
  type: "AS",
  catalogDescription: "Existing description",
  totalUnits: "18",
  status: "Draft",
  topCode: "0707.00",
  cipCode: "11.0701",
  programNarrative: "Existing narrative",
  isHighUnitMajor: false,
  departmentId: department.id,
  createdBy: "10000000-0000-4000-8000-000000000005",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
} satisfies Program;

describe("ProgramForm rendering and submission", () => {
  it("reports all invalid fields and does not submit", () => {
    const onSubmit = vi.fn();
    render(
      <ProgramForm
        departments={[department]}
        mode="create"
        onSubmit={onSubmit}
        topCodes={[topCode]}
      />,
    );

    fireEvent.change(screen.getByLabelText("TOP code"), {
      target: { value: "707" },
    });
    fireEvent.change(screen.getByLabelText("CIP code"), {
      target: { value: "110701" },
    });
    fireEvent.submit(screen.getByTestId("program-form"));

    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent(
      "Enter a program title with at least 3 characters.",
    );
    expect(summary).toHaveTextContent("Select a department.");
    expect(summary).toHaveTextContent("Use the TOP code format 0000.00.");
    expect(summary).toHaveTextContent("Use the CIP code format 00.0000.");
    expect(screen.getByLabelText("Program title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a normalized complete draft", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProgramForm
        departments={[department]}
        mode="create"
        onSubmit={onSubmit}
        topCodes={[topCode]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Program title"), {
      target: { value: "  Data Science  " },
    });
    fireEvent.change(screen.getByLabelText("Award type"), {
      target: { value: "Certificate" },
    });
    fireEvent.change(screen.getByLabelText("Owning department"), {
      target: { value: department.id },
    });
    fireEvent.change(screen.getByLabelText("Catalog description"), {
      target: { value: "  Applied data curriculum.  " },
    });
    fireEvent.change(screen.getByLabelText("TOP code"), {
      target: { value: " 0707.00 " },
    });
    fireEvent.change(screen.getByLabelText("CIP code"), {
      target: { value: " 11.0701 " },
    });
    fireEvent.click(screen.getByLabelText(/High-unit major/));
    fireEvent.change(screen.getByLabelText("Program narrative"), {
      target: { value: "  Workforce preparation.  " },
    });
    fireEvent.submit(screen.getByTestId("program-form"));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Data Science",
        type: "Certificate",
        departmentId: department.id,
        catalogDescription: "Applied data curriculum.",
        topCode: "0707.00",
        cipCode: "11.0701",
        programNarrative: "Workforce preparation.",
        isHighUnitMajor: true,
      }),
    );
  });

  it("applies an AI narrative only through the explicit review action", () => {
    render(
      <ProgramForm
        departments={[department]}
        initialProgram={program}
        mode="edit"
        onSubmit={vi.fn()}
        topCodes={[topCode]}
      />,
    );

    expect(screen.getByLabelText("Program narrative")).toHaveValue(
      "Existing narrative",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply AI narrative" }),
    );
    expect(screen.getByLabelText("Program narrative")).toHaveValue(
      "AI-assisted narrative",
    );
  });

  it("makes approved records immutable and omits AI editing controls", () => {
    render(
      <ProgramForm
        departments={[department]}
        initialProgram={{ ...program, status: "Approved" }}
        mode="edit"
        onSubmit={vi.fn()}
        topCodes={[topCode]}
      />,
    );

    expect(screen.getByText(/approved record is read-only/i)).toBeVisible();
    expect(screen.getByLabelText("Program title")).toBeDisabled();
    expect(screen.getByTestId("save-program")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Apply AI narrative" }),
    ).not.toBeInTheDocument();
  });

  it("shows a supplied save error and saving state", () => {
    render(
      <ProgramForm
        departments={[department]}
        error="Local storage is unavailable."
        initialProgram={program}
        mode="edit"
        onSubmit={vi.fn()}
        saving
        topCodes={[topCode]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local storage is unavailable.",
    );
    expect(screen.getByTestId("save-program")).toBeDisabled();
    expect(screen.getByTestId("save-program")).toHaveTextContent("Saving");
  });
});
