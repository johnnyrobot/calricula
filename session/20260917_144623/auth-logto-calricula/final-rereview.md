# Final re-review — fix wave bd8b533..9f7d467 (`auth/logto-migration`)

Scope: verdict each finding from `final-review.md` against the fix diff
(`review-bd8b533..9f7d467.diff`, 18 files, +629/−79) and inspect the diff for
new problems. Read-only; no suites re-run except a targeted `eslint` on the five
touched frontend files (clean, exit 0) and `git grep` for the link/rename checks.

## Per-finding verdicts

### I-1 seeded rows adoptable by the `/login` re-link — ADDRESSED
- `backend/seeds/seed_users.py:19-27,82` — every `SEED_USERS` entry now carries
  `"auth_issuer": "dev"`; `seed_users()` still builds rows with `User(**user_data)`
  (line 118), so the field lands on the row. Header comment explains why.
- Tests `backend/tests/test_auth_oidc_routes.py:290-318`
  (`test_login_does_not_relink_a_seeded_dev_row`: verified-email match against an
  `auth_issuer="dev"` ADMIN row provisions a fresh FACULTY row, seeded row untouched)
  and `:321-326` (`test_seeded_users_all_carry_the_dev_issuer` imports `SEED_USERS`).
- Docs: `README.md:232-238` (M-4 rewrite, dev-only); `docs/AUTH-LOGTO.md` §6
  "Seed data is for development only" (diff lines 921-929).
- Note (Minor, below): `seed_users()` skips rows that already exist, so a dev DB
  seeded before this fix keeps its NULL-issuer seed rows; nothing tells that
  deployer to stamp them.

### I-2 first-sign-in race — ADDRESSED
- Frontend `frontend/src/contexts/AuthContext.tsx`: `Gate` created once per mount
  via lazy `useState(createGate)` (line ~275); `fetchAccessToken` awaits
  `sessionGate.promise` inside the de-duplicated request before `/api/auth/token`
  (diff line 1443); gate opened synchronously in `dev`/`none` (working tree
  lines 409, 429) and in a `finally` around the `/api/auth/session` fetch in
  `logto` mode (lines 447-458). `getToken()` in `dev` returns `user.id` and in
  `none` returns `null` without touching the gate (lines 568-571), so those modes
  are unaffected.
- Test `frontend/src/contexts/__tests__/AuthContext.test.tsx:374-418`: session
  mock held on a controllable promise; asserts zero `/api/auth/token` calls and an
  empty child after 20 ms, then the token after release, and
  `urls()[0] === '/api/auth/session'` — a real ordering assertion. New test
  `:420-436` covers a throwing session fetch (child resolves `null`, not hung).
- Backend `backend/app/api/routes/auth.py:116-130` (`find_legacy_row`, single
  NULL-issuer match only), `:133-177` (`relink_legacy_row`: delete + flush the
  placeholder, `IntegrityError` → rollback, WARNING with both ids, return the
  re-fetched placeholder), `:274-291` (condition
  `email and AUTH_LEGACY_RELINK and (user is None or is_provisional_email(user.email))`).
- Tests `:329-370` (merge), `:373-411` (ambiguous → placeholder kept), `:414-470`
  (dependant via `Division.dean_id` → merge refused, warning asserted via `caplog`).

### I-3 tracked links to the untracked ADR — ADDRESSED
- `docs/AUTH-LOGTO.md` §0 "Decision record (ADR-0001, Logto auth stack)" carries
  both required paragraphs (shape; self-hosting stance) — diff lines 824-839.
- `git grep -n "docs/applicationx"` over tracked files (excluding `.superpowers/`,
  `session/`) is empty. `README.md:214`, `AUTH-LOGTO.md` intro/§9/References now
  point at §0. The remaining 23 `ADR-0001` hits are bare labels next to
  "Logto"/"OIDC" or the unrelated `calricula_pwa_demo` ADR (see Out-of-Scope).

### I-4 Logto runtime path never executed — ADDRESSED
- `docs/STAGING_VALIDATION.md` §2b (diff lines 1071-1093): sign-in → `/dashboard`
  → authenticated API call → sign-out; one legacy re-link with DB expectations
  (no `@oidc.invalid` duplicate); callback-failure row; `email_verified` per
  connector. Overview item 5 and the Go/No-Go row added.
