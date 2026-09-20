# ADR-0001: Identity provider for Calricula and ApplicationX — Logto (OIDC), replacing Firebase Authentication

- Status: Accepted 2026-09-18 (owner decision)
- Scope: Calricula backend and frontend; ApplicationX backend, standalone app and workspace package; the embedded host contract (EMBEDDED-INTERFACE §4)
- Supersedes: the "shared Firebase project" assumption in TECHNICAL-SPEC §3/§10, EMBEDDED-INTERFACE §4, the P1a plans' owner decisions and P1A-EXIT

## Context

Both applications must agree on one identity provider because the embedded workspace forwards the signed-in Calricula user's ApplicationX-scoped access token to ApplicationX unchanged — sent by the browser in `X-ApplicationX-Token` alongside the Calricula token in `Authorization` (EMBEDDED-INTERFACE §4 as amended 2026-09-19; host plan Task 3). ApplicationX then verifies the token independently and checks its own memberships. Until now the provider was Firebase Authentication: Calricula verifies ID tokens with the Firebase Admin SDK and keys users by `firebase_uid`; ApplicationX P1a Task 2 did the same behind a provider-neutral `Principal` (issuer + subject).

The owner no longer wants Firebase as the authentication system. Requirements that any replacement must meet:

1. Standard OpenID Connect so the backend verifies tokens without a vendor SDK (issuer, audience, signature via JWKS).
2. Self-hostable on the deployer's infrastructure (Calricula is a public, source-only project; identity data and operations belong to the deployer), with a hosted option for small deployments.
3. Organization membership and machine-to-machine credentials, matching ApplicationX's organization/workspace model and the broker's optional service credential.
4. Enterprise SSO (SAML/OIDC) and MFA for college deployments.
5. First-party SDKs for Next.js (both frontends) and a documented Python verification path (both FastAPI backends).
6. A migration path that keeps both apps on one identity so the embedded path keeps forwarding one token.

## Decision

Adopt **Logto** as the single OIDC provider for both applications, in one Logto tenant:

- **One tenant, two applications, one API resource.** Calricula (web app) and the ApplicationX standalone app (web app) are two Logto applications. The ApplicationX API is registered as an API resource (indicator, for example `https://api.applicationx.local` in dev and the real API origin in production). Calricula requests access tokens for that resource so the token it forwards through its broker carries `aud` = the ApplicationX resource indicator. The Calricula API is registered as its own resource for Calricula's own routes.
- **Token verification is standard JWT/JWKS**, no vendor SDK on either backend: issuer `https://<logto-endpoint>/oidc`, JWKS at `https://<logto-endpoint>/oidc/jwks`, `aud` = the API resource indicator, `sub` = the Logto user id, scopes in the `scope` claim. PyJWT with the `crypto` extra is the verification library (Logto's documented path).
- **Identity keys.** ApplicationX keeps `AppUser(issuer, subject)`; the issuer becomes the Logto issuer URL and the subject the Logto `sub`. Calricula replaces `User.firebase_uid` with a provider-neutral `auth_subject` (plus `auth_issuer`), migrated from the existing column.
- **Memberships stay application-owned.** Logto organizations are not required for P1; ApplicationX's `Organization`/`Membership` tables remain the authorization source. Mapping Logto organizations onto them is a later option, not a dependency.
- **Dev mode is unchanged.** `AUTH_DEV_MODE` still accepts only the documented `dev-*` tokens in non-production; no Logto instance is needed to run the test suites or the replay demo.
- **Frontends use `@logto/next`** (App Router): the SDK keeps the session in an encrypted, HttpOnly cookie; the browser obtains a short-lived access token for the API resource from a same-origin route handler and holds it in memory only, never in localStorage or in URLs. This replaces the earlier "token in React state only" wording with an equivalent guarantee for the browser-visible token.
- **Self-hosting.** Deployers run Logto (MPL-2.0) from its Docker image against PostgreSQL, or use Logto Cloud. The dev compose file offers an optional `logto` service on ports 3301/3302 (Logto's defaults collide with the ApplicationX web port 3002).

## Consequences

Positive:

- No vendor SDK in either backend; the verifier is ~60 lines and testable with a locally generated key.
- One sign-in across the embedded workspace and the standalone origin can be real single sign-on (same tenant, same session cookie domain permitting) rather than "may prompt again".
- Enterprise SSO, MFA and machine-to-machine credentials are available without new vendors.
- Identity data stays on deployer infrastructure when self-hosted, consistent with the FERPA/ops stance.

Negative / costs:

- Calricula has a real migration: `firebase_uid` column and every reference, the login page and `AuthContext`, dev-mode and demo-mode interplay, and deployer documentation. This is a separate plan (`plans/2026-09-18-auth-logto-calricula-migration.md`).
- Access tokens for an API resource do not carry profile claims by default; email/display name come from the ID token at sign-in or from `/oidc/me`. ApplicationX provisions users without email until a profile sync is added; Calricula captures email at login through its `/auth/login` route as today.
- Deployers must operate Logto (or pay for Cloud); the previous stack was a Google-hosted free tier. Logto Cloud's free tier (10,000 MAU for new accounts) covers pilots.
- Logto signs tokens with ES384 by default; verifiers must accept the algorithms the tenant uses (configurable, default `ES384,RS256`).

## Alternatives considered

- **Keep Firebase for Calricula and exchange identities at the broker** (Logto impersonation via a machine-to-machine credential): users would still have to exist in Logto, so it adds a second identity store and a token-exchange path without removing Firebase. Rejected.
- **Keycloak / Authentik / Ory**: capable, heavier to operate, and the owner asked specifically for Logto's footprint. Not pursued.
- **Auth0 / Clerk (SaaS only)**: no self-hosting; conflicts with requirement 2.

## Rollout order

1. ApplicationX swap (`plans/2026-09-18-auth-oidc-logto-applicationx.md`): isolated, small, ships first.
2. Calricula migration (`plans/2026-09-18-auth-logto-calricula-migration.md`).
3. Host integration (`plans/2026-09-17-p1a-calricula-host.md`) runs against the migrated Calricula and forwards Logto access tokens scoped to the ApplicationX resource.

## References

- Logto docs, validate access tokens: https://docs.logto.io/authorization/validate-access-tokens
- Logto Next.js App Router SDK: https://docs.logto.io/quick-starts/next-app-router
- Logto repository (MPL-2.0, Docker/Postgres): https://github.com/logto-io/logto
- Logto pricing: https://docs.logto.io/logto-cloud/billing-and-pricing
