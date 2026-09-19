/**
 * Tests for the server-only Logto helpers.
 *
 * These run with no LOGTO_* variables set, which is the "unconfigured" state
 * every auth route must fail closed on.
 */
import {
  LOGTO_API_RESOURCE,
  LOGTO_APPLICATIONX_RESOURCE,
  LOGTO_BASE_URL,
  LOGTO_CONFIGURED,
  logtoConfig,
  resolveResourceIndicator,
  secondsUntilExpiry,
} from '../logto';

/** Build an unsigned JWT-shaped string with the given payload. */
function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

describe('logto configuration', () => {
  it('is unconfigured (and exposes no config) when the LOGTO_* variables are unset', () => {
    expect(LOGTO_CONFIGURED).toBe(false);
    expect(logtoConfig).toBeNull();
    expect(LOGTO_API_RESOURCE).toBe('');
  });

  it('defaults the base URL to the dev origin without a trailing slash', () => {
    expect(LOGTO_BASE_URL).toBe('http://localhost:3001');
  });

  it('leaves the ApplicationX resource empty when unset', () => {
    expect(LOGTO_APPLICATIONX_RESOURCE).toBe('');
  });
});

describe('resolveResourceIndicator', () => {
  const indicators = {
    calricula: 'https://api.calricula.local',
    applicationx: 'https://api.applicationx.local',
  };

  it('defaults an absent resource key to calricula', () => {
    expect(resolveResourceIndicator(null, indicators)).toEqual({
      ok: true,
      indicator: indicators.calricula,
    });
  });

  it('resolves the applicationx key when both are configured', () => {
    expect(resolveResourceIndicator('applicationx', indicators)).toEqual({
      ok: true,
      indicator: indicators.applicationx,
    });
  });

  it('rejects an unrecognized resource key with 400-shaped error', () => {
    expect(resolveResourceIndicator('something-else', indicators)).toEqual({
      ok: false,
      error: 'unknown_resource',
    });
  });

  it('reports a recognized but unconfigured resource as not_configured', () => {
    expect(
      resolveResourceIndicator('applicationx', { ...indicators, applicationx: '' })
    ).toEqual({ ok: false, error: 'resource_not_configured' });
  });

  it('falls back to the module-level indicators when none are passed', () => {
    // No LOGTO_* variables are set in this test environment, so both are empty.
    expect(resolveResourceIndicator('calricula')).toEqual({
      ok: false,
      error: 'resource_not_configured',
    });
    expect(resolveResourceIndicator('applicationx')).toEqual({
      ok: false,
      error: 'resource_not_configured',
    });
  });
});

describe('secondsUntilExpiry', () => {
  const now = 1_700_000_000_000; // ms

  it('reads the exp claim without verifying the signature', () => {
    const token = jwt({ exp: now / 1000 + 900 });
    expect(secondsUntilExpiry(token, now)).toBe(900);
  });

  it('clamps an already-expired token to zero', () => {
    const token = jwt({ exp: now / 1000 - 10 });
    expect(secondsUntilExpiry(token, now)).toBe(0);
  });

  it('falls back for an opaque token, a malformed payload or a missing exp', () => {
    expect(secondsUntilExpiry('opaque-token', now)).toBe(300);
    expect(secondsUntilExpiry('a.!!!not-base64-json!!!.c', now)).toBe(300);
    expect(secondsUntilExpiry(jwt({ sub: 'u1' }), now)).toBe(300);
    expect(secondsUntilExpiry(jwt({ exp: 'soon' }), now)).toBe(300);
  });
});
