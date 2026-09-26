# Task A2 report — workspace-ui 0.1.1 patch release

Repo: `/Users/laccd/code/applicationx`, branch `main`, commit `a103c11` (parent `5107a77`).

## Diff summary

- `packages/workspace-ui/package.json`: `version` 0.1.0 → 0.1.1; `sideEffects` `["*.css"]` → `["**/*.css"]` (the old glob only matched root-level CSS, not `dist/theme/tokens.css`, so bundlers tree-shook the package's own `import './theme/tokens.css'` out of `dist/index.js`).
- `packages/workspace-ui/package-lock.json`: root `version` 0.0.1 → 0.1.1 via `npm install --package-lock-only`.
- `src/components/ContextHeader.tsx`: added `showOpenStandalone?: boolean` to `ContextHeaderProps`; `showStandalone` now requires it truthy (default `true`, threaded via destructuring default). Doc comment updated.
- `src/components/WorkspaceShell.tsx`: added `showOpenStandalone?: boolean` to `WorkspaceShellProps` (with doc comment explaining the no-op fallback), threaded straight to `ContextHeader`. Left `undefined` when not passed by the host, so `ContextHeader`'s own default (`true`) applies.
- `src/__tests__/WorkspaceShell.test.tsx` (new): asserts the button renders by default for a resolved workspace, and is absent when `showOpenStandalone={false}`.
- `CHANGELOG.md` (new, in `packages/workspace-ui/`, not added to `files` — ships in the repo only, not the npm tarball): 0.1.1 (both fixes) and 0.1.0 entries.

`files` in `package.json` unchanged (`["dist"]`).

## Check outputs

- `cd packages/workspace-ui && npm ci` — clean install, 119 packages (pre-existing audit warnings only, unrelated).
- `npm run build` (`tsc -p tsconfig.json && node scripts/copy-css.mjs`) — succeeded; verified `dist/theme/tokens.css` exists and `dist/index.js` still imports `./theme/tokens.css` (now covered by the widened `sideEffects` glob).
- `npm test` (vitest) — 7 files, 48 tests, all passed, including `a11y.test.tsx` (5/5) and the new `WorkspaceShell.test.tsx` (2/2).
- `cd frontend && npm ci && npm run build` — this is `applicationx/frontend` (the standalone app, consumes the package via `file:../packages/workspace-ui`; Calricula's own `frontend/` pulls `0.1.0` from GitHub Packages instead, so it was not the target here). Build succeeded (`next build`, all routes compiled, including `/chat` and `/workspaces/[id]`); default `showOpenStandalone` (`true`) means this app's button keeps rendering unchanged, as expected — no code change needed there.

## Status / commit / checks / concerns

Status: done, one commit `a103c11` on `main`, working tree clean, not pushed/tagged.
Commit: `fix(workspace-ui): ship tokens.css through bundlers; let hosts hide "Open in ApplicationX" (0.1.1)`.
Checks: `workspace-ui` `npm ci`/`build`/`test` all green (48/48 tests); `applicationx/frontend` `npm ci`/`build` green (this is the `file:`-linked standalone app, not Calricula's frontend, which pins `0.1.0` from the registry and is unaffected by this local patch).
Concerns: none — Calricula's `frontend/package.json` still pins `0.1.0` from GitHub Packages, so it needs a separate bump (out of scope here) to pick up either fix.
