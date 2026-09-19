import { describe, expect, it } from "vitest";

import { assertFreeRoutingHonoured, buildFreeRouting } from "./free-routing";

const FREE_MODELS = "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-32b:free";

function routingFor(models: string, structured = false) {
  return buildFreeRouting({ OPENROUTER_FREE_MODELS: models }, { structured });
}

describe("free routing policy", () => {
  it("appends the free catch-all to the configured chain", () => {
    expect(routingFor(FREE_MODELS).models).toEqual([
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-32b:free",
      "openrouter/free",
    ]);
  });

  it("constrains the provider to zero-price zero-retention routing", () => {
    expect(routingFor(FREE_MODELS).provider).toEqual({
      allow_fallbacks: true,
      data_collection: "deny",
      zdr: true,
      max_price: { prompt: 0, completion: 0, request: 0 },
    });
  });

  it("demands parameter support only for structured tasks", () => {
    expect(routingFor(FREE_MODELS, true).provider).toMatchObject({
      require_parameters: true,
    });
    expect(routingFor(FREE_MODELS).provider).not.toHaveProperty(
      "require_parameters",
    );
  });

  it.each([
    ["nothing configured", ""],
    ["a single model", "vendor/one:free"],
    ["the same model twice", "vendor/one:free,vendor/one:free"],
    ["three models", "vendor/a:free,vendor/b:free,vendor/c:free"],
    ["a paid model", "vendor/one:free,openai/gpt-4.1"],
    ["a free-suffixed impostor", "vendor/one:free,not-a-model:free"],
    ["the catch-all as a configured model", "vendor/one:free,openrouter/free"],
  ])("fails closed when the configuration is %s", (_description, models) => {
    expect(() => routingFor(models)).toThrowError(
      /AI service configuration is unavailable/,
    );
  });

  it.each([
    ["a configured free model", "qwen/qwen3-32b:free"],
    ["the free catch-all", "openrouter/free"],
  ])("accepts a response served by %s", (_description, model) => {
    expect(assertFreeRoutingHonoured({ model })).toBe(model);
  });

  it.each([
    ["a paid model", { model: "openai/gpt-4.1" }],
    ["no model at all", {}],
    ["an over-long model name", { model: `${"a".repeat(201)}:free` }],
  ])("rejects a response served by %s", (_description, payload) => {
    expect(() => assertFreeRoutingHonoured(payload)).toThrowError(
      /did not confirm a free model/,
    );
  });

  it.each([
    ["a charged request", { cost: 0.002 }],
    ["a charged detail line", { cost: 0, cost_details: { upstream: 0.5 } }],
    ["a non-numeric cost", { cost: "0" }],
  ])("rejects usage reporting %s", (_description, usage) => {
    expect(() =>
      assertFreeRoutingHonoured({ model: "openrouter/free", usage }),
    ).toThrowError(/reported a non-free request/);
  });

  it.each([
    ["usage is absent", {}],
    ["cost is exactly zero", { usage: { cost: 0 } }],
    ["cost is unreported", { usage: { cost: null } }],
    ["every detail line is zero", { usage: { cost: 0, cost_details: { a: 0 } } }],
  ])("accepts a free response when %s", (_description, extra) => {
    expect(
      assertFreeRoutingHonoured({ model: "openrouter/free", ...extra }),
    ).toBe("openrouter/free");
  });
});
