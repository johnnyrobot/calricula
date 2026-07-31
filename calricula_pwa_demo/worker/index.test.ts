import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleRequest,
  type Env,
  type RateLimitBinding,
  type WorkerDependencies,
} from "./index";

const APP_ORIGIN = "https://calricula.example.test";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TURNSTILE_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const FIXED_NOW = Date.UTC(2026, 6, 30, 12, 0, 0);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const HMAC_SECRET = "worker-test-hmac-secret-".padEnd(64, "0");

type FetchResponder = (
  body: Record<string, unknown>,
  init: RequestInit,
) => Response | Promise<Response>;

type FetchHarnessOptions = {
  turnstile?: FetchResponder;
  openrouter?: FetchResponder;
};

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

function completionResponse(
  content = "A concise curriculum-writing suggestion.",
  options: {
    model?: string;
    usage?: unknown;
    status?: number;
    headers?: HeadersInit;
  } = {},
): Response {
  return jsonResponse(
    {
      id: "generation-test",
      model: options.model ?? "meta-llama/llama-3.3-70b-instruct:free",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
      usage: options.usage ?? { cost: 0 },
    },
    options.status ?? 200,
    options.headers,
  );
}

function inputUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

function parseFetchBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    return {};
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

function createFetchHarness(options: FetchHarnessOptions = {}) {
  const turnstile =
    options.turnstile ??
    (() =>
      jsonResponse({
        success: true,
        hostname: "calricula.example.test",
        action: "ai-session",
      }));
  const openrouter =
    options.openrouter ?? (() => completionResponse());

  const mock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = inputUrl(input);
      const body = parseFetchBody(init);
      if (url === TURNSTILE_URL) {
        return turnstile(body, init ?? {});
      }
      if (url === OPENROUTER_URL) {
        return openrouter(body, init ?? {});
      }
      throw new Error(`Unexpected fetch target: ${url}`);
    },
  );
  return {
    fetch: mock as unknown as typeof globalThis.fetch,
    mock,
  };
}

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("asset", { status: 200 })),
    },
    AI_ENABLED: "true",
    APP_ORIGIN,
    AI_SESSION_HMAC_SECRET: HMAC_SECRET,
    OPENROUTER_API_KEY: "test-only-openrouter-key",
    OPENROUTER_FREE_MODELS:
      "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-32b:free",
    TURNSTILE_SECRET_KEY: "test-only-turnstile-secret",
    GLOBAL_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: true })),
    },
    SESSION_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: true })),
    },
    ...overrides,
  };
}

