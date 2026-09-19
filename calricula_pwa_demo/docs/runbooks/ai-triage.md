# Runbook — triaging an AI failure under content-free logging

**Scope:** any report that an AI feature in the Calricula PWA demo did not work.

> **The rule this project keeps re-learning, stated first:**
> **"It passes on rerun" is evidence *for* a timing defect, not against one.**
> Never add a retry, raise a timeout, or quarantine a test to make a failure
> disappear. The `AppShell` "flake" survived three sessions of that treatment and
> turned out to be a real marginal-timeout defect, fixed at `5eb6a29`.

Every investigation follows `superpowers:systematic-debugging`: reproduce before
hypothesising, and verify your own intermediate results before building on them.

## The constraint that shapes everything here

**The server cannot tell you what happened, because it is designed not to know.**

No prompt, response, or curriculum text is ever logged. The `DailyAiQuota`
Durable Object stores only an HMAC-derived install ID, a UTC day, an attempt
count, request IDs, and an expiry. There is no server-side transcript to read,
and adding one would break the privacy posture the demo is built on.

So triage runs on four observable signals and nothing else:

1. the error **code**,
2. the HTTP **status**,
3. the **request ID** (`requestId` flows Worker → envelope → `AIRequestError`,
   `src/lib/ai/client.ts`), and
4. **what the user was doing** — which button, on which screen.

Both AI surfaces render the code and request ID inside their error region
(`src/components/ai/ErrorDiagnostics.tsx`), so a reporter can read them off the
screen.

---

## 1. Intake

Ask the reporter for exactly this. Nothing else.

| Field | Where they find it |
|---|---|
| Error code | The "Error code" line in the red error box |
| Request reference | The "Request reference" line in the same box (may be absent) |
| Which button, on which screen | e.g. "Suggest outcomes, on a course record" |
| Approximate time **in UTC** | The quota resets at UTC midnight, so local time is ambiguous |
| Browser and version | |
| Did an immediate retry succeed? | Yes / No — see the rule at the top |

**Never ask for their curriculum content, their prompt, or the model's reply.**
It is not needed to triage any code in the table below, the demo is local-first
so that content is theirs alone, and asking for it invites them to paste
something sensitive into a channel that was never designed to hold it.

If the code is `AI_OUTPUT_REJECTED`, the **browser** rejected the response, not
the Worker — the request reached the model and came back malformed or
domain-invalid. Jump straight to rung 2 of the ladder.

---

## 2. Code → first hypothesis

27 Worker codes, plus the one browser-side code. "First hypothesis" is where to
look first, not a verdict.

### Load-bearing rows

| Code | Status | First hypothesis | Reproduce with |
|---|---|---|---|
| `UPSTREAM_INVALID_RESPONSE` | 502 | **The deployed model fails this task's output validator. Most likely defect class.** | `npm run ai:evaluate -- --models <deployed model>`, then read `pass.byTask` |
| `AI_CONFIGURATION_ERROR` | 503 | `OPENROUTER_FREE_MODELS` empty, credential rejected, or a model delisted | `npm run ai:discover` — see §4 |
| `DAILY_LIMIT_EXCEEDED` | 429 | Working as designed: 5 per install per UTC day (`worker/quota-protocol.ts`) | `tests/worker/quota-harness.ts` |
| `UPSTREAM_RATE_LIMITED` | 429 | Free-tier provider limit, not a bug | Retry after the `retryAfterSeconds` the envelope carries |
| `SESSION_EXPIRED` / `SESSION_INVALID` / `SESSION_REQUIRED` | 401 | Cookie lifetime (24h) or `AI_SESSION_HMAC_SECRET` rotation | `worker/index.test.ts` session cases |
| `TURNSTILE_FAILED` | 403 | Widget hostname does not match `APP_ORIGIN`, or the token was replayed | Phase 3 widget configuration |
| `TURNSTILE_UNAVAILABLE` | 503 | Cloudflare siteverify outage or a network path failure | Cloudflare status |
| `AI_OUTPUT_REJECTED` | — | Browser-side Zod or domain check rejected a response the Worker accepted. A genuine finding: the two validators disagree | `src/lib/ai/schemas.test.ts` |

### Complete table

