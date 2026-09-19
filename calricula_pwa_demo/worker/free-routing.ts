import { ApiError } from "./api-error";
import { isRecord, type JsonRecord } from "./json";

/**
 * The free-only guarantee, in one place and in both directions.
 *
 * Outbound, `buildFreeRouting` names the model chain and the provider
 * constraints. Provider fallback is deliberately permitted; freeness is
 * enforced by the `:free` model list plus a zero `max_price`, not by pinning
 * one provider.
 *
 * Inbound, `assertFreeRoutingHonoured` re-checks what came back. The request
 * is issued exactly once — there is no retry, so a provider that ignores the
 * constraints costs one rejected response rather than several.
 */

const FREE_CATCH_ALL = "openrouter/free";
const EXACT_FREE_MODEL = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+:free$/;
const MAX_RESPONSE_MODEL_LENGTH = 200;

export interface FreeRouting {
  readonly models: string[];
  readonly provider: JsonRecord;
}

export interface FreeRoutingEnv {
  OPENROUTER_FREE_MODELS?: string;
}

function configurationError(): ApiError {
  return new ApiError(
    503,
    "AI_CONFIGURATION_ERROR",
    "AI service configuration is unavailable.",
  );
}

function policyViolation(message: string): ApiError {
  return new ApiError(502, "UPSTREAM_POLICY_VIOLATION", message);
}

function parseConfiguredModels(env: FreeRoutingEnv): string[] {
  const raw = env.OPENROUTER_FREE_MODELS?.trim() ?? "";
  const configured = raw
    ? raw
        .split(/[\s,]+/)
        .map((model) => model.trim())
        .filter(Boolean)
    : [];
  if (configured.length !== 2 || new Set(configured).size !== 2) {
    throw configurationError();
  }
  for (const model of configured) {
    if (!model.endsWith(":free") || !EXACT_FREE_MODEL.test(model)) {
      throw configurationError();
    }
  }
  return configured;
}

export function buildFreeRouting(
  env: FreeRoutingEnv,
  options: { structured: boolean },
): FreeRouting {
  const provider: JsonRecord = {
    allow_fallbacks: true,
    data_collection: "deny",
    zdr: true,
    max_price: {
      prompt: 0,
      completion: 0,
      request: 0,
    },
  };
  if (options.structured) {
    provider.require_parameters = true;
  }
  return {
    models: [...parseConfiguredModels(env), FREE_CATCH_ALL],
    provider,
  };
}

function assertZeroCost(payload: JsonRecord): void {
  if (!isRecord(payload.usage)) {
    return;
  }
  const chargedRequest =
    Object.prototype.hasOwnProperty.call(payload.usage, "cost") &&
    payload.usage.cost !== null &&
    (typeof payload.usage.cost !== "number" || payload.usage.cost !== 0);
  if (chargedRequest) {
    throw policyViolation("The AI provider reported a non-free request.");
  }
  if (!isRecord(payload.usage.cost_details)) {
    return;
  }
  for (const value of Object.values(payload.usage.cost_details)) {
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value !== 0)
    ) {
      throw policyViolation("The AI provider reported a non-free request.");
    }
  }
}

export function assertFreeRoutingHonoured(payload: JsonRecord): string {
  const model = payload.model;
  if (
    typeof model !== "string" ||
    model.length > MAX_RESPONSE_MODEL_LENGTH ||
    (model !== FREE_CATCH_ALL && !model.endsWith(":free"))
  ) {
    throw policyViolation("The AI provider did not confirm a free model.");
  }
  assertZeroCost(payload);
  return model;
}
