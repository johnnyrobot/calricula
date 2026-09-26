# Final review — `auth/logto-migration` (f5b4020..bd8b533, 8 commits)

Reviewer: senior code review, read-only. Sources: the review package diff (read in five passes: backend core, backend tests, frontend runtime, frontend tests + env/compose/docs, staging scripts), the working tree at bd8b533, `git show` of the base for before/after comparisons, the plan, ADR-0001, EMBEDDED-INTERFACE §4, the ledger and task/e2e reports. No suites were re-run; the reports' evidence (backend 284 passed / 51.55 %, jest 357, build + lint green, migration up/down/up) is accepted as given. I did re-parse the four compose files as YAML and inspected the installed `@logto/next` 4.2.11 sources to confirm the SDK calls used exist and behave as the code assumes.

## Strengths

- **Verifier (`backend/app/core/oidc.py`)** is small, standard and fails closed. `PyJWKClient(cache_keys=False, lifespan=600)` with the rotation test (`test_rotated_key_is_rejected_after_jwks_cache_refresh`) is exactly the right call: PyJWT's per-kid `lru_cache` never expires, so leaving it on would keep a retired key trusted forever. `options={"require": [...]}`, explicit `algorithms`, `issuer`, `audience` and constant error strings (`test_error_detail_never_echoes_token`) close the usual JWT holes (alg none, HS256-with-public-key, missing aud/iss/exp, token contents in errors). Unconfigured → 503 before the token is touched.
- **Two audiences, one guard.** ID tokens (`aud` = client id) are accepted only at `/login`; access tokens (`aud` = API resource) everywhere else; both directions are pinned (`test_id_token_rejected_as_access_token`, `test_access_token_rejected_at_login`, and the route-level pair). The production refusal of `OIDC_AUDIENCE == OIDC_CLIENT_ID` (`config.py:154`) turns a subtle misconfiguration into a boot failure.
- **Trust boundary on email is explicit.** `deps.verified_email` is the single gate; the re-link, demo gate, stored email and display-name fallback all go through it. The re-link refuses ambiguous matches (`len(legacy) == 1`) and rows that already name an issuer (`test_login_does_not_relink_a_row_that_already_has_an_issuer`). I could not construct an account-takeover through attacker-controlled input.
- **Demo mode is now checked on every request** (`deps.py:137`), not just at sign-in, and auto-provisioning is refused under `DEMO_MODE` — closing the gap the pre-flight ruling identified.
- **Migration** (`20260919_0000_auth_subject_from_firebase_uid.py`) is a rename, not a drop/recreate; it also renames the unique index that the initial schema created as `ix_users_firebase_uid` (unique=True), so uniqueness survives and autogenerate stays quiet. Downgrade is the exact inverse. Single head confirmed.
- **Frontend token handling** matches the ADR: the ID token is consumed inside `/api/auth/session` and never returned; the access token is in a `useRef`, `Cache-Control: no-store` on both routes, no storage, no URL. Redirect URIs are built from `LOGTO_BASE_URL` only (no open redirect); `/callback` lands on a fixed path. Half-configured servers 404 every auth route (`logtoConfig === null`).
- **Test quality.** 44 backend auth tests (23 verifier + 21 route-level) exercise real signed ES384 tokens against a stubbed key resolver, and 44 frontend tests exercise the provider against a fake `fetch`, including fake-timer refresh, refresh-margin re-mint, per-resource caching and the "applicationx failure must not sign out" rule. The deleted `test_auth_characterization.py` (dev map, 503 unconfigured, 401 invalid/expired) is fully re-covered in `test_oidc.py`.
- **Env plumbing is consistent** across `config.py`, `lib/logto.ts`, `.env.example`, `.env.production.example`, `frontend/.env.local.example`, four compose files, and `Dockerfile.prod` (`NEXT_PUBLIC_LOGTO_ENABLED` correctly added as a build ARG since it is inlined at build). Empty compose pass-throughs (`OIDC_JWKS_URL=${OIDC_JWKS_URL}`) degrade to the defaults because every consumer uses falsy checks.
- **Hygiene.** No secrets, no personal email (`johnnyrobot`/`@gmail` grep is empty), the credential-file ignore patterns were restored after the Task 4 slip, residual Firebase mentions are exactly the accepted set (two deprecated `firebase_uid` aliases, one config comment, migrations, history lines), and the `.gitignore` placeholder file was never touched.
- **Docs** (`docs/AUTH-LOGTO.md`) are genuinely deployer-grade: tenant setup, the audience/client-id distinction, verified-email requirement with its two load-bearing consumers, the Docker JWKS reachability case, and a troubleshooting table keyed to the backend's actual error strings.

