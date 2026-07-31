import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  AI_SESSION_COOKIE_NAME,
  resolveAiCanaryCredential,
} from "./ai-canary-credential.mjs";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 512 * 1024;

export class AiCanaryError extends Error {}

function fail(message) {
  throw new AiCanaryError(message);
}

function usage() {
  return `Usage:
  CALRICULA_TURNSTILE_TOKEN=... npm run ai:canary -- --base-url https://example.workers.dev
  CALRICULA_AI_SESSION_COOKIE=__Host-calricula_ai_session=<signed-value> npm run ai:canary -- --base-url https://example.workers.dev

Provide exactly one credential. A Turnstile token creates an anonymous AI
session. A session cookie reuses the anonymous session created by the deployed
UI. The command then makes exactly one plain and one structured generation
request. It does not retry or load test.`;
}

function parseArguments(argv, environment = process.env) {
  let baseUrl = environment.CALRICULA_CANARY_BASE_URL ?? "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { baseUrl, help: true };
    }
    if (argument === "--base-url") {
      baseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${argument}`);
  }
  return { baseUrl, help: false };
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Provide a valid deployed base URL with --base-url.");
  }

  if (url.username || url.password || url.search || url.hash) {
    fail("Base URL must not contain credentials, query parameters, or a hash.");
  }
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    fail("Base URL must use HTTPS unless it targets localhost.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    fail("Base URL must be an origin without a path.");
  }
  return url.origin;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBoundedJson(response) {
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    fail(`Response from ${new URL(response.url).pathname} exceeded 512 KiB.`);
  }
  try {
    return JSON.parse(body);
  } catch {
    fail(
      `Response from ${new URL(response.url).pathname} was not valid JSON (HTTP ${response.status}).`,
    );
  }
}

function updateCookie(response, existingCookie) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return existingCookie;
  const cookie = setCookie.split(";", 1)[0];
  try {
    return resolveAiCanaryCredential({
      CALRICULA_AI_SESSION_COOKIE: cookie,
    }).value;
  } catch {
    fail(
      `Response from ${new URL(response.url).pathname} did not issue a valid ${AI_SESSION_COOKIE_NAME} cookie.`,
    );
  }
}

async function requestJson(url, options = {}, fetchFn = globalThis.fetch) {
  const started = performance.now();
  let response;
  try {
    response = await fetchFn(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail(`Request to ${new URL(url).pathname} could not be completed.`);
  }
  const body = await readBoundedJson(response);
  return {
    response,
    body,
    durationMs: Math.round(performance.now() - started),
  };
}

function requireSuccess(result, label) {
  if (
    !result.response.ok ||
    !isRecord(result.body) ||
    result.body.success !== true
  ) {
    const code =
      isRecord(result.body) &&
      isRecord(result.body.error) &&
      typeof result.body.error.code === "string"
        ? result.body.error.code
        : `HTTP_${result.response.status}`;
    fail(`${label} failed with ${code}.`);
  }
  return result.body;
}

function requireFreeModel(envelope, label) {
  if (
    typeof envelope.model !== "string" ||
    !envelope.model.endsWith(":free")
  ) {
    fail(`${label} did not report a concrete exact :free model.`);
  }
  return envelope.model;
}

export async function executeAiCanary({
  argv = [],
  environment = {},
  fetchFn = globalThis.fetch.bind(globalThis),
} = {}) {
  const parsedArguments = parseArguments(argv, environment);
  if (parsedArguments.help) {
    return { help: usage() };
  }
  const baseOrigin = normalizeBaseUrl(parsedArguments.baseUrl);
  let credential;
  try {
    credential = resolveAiCanaryCredential(environment);
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : "Invalid AI canary credential.",
    );
  }

  const commonHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    origin: baseOrigin,
  };

  const health = await requestJson(
    `${baseOrigin}/api/health`,
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
    fetchFn,
  );
  const healthEnvelope = requireSuccess(health, "Health check");
  if (
    !isRecord(healthEnvelope.data) ||
    healthEnvelope.data.aiEnabled !== true
  ) {
    fail("Health check reports that AI is not enabled.");
  }

  let cookie;
  let sessionEvidence;
  if (credential.kind === "turnstile-token") {
    const installationId = `canary-${randomUUID()}`;
    const session = await requestJson(
      `${baseOrigin}/api/ai/session`,
      {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({
          token: credential.value,
          installationId,
        }),
      },
      fetchFn,
    );
    const sessionEnvelope = requireSuccess(session, "AI session");
    cookie = updateCookie(session.response, "");
    if (!cookie) {
      fail(
        "AI session did not issue the required HttpOnly session cookie.",
      );
    }
    sessionEvidence = {
      status: "ok",
      mode: "turnstile-token",
      durationMs: session.durationMs,
      requestId:
        typeof sessionEnvelope.requestId === "string"
          ? sessionEnvelope.requestId
          : null,
    };
  } else {
    cookie = credential.value;
    sessionEvidence = {
      status: "ok",
      mode: "existing-session-cookie",
      durationMs: 0,
      requestId: null,
    };
  }

  const plain = await requestJson(
    `${baseOrigin}/api/ai/chat`,
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        cookie,
      },
      body: JSON.stringify({
        input: {
          message:
            "In one short sentence, explain why measurable course outcomes help curriculum review.",
        },
      }),
    },
    fetchFn,
  );
  const plainEnvelope = requireSuccess(plain, "Plain AI canary");
  cookie = updateCookie(plain.response, cookie);
  if (
    !isRecord(plainEnvelope.data) ||
    typeof plainEnvelope.data.message !== "string" ||
    !plainEnvelope.data.message.trim()
  ) {
    fail("Plain AI canary returned an invalid data shape.");
  }
  const plainModel = requireFreeModel(
    plainEnvelope,
    "Plain AI canary",
  );

  const structured = await requestJson(
    `${baseOrigin}/api/ai/slos`,
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        cookie,
      },
      body: JSON.stringify({
        input: {
          subjectCode: "TEST",
          courseNumber: "100",
          title: "Curriculum Workflow Fundamentals",
          catalogDescription:
            "Introduces measurable outcomes and local curriculum review.",
          topics: [
            "Measurable learning outcomes",
            "Local curriculum review workflow",
          ],
        },
      }),
    },
    fetchFn,
  );
  const structuredEnvelope = requireSuccess(
    structured,
    "Structured AI canary",
  );
  if (
    !isRecord(structuredEnvelope.data) ||
    Object.keys(structuredEnvelope.data).length !== 1 ||
    !Array.isArray(structuredEnvelope.data.slos) ||
    structuredEnvelope.data.slos.length < 1 ||
    structuredEnvelope.data.slos.length > 6 ||
    structuredEnvelope.data.slos.some(
      (slo) =>
        typeof slo !== "string" ||
        !slo.trim() ||
        slo.length > 350,
    ) ||
    new Set(
      structuredEnvelope.data.slos.map((slo) => slo.trim()),
    ).size !== structuredEnvelope.data.slos.length
  ) {
    fail("Structured AI canary returned an invalid schema.");
  }
  const structuredModel = requireFreeModel(
    structuredEnvelope,
    "Structured AI canary",
  );

  return {
    baseOrigin,
    health: {
      status: "ok",
      durationMs: health.durationMs,
    },
    session: sessionEvidence,
    generations: [
      {
        task: "chat",
        model: plainModel,
        durationMs: plain.durationMs,
        requestId:
          typeof plainEnvelope.requestId === "string"
            ? plainEnvelope.requestId
            : null,
      },
      {
        task: "slos",
        model: structuredModel,
        durationMs: structured.durationMs,
        requestId:
          typeof structuredEnvelope.requestId === "string"
            ? structuredEnvelope.requestId
            : null,
      },
    ],
  };
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === entryPoint) {
  executeAiCanary({
    argv: process.argv.slice(2),
    environment: process.env,
  })
    .then((result) => {
      if (result.help) {
        console.log(result.help);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    })
    .catch((error) => {
      console.error(
        `[ai-canary] ${
          error instanceof Error ? error.message : "AI canary failed."
        }`,
      );
      process.exitCode = 1;
    });
}
