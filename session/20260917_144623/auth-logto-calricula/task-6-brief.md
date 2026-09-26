### Task 6: Exit verification

- [ ] `git grep -i firebase` in code/configs/tests is empty; only docs history may mention it.
- [ ] Backend suite, frontend jest + build + lint, Playwright dev-mode suites, `alembic check` all green; CI workflow updated only if env names changed.
- [ ] Update `docs/applicationx/plans/2026-09-17-p1a-calricula-host.md` Task 1 settings/test fixture (`firebase_uid` → `auth_subject`) and the stub upstream's bearer expectations.

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| ADR-0001 single tenant, JWKS verification, no vendor SDK | 1, 2 |
| Provider-neutral identity key with data preservation | 2 |
| Dev/demo modes preserved and fail-closed in production | 1, 2, 4 |
| Browser never persists tokens; HttpOnly session | 3 |
| Embedded bearer forwarding with ApplicationX audience (EMBEDDED-INTERFACE §4) | 5 |

## Open owner decisions

1. Logto hosting for Calricula's public demo (Cloud free tier vs self-hosted) and the demo users' email convention.
2. Whether legacy Firebase users are re-linked by verified email on first Logto login (default: yes, one-time, logged without content) or must be re-created.
3. Redirect URIs and cookie domain for coordinated sign-in between the Calricula host and the standalone ApplicationX origin.
