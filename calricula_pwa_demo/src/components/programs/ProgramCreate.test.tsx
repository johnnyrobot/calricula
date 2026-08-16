import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createProgram = vi.hoisted(() => vi.fn());
const useReferences = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const programFormProps = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../../lib/data", () => ({
  curriculumRepository: { createProgram },
  useReferences,
}));

vi.mock("./ProgramForm", () => ({
  ProgramForm: (props: {
    saving: boolean;
    error: string | null;
    onSubmit: (value: unknown) => Promise<void>;
  }) => {
    programFormProps(props);
    return (
      <div>
        <p>{props.saving ? "Saving program" : "Ready to create"}</p>
        {props.error ? <p role="alert">{props.error}</p> : null}
        <button
          onClick={() =>
            void props.onSubmit({
              title: "Data Science",
              type: "Certificate",
              departmentId: "40000000-0000-4000-8000-000000000001",
              catalogDescription: "",
              topCode: "",
              cipCode: "",
              programNarrative: "",
              isHighUnitMajor: true,
            })
          }
          type="button"
        >
          Submit draft
        </button>
      </div>
    );
  },
}));

import { ProgramCreate } from "./ProgramCreate";

const references = {
  divisions: [],
  departments: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      divisionId: "40000000-0000-4000-8000-000000000002",
      code: "CIS",
      name: "Computer Information Systems",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  ],
  topCodes: [],
  ccnStandards: [],
};

describe("ProgramCreate", () => {
  beforeEach(() => {
    createProgram.mockReset();
    useReferences.mockReset();
    push.mockReset();
    programFormProps.mockReset();
    useReferences.mockReturnValue({
      data: references,
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
  });

  it("renders a loading state while reference data initializes", () => {
    useReferences.mockReturnValue({
      data: null,
      error: null,
      loading: true,
      refresh: vi.fn(),
    });
    render(<ProgramCreate />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading program reference data",
    );
  });

  it("shows reference failures and retries instead of remaining stuck loading", () => {
    const refresh = vi.fn();
    useReferences.mockReturnValue({
      data: null,
      error: new Error("Reference fixture failed validation."),
      loading: false,
      refresh,
    });
    render(<ProgramCreate />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reference fixture failed validation.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("creates a normalized repository input and opens the new editor", async () => {
    createProgram.mockResolvedValue({
      program: {
        id: "40000000-0000-4000-8000-000000000010",
      },
      courses: [],
      comments: [],
      history: [],
    });
    render(<ProgramCreate />);

    fireEvent.click(screen.getByRole("button", { name: "Submit draft" }));

    await waitFor(() =>
      expect(createProgram).toHaveBeenCalledWith({
        title: "Data Science",
        type: "Certificate",
        departmentId: "40000000-0000-4000-8000-000000000001",
        catalogDescription: null,
        topCode: null,
        cipCode: null,
        programNarrative: null,
        isHighUnitMajor: true,
      }),
    );
    expect(push).toHaveBeenCalledWith(
      "/programs/edit/?id=40000000-0000-4000-8000-000000000010",
    );
  });

  it("keeps the form in place and exposes repository errors", async () => {
    createProgram.mockRejectedValueOnce(new Error("Storage quota exceeded."));
    render(<ProgramCreate />);

    fireEvent.click(screen.getByRole("button", { name: "Submit draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage quota exceeded.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(programFormProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ saving: false, error: "Storage quota exceeded." }),
    );
  });
});