- `RELEASE_CHECKLIST.md:66`: 🔴 cutover-gate line, blocks cutover not source release.
- Claims in the table check out against code: token route answers 204 when signed
  out (`frontend/src/app/api/auth/token/route.ts:32`); session route error values
  match (`session/route.ts:92-106`).
- M-8: `git grep OIDC_ID_TOKEN` empty; `OIDC_ACCESS_TOKEN` in `validate_auth.py`,
  `validate_staging.sh`, `scripts/staging/README.md`, `docs/STAGING_VALIDATION.md`.

### M-3 debug log on generic 401 — ADDRESSED
`backend/app/core/oidc.py:134-139`: `logger.debug("token verification failed: %s", type(e).__name__)` — class name only; `AuthError` detail unchanged.

### M-4 README "same emails in Logto" — ADDRESSED
`README.md:232-238`: suggestion removed; replaced by the dev-only/`auth_issuer='dev'`/don't-load-in-prod note.

### M-5 endpoint label — ADDRESSED
`docs/AUTH-LOGTO.md` §1 (diff 846-849): `https://<tenant-id>.logto.app/` labelled Logto Cloud; self-hosted form given.

### M-6 troubleshooting row + §4 admin-set email — ADDRESSED
§4 sentence added (diff 872-875). Troubleshooting row scoped to demo deployments, with new rows for the `@oidc.invalid` outcome and the `/callback` failure message (diff 972-974). Accurate against `auth.py:262-266` (demo gate 403 when `email` is `None`).

### M-7 application type — ADDRESSED
`frontend/.env.local.example:27-28`: "Traditional web", App Router named as the framework guide.

### M-9 callback error → `/login?error=callback` — ADDRESSED
`frontend/src/app/callback/route.ts:22-33`: `handleSignIn` in try/catch; `console.warn` with class name only; `redirect('/login?error=callback')` is called in the `catch` block, so Next's `NEXT_REDIRECT` throw is not swallowed by the same `try`. `frontend/src/app/login/page.tsx:23-29,47-56,81`: `REDIRECT_ERRORS` map, read from `window.location.search` post-mount, shown via the existing `role="alert"` block with `error ?? authError ?? redirectError` precedence. New test file `frontend/src/app/login/__tests__/page.test.tsx` (3 tests). No new colours/classes; the alert block is pre-existing.

### Recommendation 5 — §6 cutover SQL — ADDRESSED
`docs/AUTH-LOGTO.md` §6 "Cutover" (diff 905-919) with the `UPDATE … WHERE auth_issuer IS NULL` / `DELETE` alternatives. The parenthetical "that person will get a fresh account" is correct: `users.email` is `index=True`, not unique (`backend/app/models/user.py:26`), so re-provisioning with the same address does not collide.

## New breakage in the fix diff

### Important

**N-1. Production first-time setup now yields a database with no departments, and there is no API to create them.**
- `README.md:341-344` and `docker-compose.prod.yml:17-21` replaced `seeds.seed_all` with `seeds.seed_top_codes` + `seeds.seed_ccn_standards`. Module names and `__main__` blocks are correct (`backend/seeds/seed_top_codes.py`, `seed_ccn_standards.py`) and match CI (`.github/workflows/ci.yml:58-61`). But `seed_all` was also the only documented source of divisions/departments (`backend/seeds/seed_all.py:34`), `Course.department_id` is a required FK (`backend/app/models/course.py:114`), and `backend/app/api/routes/departments.py` exposes only `GET` routes. A deployer following the new steps cannot create a course until departments exist, and the docs give no way to add them.
- Fix (one or two lines): add `python -m seeds.seed_departments` to both lists with a note that these are sample divisions/departments to replace with the college's own via SQL, or add a sentence telling the deployer to insert their departments directly. (The old instruction was wrong in the other direction — test users + demo courses in prod — so this is not a regression to revert, but the replacement is incomplete.)

### Minor

