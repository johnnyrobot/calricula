# SDD ledger — plan: /Users/laccd/code/calricula/docs/applicationx/plans/2026-09-18-auth-oidc-logto-applicationx.md

Repo: /Users/laccd/code/applicationx main at c76ad2f (pushed). Direct commits to main as before; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
Spec: ADR-0001-auth-stack-logto.md (Calricula docs/applicationx/), EMBEDDED-INTERFACE §4, TECHNICAL-SPEC §10.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1 self | test monkeypatches `oidc.signing_key_for`; `verify_token` calls `_jwks_url()` first (503 when unconfigured) | Consistent. Clean. |
| T1 self | `jwt.PyJWK.from_dict(ECAlgorithm.to_jwk(pub, as_dict=True) \| {...})` | PyJWT ≥2.6 supports `as_dict`; PyJWK.from_dict needs `kty`/`crv`/`x`/`y` — provided. Clean. |
| T1→T2 | backend `OIDC_AUDIENCE` == frontend `LOGTO_API_RESOURCE` | Documented in both env examples. Clean. |
| T2 self | `@logto/next` export names (`signIn`, `signOut`, `handleSignIn`, `getLogtoContext`, `getAccessToken`) | Plan says verify against installed typings. Ruling: installed SDK wins. |
| T2 self | `getToken()` stays sync; token fetched from a same-origin route and refreshed | Adapter unchanged. Clean. |
| T3 self | compose profile `auth` with Logto on 3301/3302 | No port clash with 3002. Clean. |
| T1 | existing tests reference FIREBASE_* settings (test_config production case) | Task 1 updates them. Clean. |

## Rulings (pre-flight)
- Ruling: the installed `@logto/next` typings are the authority for export names; the implementer records any divergence from the plan. Cost if wrong: names.
Task 1: implementer af95a1b3c686f63ee, commit bf79d70, DONE.
Task 1: review: Needs fixes — 2 Important (email claim still persisted instead of None; malformed JWKS body escapes as 500), 1 Minor (issuer trailing-slash normalisation inconsistent). Attack probes a–k all correct.
Task 1: Ruling: fix both; fold in the Minor (normalise OIDC_ISSUER with rstrip('/') once, in a helper used for both the JWKS URL and the issuer compare; note that Logto's `iss` has no trailing slash). A malformed JWKS response → 503 "authentication temporarily unavailable" (provider-side fault), any other unexpected verifier exception → 401. Cost if wrong: a few lines.
Task 1: fix round 1/5 (3 addressed, 0 open; commits bf79d70..02f736b)
Task 1: complete (commits c76ad2f..02f736b, review clean)
Task 2: implementer a4b7a2cb9b06b2db7 (opus), commit 660dcfc, DONE (@logto/next 4.2.11; expires_in derived from JWT exp; tampered /callback → Next 500; real Logto flow unexercised).
Task 2: review (opus): Approved, 0 Important, 7 Minor. Callback overload confirmed not to weaken state/PKCE checks.
Task 2: minor (deferred): unused signInLogto/signOut methods on AuthState; unreachable 500 lines in sign-in/out routes; duplicated response types; redundant getLogtoContext pre-check; generic 500 on tampered callback; "Sign in" flash before session resolves. Folded into Task 3: `.env.example` "six must be set" → five (BASE_URL defaults).
Task 2: complete (commits 02f736b..660dcfc, review clean)
Task 3: implementer a9ad111e42a876e12, commit a3c4ef4, DONE.
Task 3: complete (commits 660dcfc..a3c4ef4, review clean)
Task 4: complete (controller-run exit checks: 459 passed / 95.76% / no warnings; alembic check clean; packages/workspace-ui untouched; frontend tsc + build clean; git grep firebase empty outside the dated history line; firebase-admin not installed; 4/4 trailers). Note: the e2e was reproduced in Task 2 (4/4) and no code changed since.
Final review (opus): With fixes — 1 Important (plan text `cache_keys=True` → PyJWT lru_cache without expiry; rotated keys trusted until restart), 8 Minor. Rulings all SOUND; nuance: PyJWKSetError maps to 401 not 503.
Final: Ruling: cache_keys=False with a rotation test; PyJWKSetError → 503; `.env.example` documents the JSON-list form of OIDC_ALGORITHMS; README documents OIDC_JWKS_URL=http://logto:3001/oidc/jwks for the compose-only path; plan text corrected in the Calricula docs (so the Calricula migration does not copy the line). Refresh-before-expiry and 401 refetch (Minor 2), GET sign-out CSRF (Minor 5), unpinned logto tag (Minor 6) carried to the Calricula host/P1b work and the owner's hosting decision. Cost if wrong: small.
Final fix wave: commit b719a4a; re-review clean; 461 passed; pushed c76ad2f..b719a4a.
