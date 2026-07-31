import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./worker/index.ts",
      miniflare: {
        compatibilityDate: "2026-07-29",
        bindings: {
          AI_ENABLED: "true",
          AI_SESSION_HMAC_SECRET:
            "test-only-hmac-secret-00000000000000000000000000000000",
          APP_ORIGIN: "https://calricula.example.test",
          OPENROUTER_API_KEY: "test-only-openrouter-key",
          OPENROUTER_FREE_MODELS: "example/eval-approved-model:free",
          // Cloudflare's documented always-pass test secret. It has no
          // production privileges and must never be copied to Wrangler secrets.
          TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        },
        ratelimits: {
          GLOBAL_RATE_LIMIT: {
            namespace_id: "1739447413",
            simple: {
              limit: 18,
              period: 60,
            },
          },
          SESSION_RATE_LIMIT: {
            namespace_id: "802829484",
            simple: {
              limit: 2,
              period: 60,
            },
          },
        },
        serviceBindings: {
          ASSETS: () =>
            new Response("Static asset not available in Worker unit tests.", {
              status: 404,
            }),
        },
      },
    }),
  ],
  test: {
    globals: true,
    include: [
      "worker/**/*.test.ts",
      "worker/**/*.spec.ts",
      "tests/worker/**/*.test.ts",
      "tests/worker/**/*.spec.ts",
    ],
    exclude: ["node_modules/**", ".next/**", "out/**"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
