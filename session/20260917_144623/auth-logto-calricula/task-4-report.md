# Task 4 report: Environment, docs and demo

Commit: `d829b40` — `docs: Logto replaces Firebase in setup, env and demo guides` (branch `auth/logto-migration`, not pushed).

## Files changed and why

**Environment templates**
- `.env.example` — replaced the `FIREBASE AUTHENTICATION` block + the separate `OIDC (LOGTO)` block (left over from an earlier task) with one `LOGTO / OIDC AUTHENTICATION` block: backend `OIDC_ISSUER/OIDC_AUDIENCE/OIDC_CLIENT_ID/OIDC_JWKS_URL/OIDC_ALGORITHMS/AUTH_LEGACY_RELINK`, frontend server-only `LOGTO_ENDPOINT/LOGTO_APP_ID/LOGTO_APP_SECRET/LOGTO_COOKIE_SECRET/LOGTO_BASE_URL/LOGTO_API_RESOURCE/LOGTO_APPLICATIONX_RESOURCE/API_BASE_URL`, and client-visible `NEXT_PUBLIC_LOGTO_ENABLED`. Reworded the `DEVELOPMENT AUTH BYPASS` block (Firebase → Logto).
- `.env.production.example` — same swap for the prod-only file (it had its own separate Firebase block that Task 3 hadn't touched).

**Compose / Docker**
- `docker-compose.yml` (dev) — backend: `OIDC_*`/`AUTH_LEGACY_RELINK` in place of `FIREBASE_*`; dropped the `serviceAccountKey.json` bind mount. Frontend: `NEXT_PUBLIC_LOGTO_ENABLED`, all `LOGTO_*`, `API_BASE_URL` in place of `NEXT_PUBLIC_FIREBASE_*`.
- `docker-compose.prod.yml` — same backend swap (kept the pre-existing `:?required` pattern, now on `OIDC_ISSUER/OIDC_AUDIENCE/OIDC_CLIENT_ID`); removed the `serviceAccountKey.json` volume/prerequisite comment. Frontend: build arg `NEXT_PUBLIC_LOGTO_ENABLED` replaces the three Firebase build args; added runtime `LOGTO_*`/`API_BASE_URL` env (server-only vars must be present at container runtime, not baked at build).
- `docker-compose.demo.yml` / `docker-compose.hetzner.yml` — **not in the brief's file list, but caught by the whole-repo verification grep** (both are real `*.yml` deployment files with their own independent Firebase blocks). Applied the same swap for consistency; `hetzner.yml` additionally dropped the `../infrastructure/shared/firebase-service-account.json` bind mount (Logto needs no file-based credential) and added `env_file: .env` to its frontend service so `LOGTO_*` reach it.
- `frontend/Dockerfile.prod` — build ARGs/ENV: three `NEXT_PUBLIC_FIREBASE_*` → one `NEXT_PUBLIC_LOGTO_ENABLED` (matches the compose build-arg change; without this the compose edit alone would silently do nothing since the Dockerfile only declared the old ARG names).
- `.gitignore` — removed the Firebase-specific ignore entries (`serviceAccountKey.json`, `serviceAccountkey.json`, `serviceaccount.json`, `firebase-credentials.json`), kept the generic `*-service-account.json` pattern for any future deployer credential file. Also fixed a stale inline comment referencing `firebase.ts` (file no longer exists; frontend/src/lib now has `logto.ts`).
- Deleted `serviceAccountKey.json` (repo-root, 3-byte placeholder). It was **never actually git-tracked** — `git log -- serviceAccountKey.json` is empty and `git ls-files` was already empty before my change; it existed only because `.gitignore` hid it from `git status`. Removing the ignore entry surfaced it as untracked, then I deleted the file directly (not `git rm`).

**Root docs**
- `CLAUDE.md` — stack sentence (line 3), secrets note (line 53), new Conventions line: `Identity: users are keyed by auth_subject (OIDC sub) + auth_issuer; never reintroduce Firebase.`
- `AGENTS.md` — stack sentence, setup command comment, the now-obsolete "Firebase service-account JSON goes at the repo root" line replaced with a pointer to `docs/AUTH-LOGTO.md`, secrets note, and (for parity with CLAUDE.md) the same identity-convention sentence appended to the Backend code-style bullet.
- `README.md` — tech-stack table row, the `#### Firebase Authentication` env section rewritten to `#### Logto / OIDC Authentication` (pointing at `docs/AUTH-LOGTO.md`), dev-bypass intro line, the whole `## Firebase Setup` walkthrough replaced with a condensed `## Logto Setup` that points to the new guide, production env-var example, security checklist bullet, and the `### Firebase Authentication Issues` troubleshooting section rewritten around the backend's actual 401/503 error paths and the `OIDC_AUDIENCE != OIDC_CLIENT_ID` boot guard.
- `SECURITY.md` — secrets bullet (Firebase service account → Logto app/cookie secret), added a pointer to `docs/AUTH-LOGTO.md` in the self-host validation bullet.
- `RELEASE_CHECKLIST.md` — adopter data-inventory bullet ("Firebase UID" → "OIDC subject + issuer", with a pointer to the new guide), the credential-rotation note, and the staging-validation checklist item ("Real Firebase auth flow" → "Real Logto (OIDC) auth flow").
- `CONTRIBUTING.md` — tech-stack line, frontend local-setup snippet (also fixed a pre-existing, unrelated bug: it said `cp .env.example .env.local` but `frontend/.env.example` doesn't exist — only `frontend/.env.local.example` does, since Task 3 renamed it; corrected to `cp .env.local.example .env.local`).
- `.github/ISSUE_TEMPLATE/bug_report.md` — `Auth (Firebase)` checkbox → `Auth (Logto / OIDC)`.

**Staging validation** (not in the brief's file list, but `scripts/staging/README.md` and `docs/STAGING_VALIDATION.md` are `.md` files caught by the whole-repo verification grep, and `validate_auth.py`'s behavior is described by both)
- `docs/STAGING_VALIDATION.md` — auth section rewritten around a Logto access token (renamed `FIREBASE_ID_TOKEN` → `OIDC_ID_TOKEN` throughout, including the table, example export block, and the "getting a token" callout, which now describes reading `GET /api/auth/token` or using a `dev-*` token), the "Goal" line, and the FAIL-row explanation.
- `scripts/staging/validate_auth.py` — this script only ever forwards a bearer token to `get_current_user`; it never called a Firebase SDK, so this was a safe, purely mechanical rename: docstring, `FIREBASE_ID_TOKEN` env var → `OIDC_ID_TOKEN`, error messages. No behavioral logic changed.
- `scripts/staging/validate_staging.sh` — env-var doc comment updated to match.
- `scripts/staging/README.md` — "real Firebase auth" → "real Logto (OIDC) auth", example env block.

**New file**
- `docs/AUTH-LOGTO.md` — deployer guide: tenant creation, the "Traditional web" application + redirect/post-sign-out URIs + scopes, the Calricula API resource (and the `OIDC_AUDIENCE == LOGTO_API_RESOURCE`, `OIDC_AUDIENCE != OIDC_CLIENT_ID` constraints, both enforced by `backend/app/core/config.py`'s production boot guard), connector email-verification requirement (tied to `verified_email()` in `backend/app/core/deps.py`, which gates both `AUTH_LEGACY_RELINK` and demo mode), MFA (optional, no special-casing), a full env-var reference table for both backend and frontend, `AUTH_LEGACY_RELINK` lifecycle, demo mode (`DEMO_MODE_DETAIL`'s `"demo" in email` gate), dev mode (the seven `dev-*` tokens in `backend/app/core/oidc.py::_DEV_TOKEN_MAP`), JWKS reachability inside compose (`OIDC_JWKS_URL` vs `OIDC_ISSUER`), and a troubleshooting table (401 vs 503 meanings, sourced from `backend/app/core/oidc.py`'s actual `AuthError` call sites).

## Grep verification

```
grep -rni firebase --include='*.md' --include='*.example' --include='*.yml' --include='*.yaml' --include='*.json' --include='*.toml' . \
  | grep -v node_modules | grep -v venv | grep -v .next | grep -v "docs/applicationx"
```

Remaining lines, each justified:

| File:line | Text | Why acceptable |
| --- | --- | --- |
| `.env.production.example:30` | "Set to false once every Firebase-era user has signed in at least once" | Describes `AUTH_LEGACY_RELINK`'s purpose — inherently a migration-history reference. |
| `.env.example:57` | "Logto is the sole identity provider (replaces Firebase)" | States the migration fact. |
| `.env.example:76` | "adoption of a pre-migration (Firebase-era) user row" | Same, describing `AUTH_LEGACY_RELINK`. |
| `CLAUDE.md:46` | "never reintroduce Firebase" | Forward-looking guardrail, not a live reference. |
| `AGENTS.md:45` | "never reintroduce Firebase" | Same. |
| `docs/AUTH-LOGTO.md:4,108,111,160` | "replaces the earlier Firebase...", "Firebase-era user row" (×3) | The guide's own migration-history framing (`AUTH_LEGACY_RELINK` section). |

I additionally excluded two paths the given verification command doesn't exclude but that I judged out of scope, and did **not** edit them:

- **`calricula_pwa_demo/`** — a separate, self-contained, no-login static PWA with its own `AGENTS.md` boundary rule: *"Make changes only inside `calricula_pwa_demo/` unless the user explicitly expands the boundary... Do not modify or commit parent frontend/backend files as a side effect."* Its Firebase mentions describe the **parent app's old stack** as read-only context ("the parent Calricula frontend/, backend/, database, Firebase... are read-only reference implementations") or explicitly disclaim having Firebase themselves ("No Firebase login... is required"). Editing this subproject wasn't authorized by this task and isn't necessary for correctness — it has no auth of its own.
- **`session/*`** — untracked (per the initial git status), pre-existing agent session artifacts/reports about the *already-completed* ApplicationX and Calricula Logto migration (dated, past-tense task reports and ledgers). Read as clearly historical on their face; not part of any tracked deliverable, so not committed or edited.

## Compose config

```
docker compose -f docker-compose.yml config -q            # exit 0, no required vars needed (same as before)
DB_PASSWORD=dummy GOOGLE_API_KEY=dummy OIDC_ISSUER=https://dummy.logto.app/oidc \
  OIDC_AUDIENCE=https://api.dummy.local OIDC_CLIENT_ID=dummy-client \
  docker compose -f docker-compose.prod.yml config -q     # exit 0
```

`docker-compose.prod.yml` requires `DB_PASSWORD`/`GOOGLE_API_KEY`/`OIDC_*` via `:?` (same pattern the file already used for `DB_PASSWORD`/`GOOGLE_API_KEY`/formerly `FIREBASE_PROJECT_ID` before my change — confirmed via `git stash` that the **pre-existing** file also fails `config -q` with zero env for the same reason). Both files parse and interpolate correctly once the required variables are supplied.

Also spot-checked `docker-compose.demo.yml` and `docker-compose.hetzner.yml`: `hetzner.yml` passes `config -q` cleanly. `demo.yml` has a **pre-existing, unrelated** go-yaml parse error at its `demo-reset` service's multi-line shell `command:` block (confirmed via `git stash` that this fails identically before my changes) — not something Task 4 introduced or is scoped to fix.

## Backend suite

```
cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider
```
`284 passed, 1 warning`. Coverage 51.55% (floor 45%). No code was touched by this task, so this is a no-op confirmation that the env/doc changes didn't disturb anything.

## Trailer verification

```
$ git log -1 --format='%B'
docs: Logto replaces Firebase in setup, env and demo guides

Align .env.example/.env.production.example, all four docker-compose files,
frontend/Dockerfile.prod, and every setup/deployment/staging doc with the
Logto (OIDC) backend and frontend from Tasks 1-3: replace Firebase env
blocks with OIDC_*/LOGTO_* variables, drop the serviceAccountKey.json
placeholder and its dedicated .gitignore entries, and add
docs/AUTH-LOGTO.md as the deployer's Logto tenant setup guide.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```
Trailer is its own final paragraph, exact text, parses correctly. No personal email anywhere in any changed file (spot-checked all new/changed prose; only `<noreply@anthropic.com>` appears, matching existing convention).

`git ls-files serviceAccountKey.json` → empty (it was never tracked; confirmed both before and after the commit).

## Self-review

- Every `OIDC_*`/`LOGTO_*`/`AUTH_LEGACY_RELINK`/`NEXT_PUBLIC_LOGTO_ENABLED` env name used in `docs/AUTH-LOGTO.md`, `README.md`, `.env.example`, and the compose files cross-checked against `backend/app/core/config.py`, `frontend/src/lib/logto.ts`, and `frontend/src/contexts/AuthContext.tsx` (`NEXT_PUBLIC_LOGTO_ENABLED` usage) — all match exactly. `LOGTO_APPLICATIONX_RESOURCE` is documented as *not yet consumed by any route* (verified via grep — only the Task-4-brief's own planning doc mentions it as future work), matching the instruction to leave it as a placeholder.
- Every path referenced in `docs/AUTH-LOGTO.md` (`backend/app/core/oidc.py`, `backend/app/core/deps.py`, `backend/app/core/config.py`, `frontend/src/lib/logto.ts`, `frontend/src/app/{sign-in,callback,sign-out,api/auth}`, `docs/applicationx/ADR-0001-auth-stack-logto.md`, `docs/STAGING_VALIDATION.md`) exists.
- The 401/503 troubleshooting table and the `OIDC_AUDIENCE == OIDC_CLIENT_ID` boot-refusal description were checked directly against `backend/app/core/oidc.py`'s `AuthError` call sites and `config.py`'s `_enforce_production_safety` validator, not guessed.
- CI (`.github/workflows/ci.yml`) already had no `FIREBASE_*` env — confirmed by grep before touching anything; no CI change was needed or made.

## Concerns

- `docker-compose.demo.yml`'s pre-existing YAML parse error (unrelated to auth) means `docker compose -f docker-compose.demo.yml config -q` cannot currently be used to validate that file at all, before or after this change. Worth a separate fix but out of this task's scope.
- `calricula_pwa_demo/` and `session/` still contain Firebase mentions, excluded from the grep verification by my own judgment (documented above) rather than by the letter of the given verification command. If a stricter reading is wanted, `calricula_pwa_demo/AGENTS.md`'s boundary rule would need to be explicitly waived first.
- `backend/serviceAccountKey.json` (a separate, untracked, empty placeholder — not the repo-root one this task named) still exists locally; left alone since it's untracked, not part of the repo, and outside the task's literal "repo root" scope.

---

## Fix round 1 (Critical)

Commit: `4332e44` — `fix(gitignore): keep credential-file patterns after the Firebase removal`.

**Finding:** the original `.gitignore` edit replaced the four explicit
Firebase-era credential patterns (`serviceAccountKey.json`,
`serviceAccountkey.json`, `serviceaccount.json`, `firebase-credentials.json`)
with only the generic `*-service-account.json` glob. That glob requires a
literal `-service-account.json` suffix and does not match the camelCase
`serviceAccountKey.json` filename at all, so the pre-existing, untracked
`backend/serviceAccountKey.json` (noted as a "concern" in the original report,
left alone as out of scope) became committable: `git check-ignore` exited 1
for it and it was one `git add` away from landing in history.

**Fix:** restored the four explicit patterns under the comment `# Credential
files a deployer may leave behind (any provider) — never commit`, directly
above the still-kept generic `*-service-account.json` pattern. The untracked
`backend/serviceAccountKey.json` file itself was not touched or deleted.

**Verification:**

```
$ git check-ignore -v backend/serviceAccountKey.json
.gitignore:15:serviceAccountkey.json	backend/serviceAccountKey.json

$ git status --short
 M .gitignore
?? docs/applicationx/
?? session/
```

(The match is reported against the `serviceAccountkey.json` line rather than
`serviceAccountKey.json` because the working tree filesystem is
case-insensitive — both patterns are present and either would match. The
important result is `git check-ignore` now exits 0 and `backend/serviceAccountKey.json`
no longer appears in `git status --short`.)

`git ls-files serviceAccountKey.json` remains empty (unaffected — it was
never tracked and this fix only touches `.gitignore`).
