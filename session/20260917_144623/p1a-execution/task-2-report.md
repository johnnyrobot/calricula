# Task 2 Report: Principal resolution and membership checks

## What was implemented

Exactly per the brief:

- `backend/app/identity/firebase.py` — `AuthError`, `_ensure()` (lazy Firebase app init, raises `AuthError(503, ...)` when unconfigured), `verify_token(token) -> dict`.
- `backend/app/identity/principal.py` — `Principal` (BaseModel: `kind`, `user_id`, `issuer`, `subject`, `token_revision`), `DEV_TOKENS`, `_provision`, `get_principal_from_token(token, session) -> Principal`.
- `backend/app/identity/membership.py` — `authorize_workspace(session, principal, workspace_id) -> Membership | None`, `org_roles(session, principal, org_id) -> set[MemberRole]`.
- `backend/app/core/deps.py` — `get_principal` (`HTTPBearer(auto_error=False)` + `get_session`, delegates to `get_principal_from_token`), `require_user` (401 for public principal).
- `backend/app/core/config.py` — added `FIREBASE_PROJECT_ID: str | None = None`, `FIREBASE_SERVICE_ACCOUNT_PATH: str | None = None`, `PUBLIC_CHAT_ENABLED: bool = True`.
- `.env.example` — added `FIREBASE_PROJECT_ID=`, `FIREBASE_SERVICE_ACCOUNT_PATH=`, `PUBLIC_CHAT_ENABLED=true`.
- `backend/requirements.txt` — added `firebase-admin==7.6.0`.
- `backend/tests/test_identity.py` — the brief's test suite, verbatim.

## firebase-admin version pinned

**7.6.0** — confirmed via `pip index versions firebase-admin` as the latest release on PyPI (brief's exact-version request had no specific number beyond "7.x latest"; 7.6.0 satisfied it directly). Installed into `backend/.venv` cleanly, no dependency conflicts with existing pinned packages.

## Tests and results

TDD evidence:
- **RED**: `backend/.venv/bin/python -m pytest tests/test_identity.py -q --no-cov` before implementation →
  `ModuleNotFoundError: No module named 'app.identity.principal'` (collection error, as the brief predicted).
- **GREEN**: after implementing all four files and the config additions →
  `backend/.venv/bin/python -m pytest tests/test_identity.py -q --no-cov` → `........` (8 passed).

## Full-suite summary

`cd backend && .venv/bin/python -m pytest` → **311 passed**, no warnings, no errors.
Coverage: 92.37% total (floor 70%). New modules: `app/identity/principal.py` 82%, `app/identity/membership.py` 83%, `app/identity/firebase.py` 40% (Firebase-configured paths are untested by design — no Firebase project available in the test environment; `_ensure()`'s unconfigured-503 branch is exercised indirectly since it's never hit by dev-token/public/garbage-token test paths, all of which return before calling `verify_token`). This is consistent with the brief: tests never configure Firebase.

## Files changed

- New: `backend/app/identity/firebase.py`, `backend/app/identity/principal.py`, `backend/app/identity/membership.py`, `backend/app/core/deps.py`, `backend/tests/test_identity.py`
- Modified: `backend/app/core/config.py`, `.env.example`, `backend/requirements.txt`

## Self-review

- **Completeness**: all brief interfaces present with the exact signatures specified; dev token map matches Calricula's four tokens (`dev-faculty-001`, `dev-chair-001`, `dev-articulation-001`, `dev-admin-001`) under issuer `dev`.
- **Quality**: `authorize_workspace` keeps the `m.expires_at.replace(tzinfo=timezone.utc)` fix noted from Task 1's review (naive `TIMESTAMP WITHOUT TIME ZONE` columns). `verify_token` imports `firebase_admin` at module level per the brief's code; module imports cleanly with no Firebase configured (verified — full suite collects and runs without a Firebase project).
- **Discipline**: no settings beyond the three named were added; no extra files; `deps.py` limited to `get_principal` and `require_user` as instructed.
- **Testing**: fixtures build real `Organization`/`AppUser`/`Workspace`/`Membership` rows against the test Postgres DB via the `session` fixture; assertions check actual returned objects/None, not mocks. Full suite output is pristine (no warnings).
- **Security**: dev-provisioned user email uses `f"{token}@example.invalid"` — no personal or real email anywhere in code.

## Concerns

None. Everything matched the brief exactly; no ambiguity encountered.

## Fix round 1 (review findings)

### 1. (Important) `org_roles` didn't apply expiry — fixed

`backend/app/identity/membership.py`: factored the active-membership predicate into `_is_active(m: Membership, now: datetime) -> bool` (checks `revoked_at is None` and `expires_at` absent-or-future with the `replace(tzinfo=timezone.utc)` normalization for naive Postgres timestamps). Both `authorize_workspace` and `org_roles` now use it — `org_roles`'s query still filters `revoked_at IS NULL` at the SQL level but now also drops expired rows via `_is_active` in the comprehension.

Added to `backend/tests/test_identity.py`:
- `test_org_roles_active_membership` — active membership returns `{MemberRole.staff}`.
- `test_org_roles_revoked_membership_is_empty` — revoked → `set()`.
- `test_org_roles_expired_membership_is_empty` — expired → `set()`.
- `test_org_roles_public_principal_is_empty` — public principal → `set()`.

`_fixture` was widened to also return `org.id` (third tuple element) so the new tests can call `org_roles` against the same org the membership was created in; the two existing call sites (`test_authorize_workspace`, `test_public_principal_never_authorized`) were updated to unpack three values.

**RED evidence**: stashed the `membership.py` fix and ran `tests/test_identity.py -k org_roles` → `test_org_roles_expired_membership_is_empty` failed (`AssertionError: assert {<MemberRole.staff: 'staff'>} == set()`), confirming the bug and that the new test catches it. Unstashed to restore the fix.

### 2. (Minor) Firebase failures not all typed — fixed

`backend/app/identity/firebase.py`: added `from firebase_admin.exceptions import FirebaseError`; `verify_token` now also catches `auth.CertificateFetchError` (→ `AuthError(503, "authentication temporarily unavailable")`, checked before the generic case since it's more specific) and any other `FirebaseError` (→ `AuthError(401, "invalid or expired token")`). Existing tuple-based catch for `InvalidIdTokenError`/`ExpiredIdTokenError`/`RevokedIdTokenError`/`ValueError` kept unchanged. Verified `auth.CertificateFetchError` is a `FirebaseError` subclass in the installed `firebase-admin==7.6.0`, so exception ordering (specific before generic) is correct.

No new tests added for this branch — brief's original test suite doesn't configure Firebase, so these paths remain reachable only via integration against a real/mocked Firebase project; the change is a straightforward typed-exception addition validated by import/collection succeeding and the full suite staying green.

### Commands and output

- `cd backend && .venv/bin/python -m pytest tests/test_identity.py -q --no-cov` → `............` (12 passed).
- `cd backend && .venv/bin/python -m pytest` → **315 passed**, no warnings. Coverage 92.26% total (floor 70%); `app/identity/membership.py` now 94% (up from 83%).

### Commit

`81b8f68` — `fix(identity): apply expiry to org roles and type all Firebase failures`

### Concerns

None. Both findings addressed exactly as ruled; no scope creep.