**N-2. `relink_legacy_row`'s "refused rather than cascading" guarantee does not hold for notifications under the Alembic schema.**
- `backend/app/api/routes/auth.py:141-149` docstring and the report's "no FK to `users.id` has `ondelete`" claim. The ORM model has none (`backend/app/models/notification.py:51-52`), which is what the `create_all`-built test DB sees, but the production migration declares `notifications.user_id … ondelete='CASCADE'` and `actor_id … ondelete='SET NULL'` (`backend/alembic/versions/20251215_0335_add_notifications_table.py:37-38`). If a placeholder row acquired a notification in its brief life, deleting it silently drops that notification (and nulls `actor_id` elsewhere) instead of refusing. The window is milliseconds and a notification for a just-provisioned FACULTY placeholder is improbable, so this is a docstring accuracy issue and a note for the deployer, not a data-loss risk in practice. Either count `Notification` rows for the placeholder before deleting, or say "refused (except cascading notifications)" in the docstring/§6.

**N-3. A placeholder that an administrator already edited loses those edits on merge.**
- `auth.py:135-139` states the placeholder "carries nothing the legacy row lacks". True for the race the fix targets; not true if an admin changed the placeholder's role/department in the meantime (or if the row was a long-lived provisional-email account from an unverified connector that later got fixed). The legacy row wins and the placeholder's role is dropped without a log line. Acceptable behaviour (the legacy row is the real account), but the WARNING path only fires on FK refusal; an INFO line on every merge (`merged placeholder %s into legacy %s`) would make it auditable.

**N-4. Already-seeded databases are not remediated.**
- `backend/seeds/seed_users.py:105-112` skips existing rows by email, so a dev/demo DB seeded before this fix keeps `auth_issuer IS NULL` on the seven test accounts and remains adoptable while `AUTH_LEGACY_RELINK=true`. The §6 note says "do not load the seeds into production" but not "if you already did, stamp them". One SQL line in §6 ("Seed data…") would close it: `UPDATE users SET auth_issuer='dev' WHERE auth_issuer IS NULL AND auth_subject LIKE 'test_%';`.

**N-5. `RELEASE_CHECKLIST.md:69`** still says the RAG smoke test is "*Currently the only unverified production code path*", one bullet below the new line that says the browser-side Logto path "has no automated coverage". Implementer flagged it; one-word fix.

### Checked and clean
- Gate cannot deadlock: `finally` opens it on any fetch outcome (404/500/network throw); `dev`/`none` open it synchronously before any early return; `inflightRef` is cleared in the request's own `finally`, so a failed queued request does not poison later calls. StrictMode double-mount reuses the one lazy-state gate and both bootstraps open it.
- Placeholder merge: only when `is_provisional_email(user.email)` (`@oidc.invalid`), `AUTH_LEGACY_RELINK` on, verified email present, and exactly one NULL-issuer match; runs at most once per subject (after merge or repair the email is no longer provisional); `find_legacy_row` cannot return the placeholder itself (its issuer is set). No new takeover path — the proof of ownership is the same verified-email claim as the plain re-link.
- Unique `auth_subject` index satisfied: delete is flushed before the legacy update in the same transaction.
- `redirect()` in the callback route is outside the `try`, so its control-flow throw is not caught.
- Targeted `eslint` on the five touched frontend files: 0 problems.
- No personal email or secrets in the diff; the only `docs/applicationx` matches are removed lines.
- Commit trailer: the report states `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` is the final paragraph of each of the four commits; not independently re-run here per the "no git commands except grep" constraint.

## Out-of-Scope Observations (not touched by the fix)
- `calricula_pwa_demo/docs/adr/0001-client-side-ai-session-readiness.md` is a different "ADR-0001" in the same repo; the auth ADR label now collides with it in `git grep ADR-0001`. Cosmetic; a follow-up could rename one.
- `README.md:291` (local dev setup) still runs `seeds.seed_all` — correct for dev; noted only because I-1's "Where" cited it.
- The login alert block uses `text-red-800` on `bg-red-50` (pre-existing, ~7:1), not `gold-ink`; fine for an error state.

## Verdict

All eleven findings under verification: **ADDRESSED**.

New breakage: one Important (N-1, docs — production seed steps drop departments with no way to create them; one-line fix), four Minor (N-2..N-5). N-1 should be fixed before the PR is opened; the rest are follow-ups.
