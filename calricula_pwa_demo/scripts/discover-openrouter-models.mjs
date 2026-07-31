import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  ResponseDecodeError,
  ResponseLimitError,
  readJsonWithinLimit,
} from "./read-json-with-limit.mjs";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CATALOG_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_KEY_RESPONSE_BYTES = 64 * 1024;
const REQUIRED_NAMED_MODELS = 2;
export const MINIMUM_CONTEXT_LENGTH = 32_768;
const MODEL_ID_PATTERN =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+:free$/;
const PRICE_FIELDS = ["prompt", "completion", "request"];
const KEY_LIMIT_RESETS = new Set(["daily", "weekly", "monthly", null]);

// Current documented OpenRouter free-model policy. The authenticated /key
// response identifies which account tier applies, while it does not expose the
// number of free-model requests remaining in the current day.
export const DOCUMENTED_FREE_MODEL_LIMITS = Object.freeze({
  requestsPerMinute: 20,
  freeTierRequestsPerDay: 50,
  creditEnabledRequestsPerDay: 1_000,
});

export class OpenRouterDiscoveryError extends Error {}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegativeNumberOrNull(value) {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0)
  );
}

function parseModelList(value, label) {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new OpenRouterDiscoveryError(
      `${label} returned an unexpected response shape.`,
    );
  }
  return value.data.filter(isRecord);
}

async function readBoundedJson(response, label, maximumBytes) {
  try {
    return await readJsonWithinLimit(response, label, maximumBytes);
  } catch (error) {
    if (error instanceof ResponseLimitError) {
      throw new OpenRouterDiscoveryError(
        `${label} exceeded the response-size limit.`,
      );
    }
    if (error instanceof ResponseDecodeError) {
      throw new OpenRouterDiscoveryError(error.message);
    }
    throw new OpenRouterDiscoveryError(
      `${label} response could not be read.`,
    );
  }
}

async function fetchOpenRouterJson({
  url,
  apiKey,
  label,
  fetchFn,
  maximumBytes,
}) {
  let response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-title": "Calricula release discovery",
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Do not forward transport error text: a client or proxy can include the
    // Authorization header in its diagnostic message.
    throw new OpenRouterDiscoveryError(
      `${label} could not be reached.`,
    );
  }

  if (!response.ok) {
    throw new OpenRouterDiscoveryError(
      `${label} returned HTTP ${response.status}.`,
    );
  }
  return readBoundedJson(response, label, maximumBytes);
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string")
    : [];
}

function isZeroPrice(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric === 0;
}

function hasOnlyZeroRuntimePrices(pricing) {
  if (!isRecord(pricing)) return false;
  if (!isZeroPrice(pricing.prompt) || !isZeroPrice(pricing.completion)) {
    return false;
  }
  if (!isZeroPrice(pricing.request)) {
    return false;
  }

  if (pricing.overrides !== undefined) {
    if (!Array.isArray(pricing.overrides)) return false;
    for (const override of pricing.overrides) {
      if (!isRecord(override)) return false;
      for (const field of PRICE_FIELDS) {
        if (!isZeroPrice(override[field])) return false;
      }
    }
  }
  return true;
}

function isTextArchitecture(architecture) {
  if (!isRecord(architecture)) return false;
  const inputModalities = stringArray(architecture.input_modalities);
  const outputModalities = stringArray(architecture.output_modalities);
  return (
    inputModalities.includes("text") && outputModalities.includes("text")
  );
}

function isStructuredCandidate(model) {
  const supportedParameters = stringArray(model.supported_parameters);
  return (
    typeof model.id === "string" &&
    MODEL_ID_PATTERN.test(model.id) &&
    Number.isInteger(model.context_length) &&
    model.context_length >= MINIMUM_CONTEXT_LENGTH &&
    isTextArchitecture(model.architecture) &&
    hasOnlyZeroRuntimePrices(model.pricing) &&
    supportedParameters.includes("response_format") &&
    supportedParameters.includes("structured_outputs")
  );
}

