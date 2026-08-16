import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Department, Program } from "../../lib/domain";

const useAllPrograms = vi.hoisted(() => vi.fn());
const useReferences = vi.hoisted(() => vi.fn());

vi.mock("../../lib/data", () => ({
  useAllPrograms,
  useReferences,
}));

import { ProgramList } from "./ProgramList";

const department = {
  id: "20000000-0000-4000-8000-000000000001",
  divisionId: "20000000-0000-4000-8000-000000000002",
  code: "CIS",
  name: "Computer Information Systems",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
} satisfies Department;

const programs = [
  {
    id: "20000000-0000-4000-8000-000000000003",
    title: "Computer Science",
    type: "AAT",
    catalogDescription: "Transfer preparation.",
    totalUnits: "24",
    status: "Approved",
    topCode: "0707.00",
    cipCode: "11.0701",
    programNarrative: null,
    isHighUnitMajor: false,
    departmentId: department.id,
    createdBy: "20000000-0000-4000-8000-000000000004",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    title: "Web Development",
    type: "Certificate",
    catalogDescription: null,
    totalUnits: "18",
    status: "Draft",
    topCode: null,
    cipCode: null,
    programNarrative: null,
    isHighUnitMajor: false,
    departmentId: "20000000-0000-4000-8000-000000000006",
    createdBy: "20000000-0000-4000-8000-000000000004",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
] satisfies Program[];

describe("ProgramList", () => {
  beforeEach(() => {
    useAllPrograms.mockReset();
    useReferences.mockReset();
    useReferences.mockReturnValue({
      data: {
        departments: [department],
        divisions: [],
        topCodes: [],
        ccnStandards: [],
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    });
    useAllPrograms.mockImplementation(
      (query: { search?: string; status?: Program["status"] }) => {
        const items = programs.filter(
          (program) =>
            (!query.search ||
              program.title
                .toLowerCase()
                .includes(query.search.toLowerCase())) &&
            (!query.status || program.status === query.status),
        );
        return {
          data: items,
          error: null,
          loading: false,
          refresh: vi.fn(),
        };
      },
    );
  });

  it("renders program summaries, links, status, and department fallbacks", () => {
    render(<ProgramList />);

    expect(screen.getAllByTestId("program-card")).toHaveLength(2);
    expect(screen.getByText("AA-T")).toBeVisible();
    expect(screen.getByText("24 units")).toBeVisible();
    expect(
      screen.getByText("CIS — Computer Information Systems"),
    ).toBeVisible();
    expect(screen.getByText("Department not found")).toBeVisible();
    expect(
      screen.getByText("Computer Science").closest("a")?.querySelector(
        '[data-status="approved"]',
      ),
    ).toHaveAttribute(
      "data-status",
      "approved",
    );
    expect(screen.getByTestId("create-program")).toHaveAttribute(
      "href",
      "/programs/new",
    );
    expect(screen.getByText("Computer Science").closest("a")).toHaveAttribute(
      "href",
      `/programs/view?id=${programs[0].id}`,
    );
  });

  it("passes normalized search and status filters into the repository hook", () => {
    render(<ProgramList />);

    fireEvent.change(screen.getByLabelText("Search programs"), {
      target: { value: "  web  " },
    });
    expect(useAllPrograms).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "web", status: undefined }),
    );
    expect(screen.getByText("Web Development")).toBeVisible();
    expect(screen.queryByText("Computer Science")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "Approved" },
    });
    expect(useAllPrograms).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "web", status: "Approved" }),
    );
    expect(screen.getByText("No programs match this view")).toBeVisible();
  });

  it("shows loading and retryable failure states", () => {
    const refresh = vi.fn();
    useAllPrograms.mockReturnValueOnce({
      data: [],
      error: null,
      loading: true,
      refresh,
    });
    const { rerender } = render(<ProgramList />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading programs");

    useAllPrograms.mockReturnValue({
      data: [],
      error: new Error("IndexedDB is unavailable."),
      loading: false,
      refresh,
    });
    rerender(<ProgramList />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "IndexedDB is unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
