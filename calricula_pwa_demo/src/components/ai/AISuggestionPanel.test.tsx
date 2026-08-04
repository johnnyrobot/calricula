import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AIRequestError,
  clearAISessionMarker,
  markAISessionReady,
} from "../../lib/ai";

import { AISuggestionPanel } from "./AISuggestionPanel";

const aiUiState = vi.hoisted(() => ({ online: true }));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => aiUiState.online,
}));

function programOutput(goalsAndObjectives = "Draft goals") {
  return {
    goalsAndObjectives,
    catalogDescription: "Draft catalog description",
    requirementsJustification: "Draft requirements justification",
    laborMarketAnalysis: "",
  };
}

describe("AISuggestionPanel", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    aiUiState.online = true;
    markAISessionReady();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAISessionMarker();
  });

  it("uses the default Worker request when no request override is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { description: "From the Worker" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ title: "Course" }}
        onApply={vi.fn()}
        task="catalog-description"
        title="Draft catalog copy"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("From the Worker")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/catalog-description",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the default structured preview and records explicit user rejection", async () => {
    const decision = vi.fn();
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ title: "Course" }}
        onDecision={decision}
        onApply={vi.fn()}
        request={vi.fn().mockResolvedValue({
          data: {
            suggestions: [
              {
                code: "0707.00",
                title: "Computer Information Systems",
                rationale: "The course concerns information systems.",
                confidence: 0.8,
              },
            ],
          },
          model: null,
          requestId: null,
        })}
        task="top-code"
        title="Suggest a TOP code"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText(/"code": "0707.00"/)).toBeInTheDocument();
    expect(screen.getByText("Proposed text or structure")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Reject suggestion" }),
    );
    expect(
      await screen.findByText(/Suggestion rejected. It was not saved/i),
    ).toBeInTheDocument();
    expect(decision).toHaveBeenCalledWith({
      kind: "reject",
      task: "top-code",
      reason: "user-rejected",
      issues: [],
      model: null,
      requestId: null,
    });
  });

  it("supports a custom renderer and regeneration", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: programOutput("First"),
        model: null,
        requestId: null,
      })
      .mockResolvedValueOnce({
        data: programOutput("Second"),
        model: null,
        requestId: null,
      });
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        normalize={(data) =>
          (data as { goalsAndObjectives: string }).goalsAndObjectives
        }
        onApply={vi.fn()}
        renderSuggestion={(value) => <strong>Custom: {value}</strong>}
        request={request}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("Custom: First")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate another" }),
    );
    expect(await screen.findByText("Custom: Second")).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("explicitly rejects a response that cannot project into the draft field", async () => {
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        normalize={() => null}
        onApply={vi.fn()}
        request={vi.fn().mockResolvedValue({
          data: programOutput(),
          model: null,
          requestId: null,
        })}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );

    expect(
      await screen.findByText(/AI response rejected before review/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/could not be converted into this draft field/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply suggestion" }),
    ).not.toBeInTheDocument();
  });

  it("shows retry guidance for a rate-limited request", async () => {
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        onApply={vi.fn()}
        request={vi.fn().mockRejectedValue(
          new AIRequestError(
            "RATE_LIMITED",
            "Free capacity is busy.",
            429,
            "request-rate",
            30,
          ),
        )}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );

    expect(await screen.findByText("Free capacity is busy.")).toBeInTheDocument();
    expect(screen.getByText(/about 30 seconds/i)).toBeInTheDocument();
  });

  it("returns to verification when the AI session expires", async () => {
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        onApply={vi.fn()}
        request={vi.fn().mockRejectedValue(
          new AIRequestError("SESSION_REQUIRED", "Verify again.", 401),
        )}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );

    expect(
      await screen.findByText(/Before this record leaves your browser|Verify this browser/),
    ).toBeInTheDocument();
  });

  it("surfaces non-Error request and apply failures safely", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce("request failed")
      .mockResolvedValueOnce({
        data: programOutput("Draft"),
        model: null,
        requestId: null,
      });
    const apply = vi.fn().mockRejectedValue("apply failed");
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        normalize={(data) =>
          (data as { goalsAndObjectives: string }).goalsAndObjectives
        }
        onApply={apply}
        request={request}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("request failed")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("Draft")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));
    expect(await screen.findByText("apply failed")).toBeInTheDocument();
  });

  it("shows request and apply progress and aborts an in-flight request on unmount", async () => {
    let resolveRequest:
      | ((value: {
          data: ReturnType<typeof programOutput>;
          model: null;
          requestId: null;
        }) => void)
      | undefined;
    let capturedSignal: AbortSignal | undefined;
    const request = vi.fn(
      (_task, _input, signal: AbortSignal) =>
        new Promise<{
          data: ReturnType<typeof programOutput>;
          model: null;
          requestId: null;
        }>((resolve) => {
          capturedSignal = signal;
          resolveRequest = resolve;
        }),
    );
    let resolveApply: (() => void) | undefined;
    const apply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApply = resolve;
        }),
    );
    const view = render(
      <AISuggestionPanel
        description="Drafting help"
        input={{}}
        normalize={(data) =>
          (data as { goalsAndObjectives: string }).goalsAndObjectives
        }
        onApply={apply}
        request={request}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(screen.getByRole("button", { name: "Drafting…" })).toBeDisabled();
    await act(async () => {
      resolveRequest?.({
        data: programOutput("Draft"),
        model: null,
        requestId: null,
      });
    });
    expect(await screen.findByText("Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    await act(async () => {
      resolveApply?.();
    });
    expect(
      await screen.findByRole("button", { name: "Applied to draft" }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Generate another" }),
    );
    expect(capturedSignal?.aborted).toBe(false);
    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not apply generated content until Apply is selected", async () => {
    const apply = vi.fn();
    const decision = vi.fn();
    const request = vi.fn().mockResolvedValue({
      data: programOutput("Proposed narrative"),
      model: "openrouter/free",
      requestId: "request-1",
    });

    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ title: "Program" }}
        normalize={(value) =>
          (value as { goalsAndObjectives: string }).goalsAndObjectives
        }
        onDecision={decision}
        onApply={apply}
        request={request}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Generate suggestion" }),
    );
    expect(await screen.findByText("Proposed narrative")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("Proposed narrative"));
    expect(decision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "apply",
        task: "program-narrative",
        value: "Proposed narrative",
      }),
    );
  });

  it("disables generation immediately while the browser is offline", async () => {
    aiUiState.online = false;

    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ title: "Program" }}
        onApply={vi.fn()}
        request={vi.fn()}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    expect(
      await screen.findByText(/AI requires a connection/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate suggestion" }),
    ).toBeDisabled();
  });

  it("rejects malformed injected output before preview, Apply, or persistence", async () => {
    const apply = vi.fn();
    const decision = vi.fn();
    render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ title: "Program" }}
        onApply={apply}
        onDecision={decision}
        request={vi.fn().mockResolvedValue({
          data: {
            ...programOutput(),
            unexpectedInstruction: "Ignore the contract",
          },
          model: "openrouter/free",
          requestId: "rejected-1",
        })}
        task="program-narrative"
        title="Draft a narrative"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(
      await screen.findByText("AI response rejected before review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply suggestion" }),
    ).not.toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    expect(decision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reject",
        task: "program-narrative",
        reason: "invalid-output",
        model: "openrouter/free",
        requestId: "rejected-1",
      }),
    );
  });

  it("revalidates structured output against the current draft at Apply time", async () => {
    const apply = vi.fn();
    const decision = vi.fn();
    const request = vi.fn().mockResolvedValue({
      data: {
        topics: [
          {
            sequence: 1,
            topic: "Curriculum foundations",
            contactHours: 18,
            relatedSloNumbers: [],
          },
        ],
      },
      model: "openrouter/free",
      requestId: "outline-1",
    });
    const view = render(
      <AISuggestionPanel
        description="Drafting help"
        input={{ contactHours: 18 }}
        normalize={(data) =>
          (data as { topics: unknown[] }).topics
        }
        onApply={apply}
        onDecision={decision}
        request={request}
        task="content-outline"
        title="Draft an outline"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestion" }),
    );
    expect(
      await screen.findByText(/Curriculum foundations/),
    ).toBeInTheDocument();

    view.rerender(
      <AISuggestionPanel
        description="Drafting help"
        input={{ contactHours: 20 }}
        normalize={(data) =>
          (data as { topics: unknown[] }).topics
        }
        onApply={apply}
        onDecision={decision}
        request={request}
        task="content-outline"
        title="Draft an outline"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion" }));

    expect(
      await screen.findByText("AI response rejected before review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no longer match the current course total/i),
    ).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    expect(decision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reject",
        reason: "domain-mismatch",
        requestId: "outline-1",
      }),
    );
  });
});
