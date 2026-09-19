import { describe, expect, it, vi } from 'vitest';

import { EVAL_FIXTURES } from './ai-eval-fixtures.mjs';
import { EVAL_SAMPLES } from './ai-eval-samples.mjs';
import {
  EvaluationConfigurationError,
  FIXTURES_PER_CANDIDATE,
  MAX_CANDIDATES,
  MAX_GENERATION_REQUESTS,
  MINIMUM_CONTEXT_LENGTH,
  REQUEST_SPACING_MS,
  evaluateCandidates,
  parseCandidateModels,
  runCli,
} from './ai-evaluate.mjs';

const MODEL = 'example/curriculum-model:free';
const SECOND_MODEL = 'example/second-model:free';
const TASKS = EVAL_FIXTURES.map((fixture) => fixture.task);
const STRUCTURED_TASKS = EVAL_FIXTURES.filter(
  (fixture) => fixture.kind === 'structured',
).map((fixture) => fixture.task);

function modelMetadata(id) {
  return {
    id,
    context_length: MINIMUM_CONTEXT_LENGTH,
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    pricing: {
      prompt: '0',
      completion: '0',
      request: '0',
    },
    supported_parameters: ['response_format', 'structured_outputs'],
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function completion(model, content, usage = { cost: 0 }) {
  return {
    model,
    choices: [{ message: { content } }],
    usage,
  };
}

/** `calricula_eval_content_outline` -> `content-outline` */
function taskFromSchemaName(name) {
  return name.replace(/^calricula_eval_/, '').replace(/_/g, '-');
}

function createHarness({
  candidates = [MODEL],
  metadataTransform = (metadata) => metadata,
  completionUsage = { cost: 0 },
  structuredStatus = 200,
  structuredBody,
  taskBodies = {},
} = {}) {
  const calls = [];
  const fetchFn = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });

    if (url.pathname.endsWith('/models/user')) {
      return jsonResponse({
        data: candidates.map((model) =>
          metadataTransform(modelMetadata(model)),
        ),
      });
    }
    if (url.pathname.endsWith('/models')) {
      return jsonResponse({
        data: candidates.map((model) =>
          metadataTransform(modelMetadata(model)),
        ),
      });
    }

    const body = JSON.parse(String(init.body));
    if (body.response_format) {
      if (structuredStatus !== 200) {
        return jsonResponse(
          structuredBody ?? {
            error: { message: 'SENSITIVE_UPSTREAM_FAILURE_BODY' },
          },
          structuredStatus,
        );
      }
      const task = taskFromSchemaName(body.response_format.json_schema.name);
      return jsonResponse(
        completion(
          body.model,
          taskBodies[task] ?? EVAL_SAMPLES[task].good,
          completionUsage,
        ),
      );
    }
    return jsonResponse(
      completion(
        body.model,
        taskBodies.chat ?? EVAL_SAMPLES.chat.good,
        completionUsage,
      ),
    );
  });
  return { calls, fetchFn };
}

function deterministicClock(step = 10) {
  let value = 0;
  return () => {
    value += step;
    return value;
  };
}

function generationCalls(harness) {
  return harness.calls.filter(({ url }) =>
    url.pathname.endsWith('/chat/completions'),
  );
}

