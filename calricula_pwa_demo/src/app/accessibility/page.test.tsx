import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AccessibilityPage from "./page";

describe("AccessibilityPage", () => {
  it("publishes a navigable statement with an honest conformance boundary", () => {
    render(<AccessibilityPage />);

    expect(
      screen.getByRole("heading", { name: "Accessibility", level: 1 }),
    ).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", {
      name: "Accessibility statement sections",
    });
    for (const [label, href] of [
      ["Commitment", "#commitment"],
      ["Features", "#features"],
      ["Keyboard", "#keyboard"],
      ["Known limits", "#limits"],
      ["Feedback", "#feedback"],
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }

    expect(
      screen.getByText(/not a third-party accessibility certification/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Known limits and third parties" }),
    ).toBeInTheDocument();
  });

  it("documents keyboard, focus, target-size, and feedback expectations", () => {
    render(<AccessibilityPage />);

    expect(
      screen.getAllByText("Tab", { selector: ".keyboard-key" }),
    ).toHaveLength(3);
    expect(
      screen.getByText(/Primary interactive targets are at least 44 by 44/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A skip link moves directly to main content/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Report an accessibility barrier",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("link", { name: "Review data settings" }),
    ).toHaveAttribute("href", "/settings");
  });
});
