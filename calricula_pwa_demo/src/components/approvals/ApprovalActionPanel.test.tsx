import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Actor,
  CourseAggregate,
} from "../../lib/domain";

const transitionCourse = vi.hoisted(() => vi.fn());

vi.mock("../../lib/data", () => ({
  curriculumRepository: { transitionCourse },
}));

vi.mock("../ai", () => ({
  CourseAIControls: ({
    onApply,
  }: {
    onApply: (value: unknown) => void;
  }) => (
    <div>
      <button onClick={() => onApply("AI review explanation")} type="button">
        Apply text explanation
      </button>
      <button
        onClick={() => onApply({ explanation: "Structured finding" })}
        type="button"
      >
        Apply structured explanation
      </button>
    </div>
  ),
}));

import { ApprovalActionPanel } from "./ApprovalActionPanel";

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "chair@example.invalid",
  fullName: "Demo Curriculum Chair",
  role: "chair",
  departmentId: null,
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
} satisfies Actor;

const aggregate = {
  course: {
    id: "22222222-2222-4222-8222-222222222222",
    status: "Department Review",
  },
} as unknown as CourseAggregate;

describe("ApprovalActionPanel", () => {
  beforeEach(() => {
    transitionCourse.mockReset();
    transitionCourse.mockResolvedValue(aggregate);
  });

  it("does not advance a course until the reviewer confirms", async () => {
    const onComplete = vi.fn();
    render(
      <ApprovalActionPanel
        actor={actor}
        aggregate={aggregate}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Advance to curriculum committee",
      }),
    );
    expect(transitionCourse).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm decision" }),
    );
    await waitFor(() =>
      expect(transitionCourse).toHaveBeenCalledWith(
        aggregate.course.id,
        {
          targetStatus: "Curriculum Committee",
          actorId: actor.id,
          comment: null,
        },
      ),
    );
    expect(onComplete).toHaveBeenCalledWith("Curriculum Committee");
  });

  it("requires a revision note before confirming a return", () => {
    render(<ApprovalActionPanel actor={actor} aggregate={aggregate} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Return to faculty draft" }),
    );
    const confirm = screen.getByRole("button", {
      name: "Confirm decision",
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Review note/), {
      target: { value: "Reconcile the instructional hours table." },
    });
    expect(confirm).toBeEnabled();
  });

  it("records a trimmed return reason and returns the record to Draft", async () => {
    render(<ApprovalActionPanel actor={actor} aggregate={aggregate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Return to faculty draft" }),
    );
    fireEvent.change(screen.getByLabelText(/Review note/), {
      target: { value: "  Reconcile the instructional hours table.  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm decision" }),
    );

    await waitFor(() =>
      expect(transitionCourse).toHaveBeenCalledWith(aggregate.course.id, {
        targetStatus: "Draft",
        actorId: actor.id,
        comment: "Reconcile the instructional hours table.",
      }),
    );
  });

  it("gives an administrator only the legal action for the current stage", async () => {
    const admin = {
      ...actor,
      id: "11111111-1111-4111-8111-111111111112",
      email: "admin@example.invalid",
      fullName: "Demo Administrator",
      role: "admin",
    } satisfies Actor;
    render(<ApprovalActionPanel actor={admin} aggregate={aggregate} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Advance to curriculum committee",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm decision" }),
    );

    await waitFor(() =>
      expect(transitionCourse).toHaveBeenCalledWith(
        aggregate.course.id,
        {
          targetStatus: "Curriculum Committee",
          actorId: admin.id,
          comment: null,
        },
      ),
    );
  });

  it("shows unavailable actions for roles outside the current stage", () => {
    const faculty = {
      ...actor,
      id: "11111111-1111-4111-8111-111111111113",
      email: "faculty@example.invalid",
      role: "faculty",
    } satisfies Actor;
    render(<ApprovalActionPanel actor={faculty} aggregate={aggregate} />);
    expect(screen.getByTestId("approval-action")).toHaveTextContent(
      "Review action unavailable",
    );
    expect(
      screen.queryByRole("button", {
        name: "Advance to curriculum committee",
      }),
    ).not.toBeInTheDocument();
  });

  it("cancels an unconfirmed decision without a repository mutation", () => {
    render(<ApprovalActionPanel actor={actor} aggregate={aggregate} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Advance to curriculum committee",
      }),
    );
    expect(
      screen.getByRole("group", { name: "Confirm workflow decision" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("group", { name: "Confirm workflow decision" }),
    ).not.toBeInTheDocument();
    expect(transitionCourse).not.toHaveBeenCalled();
  });

  it("surfaces transition failures without completing the review", async () => {
    const onComplete = vi.fn();
    transitionCourse.mockRejectedValueOnce(
      new Error("The record changed in another tab."),
    );
    render(
      <ApprovalActionPanel
        actor={actor}
        aggregate={aggregate}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Advance to curriculum committee",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm decision" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The record changed in another tab.",
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("allows explicitly applied AI text to populate but not submit a note", () => {
    render(<ApprovalActionPanel actor={actor} aggregate={aggregate} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply text explanation" }),
    );
    expect(screen.getByLabelText(/Review note/)).toHaveValue(
      "AI review explanation",
    );
    expect(transitionCourse).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Apply structured explanation" }),
    );
    expect(screen.getByLabelText(/Review note/)).toHaveValue(
      JSON.stringify({ explanation: "Structured finding" }, null, 2),
    );
  });
});