## Issues

### Critical

None found.

### Important

**I-1. Seeded accounts (including `admin@calricula.com`, role ADMIN) are legacy-adoptable by email in every deployment that ran the seeds.**
- Where: `backend/seeds/seed_users.py:19-70` (no `auth_issuer` in `SEED_USERS`, so `User(**user_data)` at line 106 stores `NULL`); `backend/app/api/routes/auth.py:197-217` (re-link adopts any `auth_issuer IS NULL` row on a verified-email match); `docker-compose.prod.yml:18` and `README.md:287,338` instruct deployers to run `seeds.seed_all`; `README.md:232` even suggests creating Logto users with the seeded emails.
- What: With `AUTH_LEGACY_RELINK=true` (the default), any Logto identity in the deployer's tenant that carries a *verified* `admin@calricula.com` adopts the seeded ADMIN row. `calricula.com` is not a domain the deployer controls, so the party who can obtain that verified address is the project's domain owner (or anyone the tenant's connectors let assert it), not the deployer. Pre-migration this could not happen: Firebase-era lookups were by `firebase_uid` only and seeded `test_*` uids were unreachable. The migration introduced the path. `conftest.py` sets `auth_issuer="dev"` on its fixture users, and the ledger's own rationale for `iss: "dev"` ("so a dev-provisioned row is never mistaken for a pre-migration row") was applied to auto-provisioned rows but not to the seeds.
- Fix (small): add `"auth_issuer": "dev"` to every `SEED_USERS` entry (dev tokens still resolve — the lookup is by subject only — and the rows stop matching the `auth_issuer IS NULL` predicate). Add a one-line route test that a verified-email match against a seeded/`"dev"`-issuer row does not re-link. Rewrite `README.md:232` so the "same emails in Logto" suggestion is dropped or scoped to dev, and add a sentence to `docs/AUTH-LOGTO.md` §6 stating seeds are dev-only and must not be loaded into a production database. If the demo deployment relies on adopting the seeded `demo@calricula.com` row, note that a fresh FACULTY row is equivalent (the seeded demo row has no department).

**I-2. First-sign-in ordering race silently orphans a legacy user's row (re-link never runs).**
- Where: `frontend/src/contexts/AuthContext.tsx:301-372` (`fetchAccessToken` is callable from the first render), `:418-445` (bootstrap: `/api/auth/session` → backend `/login`, then the token), `:527-540` (`getToken` mints on demand); `frontend/src/app/dashboard/page.tsx:144-167` (`fetchStats()` runs in a mount effect with no `loading`/`user` gate — and `/dashboard` is where `/callback` lands); same shape in `src/app/lmi-data/page.tsx:89` via `useUserCourses({autoFetch:true})`; `backend/app/core/deps.py:146-166` (auto-provision on first access-token contact); `backend/app/api/routes/auth.py:197` (re-link only when `user is None`).
- What: On a Firebase-era user's first Logto sign-in, two requests leave the browser concurrently: (a) `GET /api/auth/session`, which performs the server-to-server `POST /api/auth/login` that would re-link the legacy row; (b) the dashboard's `getToken()` → `GET /api/auth/token` → `GET /api/dashboard/stats` with the access token, which makes `get_current_user` provision a brand-new row (`{sub}@oidc.invalid`, issuer = Logto). If (b) inserts first, (a) finds the new row by subject, skips the re-link, "repairs" the placeholder email, and returns the *new* FACULTY account. The legacy row — with its role, department and course ownership — is orphaned, with no error anywhere. Both paths are one Next round-trip plus one backend call, so the outcome is a coin flip per deployment/network, and the deployer's `AUTH_LEGACY_RELINK` cutover story is broken for whichever users lose it. The Task 3 test `mints a token for a child that asks during its own mount effect` pins the eager behaviour that creates the window. (The ledger's deferred "concurrent first-contact race → 500" is the sibling of this — that one is loud; this one is silent.)
- Fix: in `logto` mode, make `getToken()`/`fetchAccessToken('calricula')` await the in-flight session bootstrap before minting (store the bootstrap promise in a ref; children still get a real token, just after `/login` has settled). Update the eager-child test to assert the token arrives *after* the session route resolved. Backend defence-in-depth, optional but cheap: at `/login`, when the row found by subject is still provisional (`is_provisional_email(user.email)`) and `AUTH_LEGACY_RELINK` finds exactly one NULL-issuer row for the verified email, adopt the legacy row and delete the just-created placeholder (it has no dependants yet), or at minimum log a warning so the deployer can repair it.

