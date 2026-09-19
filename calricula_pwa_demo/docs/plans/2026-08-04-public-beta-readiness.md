# Calricula PWA Demo — Public Beta Readiness Plan

**Date:** 2026-08-04
**Branch:** `codex/calricula-pwa-demo-release`
**Base commit:** `5eb6a29` (tree clean, `npm run verify` exit 0)
**Status:** proposed — not started, not approved for execution

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement Workstreams A–C task-by-task. Steps use checkbox (`- [ ]`) syntax. Workstream D is human-gated release execution, not agent work.

**Goal:** Qualify every AI task route against a live model, close the one write-only data path, build a triage runbook that works under content-free logging, and then execute the five release phases to a public beta URL.

**Architecture:** Four verification tiers, split by what each can afford. The Worker-contract tier (all seven routes, stubbed provider) already exists and stays free and always-on. The live-model qualification tier is added to `scripts/ai-evaluate.mjs`, which calls OpenRouter *directly* with the maintainer key and therefore never touches the Worker's 5-per-day quota. The production canary (two requests) stays exactly as documented because the quota makes anything larger impossible.

**Tech Stack:** Node 22.13 ESM scripts (`.mjs`), Vitest (jsdom + `@cloudflare/vitest-pool-workers`), Playwright, Cloudflare Workers + Durable Objects, OpenRouter free-tier routing.

---

## Context

The demo is code-complete and green (`npm run verify` exit 0 at `5eb6a29`; 554 unit + 174 Worker + 7 smoke tests), but it is not beta-ready. Four release gates remain, all human-blocked, and three substantive engineering gaps would land on real users if the release ran today.

**Gap 1 — live-model qualification covers 2 of 7 AI tasks.** `worker/index.ts` implements seven task routes, each with a strict output validator: `content-outline` requires generated contact hours to sum *exactly* to the supplied total (`worker/index.ts:462–540`); `top-code` requires the code to exist in the server-owned catalog **and** the title to match it character-for-character (`worker/index.ts:540–608`); `compliance-explanation` requires citations drawn from a server-owned source pack. `scripts/ai-evaluate.mjs` qualifies a candidate model on two fixtures only — plain chat and a 2-item SLO array (`FIXTURES_PER_CANDIDATE = 2`, `scripts/ai-evaluate.mjs:11`). A free model can pass both and still fail the other five validators on every request. Those failures reach users as `UPSTREAM_INVALID_RESPONSE`.

These validators are already covered against a *stubbed* provider — `tests/worker/worker.test.ts` and `worker/index.test.ts` exercise all seven routes, including exact contact hours and the citation pack. What has never been tested is whether a real free model can actually satisfy them.

**Gap 2 — the AI artifact table is provably write-only.** `src/lib/ai/persistence.ts:52` is the only caller of `saveAIArtifact` (`src/lib/data/repository.ts:1306`), which prunes to `MAX_AI_ARTIFACTS_PER_ACTOR = 100` (`repository.ts:99`). Commit `6834d95` removed `listAIArtifacts` and `deleteAIArtifact` from `contracts.ts` as unreachable — so the interface can no longer read or delete what it writes. A beta would fill this table with real user content that nothing can surface.

**Gap 3 — no triage path under content-free logging.** The privacy design forbids logging prompts or responses. Twenty-seven distinct error codes exist and a `requestId` already flows Worker → envelope → `AIRequestError` (`src/lib/ai/client.ts:23`), but there is no documented procedure that turns a beta user's report into a reproducible local failure.

**Intended outcome:** a public beta at a stable `workers.dev` origin where every AI feature a user can reach has been qualified against the deployed model, no data is collected that cannot be surfaced, and any reported failure has a defined path from error code to local reproduction.

---

## Global Constraints

Copied verbatim from `AGENTS.md`, `CLAUDE.md`, and `HANDOFF.md`. Every task's requirements implicitly include these.

- Changes stay inside `calricula_pwa_demo/`. Verify **from the repository root** (`/Users/laccd/code/calricula`): `git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'` must stay empty.
- Commit trailer on every commit, exactly: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Never put a real personal or maintainer email in code, docs, commits, or config.
- Never weaken coverage thresholds, skip tests, quarantine failures, add retries, or raise a timeout to make a test pass. Accessibility stays exactly `1.00`.
- Coverage floors: 80% statements/lines/functions, 70% branches globally; 90/85 for `repository.ts`, `ai/client.ts`, `ai/persistence.ts`, `ai/session.ts`, `approvals/workflow.ts`.
- `OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`, `AI_SESSION_HMAC_SECRET` are Worker secrets — never committed, logged, bundled, printed, passed on a command line, or returned to the browser. Never prefix a secret with `NEXT_PUBLIC_`.
- OpenRouter routing stays free-only: `:free` model IDs, zero `max_price`, `data_collection: 'deny'`, `zdr: true`. The eval script alone sets `allow_fallbacks: false`.
- Never print model-generated content or prompts to stdout, logs, or evidence files.
- `wrangler.jsonc` ships fail-closed. Never add `account_id`. Never use raw `wrangler deploy` as a release path.
- One logical change per commit. Run `npm run verify` (~8 min) between changes; run it in the background and do not edit `src/` while its build step runs.
- Do not report this demo as deployment-ready or beta-ready until Workstream D completes.

---

## Hard limits that shape the design

| Limit | Value | Source | Consequence |
|---|---|---|---|
| Worker daily AI quota | 5 per install per UTC day | `worker/quota-protocol.ts:13` | A 7-route canary through the deployed Worker is **impossible**. The canary stays at 2 requests. |
| Documented canary contract | "exactly one text and one structured request without retries" | `AGENTS.md:182` | The canary must not grow. Changing it is a deliberate invariant edit, not a side effect. |
| Eval request budget | `MAX_CANDIDATES(4) × FIXTURES_PER_CANDIDATE(2) = 8` | `scripts/ai-evaluate.mjs:10–13` | Must rise to 28 explicitly, with pacing for free-tier rate limits. |
| Release gate | 14 ordered steps, seal written only after all pass | `scripts/release-gate.mjs:24–39` | New checks must slot into an existing step, not append a fifteenth. |

