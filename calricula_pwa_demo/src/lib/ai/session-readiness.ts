import { AIRequestError } from "./client";
import {
  clearAISessionMarker,
  hasAcknowledgedAIDisclosure,
  isAISessionMarkedReady,
  subscribeAIDisclosureStatus,
  subscribeAISessionStatus,
} from "./session";

/**
 * What the caller must do next before an AI request can succeed.
 *
 * Readiness is derived from two facts that were previously read separately by
 * every AI surface: whether the data-boundary disclosure has been acknowledged,
 * and whether a session has been established in this tab. Callers ask this
 * module rather than re-deriving the sequence.
 *
 * The authority is the HttpOnly `__Host-` session cookie, which the browser
 * cannot read. This module therefore remembers rather than asks, and re-syncs
 * when the server disagrees — see `resyncSessionReadiness`.
 */
export type SessionReadiness = "ready" | "needs-disclosure" | "needs-challenge";

/** Statuses that mean the server rejected the session itself. */
const SESSION_REJECTED_STATUSES = new Set([401, 403]);

export function readSessionReadiness(): SessionReadiness {
  // An established session dominates: the disclosure cannot be reached without
  // passing through it, so a ready session implies it was acknowledged even if
  // the acknowledgement has since been cleared from local storage.
  if (isAISessionMarkedReady()) return "ready";
  return hasAcknowledgedAIDisclosure() ? "needs-challenge" : "needs-disclosure";
}

export function subscribeSessionReadiness(listener: () => void): () => void {
  const unsubscribers = [
    subscribeAIDisclosureStatus(listener),
    subscribeAISessionStatus(listener),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

/**
 * Reconcile local readiness with a rejection from the server. Returns whether
 * the session was discarded, so a caller can distinguish "verify again" from
 * "the request failed for another reason".
 */
export function resyncSessionReadiness(error: unknown): boolean {
  if (
    !(error instanceof AIRequestError) ||
    !SESSION_REJECTED_STATUSES.has(error.status)
  ) {
    return false;
  }
  clearAISessionMarker();
  return true;
}
