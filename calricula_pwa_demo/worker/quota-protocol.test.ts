import { describe, expect, it } from "vitest";

import {
  MAX_DAILY_ATTEMPTS,
  buildQuotaRequest,
  decideReservation,
  decideStatus,
  isQuotaReservation,
  parseQuotaRequest,
} from "./quota-protocol";

const RETRY_AFTER = 3_600;
const NOW_MS = 1_800_000_000_000;
const EXPIRES_AT_MS = NOW_MS + 86_400_000;
const REQUEST_ID = "req-01JZZ";

describe("daily quota protocol", () => {
  it("admits a first attempt and counts the remainder down", () => {
    expect(
      decideReservation({
        attempts: 0,
        alreadyReserved: false,
        retryAfterSeconds: RETRY_AFTER,
      }),
    ).toEqual({
      allowed: true,
      duplicate: false,
      remaining: MAX_DAILY_ATTEMPTS - 1,
      retryAfterSeconds: RETRY_AFTER,
    });
  });

  it("re-admits a replayed request without spending a second attempt", () => {
    expect(
      decideReservation({
        attempts: 2,
        alreadyReserved: true,
        retryAfterSeconds: RETRY_AFTER,
      }),
    ).toEqual({
      allowed: true,
      duplicate: true,
      remaining: MAX_DAILY_ATTEMPTS - 2,
      retryAfterSeconds: RETRY_AFTER,
    });
  });

  it("refuses a new attempt once the day is spent", () => {
    expect(
      decideReservation({
        attempts: MAX_DAILY_ATTEMPTS,
        alreadyReserved: false,
        retryAfterSeconds: RETRY_AFTER,
      }),
    ).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: RETRY_AFTER,
    });
  });

  it("reports status without consuming anything", () => {
    expect(decideStatus({ attempts: 4, retryAfterSeconds: RETRY_AFTER })).toEqual(
      { allowed: true, remaining: 1, retryAfterSeconds: RETRY_AFTER },
    );
    expect(
      decideStatus({
        attempts: MAX_DAILY_ATTEMPTS,
        retryAfterSeconds: RETRY_AFTER,
      }),
    ).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: RETRY_AFTER });
  });

  it("round-trips a reservation request from caller to object", () => {
    const body = buildQuotaRequest({
      expiresAtMs: EXPIRES_AT_MS,
      retryAfterSeconds: RETRY_AFTER,
      requestId: REQUEST_ID,
    });
    expect(body).toEqual({
      limit: MAX_DAILY_ATTEMPTS,
      expiresAtMs: EXPIRES_AT_MS,
      retryAfterSeconds: RETRY_AFTER,
      requestId: REQUEST_ID,
    });
    expect(
      parseQuotaRequest(body, { operation: "/reserve", nowMs: NOW_MS }),
    ).toMatchObject({ requestId: REQUEST_ID, limit: MAX_DAILY_ATTEMPTS });
  });

  it("omits a request id from a status probe and never invents one", () => {
    const body = buildQuotaRequest({
      expiresAtMs: EXPIRES_AT_MS,
      retryAfterSeconds: RETRY_AFTER,
    });
    expect(body).not.toHaveProperty("requestId");
    expect(
      parseQuotaRequest(body, { operation: "/status", nowMs: NOW_MS }),
    ).not.toHaveProperty("requestId");
    expect(
      parseQuotaRequest(body, { operation: "/reserve", nowMs: NOW_MS }),
    ).toBeNull();
  });

  it.each([
    ["a non-record body", "reserve-me"],
    ["a raised limit", { limit: 50, expiresAtMs: EXPIRES_AT_MS, retryAfterSeconds: RETRY_AFTER, requestId: REQUEST_ID }],
    ["an already-elapsed expiry", { limit: MAX_DAILY_ATTEMPTS, expiresAtMs: NOW_MS, retryAfterSeconds: RETRY_AFTER, requestId: REQUEST_ID }],
    ["a retry window beyond a day", { limit: MAX_DAILY_ATTEMPTS, expiresAtMs: EXPIRES_AT_MS, retryAfterSeconds: 86_401, requestId: REQUEST_ID }],
    ["an injected request id", { limit: MAX_DAILY_ATTEMPTS, expiresAtMs: EXPIRES_AT_MS, retryAfterSeconds: RETRY_AFTER, requestId: "req/../../etc" }],
  ])("refuses %s", (_description, body) => {
    expect(
      parseQuotaRequest(body, { operation: "/reserve", nowMs: NOW_MS }),
    ).toBeNull();
  });

  it.each([
    ["a well-formed reservation", { allowed: true, duplicate: false, remaining: 3, retryAfterSeconds: RETRY_AFTER }, true],
    ["a remainder above the daily limit", { allowed: true, remaining: 99, retryAfterSeconds: RETRY_AFTER }, false],
    ["a negative remainder", { allowed: true, remaining: -1, retryAfterSeconds: RETRY_AFTER }, false],
    ["a zero retry window", { allowed: false, remaining: 0, retryAfterSeconds: 0 }, false],
    ["a missing verdict", { remaining: 1, retryAfterSeconds: RETRY_AFTER }, false],
  ])("recognises %s", (_description, value, expected) => {
    expect(isQuotaReservation(value)).toBe(expected);
  });
});
