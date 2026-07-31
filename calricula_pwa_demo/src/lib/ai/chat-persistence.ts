import {
  curriculumRepository,
  type AIConversation,
  type AIMessage,
  type CurriculumRepository,
} from "../data";
import type { EntityType } from "../domain";

import { AI_HISTORY_CONTEXT_LIMIT } from "./schemas";
import type { AIHistoryMessage } from "./types";

export interface AIChatScope {
  actorId: string;
  entityType: EntityType | null;
  entityId: string | null;
  title: string;
}

export interface PersistedAIChat {
  conversationId: string | null;
  history: AIHistoryMessage[];
}

export interface AIChatPersistence {
  load(scope: AIChatScope): Promise<PersistedAIChat>;
  append(
    scope: AIChatScope,
    conversationId: string | null,
    message: AIHistoryMessage,
  ): Promise<PersistedAIChat>;
}

type AIChatRepository = Pick<
  CurriculumRepository,
  "listAIConversations" | "saveAIConversation" | "appendAIMessage"
>;

function historyFromConversation(
  conversation: AIConversation,
): AIHistoryMessage[] {
  return conversation.messages
    .slice(-AI_HISTORY_CONTEXT_LIMIT)
    .map(({ role, content }) => ({ role, content }));
}

function createMessage(message: AIHistoryMessage): AIMessage {
  return {
    id: crypto.randomUUID(),
    role: message.role,
    content: message.content,
    createdAt: new Date().toISOString(),
  };
}

function assertScope(scope: AIChatScope): void {
  if (Boolean(scope.entityType) !== Boolean(scope.entityId)) {
    throw new Error(
      "A contextual AI conversation requires both an entity type and entity id.",
    );
  }
}

export function createAIChatPersistence(
  repository: AIChatRepository = curriculumRepository,
): AIChatPersistence {
  return {
    async load(scope) {
      assertScope(scope);
      const [conversation] = await repository.listAIConversations({
        actorId: scope.actorId,
        entityType: scope.entityType ?? undefined,
        entityId: scope.entityId,
        limit: 1,
      });
      return conversation
        ? {
            conversationId: conversation.id,
            history: historyFromConversation(conversation),
          }
        : { conversationId: null, history: [] };
    },

    async append(scope, conversationId, message) {
      assertScope(scope);
      const domainMessage = createMessage(message);
      let conversation: AIConversation;
      if (conversationId) {
        conversation = await repository.appendAIMessage(
          conversationId,
          domainMessage,
        );
      } else {
        const now = new Date().toISOString();
        conversation = await repository.saveAIConversation({
          id: crypto.randomUUID(),
          actorId: scope.actorId,
          entityType: scope.entityType,
          entityId: scope.entityId,
          title: scope.title.trim() || "Curriculum assistant",
          messages: [domainMessage],
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        conversationId: conversation.id,
        history: historyFromConversation(conversation),
      };
    },
  };
}

export const indexedDBAIChatPersistence = createAIChatPersistence();
