import {
  AI_TASK_ROUTES,
  type AIEnvelope,
  type AIRequestOptions,
  type AIResult,
  type AISessionData,
  type AISessionRequest,
  type AITask,
  type AITaskRequest,
} from "./types";
import {
  AI_HISTORY_CONTEXT_LIMIT,
  type AITaskOutputMap,
  validateAISessionData,
  validateAITaskOutput,
} from "./schemas";

export class AIRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRetryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function parseEnvelope<T>(value: unknown): AIEnvelope<T> {
  if (!isRecord(value) || typeof value.success !== "boolean") {
    throw new AIRequestError(
      "invalid-response",
      "The AI service returned an unexpected response.",
      502,
    );
  }
  if (
    (value.model !== undefined &&
      (typeof value.model !== "string" || value.model.length > 200)) ||
    (value.requestId !== undefined &&
      (typeof value.requestId !== "string" ||
        value.requestId.length > 200)) ||
    (value.retryAfterSeconds !== undefined &&
      (typeof value.retryAfterSeconds !== "number" ||
        !Number.isFinite(value.retryAfterSeconds) ||
        value.retryAfterSeconds < 0))
  ) {
    throw new AIRequestError(
      "invalid-response",
      "The AI service returned invalid response metadata.",
      502,
    );
  }
  if (value.error !== undefined) {
    if (
      !isRecord(value.error) ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string"
    ) {
      throw new AIRequestError(
        "invalid-response",
        "The AI service returned an invalid error envelope.",
        502,
      );
    }
  }

  return value as unknown as AIEnvelope<T>;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postEnvelope<T>(
  route: string,
  body: unknown,
  options: AIRequestOptions = {},
): Promise<AIResult<T>> {
  let response: Response;
  try {
    response = await fetch(route, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AIRequestError(
      "network-error",
      "The AI service could not be reached. Check your connection and try again.",
      0,
    );
  }

  const raw = await readResponseBody(response);
  let envelope: AIEnvelope<T> | null = null;
  try {
    envelope = parseEnvelope<T>(raw);
  } catch {
    if (response.ok) throw new AIRequestError(
      "invalid-response",
      "The AI service returned an unexpected response.",
      response.status,
    );
  }

  const retryAfterSeconds =
    envelope?.retryAfterSeconds ?? parseRetryAfter(response);
  const requestId = envelope?.requestId ?? null;

  if (!response.ok || !envelope?.success) {
    const fallbackMessage =
      response.status === 429
        ? "The free AI models are busy or rate-limited. Please wait before trying again."
        : response.status === 401 || response.status === 403
          ? "AI verification expired. Verify this browser again to continue."
          : "The AI service could not complete this request.";

    throw new AIRequestError(
      envelope?.error?.code ?? `http-${response.status}`,
      envelope?.error?.message ?? fallbackMessage,
      response.status,
      requestId,
      retryAfterSeconds,
    );
  }

  if (envelope.data === undefined) {
    throw new AIRequestError(
      "missing-data",
      "The AI service completed without returning a suggestion.",
      response.status,
      requestId,
      retryAfterSeconds,
    );
  }

  return {
    data: envelope.data,
    model: envelope.model ?? null,
    requestId,
  };
}

export async function createAISession(
  request: AISessionRequest,
  options: AIRequestOptions = {},
): Promise<AIResult<AISessionData>> {
  const result = await postEnvelope<unknown>(
    "/api/ai/session",
    request,
    options,
  );
  return {
    ...result,
    data: validateAISessionData(result.data, result),
  };
}

export async function runAITask<Task extends AITask>(
  task: Task,
  request: AITaskRequest,
  options: AIRequestOptions = {},
): Promise<AIResult<AITaskOutputMap[Task]>> {
  const result = await postEnvelope<unknown>(
    AI_TASK_ROUTES[task],
    {
      input: request.input,
      ...(request.history
        ? {
            history: request.history.slice(-AI_HISTORY_CONTEXT_LIMIT),
          }
        : {}),
    },
    options,
  );
  return {
    ...result,
    data: validateAITaskOutput(task, result.data, {
      input: request.input,
      model: result.model,
      requestId: result.requestId,
    }),
  };
}

export function extractAIText(
  value: unknown,
  preferredKeys: readonly string[] = [],
): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return null;

  const keys = [
    ...preferredKeys,
    "text",
    "message",
    "content",
    "suggestion",
    "description",
    "topics",
    "suggestions",
    "catalogDescription",
    "programNarrative",
    "explanation",
  ];

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}
