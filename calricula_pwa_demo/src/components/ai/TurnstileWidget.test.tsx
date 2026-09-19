import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./TurnstileWidget";

describe("TurnstileWidget", () => {
  afterEach(() => {
    delete window.turnstile;
    document.getElementById("calricula-turnstile-script")?.remove();
  });

  it("labels the verification token with the Worker-required action", async () => {
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    const removeWidget = vi.fn();
    const onError = vi.fn();
    const onToken = vi.fn();
    window.turnstile = {
      render: renderWidget,
      remove: removeWidget,
    };

    const view = render(
      <TurnstileWidget
        onError={onError}
        onToken={onToken}
        siteKey="test-site-key"
      />,
    );

    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
    expect(
      screen.getByRole("group", { name: "Browser verification" }),
    ).toBeInTheDocument();
    const options = renderWidget.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      sitekey: "test-site-key",
      action: "ai-session",
    });
    options.callback("verified-token");
    options["error-callback"]();
    options["expired-callback"]();
    expect(onToken).toHaveBeenCalledWith("verified-token");
    expect(onError).toHaveBeenCalledWith(
      "Browser verification failed. Please try again.",
    );
    expect(onError).toHaveBeenCalledWith(
      "Browser verification expired. Please verify again.",
    );

    view.unmount();
    expect(removeWidget).toHaveBeenCalledWith("widget-1");
  });

  it("reports a missing deployment site key without loading a script", async () => {
    const onError = vi.fn();
    render(
      <TurnstileWidget
        onError={onError}
        onToken={vi.fn()}
        siteKey=""
      />,
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "AI verification is not configured for this deployment.",
      ),
    );
    expect(
      document.getElementById("calricula-turnstile-script"),
    ).toBeNull();
    expect(
      screen.queryByText("Loading browser verification…"),
    ).not.toBeInTheDocument();
  });

  it("loads the explicit Turnstile script and renders after it becomes ready", async () => {
    const renderWidget = vi.fn().mockReturnValue("widget-script");
    render(
      <TurnstileWidget
        onError={vi.fn()}
        onToken={vi.fn()}
        siteKey="script-site-key"
      />,
    );
    const script = document.getElementById(
      "calricula-turnstile-script",
    ) as HTMLScriptElement;
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect(script.src).toContain(
      "challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );

    window.turnstile = {
      render: renderWidget,
      remove: vi.fn(),
    };
    fireEvent.load(script);

    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
    expect(
      screen.queryByText("Loading browser verification…"),
    ).not.toBeInTheDocument();
  });

  it("reports script errors, including an already-present script", async () => {
    const existing = document.createElement("script");
    existing.id = "calricula-turnstile-script";
    document.head.appendChild(existing);
    const onError = vi.fn();
    render(
      <TurnstileWidget
        onError={onError}
        onToken={vi.fn()}
        siteKey="test-site-key"
      />,
    );

    fireEvent.error(existing);
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "Browser verification could not load. Check your connection or content-blocking settings.",
      ),
    );
  });

  it("handles a loaded script that does not expose the Turnstile API", async () => {
    const onError = vi.fn();
    render(
      <TurnstileWidget
        onError={onError}
        onToken={vi.fn()}
        siteKey="test-site-key"
      />,
    );
    const script = document.getElementById(
      "calricula-turnstile-script",
    ) as HTMLScriptElement;
    fireEvent.load(script);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "Browser verification could not load. Check your connection or content-blocking settings.",
      ),
    );
  });
});
