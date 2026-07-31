import { describe, expect, it, vi } from 'vitest';

import {
  EvaluationConfigurationError,
  MAX_CANDIDATES,
  MAX_GENERATION_REQUESTS,
  MINIMUM_CONTEXT_LENGTH,
  evaluateCandidates,
  parseCandidateModels,
} from './ai-evaluate.mjs';

const MODEL = 'example/curriculum-model:free';
const SECOND_MODEL = 'example/second-model:free';

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

function createHarness({
  candidates = [MODEL],
  metadataTransform = (metadata) => metadata,
  completionUsage = { cost: 0 },
  structuredStatus = 200,
  structuredBody,
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
      return jsonResponse(
        completion(
          body.model,
          JSON.stringify({
            slos: [
              'Analyze evidence used in a local curriculum review.',
              'Create measurable outcomes for a proposed course.',
            ],
          }),
          completionUsage,
        ),
      );
    }
    return jsonResponse(
      completion(
        body.model,
        'Measurable course outcomes give faculty shared evidence for consistent and transparent curriculum review decisions.',
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
      }),
    ).rejects.toThrow(EvaluationConfigurationError);
    expect(
      harness.calls.filter(({ url }) =>
        url.pathname.endsWith('/chat/completions'),
      ),
    ).toHaveLength(0);
  });
});

describe('ai:evaluate fixed fixtures', () => {
  it('makes two policy-restricted requests per candidate and emits only pass and latency data', async () => {
    const harness = createHarness();
    const results = await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(),
    });

    expect(harness.fetchFn).toHaveBeenCalledTimes(4);
    const generationCalls = harness.calls.filter(({ url }) =>
      url.pathname.endsWith('/chat/completions'),
    );
    expect(generationCalls).toHaveLength(2);

    const [plainBody, structuredBody] = generationCalls.map(({ init }) =>
      JSON.parse(String(init.body)),
    );
    for (const body of [plainBody, structuredBody]) {
      expect(body.model).toBe(MODEL);
      expect(body).not.toHaveProperty('models');
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
    expect(plainBody).not.toHaveProperty('response_format');
    expect(structuredBody.provider.require_parameters).toBe(true);
    expect(structuredBody.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['slos'],
        },
      },
    });

    expect(results).toEqual([
      {
        model: MODEL,
        pass: {
          plain: true,
          structured: true,
          rate: 1,
        },
        latencyMs: {
          plain: 10,
          structured: 10,
          mean: 10,
        },
      },
    ]);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain('Measurable course outcomes');
    expect(serialized).not.toContain('Analyze evidence');
    expect(serialized).not.toContain('test-only-key');
  });

  it('does not retry a failed fixture or expose its upstream body', async () => {
    const harness = createHarness({ structuredStatus: 500 });
    const results = await evaluateCandidates({
      apiKey: 'test-only-key',
      candidates: [MODEL],
      fetchFn: harness.fetchFn,
      now: deterministicClock(7),
    });

    expect(harness.fetchFn).toHaveBeenCalledTimes(4);
    expect(
      harness.calls.filter(({ url }) =>
        url.pathname.endsWith('/chat/completions'),
      ),
    ).toHaveLength(2);
    expect(results[0]).toMatchObject({
      model: MODEL,
      pass: {
        plain: true,
        structured: false,
        rate: 0.5,
      },
    });
    expect(JSON.stringify(results)).not.toContain(
      'SENSITIVE_UPSTREAM_FAILURE_BODY',
    );
  });

  it('fails a fixture when cost details are nonnumeric', async () => {
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
    });

    expect(results[0]?.pass).toEqual({
      plain: false,
      structured: false,
      rate: 0,
    });
  });

  it('caps generation requests at two fixtures for each of four candidates', async () => {
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
    });

    expect(
      harness.calls.filter(({ url }) =>
        url.pathname.endsWith('/chat/completions'),
      ),
    ).toHaveLength(MAX_GENERATION_REQUESTS);
    expect(harness.fetchFn).toHaveBeenCalledTimes(
      2 + MAX_GENERATION_REQUESTS,
    );
  });
});
