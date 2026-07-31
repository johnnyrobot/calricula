import { describe, expect, it, vi } from "vitest";

import type { AIConversation, AIMessage } from "../domain";

import {
  createAIChatPersistence,
  type AIChatScope,
} from "./chat-persistence";

const scope: AIChatScope = {
  actorId: "11111111-1111-4111-8111-111111111111",
  entityType: "Course",
  entityId: "22222222-2222-4222-8222-222222222222",
  title: "ENGL C1000 assistant",
};

function conversation(
  messages: AIMessage[],
  id = "33333333-3333-4333-8333-333333333333",
): AIConversation {
  return {
    id,
    actorId: scope.actorId,
    entityType: scope.entityType,
    entityId: scope.entityId,
    title: scope.title,
    messages,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

function message(index: number): AIMessage {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    role: index % 2 ? "assistant" : "user",
    content: `message-${index}`,
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("IndexedDB AI chat persistence adapter", () => {
  it("restores only the latest ten local chat messages", async () => {
    const listAIConversations = vi
      .fn()
      .mockResolvedValue([conversation(Array.from({ length: 12 }, (_, index) => message(index)))]);
    const persistence = createAIChatPersistence({
      listAIConversations,
      saveAIConversation: vi.fn(),
      appendAIMessage: vi.fn(),
    });

    await expect(persistence.load(scope)).resolves.toMatchObject({
      conversationId: "33333333-3333-4333-8333-333333333333",
      history: [
        expect.objectContaining({ content: "message-2" }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ content: "message-11" }),
      ],
    });
    expect(listAIConversations).toHaveBeenCalledWith({
      actorId: scope.actorId,
      entityType: "Course",
      entityId: scope.entityId,
      limit: 1,
    });
  });

  it("creates a conversation containing only the intended chat message", async () => {
    const saveAIConversation = vi.fn(async (value: AIConversation) => value);
    const persistence = createAIChatPersistence({
      listAIConversations: vi.fn(),
      saveAIConversation,
      appendAIMessage: vi.fn(),
    });

    const stored = await persistence.append(scope, null, {
      role: "user",
      content: "How should this SLO be measured?",
    });

    expect(stored.history).toEqual([
      { role: "user", content: "How should this SLO be measured?" },
    ]);
    const saved = saveAIConversation.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      actorId: scope.actorId,
      entityType: "Course",
      entityId: scope.entityId,
      title: scope.title,
      messages: [
        {
          role: "user",
          content: "How should this SLO be measured?",
        },
      ],
    });
    expect(saved).not.toHaveProperty("prompt");
    expect(saved).not.toHaveProperty("context");
    expect(saved).not.toHaveProperty("response");
  });

  it("appends assistant messages and returns the repository-capped history", async () => {
    const appendAIMessage = vi.fn(
      async (_id: string, next: AIMessage) =>
        conversation([
          ...Array.from({ length: 10 }, (_, index) => message(index)),
          next,
        ]),
    );
    const persistence = createAIChatPersistence({
      listAIConversations: vi.fn(),
      saveAIConversation: vi.fn(),
      appendAIMessage,
    });

    const stored = await persistence.append(
      scope,
      "33333333-3333-4333-8333-333333333333",
      { role: "assistant", content: "Use an observable performance criterion." },
    );

    expect(appendAIMessage).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      expect.objectContaining({
        role: "assistant",
        content: "Use an observable performance criterion.",
      }),
    );
    expect(stored.history).toHaveLength(10);
    expect(stored.history.at(-1)?.content).toBe(
      "Use an observable performance criterion.",
    );
  });

  it("rejects partial entity scope before touching local storage", async () => {
    const listAIConversations = vi.fn();
    const persistence = createAIChatPersistence({
      listAIConversations,
      saveAIConversation: vi.fn(),
      appendAIMessage: vi.fn(),
    });

    await expect(
      persistence.load({ ...scope, entityId: null }),
    ).rejects.toThrow(/requires both an entity type and entity id/i);
    expect(listAIConversations).not.toHaveBeenCalled();
  });
});
