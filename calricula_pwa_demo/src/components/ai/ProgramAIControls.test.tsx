import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProgramAIInput,
  normalizeProgramNarrative,
  ProgramAIControls,
} from "./ProgramAIControls";
import { markAISessionReady } from "../../lib/ai";

const aiUiState = vi.hoisted(() => ({ online: true }));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => aiUiState.online,
}));

function structuredNarrative() {
  return {
    goalsAndObjectives: "Prepare students for applied analysis.",
    catalogDescription: "A focused certificate.",
    requirementsJustification: "The sequence builds proficiency.",
    laborMarketAnalysis: "",
  };
}

describe("ProgramAIControls response normalization", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    aiUiState.online = true;
    markAISessionReady();
  });

  it("preserves every structured Worker narrative section", () => {
    const narrative = normalizeProgramNarrative({
      goalsAndObjectives: "Prepare students for applied analysis.",
      catalogDescription: "A focused program in data analytics.",
      requirementsJustification: "The sequence builds from foundations.",
      laborMarketAnalysis: "",
    });

    expect(narrative).toContain(
      "Goals and objectives\nPrepare students for applied analysis.",
    );
    expect(narrative).toContain(
      "Catalog description\nA focused program in data analytics.",
    );
    expect(narrative).toContain(
      "Requirements justification\nThe sequence builds from foundations.",
    );
    expect(narrative).toContain(
      "Labor market analysis\nNo labor-market evidence was supplied for this draft.",
    );
  });

  it("sends only narrative-relevant local fields to the Worker", () => {
    const input = buildProgramAIInput({
      id: "local-program-id",
      title: "Data Analytics",
      type: "Certificate",
      catalogDescription: "Current description",
      createdBy: "local-actor-id",
    });

    expect(input).toMatchObject({
      title: "Data Analytics",
      type: "Certificate",
      catalogDescription: "Current description",
    });
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("createdBy");
  });

  it("includes optional program context and rejects legacy response aliases", () => {
    expect(
      buildProgramAIInput(
        { title: "Data Analytics", totalUnits: "18" },
        { courses: ["CS 101"] },
      ),
    ).toMatchObject({
      title: "Data Analytics",
      totalUnits: "18",
      context: { courses: ["CS 101"] },
    });
    expect(normalizeProgramNarrative(" Direct narrative ")).toBeNull();
    expect(
      normalizeProgramNarrative({ programNarrative: " Legacy narrative " }),
    ).toBeNull();
    expect(normalizeProgramNarrative(null)).toBeNull();
  });

  it("applies a structured narrative and persists it against an existing program", async () => {
    const onApply = vi.fn();
    const program = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Data Analytics",
      type: "Certificate",
      catalogDescription: "",
      totalUnits: "18",
      status: "Draft",
      topCode: "0707.00",
      cipCode: "11.0301",
      programNarrative: null,
      isHighUnitMajor: false,
      departmentId: "22222222-2222-4222-8222-222222222222",
      createdBy: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    } as const;
    render(
      <ProgramAIControls
        onApply={onApply}
        program={program}
        request={vi.fn().mockResolvedValue({
          data: {
            goalsAndObjectives: "Prepare students for applied analysis.",
            catalogDescription: "A focused certificate.",
            requirementsJustification: "The sequence builds proficiency.",
            laborMarketAnalysis: "Local evidence supplied by the author.",
          },
          model: "free-model",
          requestId: "program-request",
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(
      await screen.findByText(/Prepare students for applied analysis/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
  });

  it("applies a suggestion for an unsaved program object", async () => {
    render(
      <ProgramAIControls
        onApply={vi.fn()}
        program={{ title: "Unsaved program" }}
        request={vi.fn().mockResolvedValue({
          data: structuredNarrative(),
          model: null,
          requestId: null,
        })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Apply suggestion" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Applied to draft" }),
      ).toBeDisabled(),
    );
  });
});
