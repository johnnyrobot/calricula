# Logto (OIDC) authentication — deployer guide

Calricula authenticates through [Logto](https://logto.io), a standard OIDC
provider, self-hostable or Logto Cloud. This replaces the earlier Firebase
Authentication integration; see `docs/applicationx/ADR-0001-auth-stack-logto.md`
for the decision record. This guide covers tenant setup, the environment
variables, `AUTH_LEGACY_RELINK`, demo mode, dev mode, and troubleshooting.

The backend verifies tokens itself via JWKS (`backend/app/core/oidc.py`, no
vendor SDK); the frontend uses `@logto/next` (`frontend/src/lib/logto.ts` and
the route handlers under `frontend/src/app/{sign-in,callback,sign-out,api/auth}`).

## 1. Create the Logto tenant

Self-host Logto (Docker + PostgreSQL, MPL-2.0) or use Logto Cloud. Either way
you end up with a **tenant endpoint**, e.g. `https://your-tenant.logto.app/`
(self-hosted) — the OIDC issuer is that endpoint plus `/oidc`.

## 2. Register the Calricula application

In the Logto console, create one application:

- Type: **Traditional web** (server-rendered redirect flow; matches
  `@logto/next`'s App Router integration).
- Redirect URI: `https://<your-host>/callback` (dev: `http://localhost:3001/callback`).
- Post sign-out redirect URI: `https://<your-host>/` (dev: `http://localhost:3001/`).
- Scopes: `openid profile email`. The frontend always requests `openid`,
  `offline_access`, and `profile`; it adds `email` explicitly because the
  backend keys accounts on it (see §5).

Record the **App ID** and **App Secret** — these become `LOGTO_APP_ID` and
`LOGTO_APP_SECRET`.

## 3. Register the Calricula API resource

Create an **API resource** for Calricula's own backend:

- Indicator: any URI you control, e.g. `https://api.calricula.local` in dev
  or your real API origin in production. This becomes both the backend's
  `OIDC_AUDIENCE` and the frontend's `LOGTO_API_RESOURCE` — **they must be
  identical**, and the backend refuses to boot in production if
  `OIDC_AUDIENCE == OIDC_CLIENT_ID` (an ID token would then satisfy the
  access-token check).
- No scopes are required for Calricula's own routes today.

If you are also running the companion ApplicationX service and plan to use
the embedded workspace broker, register a second API resource for
ApplicationX and set `LOGTO_APPLICATIONX_RESOURCE` to its indicator. Leave it
empty until that integration lands — it is not read by any route yet.

## 4. Connectors: require verified email

Calricula's backend only ever trusts an `email` claim when the token's
`email_verified` claim is `true` (`backend/app/core/deps.py::verified_email`).
This is load-bearing for two features:

- **`AUTH_LEGACY_RELINK`** (§6) matches a pre-migration user row by email —
  an unverified claim would let anyone claim any legacy account.
- **Demo mode** (§7) gates sign-in on `"demo" in email` — same risk.

Configure the connector(s) your tenant uses (email/password, Google, etc.) so
they mark `email_verified: true` only after real verification (Logto's
built-in email connector does this already; a social connector must be one
that verifies email itself, e.g. Google). A user whose token has no verified
email is still provisioned, but with a synthesized, undeliverable placeholder
address (`provisioning_email` in `backend/app/core/deps.py`) — acceptable for
occasional use but not for `AUTH_LEGACY_RELINK` or demo mode.

## 5. MFA

Optional. Enable it in the tenant's sign-in experience if your institution
requires it; Calricula does not special-case MFA — from the API's point of
view it is just another property of how the user authenticated.

## 6. Environment variables

Backend (`backend/app/core/config.py`):

| Variable | Meaning |
| --- | --- |
| `OIDC_ISSUER` | Logto tenant issuer, `https://<tenant-endpoint>/oidc`. |
| `OIDC_AUDIENCE` | Calricula API resource indicator (§3). Must equal `LOGTO_API_RESOURCE`. |
| `OIDC_CLIENT_ID` | The Calricula web application's App ID (§2). Must differ from `OIDC_AUDIENCE`. |
| `OIDC_JWKS_URL` | Optional; defaults to `OIDC_ISSUER + "/jwks"`. Set explicitly when the backend must reach Logto by an internal address (§9). |
| `OIDC_ALGORITHMS` | Optional JSON list; default `["ES384","RS256"]` (Logto signs with ES384). |
| `AUTH_LEGACY_RELINK` | See below. |

Frontend (`frontend/src/lib/logto.ts`, server-only — never prefixed
`NEXT_PUBLIC_`):

| Variable | Meaning |
| --- | --- |
| `LOGTO_ENDPOINT` | Tenant endpoint (no `/oidc` suffix). |
| `LOGTO_APP_ID` / `LOGTO_APP_SECRET` | The Calricula application's credentials (§2). |
| `LOGTO_COOKIE_SECRET` | Encrypts the session cookie; `openssl rand -base64 32`. |
| `LOGTO_BASE_URL` | Public origin of the frontend; default `http://localhost:3001`. |
| `LOGTO_API_RESOURCE` | Must equal the backend's `OIDC_AUDIENCE`. |
| `LOGTO_APPLICATIONX_RESOURCE` | ApplicationX API resource (§3); leave empty until that integration lands. |
| `API_BASE_URL` | Backend origin for the server-side ID-token exchange at `POST /api/auth/login`. Compose: `http://backend:8000`; host: `http://localhost:8001`. |

Frontend (client-visible): `NEXT_PUBLIC_LOGTO_ENABLED=true` once every
`LOGTO_*` variable above is set — it is a separate flag, not derived from
them, so a half-configured server still 404s every auth route instead of
silently advertising sign-in.

### `AUTH_LEGACY_RELINK`

One-time adoption of a pre-migration (Firebase-era) user row — one whose
`auth_issuer` is still `NULL` — by its new Logto subject, on a **verified**
email match, at `POST /api/auth/login`. Leave this `true` until every
Firebase-era user has signed in at least once through Logto; then set it to
`false` so sign-in matches on the OIDC subject alone (narrowing the login
path and closing the re-link window).

## 7. Demo mode

`DEMO_MODE=true` (backend) / `NEXT_PUBLIC_DEMO_MODE=true` (frontend) now
requires a Logto tenant whose demo users have `demo` somewhere in a
**verified** email address (`DEMO_MODE_DETAIL` in `backend/app/core/deps.py`).
Create those users in the Logto console (or via whichever connector you use)
with addresses like `demo+faculty@yourdomain.example`, and verify email as in
§4. A signed-in user without `demo` in a verified email gets a `403` at
`/api/auth/login`, which the frontend session route (`GET /api/auth/session`)
surfaces as `{ signedIn: false, error: "forbidden" }` rather than creating an
account.

## 8. Dev mode (no Logto tenant needed)

`AUTH_DEV_MODE=true` (backend) / `NEXT_PUBLIC_AUTH_DEV_MODE=true` (frontend)
bypasses Logto entirely: the backend accepts seven documented `dev-*` tokens
(`backend/app/core/oidc.py::_DEV_TOKEN_MAP`) that resolve to the seeded test
accounts (`faculty@calricula.com`, `chair@calricula.com`, etc., password
`Test123!` when signing in through the UI's dev picker). Dev mode wins over
Logto when both are configured, and the backend refuses to boot with either
flag on when `ENVIRONMENT=production` (fail-closed guard in
`backend/app/core/config.py`).

## 9. JWKS reachability inside Docker Compose

The backend fetches Logto's JWKS to verify tokens. When Logto itself runs as
a container on the same Docker network (a self-hosted dev setup, not
something Calricula's own compose files start — see
`docs/applicationx/ADR-0001-auth-stack-logto.md` §"Self-hosting"), the
backend cannot reach it at `localhost`. Set `OIDC_JWKS_URL` to the service's
internal address, e.g. `http://logto:3001/oidc/jwks`, while leaving
`OIDC_ISSUER` as the tenant's public issuer URL — that is the `iss` claim
Logto stamps on tokens it issues through its published endpoint, and the
backend's issuer check must match that, not the internal JWKS address.

## 10. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `503 authentication not configured` | `OIDC_ISSUER` or `OIDC_AUDIENCE` unset on the backend. |
| `503 authentication temporarily unavailable` | The backend couldn't fetch or parse the JWKS (network, wrong `OIDC_JWKS_URL`, or Logto down). See §9 for the Docker case. |
| `401 invalid or expired token` | Token expired, wrong signing algorithm (not in `OIDC_ALGORITHMS`), or `aud` doesn't match `OIDC_AUDIENCE`. |
| Backend refuses to boot: `OIDC_AUDIENCE equal to OIDC_CLIENT_ID` | These must be two different Logto resources (§3, §6) — an ID token would otherwise pass the access-token audience check. |
| Every auth route 404s on the frontend | One of the five required `LOGTO_*` server variables is unset; `LOGTO_CONFIGURED`/`logtoConfig` in `frontend/src/lib/logto.ts` is `null` until all five are set. |
| Signed in through Logto but treated as signed out | `email_verified` is not `true` on the token (§4), or (demo deployments) the email has no `demo` in it (§7). |
| A returning Firebase-era user gets a new, empty account instead of their old one | `AUTH_LEGACY_RELINK` was set to `false` before that user signed in once post-migration, or their token's email isn't verified. |

## References

- Logto docs, validate access tokens: <https://docs.logto.io/authorization/validate-access-tokens>
- Logto Next.js App Router SDK: <https://docs.logto.io/quick-starts/next-app-router>
- `docs/applicationx/ADR-0001-auth-stack-logto.md` — the decision record shared with ApplicationX.
- `docs/STAGING_VALIDATION.md` — running the real auth check against a staging deploy.
