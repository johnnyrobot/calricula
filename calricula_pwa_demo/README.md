# Calricula PWA Demo

Calricula PWA Demo is a static, local-first demonstration of curriculum
authoring and compliance workflows for California community colleges. It
requires no login. Curriculum records created in the demo remain in the
browser's IndexedDB on the user's device.

The optional AI assistant is the only feature that sends selected content off
the device. AI requests go to the same-origin Cloudflare Worker, which forwards
them to OpenRouter under a server-side exact-free-model policy.

## Requirements

- Node.js 22.13.0 or newer
- npm 10.9.8, as pinned by `packageManager`
- Docker is not required
- A Wrangler-authenticated Cloudflare account for deployment
- An OpenRouter API key and Cloudflare Turnstile widget for AI-enabled release

Install with the committed lockfile:

```bash
npm ci
```

The checked-in `openrouter-llms-full.txt` is implementation documentation. It
is excluded from the Next export, service-worker precache, and Cloudflare
assets.

## Local development

```bash
npm run icons
npm run dev
```

The app is available at `http://localhost:3000`. Service-worker registration is
disabled in development to avoid stale local bundles.

For local Worker development, create a gitignored `.dev.vars` file:

```dotenv
OPENROUTER_API_KEY=replace-with-a-restricted-key
TURNSTILE_SECRET_KEY=replace-with-a-turnstile-secret
AI_SESSION_HMAC_SECRET=replace-with-a-generated-high-entropy-value
APP_ORIGIN=http://localhost:8787
AI_ENABLED=true
OPENROUTER_FREE_MODELS=provider/primary:free,provider/fallback:free
```

Never use a `NEXT_PUBLIC_` prefix for a secret.

## Cloudflare Free-plan fit

The deployment target is one Worker with static assets, not Pages. Cloudflare's
current Workers Free limits allow 20,000 static assets per version, 25 MiB per
asset, and a 3 MB compressed Worker; the build and dry-run validators enforce
those ceilings. Matching static-asset requests are currently free and
unlimited, while `/api/*` requests invoke the Worker and count toward its
100,000-request daily Free allowance and 10 ms CPU limit. OpenRouter usage has
its own independent limits.

