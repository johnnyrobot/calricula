import type { EntityType } from "../domain";
import {
  curriculumRepository,
  type AIArtifactPersistence,
  type CurriculumReads,
} from "../data";

import type { AIResult, AITask } from "./types";

export interface AcceptedAIArtifactInput {
  entityType: EntityType;
  entityId: string | null;
  task: AITask;
  content: unknown;
  result: AIResult<unknown>;
}

function sourceIdsFromResult(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const citations = (value as Record<string, unknown>).citations;
  if (!Array.isArray(citations)) return [];
  return [
    ...new Set(
      citations.flatMap((citation) => {
        if (!citation || typeof citation !== "object" || Array.isArray(citation)) {
          return [];
        }
        const sourceId = (citation as Record<string, unknown>).sourceId;
        return typeof sourceId === "string" && sourceId ? [sourceId] : [];
      }),
    ),
  ];
}

// Writing an audit copy needs to know who accepted the suggestion, and
// nothing else the repository can do.
const repository: Pick<CurriculumReads, "getActivePersona"> &
  AIArtifactPersistence = curriculumRepository;

/**
 * Keeps an audit copy of a suggestion only after a person explicitly accepts
 * it. Prompts and rejected suggestions are deliberately not persisted here.
 */
export async function persistAcceptedAIArtifact({
  entityType,
  entityId,
  task,
  content,
  result,
}: AcceptedAIArtifactInput): Promise<void> {
  const actor = await repository.getActivePersona();
  await repository.saveAIArtifact({
    id: crypto.randomUUID(),
    actorId: actor.id,
    conversationId: null,
    entityType,
    entityId,
    task,
    content,
    modelUsed: result.model,
    sourceIds: sourceIdsFromResult(result.data),
    createdAt: new Date().toISOString(),
  });
}