**I-3. Tracked files reference `docs/applicationx/ADR-0001-auth-stack-logto.md`, which is untracked.**
- Where: `docs/AUTH-LOGTO.md:5,150,173`, `README.md:214`, `.env.example`, `.env.production.example`, `backend/app/core/config.py`, `oidc.py`, `models/user.py`, `schemas/auth.py`, the migration docstring, three compose files, three test modules — 20 tracked files; `git ls-files docs/applicationx` is empty (`git status` shows `?? docs/applicationx/`).
- What: The ADR is the spec of record for this change and the doc that `docs/AUTH-LOGTO.md` tells deployers to read for the self-hosting stance. After merge, every one of those links dangles in a public repo. The ledger notes the planning files are deliberately kept untracked, which is fine for the plans — but the ADR is cited as authority by shipped code and docs.
- Fix: owner decision — either commit `docs/applicationx/ADR-0001-auth-stack-logto.md` (and `EMBEDDED-INTERFACE.md` if the host plan will cite it) on this branch, or fold the two paragraphs the docs depend on (self-hosting, one-tenant/two-apps/one-resource) into `docs/AUTH-LOGTO.md` and reduce the code references to a bare "ADR-0001" label. Not a code defect; it blocks the docs from being sufficient on their own.

**I-4. The Logto runtime path has never been executed end to end.**
- Where: `frontend/src/app/api/auth/session/route.ts`, `token/route.ts`, `callback/route.ts`, `sign-in/route.ts`, `sign-out/route.ts`.
- What: Jest covers `lib/logto.ts` helpers and the provider against a fake `fetch`; e2e ran in dev mode only (no tenant); backend tests use locally signed tokens. Nothing has exercised `new LogtoClient(config).createNodeClient().getIdToken()`, `handleSignIn` with a real code, cookie writes from the token route, or a real Logto ES384 access token against the verifier. I checked the installed SDK: the methods exist with the signatures used, `cookies().set` is permitted in Route Handlers, and rewrites are `afterFiles` so the `/api/auth/{session,token}` handlers win over the `/api/:path*` proxy — so I expect it to work, but expectation is not evidence for the one path production users will take.
- Fix: not merge-blocking; **required before cutover**. Add a staging checklist item (`docs/STAGING_VALIDATION.md` already exists) that runs a real tenant through sign-in → `/dashboard` → an API call → sign-out, and one legacy-row re-link, and confirms `email_verified` is `true` on the tenant's ID tokens for the connector(s) in use.

### Minor

**M-1.** `backend/app/api/routes/auth.py:49` and `backend/app/schemas/auth.py:61` — two unrelated `UserProfileResponse` classes with different fields (`display_name`/`department_name` vs `full_name`/`department`); the schemas module's `LoginResponse`/`TokenVerifyRequest` are also unused by the routes. Pre-existing duplication; the alias was added to both correctly. Consolidate in a follow-up.

**M-2.** `backend/app/core/oidc.py:69,86` — `_jwks_url()` is evaluated twice per verification (once for the 503 pre-check, once inside `signing_key_for`). Harmless; fold the pre-check into `signing_key_for`.

