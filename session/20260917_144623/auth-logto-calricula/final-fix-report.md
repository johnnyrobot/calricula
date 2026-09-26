# Final-review fix wave — report

Branch `auth/logto-migration`, base `bd8b533`. Four commits:

| Hash | Scope |
| --- | --- |
| `b5b39e9` | backend: I-1 seeds, I-2 `/login` placeholder merge, M-3 |
| `8fcfa70` | frontend: I-2 session gate, M-9 callback error, M-7 env example |
| `7717e1f` | docs: I-3 decision record + link removal, I-1 docs, I-4 cutover gate, M-4/M-5/M-6/M-8 |
| `9f7d467` | backend: comment-only follow-up to `relink_legacy_row` docstring |

## What changed, per finding

### I-1 — seeds adoptable by re-link
- `backend/seeds/seed_users.py`: every `SEED_USERS` entry now carries `"auth_issuer": "dev"`, with a comment explaining why (the `/login` re-link matches `auth_issuer IS NULL`; dev-token lookup is by `auth_subject` only, so dev sign-in is unaffected).
- Tests (`backend/tests/test_auth_oidc_routes.py`): `test_login_does_not_relink_a_seeded_dev_row` (verified-email match against an `auth_issuer="dev"` ADMIN row provisions a fresh FACULTY row; seeded row untouched); `test_seeded_users_all_carry_the_dev_issuer` (imports `SEED_USERS` and asserts the field on every entry, so the seed file itself is under test).
- `README.md` ~232 (M-4): the "create Logto users with the same emails" paragraph is replaced by a dev-only note (seeds stamped `dev`, don't create them in a production tenant, don't load seeds into production; real users provision on first sign-in).
- `README.md` production steps and `docker-compose.prod.yml` first-time-setup comment: `seeds.seed_all` (which also creates the test users, courses and demo data) replaced by the reference seeders `seeds.seed_top_codes` + `seeds.seed_ccn_standards`. This was cited in the review's I-1 "Where" (README:338, prod compose:18) and would otherwise contradict the new §6 note.
- `docs/AUTH-LOGTO.md` §6: new "Seed data is for development only" subsection; and the Recommendation-5 cutover text with the `UPDATE users SET auth_issuer='<issuer>' WHERE auth_issuer IS NULL` / `DELETE` SQL so NULL stops meaning "adoptable" after `AUTH_LEGACY_RELINK` is turned off.

### I-2 — first-sign-in race
- Frontend `frontend/src/contexts/AuthContext.tsx`: a `Gate` (`{promise, open}`) is created once per mount via lazy `useState(createGate)` (a ref was the first attempt; the React Compiler lint rule `react-hooks/refs` rejects reading a ref during render, and lazy state is the idiomatic equivalent). `fetchAccessToken` awaits `sessionGate.promise` inside the de-duplicated request before calling `/api/auth/token`. The gate opens in a `finally` around the `/api/auth/session` fetch (so a failed session route still releases queued callers, and a StrictMode-cancelled bootstrap opens it too since its request still reached the server), and immediately in `dev`/`none` modes. Result: a child calling `getToken()` in its mount effect still gets a real token, but only after `/login` has settled.
- Test `mints a token for a child that asks during its own mount effect, only once the session route has settled`: the session mock is held on a controllable promise; asserts zero `/api/auth/token` calls and an empty child while it is pending, then the token arrives after release, with `/api/auth/session` as the first request. New test `opens the token gate even when the session route itself fails`. All other provider tests unchanged and green (34 in the file).
- Backend `backend/app/api/routes/auth.py`: the re-link condition is now `email and AUTH_LEGACY_RELINK and (user is None or is_provisional_email(user.email))`. Two helpers: `find_legacy_row(session, email)` (the single NULL-issuer match or `None`) and `relink_legacy_row(session, legacy, placeholder, subject, issuer)`, which deletes the placeholder (`session.delete` + `flush`), re-points the legacy row, commits; on `IntegrityError` it rolls back, logs `Legacy re-link skipped for subject …: placeholder user … already has dependants; legacy user … left unlinked` at WARNING, and returns the re-fetched placeholder so the existing repair path runs. Verified no ORM cascades hang off `User` and no FK to `users.id` has `ondelete`, so a placeholder with dependants is refused rather than cascading. The unique index on `auth_subject` is satisfied because the delete is flushed before the update in the same transaction.
- Tests: `test_login_merges_placeholder_row_into_legacy_row` (access token first → placeholder; then `/login` → legacy row owns the subject, placeholder gone, role preserved); `test_login_keeps_placeholder_when_legacy_match_is_ambiguous` (two NULL-issuer rows → placeholder kept and email-repaired, both legacy rows untouched); `test_login_abandons_merge_when_placeholder_has_dependants` (a `Division.dean_id` pointing at the placeholder → merge refused, placeholder repaired, legacy row untouched, warning asserted via `caplog`; the dependant is cleaned up in `finally`).