---

## File structure

**Create**
- `scripts/ai-eval-fixtures.mjs` — the seven task fixtures and their deterministic rubrics. One responsibility: define what "a model can do this task" means, with no network code.
- `scripts/ai-eval-fixtures.test.mjs` — rubric unit tests over canned model outputs (valid + one violation per check).
- `src/lib/ai/eval-catalog-parity.test.ts` — asserts the `.mjs` fixture constants have not drifted from `src/lib/ai/schemas.ts`.
- `tests/worker/ai-eval-parity.test.ts` — asserts the rubric and the real Worker validator agree, accept-for-accept and reject-for-reject.
- `docs/runbooks/ai-triage.md` — the debugging runbook.

**Modify**
- `scripts/ai-evaluate.mjs` — replace the two hardcoded fixtures with the registry; raise the budget; add pacing; per-task result reporting.
- `scripts/ai-evaluate.test.mjs` — update budget and shape assertions.
- `AGENTS.md` — record the new eval contract and the unchanged canary contract.
- `HANDOFF.md` — status rows for the new evidence.
- `src/lib/ai/persistence.ts`, `src/lib/data/contracts.ts`, `src/lib/data/repository.ts` — the artifact decision (Task B1).

Splitting fixtures out of `ai-evaluate.mjs` keeps that file about *network policy and orchestration* and the new file about *task quality*. They change for different reasons and are tested differently — the rubrics are pure functions and need no `fetch` stub.

---

## End-to-end test tiers

Named explicitly because most of this already exists. What follows is the full picture, including what this plan deliberately does **not** add.

| Tier | Scope | Provider | Cost | Runs in | Status |
|---|---|---|---|---|---|
| 1. Browser e2e | 24 Playwright tests, 8 specs, 5 browser projects — offline SW reload, draft recovery, cross-tab sync, full approval workflow, backup import/export, install prompt, axe WCAG scan, 400% zoom reflow | AI forced off (`AI_ENABLED=false`) | free | `test:e2e:smoke`, `test:e2e:full`, gate step 11 | **Exists.** No change except Task C2. |
| 2. Worker contract | All seven routes through real `handleRequest` — Turnstile, HMAC session, both rate-limit bindings, the SQLite Durable Object quota, and every output validator | stubbed OpenRouter | free | `test:worker`, gate step 6 | **Exists** (`tests/worker/`, `worker/index.test.ts`). Task A3 adds the parity spec. |
| 3. Live-model qualification | All seven routes against a real candidate model | real OpenRouter, maintainer key, **Worker bypassed** | free-tier, $0 enforced | `ai:evaluate`, Phase 3 | **Task A1–A4 — the gap this plan closes.** |
| 4. Production canary | 2 routes against the deployed Worker with a human session | real, end-to-end | 2 of 5 daily attempts | `release:verify:deployed`, Phase 5 | **Exists. Must not grow.** |

Two design consequences worth stating plainly, because both are counter-intuitive:

**Tier 3 deliberately bypasses the Worker.** It calls OpenRouter directly. That looks less end-to-end, and it is — but the Worker path is already fully covered by Tier 2, and routing Tier 3 through the Worker would consume the daily quota and make a seven-route run impossible. The split puts each question where it can actually be answered: *"does the Worker enforce the contract?"* is Tier 2's, *"can this model satisfy it?"* is Tier 3's.

**Tier 4 cannot be extended, and rotating sessions to evade that is prohibited.** `MAX_DAILY_ATTEMPTS = 5` per install per UTC day (`worker/quota-protocol.ts:13`) caps it, and `AGENTS.md:182` fixes the contract at one text and one structured request without retries. Full-route confidence comes from Tiers 2 and 3; the canary only proves the deployed wiring is live.

**No live-AI Playwright project is added.** It would need a human Turnstile session, could never run in CI, and would spend quota to re-test what Tier 2 already covers deterministically.

---

## Workstream A — Live-model qualification for all seven tasks

### Task A1: Fixture registry and deterministic rubrics

**Files:**
- Create: `scripts/ai-eval-fixtures.mjs`
- Test: `scripts/ai-eval-fixtures.test.mjs`

**Interfaces:**
- Produces: `EVAL_FIXTURES` — a frozen array of `{ task, kind, messages, schema, maxTokens, checks }`, where `kind` is `'plain' | 'structured'` and each check is `{ id, run(value, fixture) => boolean }`. Also `scoreFixture(fixture, content) => { passed, checks: Array<{ id, passed }> }` and `EVAL_TOP_CODE_CATALOG`.
- Consumed by: Task A2 (`ai-evaluate.mjs`), Task A3 (parity tests).

The rubric's job is not to be a nice-to-have quality score. Three of these checks are **hallucination detectors** that mirror exactly what the Worker will reject in production:

| Task | Decisive check | Mirrors |
|---|---|---|
| `content-outline` | `sum(topics[].contactHours) === 54` exactly | `worker/index.ts:462–540` |
| `top-code` | `code ∈ catalog` **and** `title === catalog[code]` | `worker/index.ts:540–608` |
| `program-narrative` | `laborMarketAnalysis === ""` when no evidence supplied | `worker/index.ts:609–645` |

- [ ] **Step 1: Write the failing rubric tests**

