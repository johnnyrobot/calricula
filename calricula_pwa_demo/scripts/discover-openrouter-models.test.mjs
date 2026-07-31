import { describe, expect, it, vi } from "vitest";

import {
  DOCUMENTED_FREE_MODEL_LIMITS,
  MINIMUM_CONTEXT_LENGTH,
  OpenRouterDiscoveryError,
  discoverOpenRouterModels,
  summarizeAuthenticatedKey,
} from "./discover-openrouter-models.mjs";

const API_KEY = "sk-or-v1-test-secret-never-output";
const MODELS = [
  "example/curriculum-alpha:free",
  "example/curriculum-beta:free",
];
const NOW = Date.parse("2026-07-30T06:00:00.000Z");

function model(id, contextLength) {
  return {
    id,
    context_length: contextLength,
    architecture: {
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    pricing: {
      prompt: "0",
      completion: "0",
      request: "0",
    },
    supported_parameters: [
      "response_format",
      "structured_outputs",
    ],
  };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function keyPayload(overrides = {}) {
  return {
    data: {
      is_free_tier: false,
      limit: 25,
      limit_remaining: 12.5,
      limit_reset: "monthly",
      expires_at: "2027-12-31T23:59:59Z",
      // These documented fields are intentionally never projected into
      // release evidence.
      label: "private-production-key-label",
      creator_user_id: "user_private_identifier",
      usage: 12.5,
      usage_daily: 1.25,
      ...overrides,
    },
  };
}

function validFetch(key = keyPayload()) {
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/models/user")) {
      return json({ data: MODELS.map((id) => ({ id })) });
    }
    if (url.pathname.endsWith("/models")) {
      return json({
        data: [
          model(MODELS[0], 128_000),
          model(MODELS[1], 64_000),
          model("example/paid-model", 1_000_000),
        ],
      });
    }
    if (url.pathname.endsWith("/key")) {
      return json(key);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
}

describe("OpenRouter release discovery", () => {
  it("revalidates the current key and emits only safe tier/limit status", async () => {
    const fetchFn = validFetch();
    const result = await discoverOpenRouterModels({
      apiKey: API_KEY,
      configuredModelsValue: MODELS.join(","),
      fetchFn,
      now: NOW,
    });

    expect(result.keyStatus).toEqual({
      authenticated: true,
      accountTier: "credit-enabled",
      documentedFreeModelLimits: {
        requestsPerMinute: 20,
        requestsPerDay: 1_000,
      },
      freeModelDailyRemaining: "not-exposed-by-key-endpoint",
      keySpendLimitStatus: "available",
      keySpendLimitReset: "monthly",
      keyExpirationStatus: "valid",
    });
    expect(result.selectedOrderedChain).toEqual([
      ...MODELS,
      "openrouter/free",
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    const paths = fetchFn.mock.calls.map(([input]) =>
      new URL(String(input)).pathname,
    );
    expect(paths).toContain("/api/v1/key");
    for (const [, init] of fetchFn.mock.calls) {
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Bearer ${API_KEY}`,
      );
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }

    const safeOutput = JSON.stringify(result);
    for (const sensitive of [
      API_KEY,
      "private-production-key-label",
      "user_private_identifier",
      '"usage"',
      '"usage_daily"',
      "12.5",
    ]) {
      expect(safeOutput).not.toContain(sensitive);
    }
  });

  it("maps the authenticated free tier to the current documented caps", () => {
    expect(
      summarizeAuthenticatedKey(
        keyPayload({
          is_free_tier: true,
          limit: null,
          limit_remaining: null,
          limit_reset: null,
          expires_at: null,
        }),
        NOW,
      ),
    ).toEqual({
      authenticated: true,
      accountTier: "free",
      documentedFreeModelLimits: {
        requestsPerMinute:
          DOCUMENTED_FREE_MODEL_LIMITS.requestsPerMinute,
        requestsPerDay:
          DOCUMENTED_FREE_MODEL_LIMITS.freeTierRequestsPerDay,
      },
      freeModelDailyRemaining: "not-exposed-by-key-endpoint",
      keySpendLimitStatus: "not-configured",
      keySpendLimitReset: null,
      keyExpirationStatus: "not-configured",
    });
  });

  it("rejects missing prices and undersized or malformed context windows", async () => {
    const unsafeVariants = [
      {
        ...model(MODELS[0], MINIMUM_CONTEXT_LENGTH),
        pricing: { prompt: "0", completion: "0" },
      },
      model(MODELS[0], MINIMUM_CONTEXT_LENGTH - 1),
      model(MODELS[0], String(MINIMUM_CONTEXT_LENGTH)),
    ];

    for (const unsafe of unsafeVariants) {
      const fetchFn = validFetch();
      fetchFn.mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/models/user")) {
          return json({ data: MODELS.map((id) => ({ id })) });
        }
        if (url.pathname.endsWith("/models")) {
          return json({
            data: [unsafe, model(MODELS[1], MINIMUM_CONTEXT_LENGTH)],
          });
        }
        if (url.pathname.endsWith("/key")) {
          return json(keyPayload());
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      });

      await expect(
        discoverOpenRouterModels({
          apiKey: API_KEY,
          configuredModelsValue: MODELS.join(","),
          fetchFn,
          now: NOW,
        }),
      ).rejects.toThrow("Fewer than 2");
    }
  });

  it("fails closed for malformed, exhausted, or expired key status", () => {
    for (const payload of [
      {},
      { data: {} },
      keyPayload({ is_free_tier: "false" }),
      keyPayload({ limit_remaining: null }),
      keyPayload({ limit_reset: "yearly" }),
      keyPayload({ expires_at: "not-a-date" }),
    ]) {
      expect(() => summarizeAuthenticatedKey(payload, NOW)).toThrow(
        "unexpected response shape",
      );
    }

    expect(() =>
      summarizeAuthenticatedKey(
        keyPayload({ limit_remaining: 0 }),
        NOW,
      ),
    ).toThrow("limit is exhausted");
    expect(() =>
      summarizeAuthenticatedKey(
        keyPayload({ expires_at: "2026-07-30T05:59:59Z" }),
        NOW,
      ),
    ).toThrow("key is expired");
  });

  it("redacts the key and upstream response details from failures", async () => {
    const upstreamSecret = "upstream-private-account-detail";
    const fetchFn = vi.fn(async () =>
      json(
        {
          error: {
            message: `${API_KEY} ${upstreamSecret}`,
          },
        },
        401,
      ),
    );

    let caught;
    try {
      await discoverOpenRouterModels({
        apiKey: API_KEY,
        fetchFn,
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OpenRouterDiscoveryError);
    expect(caught.message).toMatch(/HTTP 401/);
    expect(caught.message).not.toContain(API_KEY);
    expect(caught.message).not.toContain(upstreamSecret);

    const transportFetch = vi.fn(async () => {
      throw new Error(`Authorization: Bearer ${API_KEY}`);
    });
    await expect(
      discoverOpenRouterModels({
        apiKey: API_KEY,
        fetchFn: transportFetch,
        now: NOW,
      }),
    ).rejects.toThrow("could not be reached");
    await expect(
      discoverOpenRouterModels({
        apiKey: API_KEY,
        fetchFn: transportFetch,
        now: NOW,
      }),
    ).rejects.not.toThrow(API_KEY);
  });

  it("rejects oversized responses without reflecting their contents", async () => {
    const oversizedSecret = `secret-${"x".repeat(70 * 1024)}`;
    const fetchFn = validFetch({
      data: {
        ...keyPayload().data,
        label: oversizedSecret,
      },
    });

    await expect(
      discoverOpenRouterModels({
        apiKey: API_KEY,
        fetchFn,
        now: NOW,
      }),
    ).rejects.toThrow("response-size limit");
    await expect(
      discoverOpenRouterModels({
        apiKey: API_KEY,
        fetchFn,
        now: NOW,
      }),
    ).rejects.not.toThrow(oversizedSecret);
  });
});