describe('ai:evaluate candidate validation', () => {
  it('accepts only a unique bounded list of concrete exact free IDs', () => {
    expect(
      parseCandidateModels(`${MODEL}, ${SECOND_MODEL}, ${MODEL}`),
    ).toEqual([MODEL, SECOND_MODEL]);
    expect(() => parseCandidateModels('openrouter/free')).toThrow(
      EvaluationConfigurationError,
    );
    expect(() => parseCandidateModels('example/paid-model')).toThrow(
      EvaluationConfigurationError,
    );
    expect(() =>
      parseCandidateModels(
        Array.from(
          { length: MAX_CANDIDATES + 1 },
          (_, index) => `example/model-${index}:free`,
        ).join(','),
      ),
    ).toThrow(`At most ${MAX_CANDIDATES}`);
  });

  it('fails closed before generation when a candidate is absent from the live ZDR catalog', async () => {
    const harness = createHarness({ candidates: [] });

    await expect(
      evaluateCandidates({
        apiKey: 'test-only-key',
        candidates: [MODEL],
        fetchFn: harness.fetchFn,
        sleep: async () => {},
      }),
    ).rejects.toThrow(EvaluationConfigurationError);
    expect(harness.fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'missing request price',
      (metadata) => ({
        ...metadata,
        pricing: {
          prompt: '0',
          completion: '0',
        },
      }),
    ],
    [
      'undersized context window',
      (metadata) => ({
        ...metadata,
        context_length: MINIMUM_CONTEXT_LENGTH - 1,
      }),
    ],
    [
      'nonnumeric context window',
      (metadata) => ({
        ...metadata,
        context_length: String(MINIMUM_CONTEXT_LENGTH),
      }),
    ],
  ])('rejects a candidate with a %s', async (_label, metadataTransform) => {
    const harness = createHarness({ metadataTransform });

    await expect(
      evaluateCandidates({
        apiKey: 'test-only-key',
        candidates: [MODEL],
        fetchFn: harness.fetchFn,
        sleep: async () => {},
      }),
    ).rejects.toThrow(EvaluationConfigurationError);
    expect(generationCalls(harness)).toHaveLength(0);
  });
});

