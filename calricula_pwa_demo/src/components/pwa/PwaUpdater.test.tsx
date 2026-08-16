import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workboxState = vi.hoisted(() => {
  type Listener = (event: { isUpdate?: boolean; type: string }) => void;

  class MockWorkbox {
    static latest: MockWorkbox | null = null;
    static nextRegisterError: Error | null = null;
    static nextRegisterPromise: Promise<void> | null = null;

    readonly listeners = new Map<string, Set<Listener>>();
    readonly messageSkipWaiting = vi.fn();
    readonly register = vi.fn(async () => {
      const error = MockWorkbox.nextRegisterError;
      const pendingRegistration = MockWorkbox.nextRegisterPromise;
      MockWorkbox.nextRegisterError = null;
      MockWorkbox.nextRegisterPromise = null;
      if (error) throw error;
      if (pendingRegistration) await pendingRegistration;
    });

    constructor(
      readonly scriptUrl: string,
      readonly options: { scope: string },
    ) {
      MockWorkbox.latest = this;
    }

    addEventListener(type: string, listener: Listener) {
      const listeners = this.listeners.get(type) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: Listener) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type: string, isUpdate?: boolean) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ isUpdate, type });
      }
    }
  }

  return { MockWorkbox };
});

vi.mock("workbox-window", () => ({
  Workbox: workboxState.MockWorkbox,
}));

import { PwaUpdater } from "./PwaUpdater";
import { registerPendingWorkFlusher } from "@/lib/pwa/pending-work";

describe("PwaUpdater", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
    workboxState.MockWorkbox.latest = null;
    workboxState.MockWorkbox.nextRegisterError = null;
    workboxState.MockWorkbox.nextRegisterPromise = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers once and keeps activation under explicit user control", async () => {
    const user = userEvent.setup();
    const view = render(<PwaUpdater />);

    await waitFor(() => {
      expect(workboxState.MockWorkbox.latest?.register).toHaveBeenCalledOnce();
    });

    const workbox = workboxState.MockWorkbox.latest;
    expect(workbox).not.toBeNull();
    expect(workbox?.scriptUrl).toBe("/sw.js");
    expect(workbox?.options).toEqual({ scope: "/" });
    expect(workbox?.register).toHaveBeenCalledWith({ immediate: true });

    act(() => workbox?.emit("waiting"));
    expect(
      screen.getByText("Calricula update available"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(
      screen.queryByText("Calricula update available"),
    ).not.toBeInTheDocument();

    act(() => workbox?.emit("waiting"));
    await user.click(screen.getByRole("button", { name: "Update now" }));
    expect(workbox?.messageSkipWaiting).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Updating…" }),
    ).toBeDisabled();

    view.unmount();
    expect(workbox?.listeners.get("waiting")?.size).toBe(0);
    expect(workbox?.listeners.get("controlling")?.size).toBe(0);
  });

  it("does not activate an update while an editor cannot save", async () => {
    const user = userEvent.setup();
    render(<PwaUpdater />);
    await waitFor(() => {
      expect(workboxState.MockWorkbox.latest?.register).toHaveBeenCalledOnce();
    });
    const workbox = workboxState.MockWorkbox.latest;
    const unregister = registerPendingWorkFlusher(async () => false);

    act(() => workbox?.emit("waiting"));
    await user.click(screen.getByRole("button", { name: "Update now" }));

    expect(workbox?.messageSkipWaiting).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "an open editor could not save",
    );
    expect(
      screen.getByRole("button", { name: "Update now" }),
    ).toBeEnabled();
    unregister();
  });

  it("renders nothing when service workers are unavailable", () => {
    Reflect.deleteProperty(window.navigator, "serviceWorker");

    const { container } = render(<PwaUpdater />);
    expect(container).toBeEmptyDOMElement();
    expect(workboxState.MockWorkbox.latest).toBeNull();
  });

  it("does not register a service worker in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    const { container } = render(<PwaUpdater />);
    expect(container).toBeEmptyDOMElement();
    expect(workboxState.MockWorkbox.latest).toBeNull();
  });

  it("reports registration failure and retries from an explicit user action", async () => {
    const user = userEvent.setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    workboxState.MockWorkbox.nextRegisterError = new Error(
      "Service-worker storage is blocked.",
    );
    render(<PwaUpdater />);
    const failedWorkbox = workboxState.MockWorkbox.latest;
    await waitFor(() => expect(failedWorkbox?.register).toHaveBeenCalledOnce());

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Offline setup needs attention");
    expect(warning).toHaveBeenCalledWith(
      "[calricula:pwa] Offline service-worker registration failed.",
    );

    let finishRetry: () => void = () => {};
    workboxState.MockWorkbox.nextRegisterPromise = new Promise<void>(
      (resolve) => {
        finishRetry = () => resolve();
      },
    );
    await user.click(
      screen.getByRole("button", { name: "Retry offline setup" }),
    );
    expect(
      screen.getByRole("button", { name: "Retrying offline setup…" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(failedWorkbox?.register).toHaveBeenCalledTimes(2),
    );
    expect(failedWorkbox?.register).toHaveBeenLastCalledWith({
      immediate: true,
    });
    act(() => finishRetry());
    await waitFor(() =>
      expect(
        screen.queryByText("Offline setup needs attention"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Calricula update available"),
    ).not.toBeInTheDocument();
    warning.mockRestore();
  });

  it("still surfaces an update after successful immediate registration", async () => {
    render(<PwaUpdater />);
    const workbox = workboxState.MockWorkbox.latest;
    await waitFor(() => expect(workbox?.register).toHaveBeenCalledOnce());

    act(() => workbox?.emit("waiting"));
    expect(
      screen.getByText("Calricula update available"),
    ).toBeInTheDocument();
  });
});
