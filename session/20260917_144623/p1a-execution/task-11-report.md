# Task 11 report: `@applicationx/workspace-ui` components and hooks (v0.1.0)

**Status:** DONE
**Commit:** `0360ff6` on `main` — `feat(workspace-ui): shell, context header, host-state views, chat panel and SSE transport (0.1.0)` (not pushed)

## What was implemented

Package root: `/Users/laccd/code/applicationx/packages/workspace-ui`

### Transport — `src/transport/sse.ts`
`subscribeSSE(fetchImpl, url, headers, lastEventId, signal, options?)` → `AsyncIterable<WorkspaceEvent>`.
- WHATWG-style frame parser: comment lines (`:`), single leading space stripped after the field colon, multiple `data:` lines joined with `\n`, CRLF normalised, frames split across chunks handled via a rolling buffer.
- `context_id` lifted from each JSON payload onto the event (backend puts it in every `data`).
- `done` ends iteration (no reconnect); stream end / non-OK / fetch error reconnects with `Last-Event-ID` = last seen `id` up to `maxRetries` (3); abort ends quietly. Non-OK after retries throws `sse <status>`.
- Extra optional 6th arg `{ maxRetries?, retryDelayMs? }` (defaults 3 / 500 ms) so tests avoid real back-off; signature otherwise as the brief.

### Hooks
- `src/hooks/useHostContext.ts` — `{ state, resolution, retry }`. Effect keyed on `[adapter, context.context_id, attempt]`; each resolution owns an `AbortController` stored in `latestRef`; results applied only when the controller is still current and not aborted; rejections → `{state:'service_unavailable', retryable:true}`; `retry()` bumps the attempt counter.
- `src/hooks/useChat.ts` — `{ messages, send(question, scopeHint?), busy, cancel, phase, error, clarification, warnings, chooseClarification(slot, value) }`. `send` posts `adapter.request('chat.messages', {question, language, workspace_id, context_id, conversation_id, scope_hint}, signal)` then iterates `adapter.subscribe(run_id, null, signal)`; events with a different `context_id` are ignored; `answer` payloads validated with `ChatAnswerSchema`; `error` payload `{code}` mapped to copy; `done` breaks. Context change (effect cleanup on `context_id`) aborts the run, forgets `conversation_id`, clears messages/warnings/clarification. `conversation_id` persists across turns within a context. `cancel` aborts and posts `chat.cancel {run_id}`. `chooseClarification` resends the last question with `scope_hint={[slot]: value}` (Task 6 ruling).

### Components (one per file, `src/components/`)
- `WorkspaceShell` — `<section className="ax-shell" aria-labelledby={headerId} data-ax-host={context.host}>`; renders `ContextHeader` + (`ChatPanel` when ready, else `HostStateView`). Props: `adapter, context, labels?, language?, onOpenStandalone?, onRequestAccess?, onSetUpMapping?`. No `<main>`, `<nav>`, `<h1>`.
- `ContextHeader` — `<h2 id={headerId}>` (workspace title or fallback), campus / program / revision meta, "Open in ApplicationX" button only when resolved and `context.host !== 'applicationx'` (calls `onOpenStandalone` or `adapter.openStandalone`).
- `HostStateView` — copy per EMBEDDED-INTERFACE §6 for all six failure states; `role="alert"` for `session_expired` / `service_unavailable`; "Retry" only when `resolution.retryable && onRetry`; "Request access" / "Set up mapping" buttons only when handlers are supplied (guidance text always present); host-supplied `message` overrides default body; `loading` is a polite `role="status"`; `ready` renders nothing. Never receives or renders workspace data.
- `ChatPanel` — `<label htmlFor>` "Ask about classes, programs and campus services", `<textarea>` (Enter sends, Shift+Enter newline, IME-safe), hint text via `aria-describedby`, `role="status" aria-live="polite"` region ("Waiting for sources" / "Answer ready" / "Request cancelled"), `role="alert"` error, Send (disabled while busy/empty) and Cancel (only while busy) buttons.
- `MessageList` — `<div role="log" aria-label="Conversation">`; each assistant message renders its own `CitationList` and `<ul aria-label="Source notices">`.
- `CitationList` — `<ul aria-label="Sources">`; observation time as visible text (`formatObserved`: `YYYY-MM-DD[ HH:MM UTC]`), source period, links `rel="noopener noreferrer" target="_blank"` with a visually-hidden "(opens in a new tab)".
- `ClarificationChips` — `role="group"` of real `<button>`s; click → `onChoose(slot, value)`.

