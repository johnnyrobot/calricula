# Final review — `feat/workspace-ui-shell` (e5729a6..d6f2b6f)

Scope: Task B of `docs/applicationx/plans/2026-09-19-workspace-ui-github-packages-and-task8.md` (Global Constraints + Task B) and host-plan Task 8; EMBEDDED-INTERFACE §5–§6. Read-only review of the two commits, the package source at `/Users/laccd/code/applicationx/packages/workspace-ui/src`, and the real service's SSE emitter. Suites were not re-run (report evidences jest 443, build, lint 0 errors, pytest 331, live Playwright 7+1 / STUB_DOWN 1, Docker deps stage with the secret). I ran `tsc --noEmit` only to check the re-exported types: no errors outside pre-existing test/mock/e2e files.

## Strengths

- **Registry hygiene is exactly what the constraints ask for.** `frontend/.npmrc` is the single scope line; `package-lock.json:2240-2251` resolves `@johnnyrobot/workspace-ui@0.1.0` to `https://npm.pkg.github.com/download/...` with a `sha512` integrity, no `file:`; `git grep` for `_authToken` yields only template lines (`${NODE_AUTH_TOKEN}`, `$(cat /run/secrets/npm_token)`, `<token>`); no value-shaped token anywhere; `.npm_token` gitignored; no personal email; both commits carry the plan-mandated trailer.
- **Docker secret handling is correct.** `Dockerfile.prod:22-33` mounts `npm_token` on both `npm ci` runs, writes `~/.npmrc`, installs, and `rm -f`s it in the same layer (so it never lands in a layer); the missing-secret guard gives a clear error. Later stages copy only `/app/node_modules` / `.next/standalone|static`; the runner has no `~/.npmrc`. The project `.npmrc` copied at `COPY ... .npmrc ./` holds no credential. Compose (dev + prod) wires `secrets: [npm_token]` with `file: ${NPM_TOKEN_FILE:-./.npm_token}`; the file lives at the repo root, outside the `./frontend` build context.
- **CI is the plan's shape**: `permissions: {contents: read, packages: read}` on the frontend job, the auth line writes the runner's `~/.npmrc` only, `WORKSPACE_UI_READ_TOKEN || GITHUB_TOKEN` fallback.
- **Type re-exports are drift-free.** `types.ts` re-exports `HostKind, ProgramRef, WorkspaceHostContext, HostState, ResolvedContext, HostFailure, HostResolution, WorkspaceEvent, WorkspaceHostAdapter, Citation, ChatAnswer`; compared field-by-field with `contracts/host.ts` and `contracts/chat.ts` the previous mirror was identical (`HostFailure.state = Exclude<HostState,'ready'|'loading'>`, `ProgramRef.source_app: 'calricula'|'calipar'`, `cards[].data: unknown`). `client.ts` (`KNOWN_FAILURE_STATES`, `SESSION_EXPIRED_RESOLUTION`) and `adapter.ts` typecheck unchanged; `AXStatus`/`AXTokens` correctly stay in `client.ts`. `sse.ts` is now a re-export, so the adapter uses the package parser — one implementation, as the host plan intended.
- **Stub matches the real emitter.** `applicationx/backend/app/chat/runs.py:40` builds every persisted event as `{**payload, "context_id": context_id}`, and `chat.py:96` returns `{conversation_id, message_id, run_id}`. The stub now does both (`applicationx_stub.py:111-166`), which is why `useChat`'s `event.context_id !== contextId` filter lets the frames through. The fix is to the stub's fidelity, not a workaround.
- **Landmark discipline holds.** `WorkspaceShell` roots a `<section aria-labelledby>` with an `<h2>`; the page keeps the only `<h1>`/`<main>`. Both the unit smoke test and e2e case 1 assert `main` count 1 and `h1` count 1. Context switch: the page rebuilds `context_id` from `program.updated_at` on every `load()`, the shell keys `ChatPanel` on `context_id`, and `useChat` resets on `context_id` change. Sign-out: `SESSION_EXPIRED` unmounts the shell, whose cleanup aborts the run.
- **Colour mapping is AA everywhere I could pair it** (computed): gold-ink on paper 5.63:1 (secondary button text, citation links, focus ring ≥3:1), paper on gold-ink 5.63:1 (Send/Retry label — the `--color-gold` the host plan wrote would have been 3.83:1, so deviation 1 is right), ink-soft on paper 8.99:1 / on surface-2 7.68:1, package default danger ink 7.21:1 on paper. `--ax-surface` = `--color-surface` = the `luminous-card` background, so the shell sits flush in the card.
- **e2e selectors match the package**: `ChatPanel` label "Ask about classes, programs and campus services", `role="log"` "Conversation", `<ul aria-label="Sources">`, `role="status"` copy "Answer ready". The `.last()` region pick is DOM-ordered (banner then shell) and the status filter avoids the page's own "Checking workspace access…" status.

