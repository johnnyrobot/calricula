# Task 2 report — Identity column, dependencies, login route, test doubles

Branch `auth/logto-migration`, commit `322971b`
`feat(auth): key users by OIDC subject; login via ID token; migrate firebase_uid`

## What I implemented

**Model + migration.** `User.firebase_uid` → `auth_subject: str = Field(unique=True, index=True)`,
plus `auth_issuer: Optional[str] = Field(default=None, index=True)`. `UserCreate` / `UserRead`
follow. New revision `backend/alembic/versions/20260919_0000_auth_subject_from_firebase_uid.py`
(`revision = "auth_subject_oidc"`, `down_revision = "ws5b_ccn_vs_cid"`): `alter_column` rename,
`ALTER INDEX ix_users_firebase_uid RENAME TO ix_users_auth_subject`, `add_column auth_issuer` +
`ix_users_auth_issuer`; `downgrade` reverses all three.

**`deps.get_current_user`.** Calls `oidc.verify_bearer`, maps `AuthError` → `HTTPException(e.status,
e.detail, headers={"WWW-Authenticate": "Bearer"})`, looks the user up by `auth_subject == claims["sub"]`,
auto-provisions FACULTY with `auth_issuer = claims.get("iss")`. In `settings.DEMO_MODE` it refuses to
provision (403 "Demo mode: demo users must sign in first") so the `/login` demo gate can't be walked
around by hitting a protected route. The `print` of the provisioned email is gone (nothing is logged
on provisioning). `get_current_user_optional` still delegates and swallows the HTTPException, so it
mirrors the new behaviour unchanged.

**`POST /api/auth/login`.** `resolve_dev_token` first, else `verify_id_token` (ID-token audience —
this is the only route that accepts one). Reads `email` / `email_verified` / `iss`. DEMO_MODE
requires `"demo"` in the email (existing 403 message kept verbatim). Then: link by `auth_subject`;
else one-time legacy re-link of a row with `auth_issuer IS NULL` whose email matches the token's
**verified** email; else provision FACULTY. `/me`, `/logout` unchanged (`get_current_user`); `/check`
keeps its token-only shape but now calls `verify_bearer` and returns `sub` instead of `uid`.
Docstrings no longer say "Firebase".

**Deletions.** `app/core/firebase.py` deleted; `firebase-admin` dropped from `requirements.txt` (the
`httpx==0.28.1` pin stays, its comment re-worded); `FIREBASE_PROJECT_ID` /
`FIREBASE_SERVICE_ACCOUNT_PATH` removed from `config.py`; `pip uninstall -y firebase-admin` run in
`backend/venv`. `app/main.py` never called `initialize_firebase`, so nothing to unwire there.
`seeds/seed_users.py` keys are `auth_subject` with the values unchanged (`test_faculty_001` …), so
`dev-*` tokens still resolve to the seeded rows. `.env.example`, docs, CLAUDE.md and compose are
untouched (Task 4).

**`oidc.resolve_dev_token` now also returns `"iss": "dev"`** (the one edit to a Task 1 file) so both
callers can read `claims.get("iss")` uniformly, and a dev-provisioned row is never mistaken for a
pre-migration row by the re-link path. Task 1's docstrings/comments were also scrubbed of "Firebase".

## `\d users` before / after

Before (`calricula_alembic` @ `ws5b_ccn_vs_cid`):

```
 firebase_uid  | character varying |  | not null |
Indexes:
    "ix_users_firebase_uid" UNIQUE, btree (firebase_uid)
```

After (`@ auth_subject_oidc`):

```
 auth_subject  | character varying |  | not null |
 auth_issuer   | character varying |  |          |
Indexes:
    "ix_users_auth_issuer" btree (auth_issuer)
    "ix_users_auth_subject" UNIQUE, btree (auth_subject)
```

## Migration up / down / up (`calricula_alembic` on :5435)

```
$ alembic upgrade head
Running upgrade ws5b_ccn_vs_cid -> auth_subject_oidc, Key users by OIDC subject: ...
$ alembic downgrade -1
Running downgrade auth_subject_oidc -> ws5b_ccn_vs_cid, ...
$ alembic upgrade head
Running upgrade ws5b_ccn_vs_cid -> auth_subject_oidc, ...
```

All three clean; `\d users` matched the expected shape after each step. Data preservation checked
explicitly: a row inserted with `auth_subject = 'legacy_subject_keepme'` came back as
`firebase_uid = 'legacy_subject_keepme'` after the downgrade and as
`auth_subject = 'legacy_subject_keepme', auth_issuer = NULL` after the re-upgrade (row then deleted).
`alembic check` was not run as a gate (pre-existing unrelated drift, per the controller).

## Tests — TDD evidence

