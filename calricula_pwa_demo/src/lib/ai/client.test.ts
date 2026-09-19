import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AIRequestError,
  createAISession,
  extractAIText,
  runAITask,
} from "./client";
import { AIOutputValidationError } from "./schemas";

describe("AI worker client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the exact task route and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { description: "A focused catalog description." },
          model: "openrouter/free",
          requestId: "request-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAITask("catalog-description", {
      input: { title: "Introduction to Design" },
      history: [{ role: "user", content: "Keep it concise." }],
    });

    expect(result.model).toBe("openrouter/free");
    expect(result.data).toEqual({
      description: "A focused catalog description.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/catalog-description",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      input: { title: "Introduction to Design" },
      history: [{ role: "user", content: "Keep it concise." }],
    });
  });

  it("establishes the session using the published body contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { expiresAt: "2026-07-30T20:00:00Z" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAISession({ token: "turnstile-token", installationId: "installation-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/session",
      expect.objectContaining({
        body: JSON.stringify({
          token: "turnstile-token",
          installationId: "installation-1",
        }),
      }),
    );
  });

  it("rejects malformed session data before marking it usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { expiresAt: "not-an-iso-date" },
            requestId: "session-invalid",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      createAISession({
        token: "turnstile-token",
        installationId: "installation-1",
      }),
    ).rejects.toMatchObject({
      task: "session",
      requestId: "session-invalid",
      reason: "schema",
    });
  });

  it("surfaces the worker error envelope and retry interval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            retryAfterSeconds: 45,
            requestId: "request-rate-limit",
            error: {
              code: "rate-limited",
              message: "Free model capacity is temporarily exhausted.",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(runAITask("chat", { input: "Hello" })).rejects.toMatchObject({
      code: "rate-limited",
      status: 429,
      retryAfterSeconds: 45,
      requestId: "request-rate-limit",
    });
  });

  it("rejects successful responses without an envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "not enveloped" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(runAITask("chat", { input: "Hello" })).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it.each([
    { model: { injected: true } },
    { requestId: 42 },
    { retryAfterSeconds: -1 },
    { error: { code: 7, message: "bad" } },
  ])("rejects malformed envelope metadata %#", async (metadata) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { message: "Otherwise valid" },
            ...metadata,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      runAITask("chat", { input: { message: "Hello" } }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejects a successful envelope that omits data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, requestId: "empty-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(runAITask("slos", { input: {} })).rejects.toMatchObject({
      code: "missing-data",
      status: 200,
      requestId: "empty-1",
    });
  });

  it("maps network failures but preserves AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      runAITask("chat", { input: "Hello" }),
    ).rejects.toMatchObject({
      code: "network-error",
      status: 0,
    });

    const abort = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(runAITask("chat", { input: "Hello" })).rejects.toBe(abort);
  });

  it.each([
    [
      429,
      "The free AI models are busy or rate-limited.",
      "27",
      27,
    ],
    [
      401,
      "AI verification expired.",
      "not-a-number",
      null,
    ],
    [
      500,
      "The AI service could not complete this request.",
      undefined,
      null,
    ],
  ] as const)(
    "uses the safe fallback for an unenveloped %i response",
    async (status, message, retryAfter, expectedRetry) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("not json", {
            status,
            headers: retryAfter
              ? {
                  "content-type": "text/plain",
                  "retry-after": retryAfter,
                }
              : { "content-type": "text/plain" },
          }),
        ),
      );

      await expect(
        runAITask("chat", { input: "Hello" }),
      ).rejects.toMatchObject({
        code: `http-${status}`,
        status,
        message: expect.stringContaining(message),
        retryAfterSeconds: expectedRetry,
      });
    },
  );

  it("treats malformed JSON as an invalid successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{broken", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(runAITask("chat", { input: "Hello" })).rejects.toBeInstanceOf(
      AIRequestError,
    );
  });

  it("omits history when absent and defaults optional response metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { message: "Hi" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const result = await runAITask(
      "chat",
      { input: { message: "Hello" } },
      { signal: controller.signal },
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(JSON.parse(String(options.body))).toEqual({
      input: { message: "Hello" },
    });
    expect(options.signal).toBe(controller.signal);
    expect(result).toEqual({
      data: { message: "Hi" },
      model: null,
      requestId: null,
    });
  });

  it.each([
    ["chat", { text: "legacy alias" }],
    ["catalog-description", { text: "legacy alias" }],
    ["slos", { slos: [] }],
    [
      "content-outline",
      {
        topics: [
          {
            sequence: 1,
            topic: "Topic",
            contactHours: 0,
            relatedSloNumbers: [],
          },
        ],
      },
    ],
    [
      "top-code",
      {
        suggestions: [
          {
            code: "9999.99",
            title: "Invented",
            rationale: "Not in the catalog.",
            confidence: 0.5,
          },
        ],
      },
    ],
    ["program-narrative", { programNarrative: "legacy alias" }],
    [
      "compliance-explanation",
      {
        explanation: "No source pack.",
        recommendations: ["Review."],
        citations: [],
        humanReviewRequired: true,
      },
    ],
  ] as const)(
    "rejects invalid successful %s output before returning it",
    async (task, data) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              success: true,
              data,
              model: "openrouter/free",
              requestId: `invalid-${task}`,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );

      const rejection = await runAITask(task, { input: {} }).catch(
        (caught: unknown) => caught,
      );
      expect(rejection).toBeInstanceOf(AIOutputValidationError);
      expect(rejection).toEqual(
        expect.objectContaining({
          task,
          model: "openrouter/free",
          requestId: `invalid-${task}`,
        }),
      );
    },
  );

  it("caps caller-supplied conversation context at ten messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { message: "Validated reply" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAITask("chat", {
      input: { message: "Current" },
      history: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 ? ("assistant" as const) : ("user" as const),
        content: `prior-${index}`,
      })),
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).history).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        role: (index + 2) % 2 ? "assistant" : "user",
        content: `prior-${index + 2}`,
      })),
    );
  });

  it("extracts trimmed text without treating arrays or empty fields as text", () => {
    expect(extractAIText("  Direct text  ")).toBe("Direct text");
    expect(extractAIText({ custom: " Preferred " }, ["custom"])).toBe(
      "Preferred",
    );
    expect(extractAIText({ text: 4, message: " Worker message " })).toBe(
      "Worker message",
    );
    expect(extractAIText({ text: " ", explanation: " Explain " })).toBe(
      "Explain",
    );
    expect(extractAIText({ topics: ["not", "text"] })).toBeNull();
    expect(extractAIText(["not", "a", "record"])).toBeNull();
    expect(extractAIText(null)).toBeNull();
    expect(extractAIText("   ")).toBeNull();
  });
});