## Issues

### Critical
None.

### Important

1. **CI auth will most likely 401 on the first run, and the docs say the opposite.** `docs/APPLICATIONX-EMBED.md:225-227` states `GITHUB_TOKEN` "can read packages published by the same owner". A GitHub Packages npm package published from a workflow inherits the permissions of the *publishing repository* (`applicationx`); another repository's `GITHUB_TOKEN` cannot read it until the package's settings grant that repository Actions access (or the package is made public). The implementer's own concern 4 says so. Fix: state in `docs/APPLICATIONX-EMBED.md` "CI" and in the `ci.yml:88-92` comment that the owner must either grant `johnnyrobot/calricula` read access under the package's "Manage Actions access" or set `WORKSPACE_UI_READ_TOKEN`, as a required one-time step; the PR's green CI is the merge evidence, so do this before merging. Related: on `pull_request` from forks no repository secret is available, so external contributors cannot build the frontend at all — a consequence of the private-registry decision that should be one sentence in the README prerequisite.

2. **A dead "Open in ApplicationX" button when the deployment has no standalone URL.** `ContextHeader.tsx:26,40-44` renders the button whenever the context is ready and `host !== 'applicationx'`; the brokered adapter's `openStandalone` (`adapter.ts:106-110`) silently returns when `standaloneUrl` is null. Calricula's own `ContextBanner` hides its link in that case. `APPLICATIONX_STANDALONE_URL` is optional (`AXStatus.standalone_url: string | null`), so a deployment without it gets a focusable button that does nothing — a keyboard/screen-reader user gets no feedback. `WorkspaceShellProps` offers no way to suppress it. Not a blocker for merge given `.env.example` ships a default, but it belongs in the same package follow-up as the `sideEffects` fix (e.g. hide when `adapter.openStandalone` is absent, or a `showOpenStandalone` prop). Host-side stopgap if wanted: a `data-` attribute on the wrapper `<div>` (`page.tsx:206`) plus one CSS rule that hides `.ax-header > .ax-button` when the URL is null.

### Minor

3. `page.tsx:130-137` comment and report deviation 3 claim `AuthProvider` "only recreates `getToken` when auth state changes". It doesn't: `AuthContext.tsx:564` is a plain function created on every provider render (the same page says so at lines 46-47). Effect is benign — `useHostContext` reads the adapter through a ref, `useChat` recomputes `send`/`cancel` but no effect re-fires and an in-flight run keeps its closure — so the adapter is "stable enough", not "stable". Fix the comment; the real fix (a `useCallback` on `getToken` in `AuthContext`) is outside this task.

4. **Two same-named controls on a ready page** (`ContextBanner.tsx:44-47` link with the sr-only "(opens in a new tab)" and `ContextHeader.tsx:41` button via `window.open` with no such hint). Same destination, so no AA failure (new-window warning is advisory / 3.2.5 AAA), but they are styled differently (`luminous-button-secondary` vs `ax-button--secondary`) and appear ~one card apart. Suggest passing `labels.openStandalone: 'Open in ApplicationX (new tab)'` now, and dropping the banner link once the package can hide its button.