New file first, against the old implementation (`tests/test_auth_oidc_routes.py`, 14 tests):

```
12 failed, 2 passed
FAILED test_dev_token_looks_user_up_by_auth_subject
FAILED test_dev_token_auto_provisions_with_dev_issuer
FAILED test_forged_token_is_401_even_in_dev_mode
FAILED test_login_with_id_token_provisions_user_with_email
FAILED test_login_relinks_legacy_row_by_verified_email
FAILED test_login_does_not_relink_on_unverified_email
FAILED test_login_does_not_relink_a_row_that_already_has_an_issuer
FAILED test_demo_mode_login_rejects_non_demo_email
FAILED test_demo_mode_login_allows_demo_email
FAILED test_demo_mode_protected_route_does_not_auto_provision
FAILED test_access_token_is_rejected_at_login
FAILED test_id_token_is_rejected_on_a_protected_route
```

(First failure was `NotNullViolation … column "firebase_uid"` — the column did not exist yet. The two
that passed red were `test_missing_credentials_is_401` and `test_unconfigured_provider_fails_closed`,
which hold under both implementations.)

After implementing: `14 passed`.

Coverage of the six brief-mandated cases: (1) dev-token lookup by `auth_subject` **and** provisioning
with `auth_issuer="dev"`; (2) forged JWT → 401 with `AUTH_DEV_MODE=True` and a provider configured
(`WWW-Authenticate: Bearer` asserted); (3) `/login` with a valid ID token (local ES384 key,
`oidc.signing_key_for` stubbed as in `test_oidc.py`); (4) legacy re-link on a verified email, no
re-link on an unverified one, **plus** no re-link of a row that already has an issuer (hijack guard);
(5) DEMO_MODE `/login` non-demo → 403 (and demo → 200), protected route with an unknown demo-mode
subject → 403 with no row created; (6) access token at `/login` → 401 and ID token on a protected
route → 401.

`tests/test_security_regressions.py::test_protected_endpoint_rejects_forged_token` now passes
(5 passed in that file). Note it passed before too — it accepts 401/403/503, and with the repo-root
`.env` (AUTH_DEV_MODE on, OIDC unset) a forged token still fails closed with 503. The new
`test_forged_token_is_401_even_in_dev_mode` is what actually pins the 401 with a provider configured.

Mechanically updated: `conftest.py` (four seed fixtures → `auth_subject=f"test_…"` + `auth_issuer="dev"`;
`mock_firebase_auth` → `mock_oidc_auth` patching `app.core.deps.verify_bearer`),
`test_api_integration.py`, `test_ccn_api_integration.py`, `test_workflow_endpoints.py`,
`test_courses_crud.py`, `test_ccn_auth.py` (its two "configured Firebase rejects it" stubs became
`patch("app.core.deps.verify_bearer", side_effect=AuthError(401, …))`; the expired-token stubs
likewise raise `AuthError`). `test_auth_characterization.py` was **deleted**: it characterised
`app/core/firebase.py`, which no longer exists, and every property it pinned (dev-token mapping,
fail-closed-when-unconfigured 503, invalid → 401, expired → 401) is already pinned against the
verifier in `tests/test_oidc.py`.

## Full suite

```
$ cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula \
    venv/bin/python -m pytest -q -p no:cacheprovider
272 passed, 1 warning in 2.84s
TOTAL   8568   4163   51%
Required test coverage of 45% reached. Total coverage: 51.41%
```

The single warning is pre-existing (`StarletteDeprecationWarning` from `fastapi.testclient`); no new
warnings. The local `calricula` DB on :5435 is built by `create_all`, which does not rename columns,
so the same DDL as the migration was applied to it by hand once (`ALTER TABLE users RENAME COLUMN …`);
CI builds that schema from scratch and needs nothing.

## Firebase grep

```
$ grep -rn -i firebase backend/app backend/tests backend/seeds backend/requirements.txt
backend/app/schemas/auth.py:54:    def firebase_uid(self) -> str:
backend/app/api/routes/auth.py:60:    def firebase_uid(self) -> str:
```