export function configuredModelOrder(rawValue = "") {
  return [
    ...new Set(
      rawValue
        .split(/[\s,]+/)
        .map((model) => model.trim())
        .filter((model) => model && model !== "openrouter/free"),
    ),
  ];
}

export function summarizeAuthenticatedKey(payload, now = Date.now()) {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new OpenRouterDiscoveryError(
      "Authenticated key status returned an unexpected response shape.",
    );
  }
  const data = payload.data;
  if (
    typeof data.is_free_tier !== "boolean" ||
    !finiteNonNegativeNumberOrNull(data.limit) ||
    !finiteNonNegativeNumberOrNull(data.limit_remaining) ||
    !KEY_LIMIT_RESETS.has(data.limit_reset) ||
    !Object.hasOwn(data, "expires_at") ||
    !(
      data.expires_at === null ||
      (typeof data.expires_at === "string" &&
        data.expires_at.endsWith("Z") &&
        Number.isFinite(Date.parse(data.expires_at)))
    ) ||
    (data.limit === null) !== (data.limit_remaining === null)
  ) {
    throw new OpenRouterDiscoveryError(
      "Authenticated key status returned an unexpected response shape.",
    );
  }

  if (
    typeof data.expires_at === "string" &&
    Date.parse(data.expires_at) <= now
  ) {
    throw new OpenRouterDiscoveryError(
      "Authenticated OpenRouter key is expired.",
    );
  }
  if (
    typeof data.limit_remaining === "number" &&
    data.limit_remaining <= 0
  ) {
    throw new OpenRouterDiscoveryError(
      "Authenticated OpenRouter key limit is exhausted.",
    );
  }

  const accountTier = data.is_free_tier
    ? "free"
    : "credit-enabled";
  return {
    authenticated: true,
    accountTier,
    documentedFreeModelLimits: {
      requestsPerMinute:
        DOCUMENTED_FREE_MODEL_LIMITS.requestsPerMinute,
      requestsPerDay: data.is_free_tier
        ? DOCUMENTED_FREE_MODEL_LIMITS.freeTierRequestsPerDay
        : DOCUMENTED_FREE_MODEL_LIMITS.creditEnabledRequestsPerDay,
    },
    freeModelDailyRemaining: "not-exposed-by-key-endpoint",
    keySpendLimitStatus:
      data.limit === null ? "not-configured" : "available",
    keySpendLimitReset:
      data.limit === null ? null : data.limit_reset,
    keyExpirationStatus:
      data.expires_at === null ? "not-configured" : "valid",
  };
}

