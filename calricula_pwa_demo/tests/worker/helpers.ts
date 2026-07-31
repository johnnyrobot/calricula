import { expect, vi } from "vitest";

import {
  handleRequest,
  type Env,
  type WorkerDependencies,
} from "../../worker/index";

export const APP_ORIGIN = "https://demo.calricula.test";
export const NOW_MS = Date.UTC(2026, 6, 30, 12, 0, 0);
export const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
export const HMAC_SECRET =
  "calricula-worker-test-hmac-secret-at-least-32-bytes";
export const OPENROUTER_KEY = "sk-or-v1-test-not-a-real-key";
export const FREE_MODELS = [
  "qwen/qwen3-4b:free",
  "meta-llama/llama-3.3-8b-instruct:free",
] as const;

export type JsonEnvelope<T = unknown> = {
  success: boolean;
  data?: T;
  model?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  error?: {
    code: string;
    message: string;
  };
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function json(
  value: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function openRouterSuccess(
  content: string,
  options: {
    model?: string;
    usage?: Record<string, unknown>;
    finishReason?: string;
    refusal?: string;
  } = {},
): Response {
  return json({
    id: "generation-test",
    model: options.model ?? FREE_MODELS[0],
    choices: [
      {
        finish_reason: options.finishReason ?? "stop",
        message: {
          role: "assistant",
          content,
          ...(options.refusal ? { refusal: options.refusal } : {}),
        },
      },
    ],
    usage: options.usage ?? {
      prompt_tokens: 10,
      completion_tokens: 8,
      cost: 0,
      cost_details: {
        upstream_inference_cost: 0,
      },
    },
  });
}

export function turnstileSuccess(): Response {
  return json({
    success: true,
    hostname: new URL(APP_ORIGIN).hostname,
    action: "ai-session",
  });
}

export function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("asset", { status: 200 })),
    },
    AI_ENABLED: "true",
    APP_ORIGIN,
    AI_SESSION_HMAC_SECRET: HMAC_SECRET,
    TURNSTILE_SECRET_KEY: "turnstile-test-secret",
    OPENROUTER_API_KEY: OPENROUTER_KEY,
    OPENROUTER_FREE_MODELS: FREE_MODELS.join(","),
    GLOBAL_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: true })),
    },
    SESSION_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: true })),
    },
    ...overrides,
  };
}

export function dependencies(
  fetchImpl: FetchImplementation,
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    fetch: vi.fn(fetchImpl) as typeof globalThis.fetch,
    now: () => NOW_MS,
    randomUUID: () => REQUEST_ID,
    upstreamTimeoutMs: 100,
    ...overrides,
  };
}

export function apiRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    rawBody?: BodyInit | null;
    origin?: string | null;
    contentType?: string | null;
    cookie?: string;
    headers?: HeadersInit;
  } = {},
): Request {
  const method = options.method ?? "POST";
  const headers = new Headers(options.headers);
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? APP_ORIGIN);
  }
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }
  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }
  const body =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body === undefined
        ? undefined
        : JSON.stringify(options.body);
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body }),
  });
}

export async function envelope<T = unknown>(
  response: Response,
): Promise<JsonEnvelope<T>> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return (await response.json()) as JsonEnvelope<T>;
}

export function cookiePair(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";", 1)[0];
}

export async function createSession(options: {
  env?: Env;
  now?: number;
  installationId?: string;
  existingCookie?: string;
  fetchImpl?: FetchImplementation;
} = {}): Promise<{
  cookie: string;
  response: Response;
  fetchMock: ReturnType<typeof vi.fn<FetchImplementation>>;
  env: Env;
}> {
  const env = options.env ?? baseEnv();
  const fetchMock = vi.fn<FetchImplementation>(
    options.fetchImpl ??
      (async (input) => {
        expect(String(input)).toBe(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        );
        return turnstileSuccess();
      }),
  );
  const response = await handleRequest(
    apiRequest("/api/ai/session", {
      body: {
        token: "turnstile-token",
        installationId:
          options.installationId ?? "installation-test-browser-0001",
      },
      cookie: options.existingCookie,
      headers: {
        "CF-Connecting-IP": "192.0.2.10",
      },
    }),
    env,
    dependencies(fetchMock, {
      now: () => options.now ?? NOW_MS,
    }),
  );
  expect(response.status).toBe(200);
  return {
    cookie: cookiePair(response),
    response,
    fetchMock,
    env,
  };
}

export async function runAi(options: {
  cookie: string;
  upstream: Response | FetchImplementation;
  env?: Env;
  path?: string;
  body?: unknown;
  now?: number;
  upstreamTimeoutMs?: number;
}): Promise<{
  response: Response;
  fetchMock: ReturnType<typeof vi.fn<FetchImplementation>>;
}> {
  let fetchImpl: FetchImplementation;
  if (options.upstream instanceof Response) {
    const upstreamResponse = options.upstream;
    fetchImpl = async () => upstreamResponse;
  } else {
    fetchImpl = options.upstream;
  }
  const fetchMock = vi.fn<FetchImplementation>(fetchImpl);
  const response = await handleRequest(
    apiRequest(options.path ?? "/api/ai/chat", {
      cookie: options.cookie,
      body: options.body ?? {
        input: {
          message: "Help me improve this catalog description.",
        },
      },
    }),
    options.env ?? baseEnv(),
    dependencies(fetchMock, {
      now: () => options.now ?? NOW_MS,
      upstreamTimeoutMs: options.upstreamTimeoutMs ?? 100,
    }),
  );
  return { response, fetchMock };
}
