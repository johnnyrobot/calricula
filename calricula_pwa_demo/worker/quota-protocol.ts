import { isRecord, type JsonRecord } from "./json";

/**
 * The wire protocol between the Worker and the DailyAiQuota Durable Object,
 * owned in one place so the caller, the object, and the in-memory test double
 * cannot drift apart.
 *
 * The object stores only an HMAC-derived install ID, the day, an attempt
 * count, reserved request IDs, and an expiry — never prompts, responses, or
 * curriculum text. Nothing in this module carries any of that either.
 */

export const MAX_DAILY_ATTEMPTS = 5;
export const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export type QuotaOperation = "/status" | "/reserve";

export type QuotaReservation = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type InternalQuotaReservation = QuotaReservation & {
  duplicate?: boolean;
};

export type QuotaRequest = {
  limit: number;
  expiresAtMs: number;
  retryAfterSeconds: number;
  requestId?: string;
};

function isRetryAfter(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_RETRY_AFTER_SECONDS
  );
}

export function buildQuotaRequest(input: {
  expiresAtMs: number;
  retryAfterSeconds: number;
  requestId?: string;
}): JsonRecord {
  return {
    limit: MAX_DAILY_ATTEMPTS,
    expiresAtMs: input.expiresAtMs,
    retryAfterSeconds: input.retryAfterSeconds,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };
}

/**
 * Server side of the same shape. Returns null rather than throwing so the
 * Durable Object can answer 400 without an exception crossing the boundary.
 */
export function parseQuotaRequest(
  body: unknown,
  options: { operation: QuotaOperation; nowMs: number },
): QuotaRequest | null {
  if (
    !isRecord(body) ||
    body.limit !== MAX_DAILY_ATTEMPTS ||
    !isRetryAfter(body.retryAfterSeconds) ||
    typeof body.expiresAtMs !== "number" ||
    !Number.isSafeInteger(body.expiresAtMs) ||
    body.expiresAtMs <= options.nowMs
  ) {
    return null;
  }
  if (options.operation === "/status") {
    return {
      limit: body.limit,
      expiresAtMs: body.expiresAtMs,
      retryAfterSeconds: body.retryAfterSeconds,
    };
  }
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) {
    return null;
  }
  return {
    limit: body.limit,
    expiresAtMs: body.expiresAtMs,
    retryAfterSeconds: body.retryAfterSeconds,
    requestId: body.requestId,
  };
}

export function isQuotaReservation(
  value: unknown,
): value is InternalQuotaReservation {
  return (
    isRecord(value) &&
    typeof value.allowed === "boolean" &&
    (value.duplicate === undefined || typeof value.duplicate === "boolean") &&
    typeof value.remaining === "number" &&
    Number.isSafeInteger(value.remaining) &&
    value.remaining >= 0 &&
    value.remaining <= MAX_DAILY_ATTEMPTS &&
    isRetryAfter(value.retryAfterSeconds)
  );
}

/**
 * The authoritative reservation decision. The Durable Object applies it inside
 * a storage transaction; the in-memory double applies it over a Map. Both get
 * the same answer because there is only one answer.
 */
export function decideReservation(input: {
  attempts: number;
  alreadyReserved: boolean;
  retryAfterSeconds: number;
}): InternalQuotaReservation {
  if (input.alreadyReserved) {
    return {
      allowed: true,
      duplicate: true,
      remaining: Math.max(0, MAX_DAILY_ATTEMPTS - input.attempts),
      retryAfterSeconds: input.retryAfterSeconds,
    };
  }
  if (input.attempts >= MAX_DAILY_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: input.retryAfterSeconds,
    };
  }
  return {
    allowed: true,
    duplicate: false,
    remaining: MAX_DAILY_ATTEMPTS - input.attempts - 1,
    retryAfterSeconds: input.retryAfterSeconds,
  };
}

export function decideStatus(input: {
  attempts: number;
  retryAfterSeconds: number;
}): QuotaReservation {
  return {
    allowed: input.attempts < MAX_DAILY_ATTEMPTS,
    remaining: Math.max(0, MAX_DAILY_ATTEMPTS - input.attempts),
    retryAfterSeconds: input.retryAfterSeconds,
  };
}
