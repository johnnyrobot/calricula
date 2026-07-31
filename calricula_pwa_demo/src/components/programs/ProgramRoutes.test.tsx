import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSearchParam = vi.hoisted(() => vi.fn());
const programEditor = vi.hoisted(() => vi.fn());
const programView = vi.hoisted(() => vi.fn());

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
  ProgramView: (props: { programId: string }) => {
    programView(props);
    return <p>View for {props.programId}</p>;
  },
}));

import { ProgramEditorRoute } from "./ProgramEditorRoute";
import { ProgramViewRoute } from "./ProgramViewRoute";

describe("program query-parameter routes", () => {
  beforeEach(() => {
    getSearchParam.mockReset();
    programEditor.mockReset();
    programView.mockReset();
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
    expect(programView).toHaveBeenCalledWith({
      programId: "local-program-id",
    });
  });
});
