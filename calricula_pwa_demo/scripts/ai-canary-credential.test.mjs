import { describe, expect, it } from 'vitest';

import {
  AI_SESSION_COOKIE_NAME,
  AiCanaryCredentialError,
  resolveAiCanaryCredential,
} from './ai-canary-credential.mjs';

const COOKIE = `${AI_SESSION_COOKIE_NAME}=${'a'.repeat(64)}.${'b'.repeat(43)}`;

describe('AI canary credentials', () => {
  it('accepts one fresh Turnstile token', () => {
    expect(
      resolveAiCanaryCredential({
        CALRICULA_TURNSTILE_TOKEN: '0.test-token_value',
      }),
    ).toEqual({
      kind: 'turnstile-token',
      value: '0.test-token_value',
    });
  });

  it('accepts only the exact signed session-cookie pair', () => {
    expect(
      resolveAiCanaryCredential({
        CALRICULA_AI_SESSION_COOKIE: COOKIE,
      }),
    ).toEqual({
      kind: 'existing-session-cookie',
      value: COOKIE,
    });
    expect(() =>
      resolveAiCanaryCredential({
        CALRICULA_AI_SESSION_COOKIE: `${COOKIE}; Path=/; HttpOnly`,
      }),
    ).toThrow(AiCanaryCredentialError);
    expect(() =>
      resolveAiCanaryCredential({
        CALRICULA_AI_SESSION_COOKIE: COOKIE.replace(
          AI_SESSION_COOKIE_NAME,
          'wrong_cookie',
        ),
      }),
    ).toThrow(AiCanaryCredentialError);
  });

  it('rejects missing, ambiguous, and newline-bearing credentials', () => {
    expect(() => resolveAiCanaryCredential({})).toThrow(
      'exactly one AI canary credential',
    );
    expect(() =>
      resolveAiCanaryCredential({
        CALRICULA_AI_SESSION_COOKIE: COOKIE,
        CALRICULA_TURNSTILE_TOKEN: 'fresh-token',
      }),
    ).toThrow('not both');
    expect(() =>
      resolveAiCanaryCredential({
        CALRICULA_TURNSTILE_TOKEN: 'token\nheader-injection',
      }),
    ).toThrow('invalid format');
  });
});
