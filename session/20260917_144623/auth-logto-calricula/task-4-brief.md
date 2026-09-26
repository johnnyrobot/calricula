### Task 4: Environment, docs and demo

**Files:** `.env.example` (lines 55-70 Firebase block → `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`; frontend `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_COOKIE_SECRET`, `LOGTO_BASE_URL`, `LOGTO_API_RESOURCE`, `LOGTO_APPLICATIONX_RESOURCE`), `CLAUDE.md` (line 3 stack sentence and line 53 secrets note), `docker-compose*.yml` env pass-through, `docs/` deployment/demo guides that mention Firebase (`grep -rn -i firebase docs README.md`), `serviceAccountKey.json` placeholder removed from the repo root and `.gitignore` comment updated.
- [ ] Demo deployment note: `DEMO_MODE` now requires a Logto tenant whose demo users have `demo` in their email; document the tenant setup (web app, two API resources, redirect URIs for `:3001` and the demo host).
- [ ] Commit `docs: Logto replaces Firebase in setup, env and demo guides`.

