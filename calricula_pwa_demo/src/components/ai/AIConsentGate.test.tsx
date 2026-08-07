import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiState = vi.hoisted(() => ({
  acknowledged: false,
  listeners: new Set<() => void>(),
  establishAISession: vi.fn(),
  acknowledgeAIDisclosure: vi.fn(),
}));
const connection = vi.hoisted(() => ({ online: true }));

vi.mock("../../lib/ai", () => {
  class MockAIRequestError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }

  return {
    AIRequestError: MockAIRequestError,
    establishAISession: aiState.establishAISession,
    acknowledgeAIDisclosure: () => {
      aiState.acknowledged = true;
      aiState.acknowledgeAIDisclosure();
      aiState.listeners.forEach((listener) => listener());
    },
    // Readiness reaches the component through the same barrel now, so this is
    // one mock instead of two.
    readSessionReadiness: () =>
      aiState.acknowledged ? "needs-challenge" : "needs-disclosure",
    subscribeSessionReadiness: (listener: () => void) => {
      aiState.listeners.add(listener);
      return () => aiState.listeners.delete(listener);
    },
  };
});

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => connection.online,
}));

vi.mock("./TurnstileWidget", () => ({
  TurnstileWidget: ({
    onError,
    onToken,
  }: {
    onError: (message: string) => void;
    onToken: (token: string) => void;
  }) => (
    <div>
      <button onClick={() => onToken("turnstile-token")} type="button">
        Complete Turnstile
      </button>
      <button onClick={() => onError("Turnstile test error")} type="button">
        Fail Turnstile
      </button>
    </div>
  ),
}));

import { AIRequestError } from "../../lib/ai";

import { AIConsentGate } from "./AIConsentGate";

describe("AIConsentGate", () => {
  beforeEach(() => {
    aiState.acknowledged = false;
    aiState.listeners.clear();
    aiState.establishAISession.mockReset();
    aiState.acknowledgeAIDisclosure.mockReset();
    aiState.establishAISession.mockResolvedValue({});
    connection.online = true;
  });

  it("requires disclosure acknowledgement before showing Turnstile", async () => {
    render(<AIConsentGate onVerified={vi.fn()} />);
    expect(
      screen.getByText("Before this record leaves your browser"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue to verification" }),
    );

    expect(aiState.acknowledgeAIDisclosure).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("button", { name: "Complete Turnstile" }),
    ).toBeInTheDocument();
  });

  it("establishes a session from the Turnstile callback", async () => {
    aiState.acknowledged = true;
    const verified = vi.fn();
    render(<AIConsentGate onVerified={verified} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Complete Turnstile" }),
    );

    await waitFor(() =>
      expect(aiState.establishAISession).toHaveBeenCalledWith(
        "turnstile-token",
      ),
    );
    expect(verified).toHaveBeenCalledOnce();
  });

  it("uses an injected token provider and reports provider failure", async () => {
    aiState.acknowledged = true;
    const provider = vi.fn().mockResolvedValueOnce("provided-token");
    const verified = vi.fn();
    const { rerender } = render(
      <AIConsentGate onVerified={verified} tokenProvider={provider} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    await waitFor(() =>
      expect(aiState.establishAISession).toHaveBeenCalledWith(
        "provided-token",
      ),
    );
    expect(verified).toHaveBeenCalledOnce();

    provider.mockRejectedValueOnce(new Error("provider unavailable"));
    rerender(
      <AIConsentGate onVerified={verified} tokenProvider={provider} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(
      await screen.findByText("Browser verification could not be completed."),
    ).toBeInTheDocument();
  });

  it("shows safe messages for session errors and Turnstile errors", async () => {
    aiState.acknowledged = true;
    aiState.establishAISession.mockRejectedValueOnce(
      new AIRequestError("SESSION_FAILED", "Session rejected.", 403),
    );
    const { rerender } = render(<AIConsentGate onVerified={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Complete Turnstile" }),
    );
    expect(await screen.findByText("Session rejected.")).toBeInTheDocument();

    aiState.establishAISession.mockRejectedValueOnce("not an Error");
    rerender(<AIConsentGate onVerified={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Turnstile" }),
    );
    expect(
      await screen.findByText("AI verification could not be completed."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Fail Turnstile" }),
    );
    expect(screen.getByText("Turnstile test error")).toBeInTheDocument();
  });

  it("keeps verification unavailable while offline", () => {
    connection.online = false;
    render(<AIConsentGate onVerified={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Continue to verification" }),
    ).toBeDisabled();
    expect(screen.getByText(/AI requires a connection/i)).toBeInTheDocument();
    expect(aiState.acknowledgeAIDisclosure).not.toHaveBeenCalled();
  });
});