| Code | Status | First hypothesis |
|---|---|---|
| `AI_CONFIGURATION_ERROR` | 503 | Missing/invalid `OPENROUTER_API_KEY`, `AI_SESSION_HMAC_SECRET`, `APP_ORIGIN`, or an empty model list |
| `AI_CONTENT_BLOCKED` | 403 | The provider's own safety filter refused. Not a Calricula rule |
| `AI_DISABLED` | 503 | `AI_ENABLED` is not `"true"`. This is the fail-closed default |
| `BODY_TOO_LARGE` | 413 | Request body over 64 KiB — an unusually large course record |
| `DAILY_LIMIT_EXCEEDED` | 429 | Quota exhausted for that install and UTC day. By design |
| `DUPLICATE_REQUEST` | 409 | The same request ID was reserved twice; usually a double-submit |
| `INTERNAL_ERROR` | 500 | Unhandled Worker exception. Always a defect — capture the request ID |
| `INVALID_JSON` | 400 | Malformed request body. Suspect a proxy or extension rewriting it |
| `INVALID_REQUEST` | 400 | Body failed a field guard: unknown key, bad type, oversized history |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST to an AI route. Usually a crawler or a stale bookmark |
| `NOT_FOUND` | 404 | Unknown `/api/*` path — a stale service worker precache is worth ruling out |
| `ORIGIN_FORBIDDEN` | 403 | `Origin` did not match `APP_ORIGIN`. Check the deployed binding first |
| `QUOTA_UNAVAILABLE` | 503 | The `DailyAiQuota` Durable Object could not be reached. Fails closed |
| `RATE_LIMITED` | 429 | Calricula's own global or per-session rate-limit binding tripped |
| `RATE_LIMIT_UNAVAILABLE` | 503 | A rate-limit binding is missing or erroring. Fails closed |
| `SESSION_EXPIRED` | 401 | Signed session past its 24-hour expiry. Re-verify |
| `SESSION_INVALID` | 401 | Signature or payload did not verify — often an HMAC secret rotation |
| `SESSION_REQUIRED` | 401 | No session cookie presented. Normal on first use |
| `TURNSTILE_FAILED` | 403 | Turnstile rejected the token: hostname, action, or replay |
| `TURNSTILE_UNAVAILABLE` | 503 | Cloudflare siteverify unreachable or erroring |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type was not `application/json` |
| `UPSTREAM_ERROR` | 502 | Provider error that matched no more specific rule. Read the status |
| `UPSTREAM_INVALID_RESPONSE` | 502 | Model output failed the task's output validator |
| `UPSTREAM_RATE_LIMITED` | 429 | Provider rate limit. Honour `retryAfterSeconds` |
| `UPSTREAM_REJECTED_REQUEST` | 400 | Provider rejected the request shape — often an unsupported `response_format` |
| `UPSTREAM_TIMEOUT` | 504 | Provider exceeded the 45-second upstream timeout |
| `UPSTREAM_UNAVAILABLE` | 503 | No eligible free, ZDR provider was available |

---

## 3. The reproduction ladder

Climb from cheapest to most expensive and **stop at the first rung that
reproduces**. Rungs 1 and 2 resolve the overwhelming majority of reports.

**Rung 1 — Worker contract, stubbed provider. Free, seconds.**

```bash
npx vitest run --config vitest.worker.config.ts tests/worker/
```

All seven routes through the real `handleRequest`: Turnstile, HMAC session, both
rate-limit bindings, the SQLite Durable Object quota, and every output
validator. If the reported code is a session, quota, rate-limit, or validator
code, it is reproducible here without touching the network.

**Rung 2 — real model, no Worker, no quota. Free, a few minutes.**

```bash
OPENROUTER_API_KEY=... npm run ai:evaluate -- --models <exact deployed model>
```

Answers "can this model actually satisfy this task's validator?" for all seven
routes at once. Read `pass.byTask`. This is the rung for every
`UPSTREAM_INVALID_RESPONSE` report. It bypasses the Worker deliberately, so it
spends none of the five daily attempts.

**Rung 3 — real Worker, locally.**

```bash
npm run build
npm run preview          # wrangler dev, reads a gitignored .dev.vars
```

Use when rungs 1 and 2 both pass but production still fails — the difference is
then configuration, not code.

**Rung 4 — the deployed canary. Spends 2 of 5 daily attempts. Last resort.**

```bash
npm run ai:canary
```

Exactly one text and one structured request, no retries. Do not extend it and do
not rotate sessions to get more attempts; `MAX_DAILY_ATTEMPTS = 5` per install
per UTC day is the contract (`worker/quota-protocol.ts`, `AGENTS.md`).

---

## 4. Procedure — a free model was delisted

Free models disappear from OpenRouter without notice. This is the most likely
real beta incident, so it is written out rather than improvised. The symptom is
usually `AI_CONFIGURATION_ERROR` or `UPSTREAM_UNAVAILABLE` on every request at
once, for every user.

1. **Confirm it.** `npm run ai:discover` — check whether the configured model IDs
   are still present in the authenticated, ZDR-filtered catalog.
2. **Find replacements.** The same command reports eligible candidates.
3. **Qualify them on all seven routes.**
   ```bash
   OPENROUTER_API_KEY=... npm run ai:evaluate -- --models <up to four>
   ```
   **A candidate is eligible only if `pass.rate` is 1.** Do not lower the bar —
   the rubric is pinned to what the Worker will reject in production either way
   (`tests/worker/ai-eval-parity.test.ts`). If nothing passes all seven, widen
   discovery, or disable the failing task's controls and say so publicly.
4. **Record the evidence.** `npm run ai:evaluate:record`.
5. **Rebind and ship.** Update `OPENROUTER_FREE_MODELS` in `wrangler.jsonc`,
   commit, diff-scan that commit, then run the full release gate. Never
   `wrangler deploy` directly.

---

## 5. What never to do

- Do not ask a reporter for prompts, responses, or curriculum content.
- Do not add server-side logging of request or response bodies to "make triage
  easier". That is the design, not a gap.
- Do not rotate installation IDs or sessions to get past the daily quota.
- Do not weaken a rubric check, coverage threshold, or output validator to make
  a model pass. Fix the model choice, or disable the feature.
- Do not add a retry or raise a timeout to make an intermittent failure go away.
  See the rule at the top of this file.
