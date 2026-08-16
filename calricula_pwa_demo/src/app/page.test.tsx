import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("public landing page", () => {
  it("offers the account-free dashboard route and explains first-run storage", () => {
    render(<HomePage />);

    const demoLinks = screen.getAllByRole("link", { name: /try it now/i });
    expect(demoLinks).not.toHaveLength(0);
    demoLinks.forEach((link) =>
      expect(new URL(link.getAttribute("href") ?? "", window.location.href).pathname).toMatch(
        /^\/dashboard\/?$/,
      ),
    );
    expect(
      screen.getByText(/your first visit creates sample curriculum records/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no account is required/i)).toBeInTheDocument();
  });

  it("states the optional AI boundary and explicit demo exclusions", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /local by default\. ai only when you ask/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not provide accounts, cloud sync, true multi-user routing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the worker does not persist or log prompt and response content/i),
    ).toBeInTheDocument();
  });
});