function postRequest(
  path: string,
  body: unknown,
  options: {
    origin?: string | null;
    contentType?: string | null;
    cookie?: string;
    headers?: HeadersInit;
  } = {},
): Request {
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
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function dependencies(
  fetchImpl: typeof globalThis.fetch,
  now = FIXED_NOW,
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    fetch: fetchImpl,
    now: () => now,
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function cookiePair(response: Response): string {
  const setCookie = response.headers.get("Set-Cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";", 1)[0];
}

async function startSession(
  env: Env,
  harness: ReturnType<typeof createFetchHarness>,
  options: {
    now?: number;
    installationId?: string;
    cookie?: string;
  } = {},
): Promise<{ cookie: string; response: Response }> {
  const response = await handleRequest(
    postRequest(
      "/api/ai/session",
      {
        token: "turnstile-test-token",
        installationId:
          options.installationId ?? "installation-test-00000001",
      },
      { cookie: options.cookie },
    ),
    env,
    dependencies(harness.fetch, options.now),
  );
  return {
    cookie: cookiePair(response),
    response,
  };
}

async function requestAi(
  path: string,
  input: unknown,
  cookie: string,
  env: Env,
  harness: ReturnType<typeof createFetchHarness>,
  options: {
    now?: number;
    body?: Record<string, unknown>;
    dependencies?: Partial<WorkerDependencies>;
  } = {},
): Promise<Response> {
  return handleRequest(
    postRequest(
      path,
      options.body ?? {
        input,
      },
      { cookie },
    ),
    env,
    dependencies(
      harness.fetch,
      options.now,
      options.dependencies ?? {},
    ),
  );
}

function callsTo(
  harness: ReturnType<typeof createFetchHarness>,
  url: string,
) {
  return harness.mock.mock.calls.filter(([input]) => inputUrl(input) === url);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routing and API envelopes", () => {
  it("serves health without AI configuration and disables caching", async () => {
    const env = baseEnv({
      AI_ENABLED: "false",
      APP_ORIGIN: undefined,
      OPENROUTER_API_KEY: undefined,
      TURNSTILE_SECRET_KEY: undefined,
      AI_SESSION_HMAC_SECRET: undefined,
    });

    const response = await handleRequest(
      new Request(`${APP_ORIGIN}/api/health`),
      env,
      {
        randomUUID: () => "health-request",
      },
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, max-age=0",
    );
    expect(body).toEqual({
      success: true,
      data: {
        status: "ok",
        aiEnabled: false,
      },
      requestId: "health-request",
    });
  });

  it("delegates non-API requests to the static asset binding", async () => {
    const assetFetch = vi.fn(
      async () => new Response("landing", { status: 200 }),
    );
    const env = baseEnv({
      ASSETS: {
        fetch: assetFetch,
      },
    });
    const request = new Request(`${APP_ORIGIN}/courses/CS-101`);

    const response = await handleRequest(request, env);

    expect(await response.text()).toBe("landing");
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(assetFetch).toHaveBeenCalledWith(request);
  });

  it("returns a JSON 404 for every unknown API route", async () => {
    const response = await handleRequest(
      new Request(`${APP_ORIGIN}/api/not-real`),
      baseEnv(),
      {
        randomUUID: () => "not-found-request",
      },
    );
    const body = await responseBody(response);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain(
      "application/json",
    );
    expect(body.error).toEqual({
      code: "NOT_FOUND",
      message: "API endpoint not found.",
    });
  });

  it("returns 405 for the wrong method on a known route", async () => {
    const response = await handleRequest(
      new Request(`${APP_ORIGIN}/api/ai/chat`),
      baseEnv(),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(405);
    expect(body.error).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  });
});

describe("strict POST boundary", () => {
  it.each([
    ["missing", null],
    ["mismatched", "https://attacker.example"],
  ])("rejects a %s Origin", async (_label, origin) => {
    const harness = createFetchHarness();
    const response = await handleRequest(
      postRequest(
        "/api/ai/session",
        {
          token: "turnstile-test-token",
          installationId: "installation-test-00000001",
        },
        { origin },
      ),
      baseEnv(),
      dependencies(harness.fetch),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "ORIGIN_FORBIDDEN" });
    expect(harness.mock).not.toHaveBeenCalled();
  });

  it("requires application/json", async () => {
    const harness = createFetchHarness();
    const response = await handleRequest(
      postRequest("/api/ai/session", "plain text", {
        contentType: "text/plain",
      }),
      baseEnv(),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(415);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects malformed JSON", async () => {
    const harness = createFetchHarness();
    const response = await handleRequest(
      postRequest("/api/ai/session", "{broken"),
      baseEnv(),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(400);
    expect((await responseBody(response)).error).toMatchObject({
      code: "INVALID_JSON",
    });
  });

  it("rejects a request body larger than 64 KiB", async () => {
    const harness = createFetchHarness();
    const response = await handleRequest(
      postRequest("/api/ai/session", {
        token: "x".repeat(66 * 1024),
        installationId: "installation-test-00000001",
      }),
      baseEnv(),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(413);
    expect((await responseBody(response)).error).toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it.each([
    "model",
    "provider",
    "system",
    "plugins",
    "tools",
    "stream",
    "token",
  ])("rejects the top-level %s override", async (field) => {
    const harness = createFetchHarness();
    const env = baseEnv();
    const session = await startSession(env, harness);
    const response = await requestAi(
      "/api/ai/chat",
      null,
      session.cookie,
      env,
      harness,
      {
        body: {
          input: { course: "CS 101" },
          [field]: field === "stream" ? true : "attacker-controlled",
        },
      },
    );

    expect(response.status).toBe(400);
    expect((await responseBody(response)).error).toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });

  it("enforces input and history bounds", async () => {
    const harness = createFetchHarness();
    const env = baseEnv();
    const session = await startSession(env, harness);
    const oversizedField = await requestAi(
      "/api/ai/chat",
      { text: "x".repeat(12_001) },
      session.cookie,
      env,
      harness,
    );
    const excessiveHistory = await requestAi(
      "/api/ai/chat",
      null,
      session.cookie,
      env,
      harness,
      {
        body: {
          input: "hello",
          history: Array.from({ length: 13 }, () => ({
            role: "user",
            content: "hello",
          })),
        },
      },
    );

    expect(oversizedField.status).toBe(400);
    expect(excessiveHistory.status).toBe(400);
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });
});

describe("Turnstile and signed anonymous sessions", () => {
  it("verifies hostname and action before setting a hardened 24-hour cookie", async () => {
    const harness = createFetchHarness();
    const result = await startSession(baseEnv(), harness);
    const setCookie = result.response.headers.get("Set-Cookie")!;
    const turnstileCall = callsTo(harness, TURNSTILE_URL)[0];
    const turnstileBody = parseFetchBody(turnstileCall[1]);

    expect(result.response.status).toBe(200);
    expect(setCookie).toContain("__Host-calricula_ai_session=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(turnstileBody).toMatchObject({
      secret: "test-only-turnstile-secret",
      response: "turnstile-test-token",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    });
  });

  it.each([
    [
      "hostname",
      {
        success: true,
        hostname: "attacker.example",
        action: "ai-session",
      },
    ],
    [
      "action",
      {
        success: true,
        hostname: "calricula.example.test",
        action: "other-action",
      },
    ],
    [
      "challenge result",
      {
        success: false,
        hostname: "calricula.example.test",
        action: "ai-session",
      },
    ],
  ])("rejects a mismatched Turnstile %s", async (_label, result) => {
    const harness = createFetchHarness({
      turnstile: () => jsonResponse(result),
    });
    const globalLimit = vi.fn(async () => ({ success: true }));
    const challengeLimit = vi.fn(
      async (options: { key: string }) => ({
        success: options.key.length > 0,
      }),
    );
    const response = await handleRequest(
      postRequest("/api/ai/session", {
        token: "turnstile-test-token",
        installationId: "installation-test-00000001",
      }),
      baseEnv({
        GLOBAL_RATE_LIMIT: { limit: globalLimit },
        SESSION_RATE_LIMIT: { limit: challengeLimit },
      }),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(403);
    expect((await responseBody(response)).error).toMatchObject({
      code: "TURNSTILE_FAILED",
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(challengeLimit).toHaveBeenCalledOnce();
    expect(challengeLimit.mock.calls[0]?.[0].key).toMatch(
      /^challenge:[A-Za-z0-9_-]{32}$/,
    );
    expect(globalLimit).not.toHaveBeenCalled();
  });

  it("fails closed when Turnstile is unavailable", async () => {
    const harness = createFetchHarness({
      turnstile: () => {
        throw new Error("network unavailable");
      },
    });
    const response = await handleRequest(
      postRequest("/api/ai/session", {
        token: "turnstile-test-token",
        installationId: "installation-test-00000001",
      }),
      baseEnv(),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(503);
    expect((await responseBody(response)).error).toMatchObject({
      code: "TURNSTILE_UNAVAILABLE",
    });
  });

  it("rejects a tampered cookie before contacting OpenRouter", async () => {
    const harness = createFetchHarness();
    const env = baseEnv();
    const session = await startSession(env, harness);
    const tampered =
      session.cookie.slice(0, -1) +
      (session.cookie.endsWith("a") ? "b" : "a");

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      tampered,
      env,
      harness,
    );

    expect(response.status).toBe(401);
    expect((await responseBody(response)).error).toMatchObject({
      code: "SESSION_INVALID",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });

  it("rejects an expired cookie before contacting OpenRouter", async () => {
    const harness = createFetchHarness();
    const env = baseEnv();
    const session = await startSession(env, harness, { now: FIXED_NOW });

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
      { now: FIXED_NOW + SESSION_TTL_MS + 1000 },
    );

    expect(response.status).toBe(401);
    expect((await responseBody(response)).error).toMatchObject({
      code: "SESSION_EXPIRED",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });

  it("checks the session before revealing provider configuration state", async () => {
    const harness = createFetchHarness();
    const response = await handleRequest(
      postRequest("/api/ai/chat", { input: "hello" }),
      baseEnv({
        OPENROUTER_API_KEY: undefined,
        OPENROUTER_FREE_MODELS: "paid/model",
      }),
      dependencies(harness.fetch),
    );

    expect(response.status).toBe(401);
    expect((await responseBody(response)).error).toMatchObject({
      code: "SESSION_REQUIRED",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });

  it("allows five daily attempts and rejects the sixth", async () => {
    const harness = createFetchHarness();
    const env = baseEnv();
    let { cookie } = await startSession(env, harness);

    for (let index = 0; index < 5; index += 1) {
      const response = await requestAi(
        "/api/ai/chat",
        `message ${index}`,
        cookie,
        env,
        harness,
      );
      expect(response.status).toBe(200);
      cookie = cookiePair(response);
    }

    const sixth = await requestAi(
      "/api/ai/chat",
      "one more",
      cookie,
      env,
      harness,
    );
    const body = await responseBody(sixth);

    expect(sixth.status).toBe(429);
    expect(body.error).toMatchObject({ code: "DAILY_LIMIT_EXCEEDED" });
    expect(body.retryAfterSeconds).toBe(43_200);
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(5);
  });
});

describe("Cloudflare rate-limit bindings", () => {
  it("enforces a configured global limiter", async () => {
    const harness = createFetchHarness();
    const initialEnv = baseEnv();
    const session = await startSession(initialEnv, harness);
    const limiter: RateLimitBinding = {
      limit: vi.fn(async () => ({ success: false })),
    };
    const env = baseEnv({ GLOBAL_RATE_LIMIT: limiter });

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );
    const body = await responseBody(response);

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({ code: "RATE_LIMITED" });
    expect(body.retryAfterSeconds).toBe(60);
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });

  it("fails closed when a configured limiter throws", async () => {
    const harness = createFetchHarness();
    const initialEnv = baseEnv();
    const session = await startSession(initialEnv, harness);
    const limiter: RateLimitBinding = {
      limit: vi.fn(async () => {
        throw new Error("binding unavailable");
      }),
    };
    const env = baseEnv({ SESSION_RATE_LIMIT: limiter });

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(503);
    expect((await responseBody(response)).error).toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });
});

describe("OpenRouter request policy", () => {
  it("builds a non-streaming, zero-price, privacy-restricted free-model request", async () => {
    const harness = createFetchHarness();
    const env = baseEnv();
    const installationId = "installation-private-000001";
    const session = await startSession(env, harness, { installationId });

    const response = await requestAi(
      "/api/ai/chat",
      { courseTitle: "Introduction to Programming" },
      session.cookie,
      env,
      harness,
    );
    const openRouterCall = callsTo(harness, OPENROUTER_URL)[0];
    const outbound = parseFetchBody(openRouterCall[1]);
    const headers = new Headers(openRouterCall[1]?.headers);

    expect(response.status).toBe(200);
    expect(outbound.models).toEqual([
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-32b:free",
      "openrouter/free",
    ]);
    expect(outbound.provider).toEqual({
      allow_fallbacks: true,
      data_collection: "deny",
      zdr: true,
      max_price: {
        prompt: 0,
        completion: 0,
        request: 0,
      },
    });
    expect(outbound.stream).toBe(false);
    expect(outbound).not.toHaveProperty("model");
    expect(outbound).not.toHaveProperty("response_format");
    expect(outbound).not.toHaveProperty("plugins");
    expect(outbound).not.toHaveProperty("tools");
    expect(outbound).not.toHaveProperty("user");
    expect(JSON.stringify(outbound)).not.toContain(installationId);
    expect(headers.get("Authorization")).toBe(
      "Bearer test-only-openrouter-key",
    );
    expect(headers.get("HTTP-Referer")).toBe(APP_ORIGIN);
    expect(headers.get("X-OpenRouter-Title")).toBe(
      "Calricula PWA Demo",
    );
  });

  it("fails closed when a configured model is not an exact :free model", async () => {
    const harness = createFetchHarness();
    const initialEnv = baseEnv();
    const session = await startSession(initialEnv, harness);
    const env = baseEnv({
      OPENROUTER_FREE_MODELS: "openai/gpt-4.1",
    });

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(503);
    expect((await responseBody(response)).error).toMatchObject({
      code: "AI_CONFIGURATION_ERROR",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(0);
  });
});

describe("strict structured curriculum tasks", () => {
  const cases = [
    {
      path: "/api/ai/catalog-description",
      schemaName: "catalog_description",
      input: { title: "Data Structures" },
      content: JSON.stringify({
        description:
          "Introduces data structures, their implementation, and algorithmic analysis.",
      }),
    },
    {
      path: "/api/ai/slos",
      schemaName: "student_learning_outcomes",
      input: { title: "Data Structures" },
      content: JSON.stringify({
        slos: [
          "Implement and evaluate data structures for a defined computing problem.",
        ],
      }),
    },
    {
      path: "/api/ai/content-outline",
      schemaName: "course_content_outline",
      input: { title: "Data Structures", contactHours: 3 },
      content: JSON.stringify({
        topics: [
          {
            sequence: 1,
            topic: "Linear structures",
            contactHours: 1,
            relatedSloNumbers: [1],
          },
          {
            sequence: 2,
            topic: "Trees and graphs",
            contactHours: 2,
            relatedSloNumbers: [1],
          },
        ],
      }),
    },
    {
      path: "/api/ai/top-code",
      schemaName: "top_code_suggestions",
      input: { title: "Systems Analysis" },
      content: JSON.stringify({
        suggestions: [
          {
            code: "0707.00",
            title: "Computer Information Systems",
            rationale: "The course centers on information systems analysis.",
            confidence: 0.82,
          },
        ],
      }),
    },
    {
      path: "/api/ai/program-narrative",
      schemaName: "program_narrative",
      input: { title: "Data Analytics Certificate" },
      content: JSON.stringify({
        goalsAndObjectives:
          "Prepare students to analyze and communicate data.",
        catalogDescription:
          "A certificate in practical data analysis and communication.",
        requirementsJustification:
          "The required courses build a coherent sequence of applied skills.",
        laborMarketAnalysis: "",
      }),
    },
    {
      path: "/api/ai/compliance-explanation",
      schemaName: "compliance_explanation",
      input: { units: 3, totalContactHours: 144 },
      content: JSON.stringify({
        explanation:
          "The proposed hours require local review against the credit-hour standard.",
        recommendations: [
          "Confirm the district credit-hour calculation policy.",
        ],
        citations: [
          {
            sourceId: "title5-credit-hour",
            supports: "Defines the minimum semester hours for one unit.",
          },
        ],
        humanReviewRequired: true,
      }),
    },
  ] as const;

  it.each(cases)(
    "uses strict JSON schema and validates $schemaName",
    async ({ path, schemaName, input, content }, caseIndex) => {
      const harness = createFetchHarness({
        openrouter: () => completionResponse(content),
      });
      const env = baseEnv();
      const session = await startSession(env, harness, {
        installationId: `structured-installation-${String(caseIndex).padStart(4, "0")}`,
      });

      const response = await requestAi(
        path,
        input,
        session.cookie,
        env,
        harness,
      );
      const openRouterCall = callsTo(harness, OPENROUTER_URL)[0];
      const outbound = parseFetchBody(openRouterCall[1]);
      const provider = outbound.provider as Record<string, unknown>;
      const format = outbound.response_format as Record<string, unknown>;
      const jsonSchema = format.json_schema as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(provider.require_parameters).toBe(true);
      expect(format.type).toBe("json_schema");
      expect(jsonSchema.name).toBe(schemaName);
      expect(jsonSchema.strict).toBe(true);
      expect(
        (jsonSchema.schema as Record<string, unknown>)
          .additionalProperties,
      ).toBe(false);
    },
  );

  it("returns citation metadata only from the server-owned source pack", async () => {
    const harness = createFetchHarness({
      openrouter: () =>
        completionResponse(
          JSON.stringify({
            explanation: "A human should verify the credit calculation.",
            recommendations: ["Review the district policy."],
            citations: [
              {
                sourceId: "title5-credit-hour",
                supports: "The minimum-hour rule.",
              },
            ],
            humanReviewRequired: true,
          }),
        ),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/compliance-explanation",
      { units: 3 },
      session.cookie,
      env,
      harness,
    );
    const body = await responseBody(response);
    const data = body.data as Record<string, unknown>;
    const citation = (data.citations as Record<string, unknown>[])[0];

    expect(citation).toEqual({
      sourceId: "title5-credit-hour",
      sourceTitle:
        "California Code of Regulations, title 5, section 55002.5",
      sourceSection: "§ 55002.5(a), Credit Hour Definition",
      excerpt:
        "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
      url: expect.stringContaining("govt.westlaw.com/calregs/Document/"),
      checksum:
        "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
      supports: "The minimum-hour rule.",
    });
    expect(citation.checksum).toBe(
      `sha256:${await sha256Hex(String(citation.excerpt))}`,
    );
  });

  it.each([
    {
      label: "extra structured field",
      path: "/api/ai/slos",
      input: {},
      content: JSON.stringify({
        slos: ["Analyze a problem."],
        injected: "not allowed",
      }),
    },
    {
      label: "mismatched outline hours",
      path: "/api/ai/content-outline",
      input: { contactHours: 3 },
      content: JSON.stringify({
        topics: [
          {
            sequence: 1,
            topic: "Foundations",
            contactHours: 2,
            relatedSloNumbers: [],
          },
        ],
      }),
    },
    {
      label: "TOP code outside local catalog",
      path: "/api/ai/top-code",
      input: {},
      content: JSON.stringify({
        suggestions: [
          {
            code: "9999.99",
            title: "Invented",
            rationale: "Not in the demo fixture.",
            confidence: 0.5,
          },
        ],
      }),
    },
    {
      label: "citation outside source pack",
      path: "/api/ai/compliance-explanation",
      input: {},
      content: JSON.stringify({
        explanation: "An unsupported citation.",
        recommendations: ["Review it."],
        citations: [
          {
            sourceId: "attacker-supplied-source",
            supports: "Nothing.",
          },
        ],
        humanReviewRequired: true,
      }),
    },
    {
      label: "compliance without human review",
      path: "/api/ai/compliance-explanation",
      input: {},
      content: JSON.stringify({
        explanation: "An overconfident answer.",
        recommendations: ["Approve automatically."],
        citations: [
          {
            sourceId: "title5-credit-hour",
            supports: "The minimum-hour rule.",
          },
        ],
        humanReviewRequired: false,
      }),
    },
  ])("rejects $label", async ({ path, input, content }) => {
    const harness = createFetchHarness({
      openrouter: () => completionResponse(content),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      path,
      input,
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(502);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UPSTREAM_INVALID_RESPONSE",
    });
  });
});

describe("OpenRouter response and error handling", () => {
  it.each([
    [400, "UPSTREAM_REJECTED_REQUEST", 400],
    [401, "AI_CONFIGURATION_ERROR", 503],
    [402, "AI_CONFIGURATION_ERROR", 503],
    [403, "AI_CONTENT_BLOCKED", 403],
    [408, "UPSTREAM_TIMEOUT", 504],
    [429, "UPSTREAM_RATE_LIMITED", 429],
    [502, "UPSTREAM_UNAVAILABLE", 503],
    [503, "UPSTREAM_UNAVAILABLE", 503],
    [504, "UPSTREAM_TIMEOUT", 504],
    [529, "UPSTREAM_UNAVAILABLE", 503],
    [500, "UPSTREAM_ERROR", 502],
  ])(
    "maps upstream HTTP %i to %s",
    async (upstreamStatus, expectedCode, expectedStatus) => {
      const harness = createFetchHarness({
        openrouter: () =>
          jsonResponse(
            {
              error: {
                code: upstreamStatus,
                message: "raw provider detail",
              },
            },
            upstreamStatus,
            upstreamStatus === 429 || upstreamStatus === 503
              ? { "Retry-After": "17" }
              : undefined,
          ),
      });
      const env = baseEnv();
      const session = await startSession(env, harness);

      const response = await requestAi(
        "/api/ai/chat",
        "hello",
        session.cookie,
        env,
        harness,
      );
      const body = await responseBody(response);

      expect(response.status).toBe(expectedStatus);
      expect(body.error).toMatchObject({ code: expectedCode });
      if (upstreamStatus === 429 || upstreamStatus === 503) {
        expect(body.retryAfterSeconds).toBe(17);
      }
      expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(1);
    },
  );

  it("maps an embedded 200 error and does not retry it", async () => {
    const harness = createFetchHarness({
      openrouter: () =>
        jsonResponse({
          error: {
            code: 429,
            message: "rate limit",
            metadata: {
              error_type: "rate_limit_exceeded",
            },
          },
        }),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(429);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UPSTREAM_RATE_LIMITED",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(1);
  });

  it.each([
    [
      "malformed JSON",
      () =>
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ],
    ["empty choices", () => jsonResponse({ model: "model:free", choices: [] })],
    [
      "empty content",
      () =>
        jsonResponse({
          model: "model:free",
          choices: [{ message: { content: "" } }],
          usage: { cost: 0 },
        }),
    ],
  ])("rejects an upstream response with %s", async (_label, responder) => {
    const harness = createFetchHarness({
      openrouter: responder,
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(502);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UPSTREAM_INVALID_RESPONSE",
    });
  });

  it.each([
    [
      "a paid model",
      {
        model: "openai/gpt-4.1",
        usage: { cost: 0 },
      },
    ],
    [
      "a nonzero total cost",
      {
        model: "meta-llama/llama-3.3-70b-instruct:free",
        usage: { cost: 0.001 },
      },
    ],
    [
      "a nonzero detailed cost",
      {
        model: "meta-llama/llama-3.3-70b-instruct:free",
        usage: {
          cost: 0,
          cost_details: { upstream_inference_cost: 0.001 },
        },
      },
    ],
  ])("rejects a response reporting %s", async (_label, policy) => {
    const harness = createFetchHarness({
      openrouter: () =>
        completionResponse("hello", {
          model: policy.model,
          usage: policy.usage,
        }),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
    );

    expect(response.status).toBe(502);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UPSTREAM_POLICY_VIOLATION",
    });
  });

  it("aborts an upstream request at the configured timeout", async () => {
    const harness = createFetchHarness({
      openrouter: (_body, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/chat",
      "hello",
      session.cookie,
      env,
      harness,
      {
        dependencies: {
          upstreamTimeoutMs: 5,
        },
      },
    );

    expect(response.status).toBe(504);
    expect((await responseBody(response)).error).toMatchObject({
      code: "UPSTREAM_TIMEOUT",
    });
    expect(callsTo(harness, OPENROUTER_URL)).toHaveLength(1);
  });

  it("never logs prompt content or raw upstream bodies", async () => {
    const sensitive = "PRIVATE-CURRICULUM-CONTENT-DO-NOT-LOG";
    const rawUpstream = `RAW-UPSTREAM-${sensitive}`;
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
    ];
    const harness = createFetchHarness({
      openrouter: () =>
        jsonResponse(
          {
            error: {
              code: 500,
              message: rawUpstream,
            },
          },
          500,
        ),
    });
    const env = baseEnv();
    const session = await startSession(env, harness);

    const response = await requestAi(
      "/api/ai/chat",
      sensitive,
      session.cookie,
      env,
      harness,
    );
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(responseText).not.toContain(sensitive);
    expect(responseText).not.toContain(rawUpstream);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