export async function discoverOpenRouterModels({
  apiKey,
  configuredModelsValue = "",
  fetchFn = globalThis.fetch.bind(globalThis),
  now = Date.now(),
}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new OpenRouterDiscoveryError(
      "Set OPENROUTER_API_KEY in the environment before discovery.",
    );
  }
  const normalizedApiKey = apiKey.trim();

  const userCatalogUrl = new URL(`${OPENROUTER_API_BASE}/models/user`);
  userCatalogUrl.searchParams.set("offset", "0");
  userCatalogUrl.searchParams.set("limit", "1000");

  // The authenticated list applies the key's provider preferences, privacy
  // settings, and guardrails. The public ZDR-filtered list proves that each
  // intersected candidate currently has at least one ZDR endpoint.
  const zdrCatalogUrl = new URL(`${OPENROUTER_API_BASE}/models`);
  zdrCatalogUrl.searchParams.set("offset", "0");
  zdrCatalogUrl.searchParams.set("limit", "1000");
  zdrCatalogUrl.searchParams.set("input_modalities", "text");
  zdrCatalogUrl.searchParams.set("output_modalities", "text");
  zdrCatalogUrl.searchParams.set("zdr", "true");

  const keyStatusUrl = new URL(`${OPENROUTER_API_BASE}/key`);
  const [userPayload, zdrPayload, keyPayload] = await Promise.all([
    fetchOpenRouterJson({
      url: userCatalogUrl,
      apiKey: normalizedApiKey,
      label: "Authenticated model catalog",
      fetchFn,
      maximumBytes: MAX_CATALOG_RESPONSE_BYTES,
    }),
    fetchOpenRouterJson({
      url: zdrCatalogUrl,
      apiKey: normalizedApiKey,
      label: "ZDR model catalog",
      fetchFn,
      maximumBytes: MAX_CATALOG_RESPONSE_BYTES,
    }),
    fetchOpenRouterJson({
      url: keyStatusUrl,
      apiKey: normalizedApiKey,
      label: "Authenticated key status",
      fetchFn,
      maximumBytes: MAX_KEY_RESPONSE_BYTES,
    }),
  ]);

  const keyStatus = summarizeAuthenticatedKey(keyPayload, now);
  const userIds = new Set(
    parseModelList(userPayload, "Authenticated model catalog")
      .map((model) => model.id)
      .filter((id) => typeof id === "string"),
  );

  const candidates = parseModelList(zdrPayload, "ZDR model catalog")
    .filter((model) => userIds.has(model.id))
    .filter(isStructuredCandidate)
    .map((model) => {
      const supportedParameters = stringArray(model.supported_parameters);
      return {
        id: model.id,
        contextLength:
          typeof model.context_length === "number" &&
          Number.isFinite(model.context_length)
            ? model.context_length
            : null,
        capabilities: {
          input: ["text"],
          output: ["text"],
          responseFormat: supportedParameters.includes("response_format"),
          structuredOutputs:
            supportedParameters.includes("structured_outputs"),
          zdrEndpointAvailable: true,
          zeroPromptCompletionRequestPrice: true,
        },
      };
    })
    .sort(
      (left, right) =>
        (right.contextLength ?? 0) - (left.contextLength ?? 0) ||
        left.id.localeCompare(right.id),
    );

  if (candidates.length < REQUIRED_NAMED_MODELS) {
    throw new OpenRouterDiscoveryError(
      `Fewer than ${REQUIRED_NAMED_MODELS} account-eligible exact :free text models currently satisfy ZDR, zero runtime prices, and structured-output requirements.`,
    );
  }

  const candidateIds = new Set(
    candidates.map((candidate) => candidate.id),
  );
  const configured = configuredModelOrder(configuredModelsValue);
  let selected;
  let selectionBasis;

  if (configured.length > 0) {
    if (configured.length !== REQUIRED_NAMED_MODELS) {
      throw new OpenRouterDiscoveryError(
        `Configured model chain must contain exactly ${REQUIRED_NAMED_MODELS} distinct named models; received ${configured.length}.`,
      );
    }
    const unsafe = configured.filter((model) => !candidateIds.has(model));
    if (unsafe.length > 0) {
      throw new OpenRouterDiscoveryError(
        `Configured model chain contains ${unsafe.length} model(s) that do not satisfy the live safety filters.`,
      );
    }
    selected = configured;
    selectionBasis = "configured-eval-approved";
  } else {
    selected = candidates
      .slice(0, REQUIRED_NAMED_MODELS)
      .map((candidate) => candidate.id);
    selectionBasis = "discovery-order-review-required";
  }

  return {
    filters: {
      accountEligible: true,
      exactFreeVariant: true,
      textInputAndOutput: true,
      zdrEndpointAvailable: true,
      zeroPriceFields: PRICE_FIELDS,
      minimumContextLength: MINIMUM_CONTEXT_LENGTH,
      responseFormat: true,
      structuredOutputs: true,
    },
    keyStatus,
    candidates,
    selectionBasis,
    selectedOrderedChain: [...selected, "openrouter/free"],
    wranglerPreferredModelsValue: selected.join(","),
  };
}

export async function runCli() {
  const configuredModelsValue =
    process.env.OPENROUTER_EVAL_APPROVED_MODELS ??
    process.env.OPENROUTER_FREE_MODELS ??
    "";
  const result = await discoverOpenRouterModels({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    configuredModelsValue,
  });
  console.log(JSON.stringify(result, null, 2));
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === entryPoint) {
  runCli().catch((error) => {
    const message =
      error instanceof OpenRouterDiscoveryError
        ? error.message
        : "OpenRouter discovery could not be completed.";
    console.error(`[ai-discovery] ${message}`);
    process.exitCode = 1;
  });
}
