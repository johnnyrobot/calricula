import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstallButton } from "./InstallButton";

interface InstallPromptEvent extends Event {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function installPrompt(outcome: "accepted" | "dismissed"): InstallPromptEvent {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome, platform: "test" }),
  });
}

function mockDisplayMode(matches = false) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    media: "(display-mode: standalone)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => media),
  });

  return {
    media,
    setMatches(value: boolean) {
      Object.defineProperty(media, "matches", {
        configurable: true,
        value,
      });
      for (const listener of listeners) listener();
    },
  };
}

describe("InstallButton", () => {
  beforeEach(() => {
    mockDisplayMode();
    Reflect.deleteProperty(
      window.navigator as Navigator & { standalone?: boolean },
      "standalone",
    );
  });

  it("links to installation guidance until the browser offers a prompt", () => {
    render(<InstallButton />);

    expect(
      screen.getByRole("link", { name: "Installation guidance" }),
    ).toHaveAttribute("href", "/settings#install");
  });

  it("captures the browser prompt and installs only after user activation", async () => {
    const user = userEvent.setup();
    const event = installPrompt("accepted");
    render(<InstallButton />);

    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Install Calricula" }),
    );
    expect(event.prompt).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Installation guidance" }),
      ).toBeInTheDocument(),
    );
  });

  it("keeps a dismissed install prompt available for another attempt", async () => {
    const user = userEvent.setup();
    const event = installPrompt("dismissed");
    render(<InstallButton />);

    act(() => window.dispatchEvent(event));
    await user.click(
      screen.getByRole("button", { name: "Install Calricula" }),
    );

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Install Calricula" }),
    ).toBeInTheDocument();
  });

  it("reflects standalone and appinstalled states", () => {
    const displayMode = mockDisplayMode(true);
    const view = render(<InstallButton />);

    expect(screen.getByText("Installed on this device")).toBeInTheDocument();

    act(() => displayMode.setMatches(false));
    expect(
      screen.getByRole("link", { name: "Installation guidance" }),
    ).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(screen.getByText("Installed on this device")).toBeInTheDocument();

    view.unmount();
    expect(displayMode.media.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("hides the compact control when already installed on iOS", () => {
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });

    const { container } = render(<InstallButton compact />);
    expect(container).toBeEmptyDOMElement();
  });
});
