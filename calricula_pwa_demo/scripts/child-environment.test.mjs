import { describe, expect, it } from 'vitest';

import {
  CHILD_SECRET_KEYS,
  CLOUDFLARE_AUTH_KEYS,
  childEnvironment,
  wranglerChildEnvironment,
} from './child-environment.mjs';

function populatedSource() {
  const source = { PATH: '/usr/bin', HOME: '/home/release' };
  for (const name of CHILD_SECRET_KEYS) {
    source[name] = `value-for-${name}`;
  }
  return source;
}

describe('child process secret scrubbing', () => {
  it('removes every listed secret from a child environment', () => {
    const environment = childEnvironment(populatedSource());
    for (const name of CHILD_SECRET_KEYS) {
      expect(environment).not.toHaveProperty(name);
    }
  });

  it('passes unrelated variables through unchanged', () => {
    const environment = childEnvironment(populatedSource());
    expect(environment.PATH).toBe('/usr/bin');
    expect(environment.HOME).toBe('/home/release');
  });

  it('never mutates the source environment', () => {
    const source = populatedSource();
    childEnvironment(source);
    wranglerChildEnvironment(source);
    for (const name of CHILD_SECRET_KEYS) {
      expect(source[name]).toBe(`value-for-${name}`);
    }
  });

  it('lists the provider and session credentials that must never escape', () => {
    // Pinned so removing one is a deliberate edit rather than a silent drop.
    expect(CHILD_SECRET_KEYS).toEqual(
      expect.arrayContaining([
        'AI_SESSION_HMAC_SECRET',
        'CALRICULA_AI_SESSION_COOKIE',
        'CALRICULA_SECRETS_FILE',
        'CALRICULA_TURNSTILE_TOKEN',
        'OPENROUTER_API_KEY',
        'TURNSTILE_SECRET_KEY',
      ]),
    );
  });

  it('has no duplicate entries', () => {
    expect(new Set(CHILD_SECRET_KEYS).size).toBe(CHILD_SECRET_KEYS.length);
  });
});

describe('wrangler child environment', () => {
  it('keeps exactly the Cloudflare credentials Wrangler authenticates with', () => {
    const environment = wranglerChildEnvironment(populatedSource());
    for (const name of CLOUDFLARE_AUTH_KEYS) {
      expect(environment[name]).toBe(`value-for-${name}`);
    }
  });

  it('removes every other secret', () => {
    const environment = wranglerChildEnvironment(populatedSource());
    const retained = CHILD_SECRET_KEYS.filter((name) =>
      Object.hasOwn(environment, name),
    );
    expect(retained).toEqual(CLOUDFLARE_AUTH_KEYS);
  });

  it('still denies the provider credential and the AI session cookie', () => {
    const environment = wranglerChildEnvironment(populatedSource());
    expect(environment).not.toHaveProperty('OPENROUTER_API_KEY');
    expect(environment).not.toHaveProperty('CALRICULA_AI_SESSION_COOKIE');
    expect(environment).not.toHaveProperty('AI_SESSION_HMAC_SECRET');
  });

  it('differs from the ordinary child environment only by those credentials', () => {
    const source = populatedSource();
    const ordinary = childEnvironment(source);
    const wrangler = wranglerChildEnvironment(source);
    const extra = Object.keys(wrangler).filter(
      (name) => !Object.hasOwn(ordinary, name),
    );
    expect(extra.sort()).toEqual([...CLOUDFLARE_AUTH_KEYS].sort());
  });

  it('denies the Cloudflare overrides a guarded release refuses to honour', () => {
    const environment = wranglerChildEnvironment(populatedSource());
    expect(environment).not.toHaveProperty('CLOUDFLARE_API_BASE_URL');
    expect(environment).not.toHaveProperty('CLOUDFLARE_COMPLIANCE_REGION');
    expect(environment).not.toHaveProperty('CLOUDFLARE_ENV');
    expect(environment).not.toHaveProperty('WRANGLER_API_ENVIRONMENT');
    expect(environment).not.toHaveProperty('WRANGLER_CI_OVERRIDE_NAME');
  });
});