```js
// scripts/ai-eval-fixtures.test.mjs
import { describe, expect, it } from 'vitest';

import {
  EVAL_FIXTURES,
  EVAL_TOP_CODE_CATALOG,
  fixtureForTask,
  scoreFixture,
} from './ai-eval-fixtures.mjs';

describe('evaluation fixture registry', () => {
  it('covers every AI task route the Worker exposes', () => {
    expect(EVAL_FIXTURES.map((fixture) => fixture.task)).toEqual([
      'chat',
      'catalog-description',
      'slos',
      'content-outline',
      'top-code',
      'program-narrative',
      'compliance-explanation',
    ]);
  });

  it('rejects a content outline whose hours do not sum to the supplied total', () => {
    const fixture = fixtureForTask('content-outline');
    const good = JSON.stringify({
      topics: [
        { title: 'Foundations', contactHours: 27, relatedSLOs: [1] },
        { title: 'Applications', contactHours: 27, relatedSLOs: [2] },
      ],
    });
    const bad = JSON.stringify({
      topics: [
        { title: 'Foundations', contactHours: 27, relatedSLOs: [1] },
        { title: 'Applications', contactHours: 20, relatedSLOs: [2] },
      ],
    });
    expect(scoreFixture(fixture, good).passed).toBe(true);
    expect(scoreFixture(fixture, bad).passed).toBe(false);
    expect(
      scoreFixture(fixture, bad).checks.find(
        (check) => check.id === 'hours-sum-exact',
      )?.passed,
    ).toBe(false);
  });

  it('rejects a TOP code whose title does not match the server catalog', () => {
    const fixture = fixtureForTask('top-code');
    const bad = JSON.stringify({
      suggestions: [
        {
          code: '0707.00',
          title: 'Computer Science',
          rationale: 'Introductory programming content.',
          confidence: 0.8,
        },
      ],
    });
    expect(scoreFixture(fixture, bad).passed).toBe(false);
    expect(
      scoreFixture(fixture, bad).checks.find(
        (check) => check.id === 'title-matches-catalog',
      )?.passed,
    ).toBe(false);
  });

  it('rejects an invented labor-market analysis when no evidence was supplied', () => {
    const fixture = fixtureForTask('program-narrative');
    const bad = JSON.stringify({
      goalsAndObjectives: 'Prepare students for entry-level roles.',
      catalogDescription: 'A synthetic demo program.',
      requirementsJustification: 'Courses build sequentially.',
      laborMarketAnalysis: 'Regional demand is projected to grow 14 percent.',
    });
    expect(
      scoreFixture(fixture, bad).checks.find(
        (check) => check.id === 'no-invented-labor-market',
      )?.passed,
    ).toBe(false);
  });

  it('rejects a citation outside the server-owned compliance pack', () => {
    const fixture = fixtureForTask('compliance-explanation');
    const bad = JSON.stringify({
      explanation: 'The unit calculation follows the standard formula.',
      citations: [
        {
          sourceTitle: 'Education Code section 70901',
          sourceSection: '§ 70901',
          excerpt: 'Invented excerpt.',
        },
      ],
    });
    expect(
      scoreFixture(fixture, bad).checks.find(
        (check) => check.id === 'citations-from-source-pack',
      )?.passed,
    ).toBe(false);
  });

  it('publishes a catalog every fixture suggestion must come from', () => {
    expect(Object.keys(EVAL_TOP_CODE_CATALOG).length).toBe(20);
    expect(EVAL_TOP_CODE_CATALOG['0707.00']).toBe(
      'Computer Information Systems',
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run scripts/ai-eval-fixtures.test.mjs`
Expected: FAIL — `Failed to load ./ai-eval-fixtures.mjs`.

Do **not** pass `--coverage` here. A single-file run cannot meet the global thresholds and exits non-zero even when every test passes.

- [ ] **Step 3: Implement the registry**

Create `scripts/ai-eval-fixtures.mjs`. Structure (write all seven; `content-outline` shown complete as the pattern):

```js
export const EVAL_TOP_CODE_CATALOG = Object.freeze({
  '1701.00': 'Mathematics, General',
  '1501.00': 'English',
  '0707.00': 'Computer Information Systems',
  // ... all 20 entries, copied from src/lib/ai/schemas.ts AI_TOP_CODE_CATALOG.
  // Task A3 adds a parity test that fails if these drift apart.
});

const OUTLINE_TOTAL_CONTACT_HOURS = 54;
const OUTLINE_SLO_POSITIONS = [1, 2];

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONTENT_OUTLINE_FIXTURE = {
  task: 'content-outline',
  kind: 'structured',
  maxTokens: 700,
  messages: [
    {
      role: 'system',
      content:
        'Draft a sequenced course content outline from the supplied course data. Allocate positive contact hours and preserve the supplied total contact hours exactly. Related SLO numbers must refer only to supplied SLO positions. Return only the required JSON object.',
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Curriculum Workflow Fundamentals. Total contact hours: 54. Supplied SLOs: (1) Analyze a course outline of record; (2) Evaluate a proposed curriculum change. Produce two to five topics.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      topics: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            contactHours: { type: 'number' },
            relatedSLOs: { type: 'array', items: { type: 'integer' } },
          },
          required: ['title', 'contactHours', 'relatedSLOs'],
        },
      },
    },
    required: ['topics'],
  },
  checks: [
    {
      id: 'exact-keys',
      run(value) {
        return isRecord(value) && Object.keys(value).length === 1
          && Array.isArray(value.topics) && value.topics.length >= 2;
      },
    },
    {
      id: 'positive-hours',
      run(value) {
        return value.topics.every(
          (topic) =>
            typeof topic.contactHours === 'number'
            && Number.isFinite(topic.contactHours)
            && topic.contactHours > 0,
        );
      },
    },
    {
      id: 'hours-sum-exact',
      run(value) {
        const total = value.topics.reduce(
          (sum, topic) => sum + topic.contactHours,
          0,
        );
        return Math.abs(total - OUTLINE_TOTAL_CONTACT_HOURS) < 1e-9;
      },
    },
    {
      id: 'related-slos-in-range',
      run(value) {
        return value.topics.every(
          (topic) =>
            Array.isArray(topic.relatedSLOs)
            && topic.relatedSLOs.every((position) =>
              OUTLINE_SLO_POSITIONS.includes(position),
            ),
        );
      },
    },
  ],
};

export const EVAL_FIXTURES = Object.freeze([
  CHAT_FIXTURE,
  CATALOG_DESCRIPTION_FIXTURE,
  SLOS_FIXTURE,
  CONTENT_OUTLINE_FIXTURE,
  TOP_CODE_FIXTURE,
  PROGRAM_NARRATIVE_FIXTURE,
  COMPLIANCE_EXPLANATION_FIXTURE,
]);

export function fixtureForTask(task) {
  const fixture = EVAL_FIXTURES.find((entry) => entry.task === task);
  if (!fixture) throw new Error(`Unknown evaluation task: ${task}`);
  return fixture;
}

export function scoreFixture(fixture, content) {
  const value =
    fixture.kind === 'structured' ? parseJson(content) : content.trim();
  if (fixture.kind === 'structured' && !isRecord(value)) {
    return {
      passed: false,
      checks: fixture.checks.map((check) => ({ id: check.id, passed: false })),
    };
  }
  const checks = fixture.checks.map((check) => {
    let passed = false;
    try {
      passed = check.run(value, fixture) === true;
    } catch {
      passed = false;
    }
    return { id: check.id, passed };
  });
  return { passed: checks.every((check) => check.passed), checks };
}
```