Not empty — both hits are the **deliberate** deprecated read-only alias the ruling asked for
(`@computed_field` property returning `auth_subject`, documented with a "remove once no client reads
it" comment). Nothing else in `app/`, `tests/`, `seeds/` or `requirements.txt` mentions Firebase; the
only other occurrences in the repo are historical Alembic revisions (the initial schema) and the new
migration, which must name the old column.

## Trailer verification

```
$ git log -1 '--format=%(trailers)'
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Parses as a trailer (own paragraph). No personal email anywhere; seed and test emails are
`@calricula.com` / `@test.edu`.

## Files changed

```
A backend/alembic/versions/20260919_0000_auth_subject_from_firebase_uid.py
A backend/tests/test_auth_oidc_routes.py
D backend/app/core/firebase.py
D backend/tests/test_auth_characterization.py
M backend/app/api/routes/auth.py
M backend/app/core/config.py
M backend/app/core/deps.py
M backend/app/core/oidc.py
M backend/app/models/user.py
M backend/app/schemas/auth.py
M backend/requirements.txt
M backend/seeds/seed_users.py
M backend/tests/{conftest,test_api_integration,test_ccn_api_integration,test_ccn_auth,
                 test_courses_crud,test_oidc,test_security_regressions,test_workflow_endpoints}.py
20 files changed, 803 insertions(+), 556 deletions(-)
```

## Self-review

- Nothing outside the backend was touched; no push, no branch switch, port 5433 never used.
- `grep -rn "verify_firebase_token\|initialize_firebase\|firebase_admin"` over `app tests seeds
  alembic` → no hits. `firebase-admin` uninstalled from `backend/venv`.
- The re-link only fires for `auth_issuer IS NULL` **and** `email_verified` **and** exactly one
  matching row (`.all()` + `len == 1`), so an ambiguous duplicate-email database silently declines to
  re-link rather than picking arbitrarily. A row that already names an issuer is never re-pointed —
  covered by a test.
- Unused `MagicMock` import dropped from `test_ccn_auth.py` after its Firebase stubs went away.

## Concerns / decisions worth a second look

1. **`users.email` is NOT NULL, and an access token carries no `email`.** The brief says to provision
   with `email = claims.get("email")`, which would be `None` for a real Logto access token and raise
   an `IntegrityError` (500) on the first API call by a user who has not hit `/login`. I did not widen
   the column (out of scope for the specified migration). Instead `deps.provisioning_email` stores an
   undeliverable placeholder `f"{sub}@oidc.invalid"` (RFC 2606 reserved), and `/login` overwrites it —
   and *only* it — once an ID token proves a verified address. A real stored email is never rewritten
   from a token. This is the one place I deviated from the letter of the brief; flagging it in case
   you would rather make `email` nullable in the migration.
2. **The Firebase grep is not empty** by construction, because the ruling also requires the deprecated
   `firebase_uid` alias. I put the alias on **both** `schemas.auth.UserResponse` (as specified) and on
   `routes.auth.UserProfileResponse` — the latter is the schema actually returned by `/login` and
   `/me`, so without it the wire response would lose the field immediately, which is what the
   one-release grace period is meant to prevent. The frontend reads neither field today
   (`grep firebase_uid frontend/src` is empty), so Task 4 can delete both.
3. **`/check` response key changed** from `uid` to `sub`. `frontend/src/lib/api.ts:715` calls the
   endpoint but does not read either key; still, it is a wire change for Task 4's checklist.
4. **Commit trailer**: I used `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` exactly as the
   task directed. Note this conflicts with `CLAUDE.md` (`Claude Opus 4.8 (1M context)`) and with the
   session attribution reminder (`Claude Opus 5 (1M context)`); the model actually running this task
   is Opus 5. Say the word and I will amend.
5. **`test_auth_characterization.py` was deleted rather than ported** — see the tests section for why.
   If you would rather keep a file by that name as an OIDC characterization suite, the content now
   lives in `test_oidc.py` + `test_auth_oidc_routes.py`.
6. **Dev tokens now carry `iss: "dev"`**, a one-line change to Task 1's `resolve_dev_token`. All of
   `test_oidc.py` still passes; flagging it because it touches another task's file.

---

# Fix round 1 — review response

Commit `af9626d` on `auth/logto-migration`
`fix(auth): trust only verified email claims; close the legacy re-link window by setting; harden demo mode`
Trailer verified: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (own paragraph).

## 1. (Important) Unverified email claims were stored — fixed

New `deps.verified_email(claims)` returns the `email` claim only when
`claims.get("email_verified") is True` (strict identity check, not truthiness), documented with why:
an unverified claim is attacker-chosen text, and Calricula stores the address on the row, shows it to
other users in workflow/approval responses, and matches on it when adopting a pre-migration row.

Every read of the claim now goes through it:

- `provisioning_email` → verified address, else `{sub}@oidc.invalid`.
- `provisioning_name` → falls back to the **verified** email's local part, else the
  `PROVISIONAL_FULL_NAME` placeholder. (Falling back to an unverified local part would have displayed
  the same attacker-chosen string under a different field, so I closed that too.)
- `/login`'s demo gate reads the verified address only.
- `/login`'s legacy re-link matches on the verified address only (it previously had its own
  `email_verified` check; that is now the single shared rule).
- `/login`'s placeholder repair writes only a verified address.

## 2. (Important) Placeholder-email rule now tested

Added to `tests/test_auth_oidc_routes.py`:

- `test_access_token_provisions_with_placeholder_email` — (a) an access token (no email claim) stores
  `{sub}@oidc.invalid` and the `New User` name.
- `test_login_replaces_placeholder_email_with_verified_email` — (b) a later `/login` repairs it.
- `test_login_does_not_overwrite_a_real_email` — (c) a different verified address does **not**
  overwrite a real stored one.
- `test_login_with_unverified_email_provisions_placeholder` — (d) an unverified claim provisions with
  the placeholder, and the placeholder is what the response returns.
- `test_demo_mode_login_rejects_unverified_demo_email` — the demo gate is not opened by an unverified
  `demo@…` claim (403, no row created).

(a) and (c) already held before the fix and passed red; (b) held; (d) and the demo case failed red.

## 3. (Folded in) `AUTH_LEGACY_RELINK`

`Settings.AUTH_LEGACY_RELINK: bool = True`, commented for deployers ("set false once every
Firebase-era user has signed in"), documented in `.env.example` directly under the OIDC block. The
re-link branch is `if user is None and email and settings.AUTH_LEGACY_RELINK:`. Tests:
`test_legacy_relink_can_be_disabled` (legacy row untouched, fresh row provisioned) and
`test_legacy_relink_is_enabled_by_default`.

## 4. (Folded in) Demo mode enforced per request

`get_current_user` now refuses (403, shared `DEMO_MODE_DETAIL` text) when `DEMO_MODE` is on and the
**stored** user's email lacks "demo" — restoring the old per-request property, so a row that predates
the flag cannot keep access. The existing "unknown subject → no auto-provision" 403 is unchanged.
Tests: `test_demo_mode_refuses_an_existing_non_demo_user` (same identity: 200 with the flag off, 403
with it on) and `test_demo_mode_allows_an_existing_demo_user`.

## 5. (Folded in) Display-name repair

`/login`'s repair branch now fixes the `New User` placeholder when the ID token carries `name`,
alongside the email repair, in one conditional commit. Neither overwrites a real stored value.
Test: `test_login_repairs_placeholder_full_name`.

## 6. (Folded in) `OIDC_AUDIENCE != OIDC_CLIENT_ID`

Added to `_enforce_production_safety`, after the missing-OIDC check: equal values mean an ID token
satisfies the access-token audience check, so a browser token would authorize API calls. Message
names both settings and explains why. Tests in `tests/test_ws4_backend_hygiene.py`:
`test_production_rejects_audience_equal_to_client_id` and
`test_production_accepts_distinct_audience_and_client_id`. Kept inside the production branch for
consistency with the other OIDC guards — worth noting that a dev/staging deployment can still
misconfigure this; say the word if you want it unconditional.

## Test evidence

Red (fix-round tests against the round-1 implementation), `test_auth_oidc_routes.py` +
`test_ws4_backend_hygiene.py`: **7 failed, 54 passed**

```
FAILED test_login_with_unverified_email_provisions_placeholder
FAILED test_login_repairs_placeholder_full_name
FAILED test_demo_mode_login_rejects_unverified_demo_email
FAILED test_legacy_relink_can_be_disabled
FAILED test_legacy_relink_is_enabled_by_default
FAILED test_demo_mode_refuses_an_existing_non_demo_user
FAILED test_production_rejects_audience_equal_to_client_id
```

Green after the fix: `test_auth_oidc_routes.py` + `test_ws4_backend_hygiene.py` + `test_oidc.py` →
**84 passed**.

Full suite:

```
$ cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula \
    venv/bin/python -m pytest -q -p no:cacheprovider
284 passed, 1 warning in 3.00s
Required test coverage of 45% reached. Total coverage: 51.55%
```

Still the single pre-existing `StarletteDeprecationWarning`; no new warnings. Coverage up from
51.41 % to 51.55 %. `tests/test_auth_oidc_routes.py` is now 26 tests.

## Files changed in this round

```
M .env.example
M backend/app/api/routes/auth.py
M backend/app/core/config.py
M backend/app/core/deps.py
M backend/tests/test_auth_oidc_routes.py
M backend/tests/test_ws4_backend_hygiene.py
```

`.env.example` was touched despite Task 4 owning documentation, because the review asked for the new
setting to be documented next to the OIDC block. Nothing else in the Task 4 surface moved.

## Remaining concerns

- Item 1's fix changes observable behaviour for any provider that sends `email_verified` as the
  string `"true"` rather than a boolean: such a user is provisioned with the placeholder instead of
  their address. Logto sends a boolean. Flagging it because a future provider swap would trip on it.
- The concerns from round 1 that were not raised by the review still stand as written above
  (notably: the commit trailer names Claude Fable 5.1 while the running model is Opus 5, and the
  two intentional `firebase_uid` alias grep hits).