### I-3 — dangling ADR links
- `docs/AUTH-LOGTO.md` gains §0 "Decision record (ADR-0001, Logto auth stack)" with the two paragraphs: (a) one tenant / two web apps / one API resource per app; Calricula requests tokens for both resources; standard JWT/JWKS verification with no vendor SDK; users keyed by `auth_subject` + `auth_issuer`; (b) self-hosting stance (deployers run Logto, MPL-2.0, Docker + Postgres, or Logto Cloud; identity data stays on deployer infrastructure).
- The three files that linked to the path (`README.md:214`, `docs/AUTH-LOGTO.md` §intro/§9/References) now point at §0. The other 17 files listed in the review already used a bare `ADR-0001` label with Logto context in the same line/comment and no path, so they were left as they are. `git grep -n "docs/applicationx"` over tracked files is empty.

### I-4 — staging gate (+ M-8)
- `docs/STAGING_VALIDATION.md`: new §2b "Logto cutover gate (manual, required before cutover)" with a step table — sign-in → `/dashboard` → authenticated API call (`/api/auth/token` 200, backend 2xx) → sign-out (token route 204 afterwards); one legacy-row re-link with the exact DB expectations (subject/issuer stamped, no `@oidc.invalid` duplicate); a cancelled callback landing on `/login` with the message; `email_verified` true per connector. Added to the overview list and the Go/No-Go table.
- `RELEASE_CHECKLIST.md` §3: a 🔴 "Logto cutover gate" line under the staging validation item, marked as blocking cutover (not a source release).
- M-8: `OIDC_ID_TOKEN` → `OIDC_ACCESS_TOKEN` in `scripts/staging/validate_auth.py`, `validate_staging.sh`, `scripts/staging/README.md`, `docs/STAGING_VALIDATION.md`; the variable descriptions now say "not the ID token" explicitly. `git grep OIDC_ID_TOKEN` is empty.

### Minors
- M-3 `backend/app/core/oidc.py`: the generic `except Exception` → 401 branch logs `token verification failed: <ExceptionClass>` at DEBUG (class name only) before raising the constant `AuthError`.
- M-5 `docs/AUTH-LOGTO.md` §1: `https://<tenant-id>.logto.app/` is labelled Logto Cloud; the self-hosted form (`https://auth.your-college.edu/`, `http://localhost:3001/` for the default image) is given too.
- M-6 `docs/AUTH-LOGTO.md`: §4 adds the sentence that an address set via the Console/Management API is reported verified (administrators are inside the trust boundary). The troubleshooting row is scoped to demo deployments, with new rows for the `@oidc.invalid` placeholder outcome outside demo mode and for the `/callback` failure message.
- M-7 `frontend/.env.local.example`: application type is "Traditional web" (App Router named as the framework guide).
- M-9 `frontend/src/app/callback/route.ts`: `handleSignIn` wrapped in try/catch; on failure `console.warn` with the error class name only, then `redirect('/login?error=callback')`. `frontend/src/app/login/page.tsx`: a `REDIRECT_ERRORS` map; `?error=` is read from `window.location.search` in the existing mount effect (no `useSearchParams`, which would need a Suspense boundary for the static build) and shown through the existing `role="alert"` block (`error ?? authError ?? redirectError`, so provider errors keep precedence). Existing classes only; no new colours. New test file `frontend/src/app/login/__tests__/page.test.tsx` (3 tests: message shown for `callback`, nothing for an unknown value, provider error wins).

