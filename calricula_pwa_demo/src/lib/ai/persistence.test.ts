import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getActivePersona: vi.fn(),
  saveAIArtifact: vi.fn(),
}));

vi.mock("../data", () => ({
  curriculumRepository: repository,
}));

import { persistAcceptedAIArtifact } from "./persistence";

describe("accepted AI artifact persistence", () => {
  beforeEach(() => {
    repository.getActivePersona.mockReset();
    repository.saveAIArtifact.mockReset();
    repository.getActivePersona.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    repository.saveAIArtifact.mockImplementation(async (value) => value);
  });

  it("records the active actor, entity, task, model, and accepted content", async () => {
    await persistAcceptedAIArtifact({
      entityType: "Course",
      entityId: "22222222-2222-4222-8222-222222222222",
      task: "catalog-description",
      content: "Accepted catalog copy",
      result: {
        data: { description: "Accepted catalog copy" },
        model: "openrouter/free-model",
        requestId: "request-1",
      },
    });

    expect(repository.saveAIArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "11111111-1111-4111-8111-111111111111",
        conversationId: null,
        entityType: "Course",
        entityId: "22222222-2222-4222-8222-222222222222",
        task: "catalog-description",
        content: "Accepted catalog copy",
        modelUsed: "openrouter/free-model",
        sourceIds: [],
      }),
    );
  });

  it("retains server-owned compliance source identifiers", async () => {
    await persistAcceptedAIArtifact({
      entityType: "Course",
      entityId: "22222222-2222-4222-8222-222222222222",
      task: "compliance-explanation",
      content: { explanation: "Review required." },
      result: {
        data: {
          citations: [
            { sourceId: "title5-credit-hour" },
            { sourceId: "pcah-current-edition" },
            { sourceId: "title5-credit-hour" },
          ],
        },
        model: "openrouter/free-model",
        requestId: "request-2",
      },
    });

    expect(repository.saveAIArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ["title5-credit-hour", "pcah-current-edition"],
      }),
    );
  });

  it.each([
    [null, []],
    [["array response"], []],
    [
      {
        citations: [
          null,
          "not-an-object",
          [],
          {},
          { sourceId: 7 },
          { sourceId: "" },
          { sourceId: "valid-source" },
        ],
      },
      ["valid-source"],
    ],
  ] as const)("safely ignores malformed citation data", async (data, sourceIds) => {
    await persistAcceptedAIArtifact({
      entityType: "Course",
      entityId: "22222222-2222-4222-8222-222222222222",
      task: "compliance-explanation",
      content: "Accepted",
      result: {
        data,
        model: null,
        requestId: null,
      },
    });

    expect(repository.saveAIArtifact).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceIds }),
    );
  });
});