### Theme — `src/theme/tokens.css`
Light-only tokens on `:where(:root)` (zero specificity, so any host `:root { --ax-* }` rule wins regardless of order): `--ax-surface #FFFFFF`, `--ax-ink #1A1A1A`, `--ax-accent #7E6018`, `--ax-accent-ink #7E6018`, `--ax-hairline #D9D2C3`, plus `--ax-surface-alt #F7F4EC`, `--ax-ink-muted #5C5548`, `--ax-danger-ink #9B2C2C`. Contrast (computed): ink/surface 16.1:1, ink-muted/surface 7.4:1, accent-ink/surface 5.3:1, surface-on-accent (buttons) 5.3:1, danger-ink/surface 7.5:1, accent-ink/surface-alt 5.4:1, ink/surface-alt 15.7:1. Hairline is borders only. Visible `:focus-visible` outline (3px accent, 2px offset). Plain `ax-*` classes, no Tailwind.

### Config / build
- `package.json`: version `0.1.0`, `"sideEffects": ["*.css"]`, `build: tsc -p tsconfig.json && node scripts/copy-css.mjs`; react/react-dom stay peer deps (`^19`) and are dev deps for tests.
- `scripts/copy-css.mjs`: copies `src/theme/tokens.css` → `dist/theme/tokens.css` and writes `dist/theme/tokens.css.d.ts` (`export {};`) because `tsc` preserves the side-effect import in `dist/index.d.ts`; verified a consumer with `skipLibCheck: false` typechecks against `dist`.
- `src/types/css.d.ts`: `declare module '*.css'` for the package's own build.
- `tsconfig.json`: `exclude` = `src/**/__tests__`, `src/__tests__`.
- `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['src/__tests__/setup.ts']`, `include: ['src/**/__tests__/**/*.test.{ts,tsx}']`; `src/contracts/__tests__/parity.test.ts` gets `// @vitest-environment node`.
- `src/__tests__/setup.ts`: `@testing-library/jest-dom/vitest`, `expect.extend(vitest-axe/matchers)`, `afterEach(cleanup)`. (`vitest-axe/extend-expect` in 0.1.0 is an empty file, so matchers are registered explicitly; `src/__tests__/vitest-axe.d.ts` augments the types.)
- `src/index.ts`: `import './theme/tokens.css'` + exports of contracts, components, hooks, `subscribeSSE`.

## Dev dependency versions installed
react 19.3.0, react-dom 19.3.0, @types/react-dom 19.3.0, @testing-library/react 16.3.3, @testing-library/user-event 14.6.7, @testing-library/jest-dom 6.9.1, jsdom 26.1.0, vitest-axe 0.1.0, axe-core 4.13.0 (existing: vitest 2.1.9, typescript 5.9.3, zod). `package-lock.json` updated and committed.

## Test and build output

Step 1 (red): `npx vitest run` → 5 test files failed to resolve `../hooks/useHostContext`, `../components/ChatPanel`, `../components/HostStateView`, `../components/WorkspaceShell`, `../transport/sse`; parity test passed (5).