## Tests and commands

Backend (port 5435):
```
cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider
  Required test coverage of 45% reached. Total coverage: 51.68%
  289 passed, 1 warning in 3.20s      (was 284; +5 route tests)
```
Targeted: `tests/test_auth_oidc_routes.py tests/test_oidc.py` → 52 passed (29 + 23).

Frontend:
```
npm run lint    → ✖ 83 problems (0 errors, 83 warnings)  — none in touched files; same pre-existing warnings
npm test        → Test Suites: 17 passed; Tests: 361 passed (was 357; +1 provider, +3 login page)
npm run build   → ✓ Compiled successfully; ✓ Generating static pages (19/19)
```
Also: `python3 -m py_compile scripts/staging/validate_auth.py` and `bash -n scripts/staging/validate_staging.sh` OK.

## Self-review notes (`git diff bd8b533..HEAD`)
- 18 files, +628/−79. Nothing outside the brief except the two seed-instruction edits (README production steps, prod compose comment), which are the direct consequence of the "seeds are dev-only" note and were cited in the review's I-1 locations.
- No personal email, no secrets; the only `docs/applicationx` matches in the diff are removed lines. No new link to `docs/applicationx/`.
- Author identity: the first backend commit was initially made with a stray `-c user.email` override; it was amended with `--reset-author` (content unchanged) so all four commits carry the repo's configured `johnnyrobot <johnnyrobot@users.noreply.github.com>` like the rest of the branch. Trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` is the final paragraph of each commit.
- Untouched: `backend/serviceAccountKey.json`, `calricula_pwa_demo/`, `docs/applicationx/`, `session/`, deferred minors M-1, M-2, M-10, M-11, M-13.

## Not done / concerns
- `RELEASE_CHECKLIST.md` still carries the pre-existing note "*Currently the only unverified production code path.*" on the RAG smoke-test line, which the new cutover-gate line one bullet above now contradicts; left as is to avoid editing unrelated text — one-word fix if wanted.
- The 17 remaining bare `ADR-0001` labels in code/env/compose comments were not reworded to "ADR-0001 (Logto auth stack)" since each already sits next to the word Logto and none is a path; say so if the exact label is wanted everywhere.
- Frontend `npm run lint` reports 83 pre-existing warnings (0 errors); CI treats lint as non-blocking.

## Re-review fixes (N-1, N-2, N-4, N-5) — one commit

- N-1: `README.md` production steps and `docker-compose.prod.yml` header now run `seeds.seed_departments` before `seed_top_codes`/`seed_ccn_standards`, with a note that it loads a reference division/department list to edit for the college (`backend/seeds/seed_departments.py` — the list is inline there; `backend/seeds/data/` holds only the CCN JSON) or to maintain the tables directly. `seed_users`/`seed_all` remain excluded; `git grep seed_all README.md docker-compose.prod.yml` shows only the local-dev step and the two "not seed_all" notes.
- N-2: `relink_legacy_row` docstring (comment only) and the matching §6 sentence in `docs/AUTH-LOGTO.md` now say the placeholder is moments old and normally has no dependants; a refused delete falls back to the placeholder path with a warning (noting `notifications` cascade/null out via the migration's `ondelete`). No logic change; the FK-refused test still holds because `Division.dean_id` has no `ondelete`.
- N-4: `docs/AUTH-LOGTO.md` §6 gains "Databases seeded before this migration" with `UPDATE users SET auth_issuer = 'dev' WHERE auth_issuer IS NULL AND auth_subject LIKE 'test\_%';` (seed subjects are `test_*`; underscore escaped so it is literal), placed before the cutover SQL.
- N-5: `RELEASE_CHECKLIST.md` RAG line reworded to "Unverified production code path, alongside the browser-side Logto flow covered by the cutover gate above."

Checks run: `git grep -n "seed_all" README.md docker-compose.prod.yml` and a read-through of the edited Markdown. No tests run (docs + docstring only).
