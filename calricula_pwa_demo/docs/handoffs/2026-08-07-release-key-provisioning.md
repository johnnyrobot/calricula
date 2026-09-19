# Handoff — release key provisioning — 2026-08-07

**Branch:** `codex/calricula-pwa-demo-release` (60 commits ahead of `main`;
`calricula_pwa_demo/` does not exist on `main` at all)
**Tree at write time:** clean, last commit `54274b6`
**Working root:** `calricula_pwa_demo/` — every path below is relative to it

Purpose: carry the credentialed release forward. It exists because the keys
**cannot all be pasted in one sitting** — three of them do not exist until
earlier steps produce them. The staging below is that dependency order, not a
preference.

`AGENTS.md` and `HANDOFF.md` still outrank this document. Read `README.md`
§ "Guarded release" before running anything under `release:*` or `deploy:*`.

**No secrets or credentials appear in this document.** Every value is a
placeholder. Keep it that way — this repository is public source.

## Standing decision recorded this session

**The Codex Security diff scans are dropped.** The maintainer is no longer using
Codex. This supersedes the two scan rows in `HANDOFF.md`
("Diff scan of work after `f0c5854`" and "New complete standard scan") and the
sentence in `docs/handoffs/2026-08-07-architecture-candidates.md` § "Open
follow-ups" item 1.

**Those documents have not yet been edited.** Until they are, a fresh session
reading `HANDOFF.md` will treat the scans as blocking and stop. Restating those
rows is the first task of the next session — before any key work, because it is
the thing that will otherwise halt it.

## Where each key goes

Four destinations. They are not interchangeable.

### 1. `.env.local` — the only key that belongs in the repo tree

Gitignored, at the demo root. Build-time; compiled into the static export.

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
```

Public by design — it ships in the bundle. `release:gate` proves this exact
key, not the placeholder, was compiled into the sealed export
(`scripts/release-state.mjs:368`, `assertSiteKeyEmbedded`). It is the only
`NEXT_PUBLIC_` value in the project. Never prefix anything else with it.

### 2. An external secrets file — outside the repository, mode `0600`

Absolute path, outside this repo, readable only by your user. Not in
`.env.local`, not in the tree, not in Git.

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
TURNSTILE_SECRET_KEY=0x...
AI_SESSION_HMAC_SECRET=...
```

`AI_SESSION_HMAC_SECRET` must be at least 43 base64url characters or 64 hex
characters. Generate it with:

```bash
openssl rand -base64 32 | tr -d '=' | tr '+/' '-_'
```

Placeholder, test, repeated-character, symlinked, in-repository,
group/world-readable, oversized, and extra-key files are all rejected by
`release-state.mjs`.

**Do not run `wrangler secret put`.** Each invocation changes the deployed
Worker version and correctly trips the ownership lock. `deploy:stage`
revalidates this file, copies its exact bytes to a sealed `0600` temporary
copy, and passes that to Wrangler's `--secrets-file`, so secret provisioning
and the code deployment stay one version change.

### 3. Shell environment, per command — never written to a file

| Variable | Needed by |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | every Cloudflare command; the only account selector — never add `account_id` to `wrangler.jsonc` |
| `CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`) | Wrangler authentication; the only three keys `wranglerChildEnvironment()` passes through |
| `CALRICULA_SECRETS_FILE` | absolute path to the file in §2, on `deploy:stage` |
| `CALRICULA_RELEASE_BASE_URL` | exact deployed origin, on verify and stage |
| `OPENROUTER_API_KEY` | inline for `ai:discover` / `ai:evaluate`, before the secrets file is involved |
| `OPENROUTER_EVAL_APPROVED_MODELS` | `ai:discover:record` |
| `CALRICULA_AI_SESSION_COOKIE` **or** `CALRICULA_TURNSTILE_TOKEN` | the final canary — exactly one, never both (`scripts/ai-canary-credential.mjs:51`) |

Deprecated `CF_*` aliases are deliberately rejected by the guarded path.

### 4. `wrangler.jsonc` — committed configuration, not keys

Three values ship fail-closed so an accidental first deploy cannot serve AI.
All three change only after the steps that produce them:

| Key | Now | Becomes |
| --- | --- | --- |
| `AI_ENABLED` | `"false"` | `"true"` |
| `APP_ORIGIN` | `"https://replace-before-deploy.invalid"` | exact HTTPS origin from bootstrap |
| `OPENROUTER_FREE_MODELS` | `""` | two evaluation-approved `:free` model IDs, preferred order |

## Staged checklist

Fill the blanks as each stage produces them.

### Stage A — prepare now (depends on nothing)