Required check IDs for the remaining six fixtures:

- `chat` — `non-empty`, `single-paragraph`, `not-json`, `no-approval-claim` (rejects `/\b(approved|guaranteed|certifie[sd])\b/i`).
- `catalog-description` — `exact-keys`, `length-within-1600`, `word-count-25-120`, `no-invented-prerequisite` (rejects `/\bprerequisite\b/i`, since the fixture supplies none).
- `slos` — `exact-keys`, `count-1-to-6`, `action-verb-start` (reuse the existing `ACTION_VERBS` list from `scripts/ai-evaluate.mjs:19–34`), `unique-outcomes`, `length-within-350`.
- `top-code` — `exact-keys`, `count-1-to-3`, `code-format` (`/^\d{4}\.\d{2}$/`), `code-in-catalog`, `title-matches-catalog`, `confidence-in-range`, `unique-codes`, `relevant-suggestion` (the fixture course is introductory programming; at least one suggestion must be `0707.00` or `0701.00`).
- `program-narrative` — `exact-keys` (all four), `no-invented-labor-market` (`laborMarketAnalysis` must be the empty string), `no-invented-approval`.
- `compliance-explanation` — `exact-keys`, `citations-from-source-pack` (every citation's `sourceTitle`, `sourceSection`, and `excerpt` must match an entry in the pack copied from `AI_COMPLIANCE_SOURCE_PACK`), `explanation-non-empty`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/ai-eval-fixtures.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-eval-fixtures.mjs scripts/ai-eval-fixtures.test.mjs
git commit -m "feat: add per-task evaluation fixtures and deterministic rubrics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: Drive the evaluator from the registry and raise the request budget

**Files:**
- Modify: `scripts/ai-evaluate.mjs` (replace `PLAIN_FIXTURE`/`STRUCTURED_FIXTURE` at lines 36–85, `baseCompletionBody` at 250–283, `validatePlainContent`/`validateStructuredContent` at 323–365, and `evaluateCandidates` at 400–462)
- Modify: `scripts/ai-evaluate.test.mjs`

**Interfaces:**
- Consumes: `EVAL_FIXTURES`, `scoreFixture` from Task A1.
- Produces: per-candidate results of shape `{ model, pass: { rate, byTask: Record<task, boolean> }, checks: Record<task, Array<{id, passed}>>, latencyMs: { byTask, mean } }`. Task A4 records these.

This is where the budget changes deliberately: `FIXTURES_PER_CANDIDATE` goes 2 → 7, so `MAX_GENERATION_REQUESTS` goes 8 → 28. Free-tier models are rate-limited around 20 requests/minute, so requests are paced.

- [ ] **Step 1: Write the failing tests**

First extend the existing harness. `createHarness` (`scripts/ai-evaluate.test.mjs:47–106`) branches on `body.response_format` and returns one hardcoded SLO payload for every structured request. With seven tasks it must branch on the schema name instead. Add a `taskBodies` option, keeping every existing default so the current tests keep passing:

```js
// scripts/ai-evaluate.test.mjs — inside createHarness's fetch stub,
// replacing the single `if (body.response_format)` branch
if (body.response_format) {
  const task = body.response_format.json_schema.name.replace(
    /^calricula_eval_/,
    '',
  ).replace(/_/g, '-');
  if (structuredStatus !== 200) {
    return jsonResponse(
      structuredBody ?? {
        error: { message: 'SENSITIVE_UPSTREAM_FAILURE_BODY' },
      },
      structuredStatus,
    );
  }
  return jsonResponse(
    completion(body.model, taskBodies[task] ?? DEFAULT_TASK_BODIES[task], completionUsage),
  );
}
```

`DEFAULT_TASK_BODIES` is a module-level map of one passing payload per task — the same samples Task A3 reuses for parity, so define them once and export them from the test file.

```js
// append to scripts/ai-evaluate.test.mjs
it('budgets one request per task route for each candidate', () => {
  expect(FIXTURES_PER_CANDIDATE).toBe(7);
  expect(MAX_GENERATION_REQUESTS).toBe(28);
});

it('reports a per-task verdict and fails a candidate that misses one task', async () => {
  const harness = createHarness({
    taskBodies: {
      // hours deliberately sum to 47 instead of the requested 54
      'content-outline': JSON.stringify({
        topics: [
          { title: 'Foundations', contactHours: 27, relatedSLOs: [1] },
          { title: 'Applications', contactHours: 20, relatedSLOs: [2] },
        ],
      }),
    },
  });

  const [result] = await evaluateCandidates({
    apiKey: 'test-key',
    candidates: [MODEL],
    fetchFn: harness.fetchFn,
    now: deterministicClock(),
    sleep: async () => {},
  });

  expect(result.pass.byTask['content-outline']).toBe(false);
  expect(result.pass.byTask.slos).toBe(true);
  expect(result.pass.rate).toBeCloseTo(6 / 7);
  expect(
    result.checks['content-outline'].find(
      (check) => check.id === 'hours-sum-exact',
    ).passed,
  ).toBe(false);
});

it('paces generation requests to respect free-tier rate limits', async () => {
  const harness = createHarness();
  const sleep = vi.fn(async () => {});
  await evaluateCandidates({
    apiKey: 'test-key',
    candidates: [MODEL],
    fetchFn: harness.fetchFn,
    now: deterministicClock(),
    sleep,
  });
  expect(sleep).toHaveBeenCalledTimes(6);
  expect(sleep).toHaveBeenCalledWith(REQUEST_SPACING_MS);
});

it('never writes model-generated content to stdout', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await runCli(['--models', 'example/model:free']);
  const printed = log.mock.calls.flat().join('\n');
  expect(printed).not.toContain('Foundations');
  expect(printed).not.toContain('Analyze');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run scripts/ai-evaluate.test.mjs`
Expected: FAIL — `FIXTURES_PER_CANDIDATE` is 2, `sleep` is not a parameter, results have no `byTask`.

- [ ] **Step 3: Implement**

In `scripts/ai-evaluate.mjs`:

```js
import { EVAL_FIXTURES, scoreFixture } from './ai-eval-fixtures.mjs';

export const MAX_CANDIDATES = 4;
export const FIXTURES_PER_CANDIDATE = EVAL_FIXTURES.length; // 7
export const MAX_GENERATION_REQUESTS =
  MAX_CANDIDATES * FIXTURES_PER_CANDIDATE; // 28
export const REQUEST_SPACING_MS = 3_000;
```

Rewrite `baseCompletionBody` to take the fixture's own schema and token budget, keeping every routing field byte-identical to the current implementation (`allow_fallbacks: false`, `data_collection: 'deny'`, `zdr: true`, zero `max_price`, `temperature: 0`, `stream: false`):

```js
function baseCompletionBody(model, fixture) {
  return {
    model,
    messages: fixture.messages,
    provider: {
      allow_fallbacks: false,
      data_collection: 'deny',
      zdr: true,
      max_price: { prompt: 0, completion: 0, request: 0 },
      ...(fixture.kind === 'structured' ? { require_parameters: true } : {}),
    },
    stream: false,
    temperature: 0,
    max_tokens: fixture.maxTokens,
    ...(fixture.kind === 'structured'
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: `calricula_eval_${fixture.task.replace(/-/g, '_')}`,
              strict: true,
              schema: fixture.schema,
            },
          },
        }
      : {}),
  };
}
```

Replace `evaluateFixture`'s hardcoded branch with `scoreFixture(fixture, content)`, and loop `EVAL_FIXTURES` inside `evaluateCandidates`, awaiting `sleep(REQUEST_SPACING_MS)` between requests but not after the last. Keep the existing behaviour that any thrown error scores the fixture as failed — the evaluator never retries.

Keep `runCli`'s exit rule: `process.exitCode = 1` unless every candidate has `pass.rate === 1`. Print only `model`, `pass`, `checks` (IDs and booleans), and `latencyMs` — never content.

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run scripts/ai-evaluate.test.mjs scripts/ai-eval-fixtures.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-evaluate.mjs scripts/ai-evaluate.test.mjs
git commit -m "feat: qualify candidate models on all seven AI task routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Parity tests so the rubric cannot drift from the Worker

**Files:**
- Create: `src/lib/ai/eval-catalog-parity.test.ts`
- Create: `tests/worker/ai-eval-parity.test.ts`

This follows the pattern already established by `src/lib/compliance/golden-parity.test.ts`, which pins the compliance engine to a captured fixture of the parent Python service. Here the same idea pins the evaluation rubric to the Worker's real validators, so a rubric that passes a model the Worker would reject becomes a test failure rather than a production incident.

Two independent drift risks, two tests:

1. **Constant drift** — the `.mjs` fixture file duplicates `AI_TOP_CODE_CATALOG` and `AI_COMPLIANCE_SOURCE_PACK` because a plain Node script cannot import the Zod-bearing TypeScript module. A jsdom-config test can import both and compare.
2. **Verdict drift** — the rubric could accept output the Worker rejects. A Worker-pool test can push the same canned content through `handleRequest` with a stubbed OpenRouter and compare verdicts.

- [ ] **Step 1: Write the failing constant-parity test**

```ts
// src/lib/ai/eval-catalog-parity.test.ts
import { describe, expect, it } from "vitest";

import { EVAL_TOP_CODE_CATALOG } from "../../../scripts/ai-eval-fixtures.mjs";
import { AI_TOP_CODE_CATALOG } from "./schemas";

describe("evaluation fixture / server catalog parity", () => {
  it("duplicates the server-owned TOP catalog exactly", () => {
    expect({ ...EVAL_TOP_CODE_CATALOG }).toEqual({ ...AI_TOP_CODE_CATALOG });
  });
});
```

- [ ] **Step 2: Write the failing verdict-parity test**

```ts
// tests/worker/ai-eval-parity.test.ts
import { describe, expect, it } from "vitest";

import {
  EVAL_FIXTURES,
  scoreFixture,
} from "../../scripts/ai-eval-fixtures.mjs";
import { postTask, stubOpenRouter, withSession } from "./helpers";

// One accepted sample and one violating sample per task. The violating sample
// must break the check the Worker also enforces, not an arbitrary one.
const SAMPLES: Record<string, { good: string; bad: string }> = {
  "content-outline": {
    good: JSON.stringify({
      topics: [
        { title: "Foundations", contactHours: 27, relatedSLOs: [1] },
        { title: "Applications", contactHours: 27, relatedSLOs: [2] },
      ],
    }),
    bad: JSON.stringify({
      topics: [
        { title: "Foundations", contactHours: 27, relatedSLOs: [1] },
        { title: "Applications", contactHours: 20, relatedSLOs: [2] },
      ],
    }),
  },
  // ... one entry per task in EVAL_FIXTURES
};

describe("evaluation rubric / Worker validator parity", () => {
  it.each(EVAL_FIXTURES.map((fixture) => fixture.task))(
    "agrees with the Worker on accepted and rejected %s output",
    async (task) => {
      const sample = SAMPLES[task];
      const session = await withSession();

      for (const [variant, content] of [
        ["good", sample.good],
        ["bad", sample.bad],
      ] as const) {
        stubOpenRouter(content);
        const response = await postTask(task, session);
        const workerAccepted = response.status === 200;
        const rubricAccepted = scoreFixture(
          EVAL_FIXTURES.find((fixture) => fixture.task === task),
          content,
        ).passed;

        expect(
          { task, variant, workerAccepted },
          `rubric and Worker disagree on ${variant} ${task}`,
        ).toEqual({ task, variant, workerAccepted: rubricAccepted });
      }
    },
  );
});
```

Reuse the existing harness in `tests/worker/helpers.ts` and `tests/worker/quota-harness.ts` rather than writing new Miniflare setup — `vitest.worker.config.ts` already binds a real SQLite Durable Object, the two rate-limit namespaces, and Cloudflare's always-pass Turnstile test secret `1x0000000000000000000000000000000AA`. If `postTask`/`stubOpenRouter`/`withSession` are not already exported with those names, add thin wrappers around whatever `helpers.ts` provides rather than duplicating the setup.

Each `it.each` case consumes 2 of the 5 daily quota attempts per session, so obtain a fresh session per task.

- [ ] **Step 3: Run both and confirm they fail**

Run: `npx vitest run src/lib/ai/eval-catalog-parity.test.ts` — Expected: FAIL (module not found until A1 lands, then a real comparison).
Run: `npx vitest run --config vitest.worker.config.ts tests/worker/ai-eval-parity.test.ts` — Expected: FAIL until `SAMPLES` is complete.

- [ ] **Step 4: Fill in the samples until both pass**

Run: `npm run test && npm run test:worker`
Expected: PASS. A disagreement here is a real finding — fix the rubric to match the Worker, never the reverse. The Worker is the contract.

- [ ] **Step 5: Commit** (this commit also updates the published `src/lib/**` count — see Verification)

```bash
git add src/lib/ai/eval-catalog-parity.test.ts tests/worker/ai-eval-parity.test.ts AGENTS.md HANDOFF.md
git commit -m "test: pin the evaluation rubric to the Worker output validators

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A4: Record the widened evidence and update the published contracts

**Files:**
- Modify: `AGENTS.md` (the eval/canary paragraph at ~line 182)
- Modify: `HANDOFF.md` (status table)
- Check: `scripts/release-evidence.mjs` — `ai:evaluate:record` must accept the new per-task result shape

- [ ] **Step 1: Confirm the evidence recorder accepts the new shape**

Run: `npx vitest run scripts/release-evidence.test.mjs`
If it asserts the old `{ pass: { plain, structured, rate } }` shape, update both the recorder and its test to store `pass.byTask` and the check IDs. Store **only** task names, check IDs, booleans, and latencies — never content.

- [ ] **Step 2: Update `AGENTS.md`**

Replace the sentence "The canary performs exactly one text and one structured request without retries." with text that keeps the canary contract and adds the eval contract:

```markdown
- Model qualification and the production canary are separate budgets.
  `ai:evaluate` calls OpenRouter directly with the maintainer credential and
  qualifies each candidate on all seven task routes — one fixed request per
  route, at most four candidates, 28 requests, no retries, paced to respect
  free-tier limits. Its rubric is pinned to the Worker's own output validators
  by `tests/worker/ai-eval-parity.test.ts`.
- The deployed canary is unchanged and must stay unchanged: exactly one text
  and one structured request without retries. The Worker enforces
  `MAX_DAILY_ATTEMPTS = 5` per install per UTC day
  (`worker/quota-protocol.ts`), so a canary covering every route is not
  possible and must not be attempted by rotating sessions.
```

- [ ] **Step 3: Update `HANDOFF.md`**

Add a status row: `| Live model qualification | All seven task routes | ai:evaluate qualifies each candidate on chat, catalog-description, slos, content-outline, top-code, program-narrative, compliance-explanation; rubric pinned to the Worker validators |`

- [ ] **Step 4: Full verification**

Run: `npm run verify`
Expected: exit 0. ~8 min — run it in the background and do not edit `src/` during its build step.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md HANDOFF.md scripts/release-evidence.mjs scripts/release-evidence.test.mjs
git commit -m "docs: record the seven-route evaluation contract and the fixed canary budget

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Workstream B — Close the write-only artifact path

### Task B1: Make AI artifacts readable, or stop writing them

**Files:**
- Modify: `src/lib/ai/persistence.ts:52`
- Modify: `src/lib/data/contracts.ts:257`, `src/lib/data/repository.ts:1306`
- Test: `src/lib/ai/persistence.test.ts`, `src/lib/data/repository.test.ts`

**Decision required before implementing.** The evidence: `persistence.ts:52` is the only writer; `6834d95` deleted `listAIArtifacts` and `deleteAIArtifact` from the interface as unreachable. So the table is not merely unread — it is unreadable and undeletable through the sanctioned interface, while `MAX_AI_ARTIFACTS_PER_ACTOR = 100` silently discards the oldest entries.

Recommended resolution: **stop writing.** The stated purpose was an audit trail, but an audit trail nothing can read is not an audit trail, and a beta would accumulate real curriculum text in it. Removing the write is smaller, reversible, and honours the demo's local-first privacy posture. Re-adding a read path later is a feature with a UI, and should be planned as one.

If the user prefers to keep the data, the alternative is a Settings-screen "AI activity" list plus a delete control — which means restoring `listAIArtifacts`/`deleteAIArtifact`, a new screen, and its own accessibility and e2e coverage (~1 day, not 2 hours).

- [ ] **Step 1: Write the failing test for the chosen direction**

```ts
// src/lib/ai/persistence.test.ts — for the "stop writing" resolution
it("does not persist an artifact for an accepted suggestion", async () => {
  await recordAcceptedSuggestion({
    task: "slos",
    actorId: "faculty-1",
    entityId: "course-1",
    output: { slos: ["Analyze a course outline of record."] },
  });
  expect(repository.saveAIArtifact).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/ai/persistence.test.ts`
Expected: FAIL — `saveAIArtifact` was called once.

- [ ] **Step 3: Remove the write path**

Delete the `saveAIArtifact` call at `src/lib/ai/persistence.ts:52` and the now-unused artifact construction around it. Remove `saveAIArtifact` from `contracts.ts:257` and its implementation plus `MAX_AI_ARTIFACTS_PER_ACTOR` from `repository.ts`. Leave the Dexie table declaration in `database.ts` alone — dropping a table is a schema migration and existing installs may hold rows; the table simply stops growing.

- [ ] **Step 4: Run the full unit suite with coverage**

Run: `npm run test:coverage`
Expected: PASS. `ai/persistence.ts` and `data/repository.ts` both carry a 90/85 floor — removing code raises the ratio, but confirm no test that only existed to cover the deleted branch has left an uncovered neighbour.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/persistence.ts src/lib/data/contracts.ts src/lib/data/repository.ts src/lib/ai/persistence.test.ts src/lib/data/repository.test.ts
git commit -m "refactor: stop persisting AI artifacts no interface can read

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Workstream C — Debugging and triage under content-free logging

### Task C1: The AI triage runbook

**Files:**
- Create: `docs/runbooks/ai-triage.md`

**Method.** Every investigation follows `superpowers:systematic-debugging`. Its Phase 1 discipline — reproduce before hypothesising, and verify your own intermediate results — is what closed the three-session `AppShell` "flake" in under an hour at `5eb6a29`, and what caught two wrong intermediate conclusions in the same session. The runbook is that skill's loop specialised to this system's one hard constraint: **the server cannot tell you what happened, because it is designed not to know.** No prompt, response, or curriculum text is ever logged; the Durable Object stores only an HMAC-derived install ID, a day, an attempt count, request IDs, and an expiry.

So triage runs on four observable signals only: the error `code`, the HTTP status, the `requestId` (already carried Worker → envelope → `AIRequestError`, `src/lib/ai/client.ts:23`), and what the user was doing.

The runbook must contain:

1. **The intake block** — exactly what to ask a reporter for: error code, request ID, task (which button), UTC time, browser, and whether a retry succeeded. Nothing else; never ask for their curriculum content.
2. **The code → hypothesis table**, covering all 27 codes. The load-bearing rows:

| Code | First hypothesis | Reproduce with |
|---|---|---|
| `UPSTREAM_INVALID_RESPONSE` | The chosen model fails this task's validator. **Most likely defect class.** | `npm run ai:evaluate -- --models <deployed model>` and read `pass.byTask` |
| `DAILY_LIMIT_EXCEEDED` | Working as designed — 5/UTC day (`worker/quota-protocol.ts:13`) | `tests/worker/quota-harness.ts` |
| `SESSION_EXPIRED` / `SESSION_INVALID` | Cookie lifetime or HMAC rotation | `worker/index.test.ts` session cases |
| `TURNSTILE_FAILED` / `TURNSTILE_UNAVAILABLE` | Widget hostname mismatch, or Cloudflare outage | Phase 3 widget configuration |
| `UPSTREAM_RATE_LIMITED` | Free-tier provider limit, not a bug | Retry after the `retry-after` the envelope carries |
| `AI_CONFIGURATION_ERROR` | `OPENROUTER_FREE_MODELS` empty or a model delisted | `npm run ai:discover` |

3. **The reproduction ladder** — always climb from cheapest to most expensive, and stop at the first rung that reproduces:
   1. `npx vitest run --config vitest.worker.config.ts tests/worker/` — stubbed provider, all seven routes, free, seconds.
   2. `npm run ai:evaluate -- --models <exact deployed model>` — real model, no Worker, no quota, ~2 min.
   3. `npm run preview` with `.dev.vars` — real Worker locally.
   4. `npm run ai:canary` against staging — spends 2 of 5 daily attempts. Last resort.
4. **The "model delisted" procedure** — free models disappear without notice. `ai:discover` → `ai:evaluate` the replacement on all seven routes → Phase 4 config commit → full gate. This is the most likely real beta incident, so it is written out as steps, not left to be improvised.
5. **The rule this project keeps re-learning**, stated at the top: *"it passes on rerun" is evidence for a timing defect, not against one.* Never add a retry or raise a timeout to make a failure disappear.

- [ ] **Step 1: Write the runbook** with all five sections and the full 27-code table.
- [ ] **Step 2: Verify every command in it actually runs**

For each command quoted in the runbook, run it and confirm the exit status and observable output match what the runbook claims. A runbook with a command that does not work is worse than none.

- [ ] **Step 3: Verify every referenced path exists**

```bash
grep -oE '`[a-zA-Z0-9_./-]+\.(ts|mjs|tsx|json)`' docs/runbooks/ai-triage.md \
  | tr -d '`' | sort -u | while read -r file; do
    test -e "$file" || echo "MISSING: $file"
  done
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/ai-triage.md
git commit -m "docs: add the AI triage runbook for content-free debugging

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: Make a failure reportable

**Files:**
- Modify: `src/components/ai/AISuggestionPanel.tsx` (already references `requestId`)
- Test: `src/components/ai/AISuggestionPanel.test.tsx`
- Test: `e2e/offline-ai.spec.ts`

The runbook's intake block asks for an error code and request ID. That only works if the UI shows them. `AISuggestionPanel.tsx` already handles `requestId`; this task confirms the error state renders both, accessibly, on every AI surface a user can reach — and adds them where missing.

- [ ] **Step 1: Write the failing test**

Match the file's existing setup rather than the names below — `AISuggestionPanel.test.tsx` already mocks the AI client and already constructs `AIRequestError` (see its line ~232, `new AIRequestError("SESSION_REQUIRED", "Verify again.", 401)`). Reuse that mock and its render props; only the assertion below is new.

```tsx
it("shows the error code and request ID so a beta user can report it", async () => {
  requestSuggestion.mockRejectedValue(
    // constructor is (code, message, status, requestId, retryAfterSeconds)
    // — src/lib/ai/client.ts:19-25
    new AIRequestError(
      "UPSTREAM_INVALID_RESPONSE",
      "The assistant returned an unusable response.",
      502,
      "req_01HTEST",
    ),
  );
  render(<AISuggestionPanel task="slos" {...baseProps} />);
  await userEvent.click(screen.getByRole("button", { name: /suggest/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("UPSTREAM_INVALID_RESPONSE");
  expect(alert).toHaveTextContent("req_01HTEST");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/ai/AISuggestionPanel.test.tsx`

- [ ] **Step 3: Render the diagnostic pair in the error state**

Show the code and request ID inside the existing `role="alert"` region, in a `<dl>` or small print styled with `gold-ink` (`#7E6018`) — the decorative `gold` fails contrast for small text on parchment. Do not surface the raw upstream message.

- [ ] **Step 4: Confirm accessibility is unchanged**

Run: `npm run build && npx playwright test e2e/accessibility.spec.ts --project=chromium`
Expected: PASS. Accessibility must stay exactly `1.00`; e2e serves the built `out/`, so build first.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/AISuggestionPanel.tsx src/components/ai/AISuggestionPanel.test.tsx e2e/offline-ai.spec.ts
git commit -m "feat: surface the AI error code and request ID for beta reporting

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Workstream D — Release execution (human-gated, not agent work)

Do **not** restate `HANDOFF.md`'s "Required continuation sequence" — execute it. These are the deltas this plan introduces.

- [ ] **D1 — Phase 1, with the range corrected.** The pending security diff scan is configured `b446c76..274d428`; head will be several commits past `5eb6a29` once Workstreams A–C land. Re-target it at `b446c76..<current head>` before pressing **Start scan**. `HANDOFF.md`'s own note names `c83084f`, which is stale. Then the second, mandatory standard scan over the whole tracked commit. ~1–2 days including remediation. **Long pole — start this first, in parallel with everything else.**
- [ ] **D2 — Phase 2.** Cloudflare recheck, `release:gate --bootstrap`, `deploy:bootstrap`. Requires `CLOUDFLARE_ACCOUNT_ID`. Confirm mode-0600 `.release-evidence/local-gate.json` appears — it does not exist today, so its creation is the first proof the gate has ever completed.
- [ ] **D3 — Phase 3, now covering seven routes.** `ai:discover`, then `npm run ai:evaluate -- --models <up to four>`. **A candidate is eligible only if `pass.rate === 1`** — all seven tasks. Expect fewer eligible free models than before; that is the point. If no candidate passes all seven, do not lower the bar: widen discovery, or ship beta with the failing task's UI disabled and say so.
- [ ] **D4 — Phase 4.** Bind `APP_ORIGIN`, `AI_ENABLED=true`, and the two qualified model IDs in `wrangler.jsonc`; commit; diff-scan that commit; run the non-publishing full gate.
- [ ] **D5 — Phase 5.** `deploy:stage`, one human Turnstile session in a private window, then `release:verify:deployed` with the cookie read silently via `read -r -s`. The canary stays at exactly two requests.

---

## Verification

**Per task:** the TDD cycle in each task above — failing test, implementation, passing test, commit.

**Before any release phase:**

```bash
npm run verify        # ~8 min: audit → lint → types → coverage → worker → build → dry-run → smoke
```

**End-to-end proof the qualification gap is actually closed** — the single check that tells you this plan worked:

```bash
# 1. Every route qualified against the model you will deploy.
OPENROUTER_API_KEY=... npm run ai:evaluate -- --models <exact deployed model>
# Expect pass.rate === 1 and seven true values in pass.byTask. Exit code 0.

# 2. The rubric that produced that verdict agrees with the Worker.
npm run test:worker   # includes tests/worker/ai-eval-parity.test.ts

# 3. The full five-browser suite against the built output.
npm run build && npm run test:e2e:full

# 4. The gate seal exists and binds the exact commit.
npm run release:gate && ls -l .release-evidence/local-gate.json   # mode 0600
```

**Boundary check, from the repository root** (`/Users/laccd/code/calricula`, not the demo directory — both pathspecs are cwd-relative):

```bash
git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'   # must be empty
git ls-files 'calricula_pwa_demo/src/lib/**' | wc -l
```

**This plan changes that count.** Task A3 adds `src/lib/ai/eval-catalog-parity.test.ts`, taking the tracked total from **46 to 47**. Update the published figure in `AGENTS.md` (~line 100) and `HANDOFF.md` (lines 37 and 69) **in the same commit as A3** — those two documents publish the count as a provenance check, and a stale figure makes an agent running the documented check read a correct repository as broken. This exact drift already happened once (44 → 46, corrected at `7c7d97d`). Task A1's fixtures live in `scripts/` and do not affect the count; Task B1 removes no files.

---

## Sequencing and estimates

| # | Work | Effort | Blocked on |
|---|---|---|---|
| 1 | **D1** security scans — start immediately, runs in parallel | 1–2 days | Human presses Start scan |
| 2 | A1 → A2 → A3 → A4 (seven-route qualification) | ~1.5 days | Nothing |
| 3 | B1 (artifact decision) | 2h, or ~1 day if surfacing | Direction confirmed |
| 4 | C1 → C2 (runbook + reportable errors) | ~3h | Nothing |
| 5 | D2 → D5 (release phases) | 2 days | Credentials, Turnstile, one human session |

Workstreams A–C are agent-executable and independent of D1, so the security scan should be started **first** and left running. Realistic total: **4–5 working days** to a public beta URL, assuming the scans return clean and at least one free model passes all seven task gates. That is one day more than the release path alone, and it buys the guarantee that no AI feature reaching a beta user is unqualified.

**Risk to name now:** if no free model passes all seven — plausible, since `top-code` demands exact catalog titles and `content-outline` demands exact hour arithmetic — the honest options are to widen discovery beyond four candidates, or open the beta with the failing tasks' controls disabled and documented. Do not resolve it by loosening the rubric; the rubric is pinned to what the Worker will reject in production either way.
