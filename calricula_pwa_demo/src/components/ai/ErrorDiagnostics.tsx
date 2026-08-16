"use client";

import { AIOutputValidationError, AIRequestError } from "../../lib/ai";

/**
 * The two values a beta report has to carry.
 *
 * The server logs no prompt, response, or curriculum text by design, and the
 * quota Durable Object stores only an HMAC-derived install ID, a day, an
 * attempt count, request IDs, and an expiry. So triage runs on four signals:
 * the error code, the HTTP status, the request ID, and what the user was doing.
 * The first and third only ever reach a report if the failure state puts them
 * on screen — which is what this renders.
 *
 * See `docs/runbooks/ai-triage.md`.
 */
export function aiErrorDiagnostics(
  error: Error,
): { code: string; requestId: string | null } | null {
  if (error instanceof AIRequestError) {
    return { code: error.code, requestId: error.requestId };
  }
  if (error instanceof AIOutputValidationError) {
    // The browser, not the Worker, rejected this one. Name it distinctly so a
    // report points at the right side of that boundary.
    return { code: "AI_OUTPUT_REJECTED", requestId: error.requestId };
  }
  return null;
}

/**
 * Renders inside an existing `role="alert"` region — it deliberately does not
 * create its own, so a single failure is announced once.
 *
 * `gold-ink` (#7E6018) rather than the decorative `gold`: this is small text on
 * parchment and must clear WCAG 2.2 AA.
 */
export function ErrorDiagnostics({ error }: { error: Error }) {
  const diagnostics = aiErrorDiagnostics(error);
  if (!diagnostics) return null;

  return (
    <dl className="mb-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs text-[var(--gold-ink)]">
      <dt className="font-semibold">Error code</dt>
      <dd className="mb-0 break-all font-mono">{diagnostics.code}</dd>
      {diagnostics.requestId ? (
        <>
          <dt className="font-semibold">Request reference</dt>
          <dd className="mb-0 break-all font-mono">
            {diagnostics.requestId}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