The pinned Wrangler version is newer than the minimum versions required for
both the current static-asset limits and Rate Limiting bindings. Recheck the
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[static-asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
and [Rate Limiting accuracy boundary](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
before a later release because hosted-service limits can change.

## Build and test

The normal non-publishing checks are:

```bash
npm run audit:production
npm run lint
npm run typecheck
npm run test:coverage
npm run test:worker
npm run build
npm run deploy:dry-run
npm run test:e2e:full
npm run verify:production:local
npm run lighthouse:local
```

`npm run build` creates a Next static export, generates `out/sw.js` with
Workbox, and validates the deployable output. The validator enforces
Cloudflare's file, file-size, and `_headers` limits; required routes, icons,
manifest, offline page, and network-only connectivity probe; safe MIME and
service-worker behavior; and absence of source maps, excluded documentation,
and recognizable secret material.

`public/connectivity.txt` is a deliberate network-only probe. Cloudflare serves
it with `no-store`; Workbox must never precache it. Both build and production
verification enforce that boundary.

`npm run deploy:dry-run` bundles the Worker without publishing it. It rejects a
bundle over the Workers Free compressed size limit or one containing
recognizable secret material.

### Browser coverage

`npm run test:e2e:full` always tests the current local build and discards
`PLAYWRIGHT_BASE_URL` and server-reuse overrides:

- Chromium, Firefox, and mobile Chromium run through local Wrangler.
- WebKit and mobile WebKit run through a deterministic static `out/` server.

The WebKit split works around a Wrangler 4.115 local response-stream hang. It
does not skip or reduce tests. The release command reruns all five projects
against the real deployed Worker with `npm run test:e2e:remote`.

### Production contract verifier

`npm run verify:production:local` starts the built Worker locally.
`CALRICULA_RELEASE_BASE_URL=https://... npm run verify:production` checks a
deployed origin.

The verifier covers every finite shell, including course create/view/edit/
compare routes with representative query IDs and program create/view/edit
routes. It also checks:

- security headers and exact MIME essences on every HTML shell;
- all route-linked static chunks and manifest icons, including size and secret
  scans;
- manifest shape, service-worker scope and `no-store`, and connectivity
  probe behavior;
- JSON health and API 404 envelopes with `no-store`;
- a real static 404 response.

### Lighthouse

`npm run lighthouse:local` and
`CALRICULA_RELEASE_BASE_URL=https://... npm run lighthouse:production` run
bounded mobile audits for `/`, `/dashboard/`, and `/courses/`. The committed
thresholds require:

- performance at least 0.90;
- accessibility exactly 1.00;
- best practices and SEO at least 0.90;
- LCP at most 2,500 ms;
- CLS at most 0.10;
- TBT at most 300 ms.

Per-route raw reports and a timestamped, origin-bound summary are written under
the gitignored `.release-artifacts/lighthouse/` directory. Reassert an existing
report with:

```bash
CALRICULA_RELEASE_BASE_URL=https://exact-origin.example \
  npm run lighthouse:assert
```

Stale summaries, wrong origins, wrong routes, redirects, missing metrics, and
threshold regressions fail.

## AI model qualification

Live discovery and evaluation require explicit credentials and are never
performed by ordinary local tests.

First inspect the current safe roster without recording release evidence:

```bash
OPENROUTER_API_KEY=... npm run ai:discover
```

Discovery makes bounded authenticated model and key-status requests. It
intersects the key's eligible catalog with the live ZDR-filtered catalog and
keeps concrete `:free` text models with a numeric context window of at least
32,768 tokens, explicit zero values for every prompt, completion, and request
price field, and structured-output support. It never prints key labels,
credentials, generated content, or private account identity.

Evaluate at most four explicit candidates:

```bash
OPENROUTER_API_KEY=... \
  npm run ai:evaluate -- --models provider/primary:free,provider/fallback:free
```

Each model receives exactly two fixed synthetic fixtures, one plain and one
strict JSON-schema SLO request. Requests use ZDR, deny data collection, cap
price at zero, disable provider fallbacks, and never retry. Output is limited to
model IDs, pass status, and latency.

After human review, put exactly two distinct passing model IDs in
`wrangler.jsonc` in preferred order and run the credentialed recorded checks:

```bash
OPENROUTER_API_KEY=... \
OPENROUTER_EVAL_APPROVED_MODELS=provider/primary:free,provider/fallback:free \
  npm run ai:discover:record

OPENROUTER_API_KEY=... \
  npm run ai:evaluate:record -- \
  --models provider/primary:free,provider/fallback:free
```

The gitignored evidence records are valid for 24 hours and are bound to the
source fingerprint, executed Node/npm/Wrangler/Playwright/Lighthouse versions,
model order, authenticated key-status result, and a one-way fingerprint of the
OpenRouter credential. The fallback router `openrouter/free` is implicit after
the two named models.

## Guarded Cloudflare release

Raw `wrangler deploy` is not the normal release workflow. The guarded sequence
uses an AI-disabled first deployment to establish the exact Workers hostname,
then a separately sealed AI-enabled release.

Both release gates require the Calricula demo source to be committed and clean.
The gate records the exact Git commit and subtree, source fingerprint,
validated `out/` plus Worker dry-run fingerprint, executed tool versions, and
the steps that passed. Any later source, output, config, site-key, or tool
change invalidates the seal.

Use `CLOUDFLARE_ACCOUNT_ID` as the only account selector; do not add
`account_id` to `wrangler.jsonc`. Guarded releases reject Wrangler staging/API
host overrides, environment selectors, CI name overrides, compliance-region
overrides, and deprecated `CF_*` authentication aliases. Wrangler mutations
also pin the absolute config path and the exact `calricula-demo` Worker name.

### 1. Establish the hostname with AI disabled

Keep the checked-in fail-closed values in `wrangler.jsonc`:
`AI_ENABLED=false`, the invalid placeholder `APP_ORIGIN`, and an empty model
list. No Turnstile site key or Worker secret is needed.

```bash
CLOUDFLARE_ACCOUNT_ID=... npm run release:gate -- --bootstrap
CLOUDFLARE_ACCOUNT_ID=... npm run deploy:bootstrap
```

The bootstrap refuses to run unless a read-only Cloudflare check returns exact
Worker-not-found error `10007` for `calricula-demo`. Any existing Worker is
treated as unexpected and is never overwritten.

After publishing, the command reconciles Wrangler's machine-readable version
ID against Cloudflare deployment status and the exact release message, then
runs the production verifier, mobile Lighthouse thresholds, and all five
browser projects against the real `workers.dev` origin.

The first successful bootstrap creates a private, immutable local ownership
record containing only the Cloudflare account ID, exact Worker name and origin,
and bootstrap deployment/version IDs. Do not delete it. Current and prior
rollback IDs are also kept in a private append-only deployment history.

Before Wrangler is allowed to mutate the Worker, the command creates a private
pending-attempt record. It remains if Wrangler reports an uncertain failure,
its output cannot be parsed, or Cloudflare status is temporarily unavailable.
One private process-lifecycle lease covers Wrangler publication,
reconciliation, and result-marker updates. A second release or cancellation
cannot run while that publisher is alive. Wrangler starts behind a closed
launcher gate: the launcher PID is first persisted in the lease, then the gate
opens and `exec` preserves that PID as Wrangler. After an abrupt process death,
the recorded dead owner can be recovered without deleting evidence by hand.
Each pending attempt also gets a UUID incorporated into its exact Wrangler
release message, so an older identical build cannot be mistaken for this
attempt.
Reconcile it and rerun bootstrap checks with:

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
  npm run release:verify:deployed -- --bootstrap
```

If Wrangler failed without returning a version ID and the Worker truly was not
published, do not delete the pending record by hand. After allowing time for
Cloudflare propagation, explicitly prove that the deployment stayed unchanged
across three guarded reads and archive the attempt:

```bash
CLOUDFLARE_ACCOUNT_ID=... npm run release:cancel:pending-no-change
```

The cancellation waits through the pending record's 45-second reconciliation
window before its first read. Each guarded check requires both the exact
pre-attempt active deployment/version and the absence of the pending release's
exact message from Cloudflare's version list. Any changed, created-but-inactive,
or ambiguous remote version stops cancellation. A final boundary between the
remote read and local archive is unavoidable because Cloudflare does not
provide a conditional cancellation transaction. After a confirmed no-change
archive, rerun the appropriate deploy command.

### 2. Configure the AI-enabled source

Create a Turnstile widget for the exact bootstrap hostname. Put its public,
non-placeholder site key in gitignored `.env.local`:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
```

Then update `wrangler.jsonc` with that exact HTTPS `APP_ORIGIN`, the two
evaluation-approved concrete `:free` models, and `AI_ENABLED=true`. Commit those
non-secret configuration changes before recording final AI evidence and
running the full gate.

### 3. Create an external release-secrets file

Do not run separate `wrangler secret put` commands between bootstrap and the
guarded release: each command changes the deployed Worker version and correctly
trips the ownership lock.

Instead, create a file outside this public repository, make it readable only by
your user (`0600`), and set:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
TURNSTILE_SECRET_KEY=0x...
AI_SESSION_HMAC_SECRET=generated-base64url-or-64-hex-value
```

The HMAC value must be high-entropy: at least 43 base64url characters or 64 hex
characters. Placeholder, test, repeated-character, symlinked, in-repository,
group/world-readable, oversized, and extra-key files are rejected.

Immediately before the full publish, the release command revalidates the
source file, copies its exact bytes into a private temporary directory, and
passes that sealed `0600` copy to Wrangler's `--secrets-file`. The temporary
copy is removed afterward, so secret provisioning and the guarded code
deployment remain one version change. The file's OpenRouter key fingerprint
must match the key used for recorded discovery and evaluation.

### 4. Seal and publish the AI-enabled release

Run the full local gate:

```bash
npm run release:gate
```

This is non-publishing and includes the full local E2E matrix, production HTTP
contract, mobile Lighthouse thresholds, and recorded AI predeploy evidence.
It also proves that the expected Turnstile site key—not its placeholder—was
compiled into the exact sealed export.

The bootstrap cannot issue an AI session because it intentionally has no
Turnstile site key or AI secrets. Publish the sealed AI-enabled bundle first as
an explicitly incomplete staged release:

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
CALRICULA_SECRETS_FILE=/absolute/path/outside/repo/release-secrets.env \
  npm run deploy:stage
```

The stage command:

1. revalidates the clean Git/source/artifact/site-key/tool/evidence seal;
2. verifies the immutable ownership record and exact current Cloudflare
   deployment/version;
3. repeats that read-only target check immediately before the publish;
4. deploys through the pinned local Wrangler with `--strict`, an exact release
   message, and the external secrets file;
5. records Wrangler's direct JSONL version ID before bounded Cloudflare
   reconciliation;
6. saves exact active and rollback deployment/version IDs, writes the
   recoverable staged marker, and only then archives the pending attempt;
7. runs the production verifier, mobile Lighthouse audits, and all five browser
   projects against the deployed origin, including an assertion that the
   staged Worker reports `aiEnabled=true`; and
8. writes `.release-artifacts/release-staged.json` with
   `verification-incomplete`. It never writes the completion artifact or runs
   the credentialed canary.

If a staged publish is interrupted before reconciliation—or an uncredentialed
stage check needs to be rerun—recover the exact version by its release message
without publishing again:

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
  npm run release:verify:staged
```

Next, open that exact deployed origin in a private browser window. Enter the
demo, open an AI-assisted field, accept the disclosure, and complete the
Turnstile challenge. Stop before requesting generated content. In browser
developer tools, open Application (or Storage), select Cookies for the exact
Worker origin, and copy only this name/value pair:

```text
__Host-calricula_ai_session=<signed-value>
```

Do not copy `Path`, `Expires`, `HttpOnly`, or other attributes. The cookie is a
short-lived bearer credential, so do not put it in the repository, a command
line, screenshots, or release evidence. Complete final verification within the
local gate's two-hour validity window. Read the cookie silently into the shell,
export it only for final verification, then remove it:

```bash
read -r -s CALRICULA_AI_SESSION_COOKIE
export CALRICULA_AI_SESSION_COOKIE

CLOUDFLARE_ACCOUNT_ID=... \
CALRICULA_RELEASE_BASE_URL=https://exact-origin.workers.dev \
  npm run release:verify:deployed

unset CALRICULA_AI_SESSION_COOKIE
```

Close the private browser window afterward so its original bearer cookie is
discarded.

Final verification checks that the current Cloudflare deployment is still the
exact staged version and that its recorded OpenRouter key fingerprint matches
the discovery/evaluation credential. The cookie is exposed only to the canary
recording chain and the canary process it launches. Provider and Cloudflare
credentials are removed from Git, Wrangler read-only checks, Lighthouse,
Playwright, and other post-deploy child environments.

The canary reuses the UI-created anonymous session and performs exactly one
plain chat and one strict SLO generation. It does not retry and never prints
generated curriculum. Its evidence must be newer than the current deployment.
The production verifier, mobile Lighthouse audits, and all five browser
projects then run again. Only after every check succeeds does the command write
`.release-artifacts/release-complete.json` and remove the staged marker.

If staging or a later post-deploy check fails, the command exits nonzero and
explicitly reports that the Worker was published but the release is incomplete.
Fix the underlying failure and rerun the final verification with a newly
created session cookie. A one-shot `npm run deploy` remains available for later
releases when a valid canary credential already exists before publication, but
the two-phase `deploy:stage` flow is required for the first AI-enabled release
after an AI-disabled bootstrap.

There is an unavoidable narrow race between the final Cloudflare status read
and the deployment API write because Wrangler does not expose a conditional
"deploy only if version still equals X" option. The automation minimizes it
with a second immediate read and proves that the resulting version is the
version Wrangler just uploaded.

## Cloudflare and privacy boundaries

- Static files come from `out`; only `/api/*` invokes Worker code first.
- Missing static routes use the exported 404 page.
- HTML uses auto-trailing-slash routing.
- The service worker caches application code, never API or AI requests.
- Course and program records remain in local IndexedDB. An unsaved course-edit
  recovery snapshot is also kept in same-origin browser storage until the draft
  is saved, discarded, reset, or replaced by an import.
- Reset and import/export operate on local browser data.
- No Firebase login, PostgreSQL database, or FastAPI server is required.
- Using the assistant sends only the fields the user chooses through
  Cloudflare to OpenRouter and a third-party model.
- Cloudflare rate-limit bindings provide the operational per-minute guardrails,
  but their counters are location-local and eventually consistent rather than
  an accounting system. The five-attempt display is also a convenience counter
  in the signed anonymous session cookie, not a durable account-level daily
  quota; clearing or replaying browser session state can reset it.
- Do not enter student records, credentials, or other private data in the demo
  or its AI assistant.

Cloudflare hosting does not make curriculum data FERPA-cleared. The demo is
public, source-only software; deployment governance remains the deployer's
responsibility.
