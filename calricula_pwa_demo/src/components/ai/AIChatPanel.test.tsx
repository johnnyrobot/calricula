import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAISessionMarker,
  markAISessionReady,
} from "../../lib/ai";
import type { AIChatPersistence } from "../../lib/ai";

import { AIChatPanel } from "./AIChatPanel";

const aiUiState = vi.hoisted(() => ({ online: true }));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => aiUiState.online,
}));

describe("AIChatPanel", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    aiUiState.online = true;
    markAISessionReady();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAISessionMarker();
  });

  it("sends at most ten prior messages without duplicating the new prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { message: "A response" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const initialHistory = Array.from({ length: 11 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `prior-${index}`,
    }));

    const historyChanged = vi.fn();
    render(
      <AIChatPanel
        initialHistory={initialHistory}
        onHistoryChange={historyChanged}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Message the curriculum assistant"),
      { target: { value: "New focused question" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as {
      input: { message: string };
      history: Array<{ content: string }>;
    };

    expect(body.input.message).toBe("New focused question");
    expect(body.history).toHaveLength(10);
    expect(body.history[0]?.content).toBe("prior-1");
    expect(body.history.some((item) => item.content === "New focused question")).toBe(
      false,
    );
    expect(await screen.findByText("A response")).toBeInTheDocument();
    expect(historyChanged).toHaveBeenLastCalledWith([
      ...initialHistory.slice(-8),
      { role: "user", content: "New focused question" },
      { role: "assistant", content: "A response" },
    ]);
  });

  it("renders an empty-state prompt and disables sending while offline", () => {
    aiUiState.online = false;
    render(<AIChatPanel />);

    expect(
      screen.getByText(/Start with a focused drafting or policy question/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI requires a connection/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("explicitly rejects a malformed assistant response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { message: " " } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    render(<AIChatPanel />);
    fireEvent.change(
      screen.getByLabelText("Message the curriculum assistant"),
      { target: { value: "Question" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Assistant response rejected"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/was not added to local history/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("restores and appends browser-local chat history for the active record", async () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    const entityId = "22222222-2222-4222-8222-222222222222";
    const append = vi
      .fn<AIChatPersistence["append"]>()
      .mockResolvedValueOnce({
        conversationId: "33333333-3333-4333-8333-333333333333",
        history: [
          { role: "assistant", content: "Previously saved answer" },
          { role: "user", content: "Follow-up question" },
        ],
      })
      .mockResolvedValueOnce({
        conversationId: "33333333-3333-4333-8333-333333333333",
        history: [
          { role: "assistant", content: "Previously saved answer" },
          { role: "user", content: "Follow-up question" },
          { role: "assistant", content: "New saved answer" },
        ],
      });
    const persistence: AIChatPersistence = {
      load: vi.fn().mockResolvedValue({
        conversationId: "33333333-3333-4333-8333-333333333333",
        history: [
          { role: "assistant", content: "Previously saved answer" },
        ],
      }),
      append,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { message: "New saved answer" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    render(
      <AIChatPanel
        actorId={actorId}
        context={{ recordType: "Course" }}
        contextLabel="ENGL C1000"
        conversationTitle="ENGL C1000 assistant"
        entityId={entityId}
        entityType="Course"
        persistence={persistence}
      />,
    );

    expect(await screen.findByText("Previously saved answer")).toBeInTheDocument();
    expect(persistence.load).toHaveBeenCalledWith({
      actorId,
      entityType: "Course",
      entityId,
      title: "ENGL C1000 assistant",
    });
    fireEvent.change(
      screen.getByLabelText("Message the curriculum assistant"),
      { target: { value: "Follow-up question" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("New saved answer")).toBeInTheDocument();
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[0]?.[2]).toEqual({
      role: "user",
      content: "Follow-up question",
    });
    expect(append.mock.calls[1]?.[2]).toEqual({
      role: "assistant",
      content: "New saved answer",
    });
  });

  it("persists the intended user chat message but never a rejected assistant output", async () => {
    const append = vi
      .fn<AIChatPersistence["append"]>()
      .mockResolvedValue({
        conversationId: "33333333-3333-4333-8333-333333333333",
        history: [{ role: "user", content: "Check this draft" }],
      });
    const persistence: AIChatPersistence = {
      load: vi.fn().mockResolvedValue({
        conversationId: null,
        history: [],
      }),
      append,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { message: "Unsafe alias", extra: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    render(
      <AIChatPanel
        actorId="11111111-1111-4111-8111-111111111111"
        persistence={persistence}
      />,
    );
    await waitFor(() => expect(persistence.load).toHaveBeenCalledOnce());
    fireEvent.change(
      screen.getByLabelText("Message the curriculum assistant"),
      { target: { value: "Check this draft" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Assistant response rejected"),
    ).toBeInTheDocument();
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0]?.[2]).toEqual({
      role: "user",
      content: "Check this draft",
    });
    expect(screen.queryByText("Unsafe alias")).not.toBeInTheDocument();
  });

  it("returns to verification after a session error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "SESSION_REQUIRED", message: "Verify again." },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    render(<AIChatPanel />);
    fireEvent.change(
      screen.getByLabelText("Message the curriculum assistant"),
      { target: { value: "Question" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Before this record leaves your browser|Verify this browser/),
    ).toBeInTheDocument();
  });

  it("shows the consent boundary when no session is marked ready", () => {
    clearAISessionMarker();
    render(<AIChatPanel />);
    expect(
      screen.getByText(/Before this record leaves your browser|Verify this browser/),
    ).toBeInTheDocument();
  });
});
