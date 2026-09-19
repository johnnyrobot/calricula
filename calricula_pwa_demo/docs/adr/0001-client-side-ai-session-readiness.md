# ADR-0001 — AI session readiness is remembered client-side, not asked of the server

**Status:** Accepted — 2026-08-01
**Implemented by:** `5c0de4c` (`src/lib/ai/session-readiness.ts`)

## Context

Three AI surfaces — `AIChatPanel`, `AISuggestionPanel`, and `AIConsentGate` — each
re-derived what a caller must do before an AI request could succeed. Two read the session
marker directly and separately repeated the rule that a 401 or 403 discards the session;
the consent gate derived its stage from the disclosure flag alone. An architecture review
identified this as duplicated derivation and proposed a single readiness module whose
answer came from **asking the server** rather than remembering locally.

The authority on whether a session exists is the HMAC-signed HttpOnly
`__Host-calricula_ai_session` cookie. Being HttpOnly, the browser cannot read it. The only
route that touches sessions is `POST /api/ai/session`, and it requires a Turnstile token —
it *is* the challenge, not a probe of it.

The concrete benefit of asking is narrow: a second tab, or a reopened tab, holds a valid
cookie but no `sessionStorage` marker, so it presents the Turnstile challenge again even
though the session would have been accepted.

## Decision

Readiness is derived client-side and remembered. `src/lib/ai/session-readiness.ts` answers
`ready` / `needs-disclosure` / `needs-challenge` from two local facts — disclosure
acknowledged (`localStorage`) and session established in this tab (`sessionStorage`) — and
owns the re-sync rule: a 401 or 403 from any AI route clears the marker, so the next read
returns `needs-challenge`.

An established session deliberately outranks a cleared acknowledgement. The disclosure
cannot be reached without passing through it, so a ready session implies acknowledgement
even if the flag was cleared. This preserves every caller's previous behaviour exactly.

We did **not** add a server endpoint reporting session validity.

## Alternatives considered

1. **A new unauthenticated `GET /api/ai/session` returning cookie validity.** Rejected.
   It adds an unauthenticated, un-rate-limited oracle over an HttpOnly credential — a
   security-surface change to the one path where data leaves the device — to save one
   Turnstile challenge in a second tab. The cost is permanent; the benefit is a single
   avoided interaction.
2. **Make the session cookie readable (drop HttpOnly).** Rejected outright. The cookie is
   HMAC-signed session authority; exposing it to script is strictly worse than the problem.
3. **Infer readiness from the first real AI request's outcome.** Rejected as the sole
   mechanism — it makes the disclosure gate render the wrong stage on first paint. It is,
   however, exactly what `resyncSessionReadiness` does *after* a request, which is why no
   separate probe is needed.
4. **Mirror the marker in `localStorage` so a second tab sees it.** Rejected. It converts a
   per-tab lie into a persistent one: the cookie can expire or be rejected while the mirror
   claims readiness, and the user gets a failed request instead of a challenge.

## Consequences

- A second tab, or a reopened tab, re-presents the Turnstile challenge. Accepted cost.
- Local readiness can be stale in exactly one direction — claiming `ready` when the server
  disagrees. `resyncSessionReadiness` is the correction, and it is why every AI caller must
  route its errors through that function rather than handling 401/403 itself.
- The AI attack surface is unchanged by this refactor: no new route, no new unauthenticated
  endpoint, no credential readable from script.
- A future architecture review will likely re-suggest "ask the server". This ADR is the
  answer. Reopen it only if a *challenge-free* way to validate the cookie appears — for
  example, if an existing authenticated AI route can carry readiness in its response
  envelope without becoming an oracle for unauthenticated callers.

## References

- `src/lib/ai/session-readiness.ts`, `src/lib/ai/session.ts`
- `worker/index.ts` — `SESSION_COOKIE`, `verifyTurnstile`, `/api/ai/session`
- `CLAUDE.md` § "AI path (the only data that leaves the device)"
- `AGENTS.md` — security and privacy invariants