describe('ai:evaluate seven-route qualification', () => {
  it('budgets one request per task route for each candidate', () => {
    expect(FIXTURES_PER_CANDIDATE).toBe(7);
    expect(MAX_GENERATION_REQUESTS).toBe(28);
    expect(TASKS).toHaveLength(FIXTURES_PER_CANDIDATE);
  });

  it('makes one policy-restricted request per route and emits only pass, check, and latency data', async () => {
    const harness = createHarness();
    const results = await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(),
      sleep: async () => {},
    });

    expect(harness.fetchFn).toHaveBeenCalledTimes(2 + FIXTURES_PER_CANDIDATE);
    const bodies = generationCalls(harness).map(({ init }) =>
      JSON.parse(String(init.body)),
    );
    expect(bodies).toHaveLength(FIXTURES_PER_CANDIDATE);

    for (const body of bodies) {
      expect(body.model).toBe(MODEL);
      expect(body).not.toHaveProperty('models');
      expect(body.stream).toBe(false);
      expect(body.temperature).toBe(0);
      expect(body.provider).toMatchObject({
        allow_fallbacks: false,
        data_collection: 'deny',
        zdr: true,
        max_price: {
          prompt: 0,
          completion: 0,
          request: 0,
        },
      });
    }

    const [chatBody, ...structuredBodies] = bodies;
    expect(chatBody).not.toHaveProperty('response_format');
    expect(chatBody.provider).not.toHaveProperty('require_parameters');
    expect(structuredBodies).toHaveLength(STRUCTURED_TASKS.length);
    expect(
      structuredBodies.map((body) =>
        taskFromSchemaName(body.response_format.json_schema.name),
      ),
    ).toEqual(STRUCTURED_TASKS);
    for (const body of structuredBodies) {
      expect(body.provider.require_parameters).toBe(true);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.response_format.json_schema.schema.type).toBe('object');
    }

    expect(results).toHaveLength(1);
    expect(results[0].model).toBe(MODEL);
    expect(results[0].pass.rate).toBe(1);
    expect(results[0].pass.byTask).toEqual(
      Object.fromEntries(TASKS.map((task) => [task, true])),
    );
    expect(Object.keys(results[0].checks)).toEqual(TASKS);
    expect(results[0].checks.slos).toContainEqual({
      id: 'action-verb-start',
      workerEnforced: false,
      passed: true,
    });
    expect(Object.keys(results[0].latencyMs.byTask)).toEqual(TASKS);
    expect(results[0].latencyMs.mean).toBe(10);

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain('Measurable course outcomes');
    expect(serialized).not.toContain('Analyze a course outline');
    expect(serialized).not.toContain('Computer Information Systems');
    expect(serialized).not.toContain('test-only-key');
  });

  it('reports a per-task verdict and fails a candidate that misses one task', async () => {
    const harness = createHarness({
      taskBodies: {
        'content-outline': EVAL_SAMPLES['content-outline'].bad,
      },
    });

    const [result] = await evaluateCandidates({
      apiKey: 'test-only-key',
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
    expect(
      result.checks['content-outline'].find(
        (check) => check.id === 'positive-hours',
      ).passed,
    ).toBe(true);
  });

  it('paces generation requests to respect free-tier rate limits', async () => {
    const harness = createHarness();
    const sleep = vi.fn(async () => {});
    await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(),
      sleep,
    });
    expect(sleep).toHaveBeenCalledTimes(FIXTURES_PER_CANDIDATE - 1);
    expect(sleep).toHaveBeenCalledWith(REQUEST_SPACING_MS);
  });

  it('does not retry a failed fixture or expose its upstream body', async () => {
    const harness = createHarness({ structuredStatus: 500 });
    const results = await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(7),
      sleep: async () => {},
    });

    expect(harness.fetchFn).toHaveBeenCalledTimes(2 + FIXTURES_PER_CANDIDATE);
    expect(generationCalls(harness)).toHaveLength(FIXTURES_PER_CANDIDATE);
    expect(results[0].pass.byTask.chat).toBe(true);
    for (const task of STRUCTURED_TASKS) {
      expect(results[0].pass.byTask[task]).toBe(false);
    }
    expect(results[0].pass.rate).toBeCloseTo(1 / 7);
    expect(
      results[0].checks['top-code'].every((check) => !check.passed),
    ).toBe(true);
    expect(JSON.stringify(results)).not.toContain(
      'SENSITIVE_UPSTREAM_FAILURE_BODY',
    );
  });

  it('fails every route when cost details are nonnumeric', async () => {
    const harness = createHarness({
      completionUsage: {
        cost: 0,
        cost_details: { upstream_inference_cost: '0' },
      },
    });
    const results = await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(),
      sleep: async () => {},
    });

    expect(results[0].pass.rate).toBe(0);
    expect(results[0].pass.byTask).toEqual(
      Object.fromEntries(TASKS.map((task) => [task, false])),
    );
  });

  it('caps generation requests at seven routes for each of four candidates', async () => {
    const candidates = Array.from(
      { length: MAX_CANDIDATES },
      (_, index) => `example/model-${index}:free`,
    );
    const harness = createHarness({ candidates });

    await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates,
      fetchFn: harness.fetchFn,
      now: deterministicClock(),
      sleep: async () => {},
    });

    expect(generationCalls(harness)).toHaveLength(MAX_GENERATION_REQUESTS);
    expect(harness.fetchFn).toHaveBeenCalledTimes(2 + MAX_GENERATION_REQUESTS);
  });
});

describe('ai:evaluate command line', () => {
  it('never writes model-generated content to stdout', async () => {
    const harness = createHarness();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runCli(['--models', MODEL], {
        apiKey: 'test-only-key',
        fetchFn: harness.fetchFn,
        now: deterministicClock(),
        sleep: async () => {},
      });
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain(MODEL);
      expect(printed).toContain('hours-sum-exact');
      expect(printed).not.toContain('Measurable course outcomes');
      expect(printed).not.toContain('Analyze a course outline');
      expect(printed).not.toContain('Computer Information Systems');
      expect(printed).not.toContain('test-only-key');
    } finally {
      log.mockRestore();
    }
  });

  it('exits non-zero when any route fails for any candidate', async () => {
    const harness = createHarness({
      taskBodies: { 'top-code': EVAL_SAMPLES['top-code'].bad },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      await runCli(['--models', MODEL], {
        apiKey: 'test-only-key',
        fetchFn: harness.fetchFn,
        now: deterministicClock(),
        sleep: async () => {},
      });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      log.mockRestore();
    }
  });
});
