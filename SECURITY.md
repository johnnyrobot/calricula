# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately through
[GitHub's private vulnerability reporting](https://github.com/johnnyrobot/calricula/security/advisories/new)
(the **Security** tab → **Report a vulnerability**). If that is unavailable,
contact a repository maintainer directly through GitHub.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version / commit
- Any suggested remediation

We will acknowledge your report, investigate, and keep you informed of progress.
Please give us a reasonable window to release a fix before any public
disclosure.

## Supported versions

This project is under active development; security fixes target the latest
`main`. There is no long-term-support branch at this time — deploy from a recent
`main` and keep dependencies current.

## Scope

In scope: the application code in this repository (backend API, frontend, and
their dependencies as pinned here).

Out of scope: issues that exist only in a specific operator's deployment
(misconfiguration, infrastructure, or third-party services they run). See
"Responsibilities when you self-host" below.

---

## Responsibilities when you self-host

Calricula is distributed as source for institutions and individuals to deploy
themselves. **The party that deploys and operates an instance is responsible for
the security, privacy, and compliance of that instance and any data it holds**,
including:

- **Student-data privacy / FERPA.** If you operate an instance that stores
  student or other regulated data, meeting FERPA (and any other applicable
  privacy law) is **your** responsibility as the operating institution — not the
  responsibility of this project's authors/distributors. Provide your own
  privacy policy and terms of service for your deployment.
- **Secrets.** Supply your own credentials (Gemini/Google API key, Firebase
  service account, database credentials) via the environment. Never commit them.
  `.env` files are gitignored by design.
- **Trusted hosts.** Set `ALLOWED_HOSTS` to your real hostnames in production.
  The app **refuses to boot** in `ENVIRONMENT=production` if `ALLOWED_HOSTS` is a
  wildcard/empty or if `AUTH_DEV_MODE`/`DEMO_MODE` are enabled (fail-closed
  guards) — set these correctly for your environment.
- **CORS.** Restrict `CORS_ORIGINS` to your actual frontend origin(s).
- **Transport & infrastructure.** Terminate TLS, keep the host patched, run
  database backups, and configure monitoring/alerting for your deployment.
- **Validate before going live.** Run the checks in
  [`docs/STAGING_VALIDATION.md`](./docs/STAGING_VALIDATION.md) (migrations, auth,
  AI/RAG, health) against a staging environment before exposing an instance to
  users.

See [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) for the full
pre-deployment checklist.