**M-3.** `backend/app/core/oidc.py:116` — `except Exception` → 401 after the `PyJWTError` branch. It is the safe direction, but it also hides programming errors (e.g. a bad `algorithms` type) as "invalid token". Log at debug with the exception class, still return 401.

**M-4.** `README.md:232` — "add users in the Logto console with the same emails as the test credentials above" is the documented path that makes I-1 reachable; rewrite with I-1.

**M-5.** `docs/AUTH-LOGTO.md:17` — `https://your-tenant.logto.app/` is the Logto Cloud endpoint shape but is labelled "(self-hosted)". Swap the label or give both forms.

**M-6.** `docs/AUTH-LOGTO.md:166` — "Signed in through Logto but treated as signed out → `email_verified` is not `true`" is inaccurate outside demo mode: §4 correctly says such a user *is* provisioned (with a placeholder address). Only the demo case produces "signed out". Also worth one sentence in §4: Logto reports `email_verified` for a primary email set through the Console/Management API as well, so administrators assigning addresses are inside the trust boundary.

**M-7.** `frontend/.env.local.example:27` says the Logto application type is "Next.js (App Router)"; `docs/AUTH-LOGTO.md` §2 and README say "Traditional web". Pick one (Logto's console type is "Traditional web"; App Router is the framework guide).

**M-8.** `scripts/staging/validate_auth.py:15,22` and `validate_staging.sh` — the variable is named `OIDC_ID_TOKEN` but must hold an **access** token (the script hits `get_current_user` routes). Rename to `OIDC_ACCESS_TOKEN` before someone pastes an ID token and files a bug against the 401.

**M-9.** `frontend/src/app/callback/route.ts:22` — an error from `handleSignIn` (user cancelled at Logto, state mismatch, expired code) surfaces as a bare Next 500. Catch and redirect to `/login?error=callback` with a message; the provider already knows how to show `authError`.

**M-10.** `frontend/src/contexts/AuthContext.tsx:527` — `getToken`, `login`, `logout` are recreated every render; ~30 consumers list `getToken` in effect deps. Pre-existing (the Firebase version was the same), and the in-flight de-dup keeps it from multiplying requests, but a `useCallback` here would stop those effects re-firing on every provider state change.

**M-11.** `docker-compose.demo.yml:165` fails to parse as YAML (`docker compose config` will refuse it). Pre-existing on the base branch (`f5b4020` fails at the same construct), untouched by this work, but the file now carries new Logto content nobody can validate. Fix in a follow-up or with I-1's doc edits.

**M-12.** Commit trailer: all eight commits use `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; the repo's `CLAUDE.md` names a different model string. The ledger records the choice; flagging only so the owner decides which rule is authoritative. The essential constraint (noreply address, no personal email) is met.

**M-13.** No route-level test for `GET /api/auth/token` itself (the plan's Task 5 test line). `resolveResourceIndicator` is unit-tested and the provider's consumer side is tested, so the untested surface is ~15 lines; acceptable given I-4 will exercise it on staging.

## Deferred-minor triage

- T1 `_jwks_url` called twice — stays deferred (M-2).
- T2 demo gate reads the unverified email claim — resolved by round 1 (`email = verified_email(claims)` at `auth.py:173`); nothing to defer.
- T2 duplicate `UserProfileResponse` classes — stays deferred (M-1).
- T2 concurrent first-contact race → 500 — stays deferred as a 500, but its silent sibling is I-2 and must be fixed before merge.
- T2 `email_verified is True` strict — stays deferred; strict is the correct fail-closed reading.
- T2 audience==client-id guard production-only — stays deferred; dev/test rely on distinct values anyway.
- T3 GET sign-out (logout CSRF nuisance) — stays deferred; matches the SDK's documented shape, no data impact.
- T3 unhandled callback errors → 500 — stays deferred but should be the first follow-up (M-9); a user who cancels at Logto sees a raw 500.
- T3 "works without JS" comment inaccurate — stays deferred.
- T3 `getLogtoContext` ignoreCookieChange nuance — stays deferred; verified against the SDK source that `getLogtoContext` uses `ignoreCookieChange: true` and the token route's `getAccessToken` does not, which is the right pairing.
- T3 `logout()` does not cancel an in-flight token fetch — stays deferred; the full-page `/sign-out` navigation tears it down.
- T3 no route-level test for the AbortSignal timeout path — stays deferred.
- T5 resource validated before auth (400/404 when signed out) — stays deferred; no token leaves either way.

## Rulings review

- Base branch = demo branch, not main — **agree**; the auth code lives there and PR #35 stacks it.
- Tests on a disposable Postgres :5435 — **agree**.
- DEMO_MODE enforced at `/login` and auto-provision refused under DEMO_MODE — **agree**; and the round-1 addition of the per-request re-check in `get_current_user` was the right completion of this ruling.
- T5 ships route + config only; adapter stays in the host plan — **agree**; `getToken('applicationx')` is the contract the host plan was patched to expect.
- Task 1 keeps firebase-admin until Task 2 — **agree**; avoids a broken intermediate commit.
- `alembic check` drift is pre-existing and not a gate — **agree**, with the condition that the drift is filed as its own issue; it is currently only in this ledger.
- Task 2 fix set (verified-email only; `AUTH_LEGACY_RELINK`; demo re-check; name repair; aud≠client guard) — **agree** on every item.
- Task 3 ruling (fetch from first render; refresh-margin re-mint; AbortSignal; 502 message) — **agree with the fixes, disagree with the framing**: "child effects must get a real token immediately" created the window in I-2. The correct rule is "a child may call `getToken()` at any time, and it resolves after the session bootstrap has settled." The plan itself said `/api/auth/session` "can perform the `/api/auth/login` exchange server-side" precisely so that `/login` runs first.
- Task 4 ruling (restore the four credential ignore patterns; never delete the placeholder) — **agree**.
- Task 5 ruling (`getToken(resource?)`, per-resource cache, 400/204 semantics) — **agree**.
- Plan deviation: `auth_issuer` left NULL for existing rows instead of "the configured issuer at migration time" — **agree with the deviation and flag the plan line as a plan defect**: stamping Firebase-UID rows with the Logto issuer would have been factually wrong and would have made the re-link predicate impossible. The Global Constraint should be amended to say NULL.
- Plan deviation: `get_current_user` provisions with a placeholder email rather than `email=None` — **agree**; `users.email` is NOT NULL, and `.invalid` is the right reserved domain. The plan line is a second plan defect (it assumed a nullable column).

## Recommendations

1. Fix I-1 and I-2 on this branch (both are small: a seed field + one test; a bootstrap-promise gate + one adjusted test; optionally the `/login` placeholder-merge guard).
2. Resolve I-3 by owner decision before the PR is opened (commit the ADR or inline what the docs need).
3. Add the staging run in I-4 to `docs/STAGING_VALIDATION.md` and `RELEASE_CHECKLIST.md` as a cutover gate; include "confirm `email_verified` on the tenant's ID tokens for each connector" and one legacy-row re-link.
4. Follow-ups (not blocking): M-9 friendly callback error page; M-1 schema consolidation; M-8 rename; M-11 demo compose YAML; file the `alembic check` drift as an issue; the three pre-existing e2e failures the e2e report catalogued (`units.toFixed` on a string, hardcoded `:3000`, `clearCookies` vs sessionStorage).
5. When `AUTH_LEGACY_RELINK` is flipped off, the deployer should also `UPDATE users SET auth_issuer='<issuer>' ...` for any rows still NULL, or delete them; add that line to the §6 cutover text so the NULL predicate stops meaning "adoptable" forever.

## Assessment

**Ready to merge? With fixes.**

The architecture is right and the security-sensitive core — the verifier, the audience split, the verified-email trust boundary, the fail-closed production guards, the browser-side token handling — is careful and well tested; I found no path by which attacker-controlled input takes over an account. The two blocking items are both seams the tasks did not see across: seeds that predate the re-link concept now satisfy its predicate (I-1), and the Task 3 "mint immediately" fix races the Task 2 "re-link at `/login`" contract (I-2). Each is a few lines. I-3 needs an owner decision, and I-4 is a cutover gate rather than a merge gate. After I-1 and I-2 land with their tests, this is ready.
