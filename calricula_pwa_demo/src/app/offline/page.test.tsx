import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OfflinePage from "./page";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("OfflinePage", () => {
  beforeEach(() => {
    setOnline(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("calricula-online", { status: 200 }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("explains the local and network boundaries with working destinations", () => {
    render(<OfflinePage />);

    expect(
      screen.getByRole("heading", { name: "Offline use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Courses, programs, comments, notifications/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AI requests, including Turnstile verification/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Prepare storage" }),
    ).toHaveAttribute("href", "/settings#storage");
    expect(
      screen.getByRole("link", { name: "Open local catalog" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("announces connectivity changes and offers a retry only while offline", async () => {
    render(<OfflinePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Online now");
    expect(
      screen.queryByRole("button", { name: "Try connection again" }),
    ).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Offline now");
    expect(
      screen.getByRole("button", { name: "Try connection again" }),
    ).toBeInTheDocument();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Online now"),
    );
    expect(
      screen.queryByRole("button", { name: "Try connection again" }),
    ).not.toBeInTheDocument();
  });
});