- [ ] `CLOUDFLARE_ACCOUNT_ID` = `____________`
- [ ] `CLOUDFLARE_API_TOKEN` = *(held outside this file)*
- [ ] `OPENROUTER_API_KEY` = *(held outside this file)*
- [ ] `AI_SESSION_HMAC_SECRET` generated and stored in the §2 file

### Stage B — bootstrap the hostname with AI disabled

Keep the fail-closed `wrangler.jsonc` values unchanged. No Turnstile key and no
Worker secret are needed or wanted here.

```bash
CLOUDFLARE_ACCOUNT_ID=... npm run release:gate -- --bootstrap
CLOUDFLARE_ACCOUNT_ID=... npm run deploy:bootstrap
```

Refuses to run unless a read-only check returns Cloudflare error `10007`
(Worker not found) for `calricula-demo`. An existing Worker is never
overwritten.

- [ ] Exact origin produced = `https://____________.workers.dev`
- [ ] Ownership record written — **do not delete `.release-artifacts/`**

### Stage C — Turnstile widget for that exact hostname

- [ ] Widget created for the Stage B hostname
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` → `.env.local`
- [ ] `TURNSTILE_SECRET_KEY` → the §2 secrets file

### Stage D — model discovery and evaluation

```bash
OPENROUTER_API_KEY=... npm run ai:discover
OPENROUTER_API_KEY=... \
  npm run ai:evaluate -- --models provider/primary:free,provider/fallback:free
```

Human review, then the recorded pair:

```bash
OPENROUTER_API_KEY=... \
OPENROUTER_EVAL_APPROVED_MODELS=provider/primary:free,provider/fallback:free \
  npm run ai:discover:record

OPENROUTER_API_KEY=... \
  npm run ai:evaluate:record -- \
  --models provider/primary:free,provider/fallback:free
```

- [ ] Primary model = `____________`
- [ ] Fallback model = `____________`

**Scheduling constraint.** The recorded evidence is valid for **24 hours** and
is bound to the source fingerprint, the executed tool versions, model order, and
a one-way fingerprint of the OpenRouter credential. Stages E through H must
finish inside that window, or Stage D is rerun. Do not start Stage D until there
is time to carry through to Stage H.

### Stage E — configure and commit

- [ ] `wrangler.jsonc`: `AI_ENABLED`, `APP_ORIGIN`, `OPENROUTER_FREE_MODELS`
- [ ] Committed — the gate requires a clean tree

### Stage F — secrets file complete

- [ ] All three keys present, mode `0600`, outside the repo
- [ ] OpenRouter key is the **same** credential used in Stage D — the
      fingerprint must match or the release is refused

### Stage G — full local gate (non-publishing)

```bash
npm run release:gate
```

Fourteen steps (`RELEASE_GATE_STEPS`, `scripts/release-gate.mjs:24`). Writes the
mode-0600 `.release-evidence/local-gate.json` seal, which does not exist yet.

- [ ] Exit 0, seal written

### Stage H — stage and publish

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
CALRICULA_SECRETS_FILE=/absolute/path/outside/repo/release-secrets.env \
  npm run deploy:stage
```

- [ ] Staged marker written

### Stage I — human Turnstile session, then final verification

Requires a real person completing a Turnstile challenge in a private browser
window; it cannot be automated. Capture the session cookie without it entering
shell history:

```bash
read -r -s CALRICULA_AI_SESSION_COOKIE
export CALRICULA_AI_SESSION_COOKIE

CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
  npm run release:verify:deployed

unset CALRICULA_AI_SESSION_COOKIE
```

Close the private window afterward so its bearer cookie is discarded.

- [ ] `.release-artifacts/release-complete.json` written, staged marker removed

## Known risk carried into the next session

**Gate step 10, `release:fresh-checkout`, has never run against the current
source shape.** `HANDOFF.md` records the fresh-checkout package reproduction as
passing at `274d428` and not rerun since — and `274d428` predates `shared/`
existing. `f1e0535` then created `shared/` without enumerating it, which broke
that step for four commits; `d650b92` fixed the enumeration and added a
directory-coverage guard.

So the repair is proven by its unit test only, not by an actual fresh-checkout
rebuild. Stage G will be its first real exercise. It is the least-evidenced step
in the chain and the only blocking item that needs no credentials — worth
running on its own before committing to a full gate attempt.

## State at the end of this session

Unchanged as a release: no Worker bootstrapped, no `.release-evidence/`, no
Turnstile or OpenRouter configuration, no live model qualification, no
production checks, no canaries. **Do not report this demo as deployment-ready.**

Only artifacts on disk are `.release-artifacts/lighthouse` and
`.release-artifacts/sealed`, both from 2026-07-30/31, predating all August work.

This session changed documentation only — `54274b6` corrected five claims in
`docs/handoffs/2026-08-07-architecture-candidates.md` and amended ADR-0003 where
it named a 60-unit program limit this codebase does not contain. No code moved.
