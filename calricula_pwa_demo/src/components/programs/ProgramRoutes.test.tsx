import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSearchParam = vi.hoisted(() => vi.fn());
const programEditor = vi.hoisted(() => vi.fn());
const programView = vi.hoisted(() => vi.fn());
const useProgram = vi.hoisted(() => vi.fn());
const useReferences = vi.hoisted(() => vi.fn());

vi.mock("../../lib/data", () => ({ useProgram, useReferences }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: getSearchParam }),
}));

vi.mock("./ProgramEditor", () => ({
  ProgramEditor: (props: { programId: string }) => {
    programEditor(props);
    return <p>Editor for {props.programId}</p>;
  },
}));

vi.mock("./ProgramView", () => ({
  ProgramView: (props: Record<string, unknown>) => {
    programView(props);
    return <p>View rendered</p>;
  },
}));

import { ProgramEditorRoute } from "./ProgramEditorRoute";
import { ProgramViewRoute } from "./ProgramViewRoute";

describe("program query-parameter routes", () => {
  beforeEach(() => {
    getSearchParam.mockReset();
    programEditor.mockReset();
    programView.mockReset();
    useProgram.mockReturnValue({
      data: {
        program: { departmentId: "department-1" },
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    useReferences.mockReturnValue({
      data: {
        departments: [{ id: "department-1", code: "CIS", name: "Computing" }],
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
  });

  it("renders an in-app missing-id state instead of failing", () => {
    getSearchParam.mockReturnValue(null);
    const { rerender } = render(<ProgramEditorRoute />);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a program");
    expect(screen.getByRole("link", { name: "View programs" })).toHaveAttribute(
      "href",
      "/programs",
    );

    rerender(<ProgramViewRoute />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No program identifier was supplied",
    );
  });

  it("passes a supplied id only to the matching route component", () => {
    getSearchParam.mockImplementation((key: string) =>
      key === "id" ? "local-program-id" : null,
    );
    const { rerender } = render(<ProgramEditorRoute />);
    expect(programEditor).toHaveBeenCalledWith({
      programId: "local-program-id",
    });

    rerender(<ProgramViewRoute />);
    expect(programView).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregate: { program: { departmentId: "department-1" } },
        department: { id: "department-1", code: "CIS", name: "Computing" },
        error: null,
        loading: false,
      }),
    );
  });

  it("resolves the department and forwards read failures to the view", () => {
    getSearchParam.mockReturnValue("local-program-id");
    useProgram.mockReturnValue({
      data: { program: { departmentId: "department-missing" } },
      error: new Error("Program read failed."),
      loading: false,
      refresh: vi.fn(),
    });

    render(<ProgramViewRoute />);

    expect(programView).toHaveBeenCalledWith(
      expect.objectContaining({
        department: null,
        error: new Error("Program read failed."),
      }),
    );
  });

  it("reports a read as loading while either source is still opening", () => {
    getSearchParam.mockReturnValue("local-program-id");
    useReferences.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });

    render(<ProgramViewRoute />);

    expect(programView).toHaveBeenCalledWith(
      expect.objectContaining({ loading: true }),
    );
  });
});