5. **Transient window with banner but no shell**: `hostContext` is `null` while `status === null` (`page.tsx:128`), yet `load()` runs and can reach `ready` before `/status` answers, so the banner renders with an empty card region and no status text. The M-10 test was changed from `status: null` to `enabled: true` rather than covering this. Harmless in practice (the broker call is slower than `/status`), but worth a `role="status"` "Loading workspace…" or gating the banner on `hostContext` too.

6. **Double resolve** (report concern 3): inherent to the plan's "page owns non-ready copy, shell owns ready" split; one extra `host-contexts.resolve` per load. Acceptable; if ApplicationX later rate-limits resolve, pass the page's resolution into the shell (package change) rather than resolving twice.

7. **Docs contradictions on token type**: `ci.yml:90` says `WORKSPACE_UI_READ_TOKEN` is "a fine-grained PAT with read:packages"; `docs/APPLICATIONX-EMBED.md:169-171` says fine-grained PATs cannot read Packages. Pick one. Also `README.md:82` and `docs:183,203` show `printf '%s' "<token>" > .npm_token`, which puts the token in shell history right after telling the reader to keep it out; prefer `gh auth token > .npm_token` or `read -rs`.

8. `Dockerfile.prod:29-33` second `RUN` lacks the `test -s` guard the first has; harmless since the first RUN already fails without the secret, but the two blocks are otherwise duplicates — a tiny `install.sh` would remove the copy.

9. `tailwind.config.ts:9` scans the package `dist` for utilities; the package uses only `ax-*` classes, so this is inert today. Fine to keep per the plan, but note it makes Tailwind read `node_modules` on every build.

## Implementer concerns — triage

| # | Concern | Verdict |
|---|---|---|
| 1 | `sideEffects: ["*.css"]` tree-shakes `dist/theme/tokens.css`; explicit `import '@johnnyrobot/workspace-ui/tokens.css'` in the page | Accept. The workaround is correct, cheap, and keeps working after the package fix. Confirmed the manifest ships `"*.css"`; recommend `"**/*.css"` in a 0.1.1 together with issue 2. |
| 2 | `--ax-accent` → `gold-ink` instead of the plan's `gold` | Accept, and it is required: 3.83:1 vs 5.63:1 for the Send label. Plan interface was wrong on AA. |
| 3 | Adapter memoised on `getToken`/router/URL, not per `context_id` | Accept the outcome, not the justification (Minor 3). Per-`context_id` memoisation would not help either, since `getToken` identity is the churn source. |
| 4 | Stub events tagged with `context_id` | Accept; matches `runs.py:40` and `chat.py:96` exactly. |
| 5 | `_authToken` template hits | Accept. The constraint's intent (no token *value*) is met; the plan itself prescribes the CI echo line. |
| 6 | Duplicate "Open in ApplicationX" + double resolve | Accept as Minor 4 / Minor 6; the dead-button variant is Important 2. |
| (report) 4 | CI `GITHUB_TOKEN` package visibility | Escalated to Important 1: the docs currently say the opposite of what the concern says. |

## Assessment

Both commits do what Task B specifies, on the package's real contracts, with no secret or `file:` leakage, a correct BuildKit secret lifecycle, AA colour mapping, and landmark discipline verified in unit + e2e. The two Important items are (1) a documentation claim about `GITHUB_TOKEN` that will mislead the first person to see a red CI run, plus the owner's one-time package-access action, and (2) a package-level UX defect that only surfaces when `APPLICATIONX_STANDALONE_URL` is unset.

**Ready to merge?** Yes, conditionally: fix the `docs/APPLICATIONX-EMBED.md` / `ci.yml` wording for Important 1 (a docs-only follow-up commit on this branch) and confirm CI is green on the PR — which itself proves the package-access step was done. Important 2 and the `sideEffects` glob go to a `@johnnyrobot/workspace-ui@0.1.1` follow-up in the ApplicationX repo; none of the Minors need to block.
