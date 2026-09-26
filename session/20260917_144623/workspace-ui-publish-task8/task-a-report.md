# Task A report — rename workspace-ui to @johnnyrobot/workspace-ui and add publish workflow

Repo: `/Users/laccd/code/applicationx`, branch `main`, base HEAD `b719a4a`.
Commit created: `5107a77` — `chore(workspace-ui): publish as @johnnyrobot/workspace-ui to GitHub Packages`
(not pushed; no tag created — left to the controller, per instructions).

## Files changed

- `packages/workspace-ui/package.json` — name → `@johnnyrobot/workspace-ui`; added `repository`
  (`https://github.com/johnnyrobot/applicationx.git`, directory `packages/workspace-ui`),
  `publishConfig` (`registry: https://npm.pkg.github.com`, `access: restricted`), `license:
  BSD-3-Clause`, and the `exports` map (`.` → `dist/index.d.ts`/`dist/index.js`,
  `./tokens.css` → `dist/theme/tokens.css`, `./package.json` → `package.json`). Version stays
  `0.1.0` (exact pin required by Calricula-side Task B).
- `packages/workspace-ui/package-lock.json` — `name` fields renamed to match (2 occurrences);
  regenerated in place via `npm ci` (root-level `name`/`version` block already existed as
  `0.0.1` before my change — pre-existing drift from `package.json`'s `0.1.0`, unrelated to the
  rename, left untouched since only the name change was in scope, and `npm ci` accepts it because
  it only compares `name`, not `version`).
- `packages/workspace-ui/src/theme/tokens.css` — header comment `@applicationx/workspace-ui
  design tokens` → `@johnnyrobot/workspace-ui design tokens`. The `--ax-*` CSS variable names
  themselves were left untouched, per instructions (the `@applicationx` UI/theme prefix stays).
- `frontend/package.json` — dependency key `@applicationx/workspace-ui` → `@johnnyrobot/workspace-ui`,
  still `file:../packages/workspace-ui`.
- `frontend/package-lock.json` — 3 occurrences renamed (`dependencies` key, the
  `../packages/workspace-ui` package block `name`, and the `node_modules/@applicationx/workspace-ui`
  link entry key → `node_modules/@johnnyrobot/workspace-ui`).
- `frontend/next.config.mjs` — `transpilePackages: ['@johnnyrobot/workspace-ui']`.
- `frontend/Dockerfile` — comment updated (`the built @johnnyrobot/workspace-ui package`).
- `frontend/src/app/chat/page.tsx`, `frontend/src/app/workspaces/[id]/page.tsx`,
  `frontend/src/lib/adapter.ts`, `frontend/src/lib/useAdapter.ts` — import specifiers updated to
  `@johnnyrobot/workspace-ui`.
- `README.md` — 3 mentions updated (P1a summary sentence, "Running P1a" section, layout table
  `packages/` row). Sentence meanings unchanged.
- `.github/workflows/publish-workspace-ui.yml` (new) — `on: push: tags: ['workspace-ui-v*']`;
  `permissions: { contents: read, packages: write }`; job runs in
  `packages/workspace-ui`, uses `actions/setup-node@v4` (`node-version: '22'`,
  `registry-url: https://npm.pkg.github.com`, `scope: '@johnnyrobot'`), steps: `npm ci`,
  `npm run build`, `npm test`, a `node -e` guard comparing `GITHUB_REF_NAME` (stripped of the
  `workspace-ui-v` prefix) against `package.json`'s `version` and failing if they differ, then
  `npm publish` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Verified with `grep -rln "@applicationx/workspace-ui" . --exclude-dir=node_modules --exclude-dir=dist
--exclude-dir=.next --exclude-dir=.git` before and after: 12 files found initially, 0 remaining
after edits.

## Checks run

### `cd packages/workspace-ui && npm ci && npm run build && npm test`
```
$ npm ci
added 119 packages, and audited 120 packages in 1s
(5 vulnerabilities pre-existing in devDependencies, unrelated to this change)

$ npm run build
> tsc -p tsconfig.json && node scripts/copy-css.mjs
(no output — success)

$ npm test
> vitest run
 ✓ src/contracts/__tests__/parity.test.ts (5 tests)
 ✓ src/__tests__/sse.test.ts (7 tests)
 ✓ src/__tests__/HostStateView.test.tsx (11 tests)
 ✓ src/__tests__/a11y.test.tsx (5 tests)
 ✓ src/__tests__/ChatPanel.test.tsx (11 tests)
 ✓ src/__tests__/useHostContext.test.tsx (7 tests)
 Test Files  6 passed (6)
      Tests  46 passed (46)
```

