import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contextState = vi.hoisted(() => ({
  getCourse: vi.fn(),
  getProgram: vi.fn(),
}));

vi.mock("../../lib/data", () => ({
  curriculumRepository: {
    getCourse: contextState.getCourse,
    getProgram: contextState.getProgram,
  },
}));

vi.mock("./AIChatPanel", () => ({
  AIChatPanel: (props: {
    actorId: string;
    contextLabel: string;
    entityId: string | null;
    entityType: string | null;
  }) => (
    <div data-testid="contextual-chat">
      {props.actorId}|{props.contextLabel}|{props.entityType}|{props.entityId}
    </div>
  ),
}));

import {
  ContextualAssistant,
  resolveContextualAIContext,
} from "./ContextualAssistant";

const courseId = "11111111-1111-4111-8111-111111111111";

function courseAggregate() {
  return {
    course: {
      id: courseId,
      subjectCode: "ENGL",
      courseNumber: "C1000",
      title: "Academic Reading and Writing",
      status: "Draft",
      units: "4",
      catalogDescription: "Practice in academic reading and writing.",
      topCode: "1501.00",
      ccnCode: "ENGL C1000",
      createdBy: "private-local-id",
    },
    slos: [
      {
        sequence: 1,
        outcomeText: "Compose a documented academic argument.",
      },
    ],
    content: [
      {
        sequence: 1,
        topic: "Rhetorical reading",
        hoursAllocated: "18",
      },
    ],
    requisites: [],
    comments: [{ content: "Do not send this comment." }],
    history: [],
    ccnJustification: null,
  };
}

describe("contextual curriculum assistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/dashboard/");
  });

  it("builds a minimized record context without local audit metadata", async () => {
    const repository = {
      getCourse: vi.fn().mockResolvedValue(courseAggregate()),
      getProgram: vi.fn(),
    };
    const resolved = await resolveContextualAIContext(
      "/courses/edit/",
      `?id=${courseId}`,
      "Course outlines",
      repository as never,
    );

    expect(resolved).toMatchObject({
      entityType: "Course",
      entityId: courseId,
      contextLabel: "ENGL C1000 — Academic Reading and Writing",
      context: {
        page: "Course outlines",
        recordType: "Course",
        course: {
          subjectCode: "ENGL",
          courseNumber: "C1000",
          title: "Academic Reading and Writing",
        },
        studentLearningOutcomes: [
          {
            sequence: 1,
            outcomeText: "Compose a documented academic argument.",
          },
        ],
      },
    });
    expect(JSON.stringify(resolved.context)).not.toContain("createdBy");
    expect(JSON.stringify(resolved.context)).not.toContain(
      "Do not send this comment.",
    );
  });

  it("uses general page context when no valid record is in view", async () => {
    const repository = {
      getCourse: vi.fn(),
      getProgram: vi.fn(),
    };
    await expect(
      resolveContextualAIContext(
        "/dashboard/",
        "",
        "Dashboard",
        repository as never,
      ),
    ).resolves.toEqual({
      entityType: null,
      entityId: null,
      contextLabel: "Dashboard",
      context: {
        product: "Calricula local-first curriculum demo",
        page: "Dashboard",
      },
    });
    expect(repository.getCourse).not.toHaveBeenCalled();
    expect(repository.getProgram).not.toHaveBeenCalled();
  });

  it("is reachable from the shell trigger and scopes restored chat to the record", async () => {
    contextState.getCourse.mockResolvedValue(courseAggregate());
    window.history.replaceState(
      {},
      "",
      `/courses/edit/?id=${courseId}`,
    );
    render(
      <ContextualAssistant
        actorId="22222222-2222-4222-8222-222222222222"
        currentPage="Course outlines"
        pathname="/courses/edit/"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Open contextual AI assistant",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Curriculum assistant" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("contextual-chat"),
    ).toHaveTextContent(
      `22222222-2222-4222-8222-222222222222|ENGL C1000 — Academic Reading and Writing|Course|${courseId}`,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Curriculum assistant" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
