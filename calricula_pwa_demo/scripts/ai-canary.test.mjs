import { describe, expect, it, vi } from 'vitest';

import {
  AiCanaryError,
  executeAiCanary,
} from './ai-canary.mjs';

const COOKIE_NAME = '__Host-calricula_ai_session';
const COOKIE_0 = `${COOKIE_NAME}=${'a'.repeat(64)}.${'b'.repeat(43)}`;
const COOKIE_1 = `${COOKIE_NAME}=${'c'.repeat(64)}.${'d'.repeat(43)}`;
const COOKIE_2 = `${COOKIE_NAME}=${'e'.repeat(64)}.${'f'.repeat(43)}`;
const GENERATED_SENTINEL = 'generated curriculum must stay private';
const BASE_URL = 'https://calricula-demo.example';

function jsonResponse(body, cookie = '') {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...(cookie
        ? {
            'set-cookie': `${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict`,
          }
        : {}),
    },
  });
}

function canaryFetch() {
  return vi.fn(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/api/health') {
      return jsonResponse({
        success: true,
        data: { aiEnabled: true, status: 'ok' },
      });
    }
    if (path === '/api/ai/session') {
      return jsonResponse(
        {
          success: true,
          data: { remainingDailyAttempts: 5 },
          requestId: 'session-request',
        },
        COOKIE_1,
      );
    }
    if (path === '/api/ai/chat') {
      return jsonResponse(
        {
          success: true,
          data: { message: GENERATED_SENTINEL },
          model: 'provider/chat:free',
          requestId: 'chat-request',
        },
        COOKIE_2,
      );
    }
    if (path === '/api/ai/slos') {
      return jsonResponse({
        success: true,
        data: { slos: [GENERATED_SENTINEL] },
        model: 'provider/structured:free',
        requestId: 'slos-request',
      });
    }
    throw new Error(`Unexpected path ${path}`);
  });
}

function calledPaths(fetchFn) {
  return fetchFn.mock.calls.map(
    ([input]) => new URL(String(input)).pathname,
  );
}

describe('production AI canary', () => {
  it('reuses a UI session cookie without calling the session endpoint', async () => {
    const fetchFn = canaryFetch();
    const evidence = await executeAiCanary({
      argv: ['--base-url', BASE_URL],
      environment: { CALRICULA_AI_SESSION_COOKIE: COOKIE_0 },
      fetchFn,
    });
    expect(calledPaths(fetchFn)).toEqual([
      '/api/health',
      '/api/ai/chat',
      '/api/ai/slos',
    ]);
    expect(fetchFn.mock.calls[1][1].headers.cookie).toBe(COOKIE_0);
    expect(fetchFn.mock.calls[2][1].headers.cookie).toBe(COOKIE_2);
    expect(evidence.session).toMatchObject({
      mode: 'existing-session-cookie',
      status: 'ok',
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(GENERATED_SENTINEL);
    expect(serialized).not.toContain(COOKIE_0);
  });

  it('uses a Turnstile token once to create the anonymous session', async () => {
    const fetchFn = canaryFetch();
    const token = '0.integration-token_value';
    const evidence = await executeAiCanary({
      argv: ['--base-url', BASE_URL],
      environment: { CALRICULA_TURNSTILE_TOKEN: token },
      fetchFn,
    });
    expect(calledPaths(fetchFn)).toEqual([
      '/api/health',
      '/api/ai/session',
      '/api/ai/chat',
      '/api/ai/slos',
    ]);
    expect(
      JSON.parse(fetchFn.mock.calls[1][1].body).token,
    ).toBe(token);
    expect(fetchFn.mock.calls[2][1].headers.cookie).toBe(COOKIE_1);
    expect(fetchFn.mock.calls[3][1].headers.cookie).toBe(COOKIE_2);
    expect(evidence.session.mode).toBe('turnstile-token');
    expect(JSON.stringify(evidence)).not.toContain(token);
  });

  it('fails closed before networking for ambiguous or malformed credentials', async () => {
    for (const environment of [
      {},
      {
        CALRICULA_AI_SESSION_COOKIE: COOKIE_0,
        CALRICULA_TURNSTILE_TOKEN: '0.both',
      },
      {
        CALRICULA_AI_SESSION_COOKIE: `${COOKIE_0}; Path=/`,
      },
      {
        CALRICULA_TURNSTILE_TOKEN: 'token\nheader-injection',
      },
    ]) {
      const fetchFn = vi.fn();
      await expect(
        executeAiCanary({
          argv: ['--base-url', BASE_URL],
          environment,
          fetchFn,
        }),
      ).rejects.toBeInstanceOf(AiCanaryError);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
});
