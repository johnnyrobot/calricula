export const AI_TASK_ROUTES = {
  chat: "/api/ai/chat",
  "catalog-description": "/api/ai/catalog-description",
  slos: "/api/ai/slos",
  "content-outline": "/api/ai/content-outline",
  "top-code": "/api/ai/top-code",
  "program-narrative": "/api/ai/program-narrative",
  "compliance-explanation": "/api/ai/compliance-explanation",
} as const;

export type AITask = keyof typeof AI_TASK_ROUTES;

export interface AIHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AITaskRequest {
  input: unknown;
  history?: readonly AIHistoryMessage[];
}

export interface AIEnvelopeError {
  code: string;
  message: string;
}

export interface AIEnvelope<T> {
  success: boolean;
  data?: T;
  model?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  error?: AIEnvelopeError;
}

export interface AISessionRequest {
  token: string;
  installationId: string;
}

export interface AISessionData {
  expiresAt?: string;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
}

export interface AIResult<T> {
  data: T;
  model: string | null;
  requestId: string | null;
}