### `cd frontend && npm ci && npm run build`
```
$ npm ci
added 362 packages, and audited 364 packages in 6s
(3 vulnerabilities pre-existing in devDependencies, unrelated to this change)

$ ls -la node_modules/@johnnyrobot/workspace-ui
lrwxr-xr-x  ... node_modules/@johnnyrobot/workspace-ui -> ../../../packages/workspace-ui
$ ls node_modules/@applicationx
ls: node_modules/@applicationx: No such file or directory   (old scope dir gone, as expected)

$ npm run build
> next build
✓ Compiled successfully in 871ms
✓ Generating static pages using 11 workers (4/4) in 193ms
Route (app): /, /_not-found, /api/auth/session, /api/auth/token, /callback, /chat, /sign-in,
/sign-out, /workspaces/[id]
```

### `npm pack --dry-run` (in `packages/workspace-ui`)
```
npm notice 📦  @johnnyrobot/workspace-ui@0.1.0
npm notice Tarball Contents
  dist/components/*.d.ts, dist/components/*.js  (ChatPanel, CitationList, ClarificationChips,
    ContextHeader, HostStateView, MessageList, WorkspaceShell)
  dist/contracts/*.d.ts, dist/contracts/*.js     (chat, connector, host)
  dist/hooks/*.d.ts, dist/hooks/*.js             (useChat, useHostContext)
  dist/index.d.ts, dist/index.js
  dist/theme/tokens.css, dist/theme/tokens.css.d.ts
  dist/transport/sse.d.ts, dist/transport/sse.js
  package.json
npm notice total files: 31
```
Only `dist/**` and `package.json` — no README/LICENSE present in the package directory, so none
listed (consistent with the requirement).

### Workflow YAML parse check
```
$ python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/publish-workspace-ui.yml'))
print('YAML parses OK')
print('keys:', list(d.keys()))
"
YAML parses OK
keys: ['name', True, 'permissions', 'jobs']
```
Note: PyYAML (YAML 1.1) parses the bareword `on:` key as the boolean `True` — this is a
well-known PyYAML quirk, not a workflow syntax error; GitHub's own workflow parser reads `on:`
literally as the trigger key. The file parses as valid YAML and the `on.push.tags` structure is
present and well-formed (confirmed by inspecting `d[True]` during validation, which correctly
returned `{'push': {'tags': ['workspace-ui-v*']}}`).

### Secret/token leak check
```
$ git grep -n "_authToken\|ghp_\|gho_" -- . ':!node_modules' ':!dist'
(no output — clean)
```

## Commit

```
$ git log --oneline -2
5107a77 chore(workspace-ui): publish as @johnnyrobot/workspace-ui to GitHub Packages
b719a4a fix(identity): never cache per-key JWKS lookups; ...
```
13 files changed (12 modified + 1 new workflow file). Not pushed; no tag created.

## Concerns

- Pre-existing `packages/workspace-ui/package-lock.json` root `version` (`0.0.1`) doesn't match
  `package.json`'s `0.1.0` — this drift existed before this task (only the `name` fields were in
  scope) and didn't block `npm ci`/`npm run build`/`npm test`, but the publish workflow's
  tag-vs-version guard compares against `package.json`'s version (`0.1.0`), which is correct and
  unaffected by the lockfile's stale version field. Flagging in case a lockfile refresh is wanted
  separately.
- `frontend/package-lock.json` was hand-edited (3 `sed` replacements of the package name/link
  key) rather than fully regenerated, then validated by running `npm ci` successfully — this
  confirms internal consistency but a fresh `npm install` was not run to rebuild the lockfile
  from scratch, so any other latent inconsistencies in that lockfile (unrelated to this rename)
  would not have been surfaced.
- Did not push or tag, per instructions — the controller will tag `workspace-ui-v0.1.0` and
  verify the workflow run + `gh api /user/packages/npm/workspace-ui/versions`.
