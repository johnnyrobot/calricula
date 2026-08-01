import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIRequestError } from "./client";
import {
  acknowledgeAIDisclosure,
  clearAISessionMarker,
  markAISessionReady,
} from "./session";
import {
  readSessionReadiness,
  resyncSessionReadiness,
  subscribeSessionReadiness,
} from "./session-readiness";

function requestError(status: number): AIRequestError {
  return new AIRequestError("unauthorized", "rejected", status);
}

describe("AI session readiness", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearAISessionMarker();
  });

  it("asks for the disclosure before anything else", () => {
    expect(readSessionReadiness()).toBe("needs-disclosure");
  });

  it("asks for a challenge once the disclosure is acknowledged", () => {
    acknowledgeAIDisclosure();
    expect(readSessionReadiness()).toBe("needs-challenge");
  });

  it("reports ready once a session is established", () => {
    acknowledgeAIDisclosure();
    markAISessionReady();
    expect(readSessionReadiness()).toBe("ready");
  });

  it("lets an established session outrank a cleared acknowledgement", () => {
    markAISessionReady();
    window.localStorage.clear();
    expect(readSessionReadiness()).toBe("ready");
  });

  it.each([
    ["an expired session", 401, "needs-challenge"],
    ["a refused session", 403, "needs-challenge"],
  ])("re-syncs after %s", (_description, status, expected) => {
    acknowledgeAIDisclosure();
    markAISessionReady();
    expect(resyncSessionReadiness(requestError(status))).toBe(true);
    expect(readSessionReadiness()).toBe(expected);
  });

  it.each([
    ["a rate limit", requestError(429)],
    ["an upstream failure", requestError(502)],
    ["a thrown non-request error", new Error("offline")],
  ])("keeps the session after %s", (_description, error) => {
    acknowledgeAIDisclosure();
    markAISessionReady();
    expect(resyncSessionReadiness(error)).toBe(false);
    expect(readSessionReadiness()).toBe("ready");
  });

  it("notifies subscribers when either half of readiness changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionReadiness(listener);

    acknowledgeAIDisclosure();
    expect(listener).toHaveBeenCalledTimes(1);
    markAISessionReady();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    clearAISessionMarker();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
