# Public Release Checklist

Status of the items that gate a **public release** of Calricula. The 2026-06
brownfield remediation (epic #1) closed the known critical/major code debt;
this checklist tracks what remains before exposing the app to outside users.

Legend: `[x]` done · `[~]` in progress / partial · `[ ]` not started · 🔴 blocker

---

## 1. Security & configuration hardening

- [x] Backend dependency CVEs patched (WS-1) + `TrustedHostMiddleware` wired.
- [x] Fail-closed prod guard: app refuses to boot if `ENVIRONMENT=production` and `AUTH_DEV_MODE`/`DEMO_MODE` are on (WS-4).
- [~] **`ALLOWED_HOSTS` must not be `["*"]` in production.** Guard being extended to fail closed on a wildcard host in prod. *Deploy must set real hostnames* — e.g. `ALLOWED_HOSTS='["calricula.com","api.calricula.com"]'`.
- [x] Real secrets (`backend/.env`, `frontend/.env.local`) are gitignored; only `*.example` committed (verified).
- [ ] 🔴 **Rotate / confirm all production secrets** (Gemini API key, Firebase service account, DB creds) are set via the deploy environment, not baked into images, and have never been committed in history (run a history secret scan, e.g. `gitleaks`/`trufflehog`).
- [ ] CORS `CORS_ORIGINS` restricted to the real frontend origin(s) in prod (currently a dev-oriented default).
- [ ] Rate limiting (`core/rate_limiter.py`) reviewed/tuned for public traffic.
- [ ] Security pass: dependency audit clean (or accepted), basic pentest / OWASP review of auth + file-upload + AI endpoints.

## 2. Privacy & legal  🔴

- [ ] 🔴 **FERPA posture.** This is student-facing California community-college software with user accounts. Confirm what PII is stored (auth identities, any student data), data-retention policy, access controls, and FERPA obligations. Needs a human/legal owner — **not** something code review can clear.
- [ ] Published **Privacy Policy** and **Terms of Service**.
- [ ] Confirm the `LICENSE` is the intended one for a public release (and that bundled deps' licenses are compatible).
- [ ] Accessibility (WCAG 2.x) audit — relevant for a public-sector education tool.

## 3. Verification & quality gates

- [x] CI gate live and green: backend pytest (Postgres service) + frontend build/jest, on every push/PR.
- [x] CodeRabbit reviews active (seat assigned mid-remediation).
- [~] **Coverage gates** being added (backend `--cov-fail-under`, frontend `coverageThreshold`) as ratchet floors. Raise the floors over time.
- [~] Frontend React-Compiler hook warnings (`set-state-in-effect` ×27 etc.) being resolved; any left as warnings are documented in `eslint.config.mjs`.
- [ ] 🔴 **End-to-end staging validation** against a production-like environment:
  - [ ] Real Firebase auth flow (sign-up, sign-in, JIT provisioning, sign-out).
  - [ ] Alembic migrations applied to a fresh prod-shaped DB (not the test `create_all` path) + a rollback rehearsal.
  - [ ] AI features exercised with a live key.
  - [ ] **File Search Stores RAG smoke test** — `cd backend && GOOGLE_API_KEY=… python -m scripts.smoke_test_file_search` (store create → upload → grounded query → citations). *Currently the only unverified production code path.*
- [ ] Playwright E2E (currently opt-in) run green against staging; consider gating in CI.
- [ ] Load / performance check at expected concurrency.

## 4. Operations & deployment

- [ ] Documented **deploy + rollback runbook** (a Hetzner deploy exists; validate the full procedure).
- [ ] Observability: error tracking + logging + uptime/health alerting in prod (a `/health` endpoint exists; wire monitoring to it).
- [ ] Database backups + restore tested.
- [ ] Incident/on-call contact and a status/feedback channel for public users.

---

## Quick "go / no-go" summary

**Go-ready:** dependencies current & supported, known CVEs patched, auth-bypass-in-prod fails closed, secrets not committed, CI green, compliance math corrected.

**Hard blockers before public launch:** FERPA/privacy + legal sign-off (§2), a real staging validation incl. the RAG smoke test and migration/rollback rehearsal (§3), production secret/host/CORS hardening confirmed on the live deploy (§1), and a deploy/rollback + monitoring runbook (§4).

Treat current `main` as a **release candidate**, not a release.