Final `npx vitest run`:
```
 ✓ src/contracts/__tests__/parity.test.ts (5 tests)
 ✓ src/__tests__/sse.test.ts (5 tests)
 ✓ src/__tests__/HostStateView.test.tsx (10 tests)
 ✓ src/__tests__/a11y.test.tsx (3 tests)
 ✓ src/__tests__/useHostContext.test.tsx (4 tests)
 ✓ src/__tests__/ChatPanel.test.tsx (8 tests)
 Test Files  6 passed (6)
      Tests  35 passed (35)
```
Zero stderr lines, zero `act()` warnings (bare waits are wrapped in `act`; the brief's tests were extended, not weakened). A duplicate-key warning found mid-way (server reusing `message_id` across turns) was fixed by using local ids for list keys.

`npm run build` → clean (`tsc` + copy-css); `dist/index.js` line 1 is `import './theme/tokens.css'`; `dist/theme/{tokens.css,tokens.css.d.ts}` present. `dist/` and `node_modules/` are gitignored and not committed.

## axe results
`a11y.test.tsx` runs axe on `WorkspaceShell` in `ready`, `access_required` and (extra) `service_unavailable` states: **0 violations** in each. The `color-contrast` rule is disabled for these runs because jsdom has no canvas (axe throws "Not implemented: HTMLCanvasElement.prototype.getContext"); contrast is verified numerically in `tokens.css` (all pairs listed above ≥ 4.5:1). The matcher was sanity-checked against an unlabeled input + alt-less image (reports `label`, `image-alt`) in a scratch test that was then deleted.

## Backend suite
`cd backend && .venv/bin/python -m pytest -q --no-cov | tail -1` → `423 passed in 9.64s` (nothing outside `packages/workspace-ui` changed).

## Trailer verification
`git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`

## Files changed (commit 0360ff6)
packages/workspace-ui/package-lock.json            | 873 ++++++++++++++++++++-
packages/workspace-ui/package.json                 |  24 +-
packages/workspace-ui/scripts/copy-css.mjs         |  13 +
.../workspace-ui/src/__tests__/ChatPanel.test.tsx  | 182 +++++
.../src/__tests__/HostStateView.test.tsx           |  77 ++
packages/workspace-ui/src/__tests__/a11y.test.tsx  |  74 ++
packages/workspace-ui/src/__tests__/setup.ts       |  11 +
packages/workspace-ui/src/__tests__/sse.test.ts    | 121 +++
.../src/__tests__/useHostContext.test.tsx          |  83 ++
.../workspace-ui/src/__tests__/vitest-axe.d.ts     |   8 +
packages/workspace-ui/src/components/ChatPanel.tsx | 104 +++
.../workspace-ui/src/components/CitationList.tsx   |  47 ++
.../src/components/ClarificationChips.tsx          |  34 +
.../workspace-ui/src/components/ContextHeader.tsx  |  55 ++
.../workspace-ui/src/components/HostStateView.tsx  |  93 +++
.../workspace-ui/src/components/MessageList.tsx    |  41 +
.../workspace-ui/src/components/WorkspaceShell.tsx |  40 +
.../src/contracts/__tests__/parity.test.ts         |   1 +
packages/workspace-ui/src/hooks/useChat.ts         | 208 +++++
packages/workspace-ui/src/hooks/useHostContext.ts  |  63 ++
packages/workspace-ui/src/index.ts                 |  23 +
packages/workspace-ui/src/theme/tokens.css         | 224 ++++++
packages/workspace-ui/src/transport/sse.ts         | 150 ++++
packages/workspace-ui/src/types/css.d.ts           |   1 +
packages/workspace-ui/tsconfig.json                |  14 +-
packages/workspace-ui/vitest.config.ts             |   6 +-
26 files changed, 2556 insertions(+), 14 deletions(-)

## Self-review
- Completeness: all seven components, both hooks, transport, theme, index exports, five brief test files (plus tests beyond the brief for abort-on-switch, cancel, clarification resend, notices/links, stream error, cursor/abort/retry paths of SSE). `grep` confirms no `<main>`, `<nav>`, `<h1>` in package source (only doc comments mention them). No personal email anywhere.
- Accessibility rules: section/aria-labelledby/h2, visible label, status live region, `role="log"`, Sources/Source notices lists with visible observation time and safe outbound links, alert roles, Retry gating, real buttons with visible text, focus-visible styles, tokens-only colours.
- Discipline: one component per file; contracts untouched; only the package (and its lockfile) changed; one commit.
- Testing: real rendering via RTL, real async iteration through async generators and `ReadableStream`, user-event for typing/clicks, pristine output.

## Concerns / notes for the controller
1. **zod vs. interface mismatch (P0):** `ChatAnswerSchema.cards[].data` is `z.unknown()`, which zod infers as optional, so `z.infer` is not assignable to the P0 `ChatAnswer` interface (`data: unknown` required). `useChat` casts `parsed.data as ChatAnswer` with a comment. Consider `z.unknown().optional()`-free alternative or an interface tweak in P0 later; no runtime effect.
2. **vitest-axe 0.1.0 `extend-expect` is empty** — matchers registered explicitly in setup; not a blocker.
3. **`color-contrast` disabled under jsdom** (unavoidable there); real-browser axe (Playwright in Task 12 / host) should keep it on.
4. `subscribeSSE` gained an optional trailing `options` argument beyond the brief's signature (backwards-compatible) so reconnect tests run without the 500 ms back-off.
5. "Request access" / "Set up mapping" are rendered as buttons only when the host passes handlers (`onRequestAccess` / `onSetUpMapping`); the guidance text always shows. The host plan must wire those handlers.
6. A stream whose frames all belong to another context (or ends without `done`/answer after retries) leaves the panel idle with no message; it does not surface an error. Fine for P1a but worth a follow-up if the host wants a "no answer" notice.

---

# Fix report — review round 1

**Commit:** `514a253` on `main` — `fix(workspace-ui): never render raw errors, harden SSE CRLF parsing, isolate stale frames on context change`; trailer parses as `Claude Fable 5.1 <noreply@anthropic.com>`.

## Per finding

1. **Raw error text rendered (Important).**
   - `src/hooks/useHostContext.ts`: `unavailable()` now returns `{ state: 'service_unavailable', message: '', retryable: true }`; the exception is not stored at all.
   - `src/hooks/useChat.ts`: `errorMessage(payload)` returns `ERROR_COPY[code] ?? ERROR_COPY.run_failed` only; a server `message` field is ignored. The `catch` branch sets `ERROR_COPY.run_failed` instead of `err.message` (covers Minor 7).
   - `src/components/HostStateView.tsx`: unchanged logic (§6 body unless a non-empty host-supplied `HostFailure.message`), comment added.
   - Tests: `useHostContext.test.tsx` "never carries the exception text into the resolution" and the retry test now asserts `message: ''`; `a11y.test.tsx` "a rejecting adapter shows the §6 outage copy, not the exception" (asserts "could not be reached", no "Failed to fetch"/hostname, Retry present, axe clean); `ChatPanel.test.tsx` "renders only code-mapped copy for an error event, never the server-supplied message" (hostile `message` with markup + internal host) and "renders mapped copy when the adapter request itself throws"; `HostStateView.test.tsx` "renders the §6 copy for an empty-message service_unavailable failure".

2. **CRLF split across reads (Important).** `src/transport/sse.ts`: `buf = (buf + decoded).replace(/\r\n/g, '\n')` — normalisation on the rolling buffer. A lone trailing `\r` stays in the buffer until its `\n` arrives (a `\r\n?` variant was tried and rejected: it turns a split CRLF into a spurious blank line and drops the `id`). Tests: `sse.test.ts` "collapses a CRLF split across reads…" (chunks `'id: 3\r'` + `'\nevent: done\r\ndata: …\r\n\r\n'` → single `{id:'3', type:'done'}`, one fetch) and "carries a clean Last-Event-ID after CRLF frames when reconnecting" (`Last-Event-ID: 5`, no `\r`).

3. **Stale frame on context switch (Minor).** `WorkspaceShell.tsx`: `<ChatPanel key={context.context_id} …>`. `useHostContext.ts`: snapshot tagged with `contextId`; the hook returns `loading`/`null` whenever `snapshot.contextId !== context.context_id`. Tests: `useHostContext.test.tsx` "reports loading synchronously when the context changes…"; `a11y.test.tsx` "a context switch never paints the previous context frame" — after a synchronous `rerender` to ctx-2 the container has no ctx-1 title or message, no log, and shows the loading status; after ctx-2 resolves the log is empty.

4. **Hairline comment (Minor).** `tokens.css`: now states `--ax-hairline` is 1.5:1 on surface, decorative rules/card borders only, not a control boundary (the ask box border uses `--ax-ink-muted`, 7.4:1).

5. **Adapter via ref (Minor).** `useHostContext.ts`: `adapterRef`, effect deps `[contextId, attempt]`; docstring says hosts should still pass a stable adapter. Test: "does not re-resolve when only the adapter identity changes" (no new call on identity change; `retry()` uses the latest adapter).

## Commands and output
- `npx vitest run` → 6 files, **45 passed (45)** (was 35); zero stderr / act warnings.
- `npm run build` → exit 0; `dist/theme/{tokens.css,tokens.css.d.ts}` present.
- `git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`.

## Files changed (514a253)
.../workspace-ui/src/__tests__/ChatPanel.test.tsx  | 24 +++++++++
.../src/__tests__/HostStateView.test.tsx           |  5 ++
packages/workspace-ui/src/__tests__/a11y.test.tsx  | 45 +++++++++++++++++
packages/workspace-ui/src/__tests__/sse.test.ts    | 19 +++++++
.../src/__tests__/useHostContext.test.tsx          | 36 +++++++++++++-
.../workspace-ui/src/components/HostStateView.tsx  |  2 +
.../workspace-ui/src/components/WorkspaceShell.tsx |  6 ++-
packages/workspace-ui/src/hooks/useChat.ts         | 13 +++--
packages/workspace-ui/src/hooks/useHostContext.ts  | 58 ++++++++++++++--------
packages/workspace-ui/src/theme/tokens.css         |  5 +-
packages/workspace-ui/src/transport/sse.ts         |  5 +-
11 files changed, 187 insertions(+), 31 deletions(-)
