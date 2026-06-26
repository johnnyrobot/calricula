# Public Release Checklist

Status of the items that gate a **public release** of Calricula. The 2026-06
brownfield remediation (epic #1) closed the known critical/major code debt;
this checklist tracks what remains before exposing the app to outside users.

Legend: `[x]` done · `[~]` in progress / partial · `[ ]` not started · 🔴 blocker

---

## 1. Security & configuration hardening

- [x] Backend dependency CVEs patched (WS-1) + `TrustedHostMiddleware` wired.
- [x] Fail-closed prod guard: app refuses to boot if `ENVIRONMENT=production` and `AUTH_DEV_MODE`/`DEMO_MODE` are on (WS-4).
- [x] **`ALLOWED_HOSTS` must not be `["*"]` in production.** Prod guard fails closed on a wildcard host (merged). *Deploy must set real hostnames* — e.g. `ALLOWED_HOSTS='["calricula.com","api.calricula.com"]'`.
- [x] Real secrets (`backend/.env`, `frontend/.env.local`) are gitignored; only `*.example` committed (verified).
- [x] **No secrets in git history** (distributor-side): history secret scan run, no committed credentials. *(Adopter-side: each deploying institution must still set its own Gemini key, Firebase service account, and DB creds via the deploy environment — never baked into images — and rotate them per its own policy.)*
- [ ] CORS `CORS_ORIGINS` restricted to the real frontend origin(s) in prod (currently a dev-oriented default).
- [ ] Rate limiting (`core/rate_limiter.py`) reviewed/tuned for public traffic.
- [ ] Security pass: dependency audit clean (or accepted), basic pentest / OWASP review of auth + file-upload + AI endpoints.

## 2. Privacy & legal

**Distribution model: source-only / self-hosted.** Calricula is distributed as
source for institutions to deploy and operate themselves. The distributor is
**not** hosting a service and is **not** a data controller/processor for any
institution's data. Therefore FERPA compliance, a Privacy Policy, and Terms of
Service are the **deploying institution's** responsibility — they own the
running instance, the database, and the student records in it. These are **not
distributor-side launch blockers**.

### Guidance for adopters (the deploying institution's responsibility)

To help adopters meet their own obligations, document what the app stores so
they can complete their FERPA / privacy review:

- [ ] **Data inventory for adopters.** Document the PII the app stores so an
  institution can map it to its FERPA/privacy program: auth identities
  (Firebase UID, email, display name, role in the `users` table; JIT-provisioned
  on first sign-in), curriculum content (courses, programs, SLOs, uploaded
  reference documents), AI chat history, and any documents sent to the Gemini /
  File Search Stores RAG service (note the third-party data flow to Google).
- [ ] **FERPA note for adopters.** State plainly that the adopter is the data
  controller and must satisfy FERPA (access controls, retention, disclosure)
  for their instance; the project ships role-based access controls but the
  institution configures and governs them.
- [ ] **Privacy Policy / ToS are adopter-provided.** The adopter publishes its
  own Privacy Policy and Terms of Service for its users; the project does not
  ship binding legal documents on the institution's behalf.

### Distributor-side items (retained)

- [x] **No secrets committed** to history (also tracked in §1).
- [ ] **"Deploy responsibly" note** in the README/docs: adopters are
  responsible for FERPA, privacy, ToS, secret management, and securing their
  deployment (env hardening per §1, real `ALLOWED_HOSTS`/`CORS_ORIGINS`).
- [ ] Confirm the `LICENSE` is the intended one for a source release (and that
  bundled deps' licenses are compatible with redistribution).
- [ ] Accessibility (WCAG 2.x) audit — relevant for a public-sector education
  tool; ship findings as guidance, adopters own remediation for their instance.

## 3. Verification & quality gates

- [x] CI gate live and green: backend pytest (Postgres service) + frontend build/jest, on every push/PR.
- [x] CodeRabbit reviews active (seat assigned mid-remediation).
- [x] **Coverage gates** live as ratchet floors (backend `--cov-fail-under`, frontend `coverageThreshold`). Raise the floors over time.
- [x] Frontend React-Compiler hook warnings (`set-state-in-effect` ×27 etc.) resolved; any left as warnings are documented in `eslint.config.mjs`.
- [~] 🔴 **End-to-end staging validation** against a production-like environment. A documented runbook + runnable scripts now exist — [`docs/STAGING_VALIDATION.md`](docs/STAGING_VALIDATION.md) and [`scripts/staging/`](scripts/staging/) — run them against a real staging deploy before launch:
  - [ ] Real Firebase auth flow (sign-in, JIT provisioning) — `python scripts/staging/validate_auth.py`.
  - [ ] Alembic migrations applied to a fresh prod-shaped DB (not the test `create_all` path) + a rollback rehearsal — `scripts/staging/validate_migrations.sh`.
  - [ ] AI features exercised with a live key — `python scripts/staging/validate_ai.py`.
  - [ ] **File Search Stores RAG smoke test** — `cd backend && GOOGLE_API_KEY=… python -m scripts.smoke_test_file_search` (store create → upload → grounded query → citations), also wrapped by `validate_ai.py`. *Currently the only unverified production code path.*
  - [ ] One-shot: `scripts/staging/validate_staging.sh` runs all of the above with a go/no-go summary.
- [ ] Playwright E2E (currently opt-in) run green against staging; consider gating in CI.
- [ ] Load / performance check at expected concurrency.

## 4. Operations & deployment

- [ ] Documented **deploy + rollback runbook** (a Hetzner deploy exists; validate the full procedure).
- [ ] Observability: error tracking + logging + uptime/health alerting in prod (a `/health` endpoint exists; wire monitoring to it).
- [ ] Database backups + restore tested.
- [ ] Incident/on-call contact and a status/feedback channel for public users.

---

## Quick "go / no-go" summary

**Go-ready (distributor-side):** dependencies current & supported, known CVEs patched, auth-bypass-in-prod fails closed, `ALLOWED_HOSTS` prod guard merged, secrets not committed (history scanned), coverage gates live, CI green, compliance math corrected, staging-validation runbook + scripts shipped.

**Remaining distributor-side items before tagging a source release:** a "deploy responsibly" note + adopter data-inventory/FERPA guidance (§2), `LICENSE` confirmation, and actually **running** the staging validation (§3) against a real staging deploy at least once (the scripts exist; the run is still pending).

**NOT distributor blockers (adopter responsibility):** FERPA compliance, a Privacy Policy, and Terms of Service belong to each **deploying institution** — the distributor is source-only / not hosting. Production secret rotation, real `ALLOWED_HOSTS`/`CORS_ORIGINS`, monitoring, backups, and on-call (§1/§4) are configured per-deployment by the adopter.

Treat current `main` as a **source release candidate**: distributor-side hardening is largely done; the gating action is running the staging validation once and shipping adopter deployment guidance.
