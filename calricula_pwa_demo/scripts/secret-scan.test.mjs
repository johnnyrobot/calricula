import { describe, expect, it } from 'vitest';

import { findSecrets } from './secret-scan.mjs';

const OPENROUTER_KEY = `sk-or-v1-${'a'.repeat(20)}`;
const ASSIGNED_SECRET = 'TURNSTILE_SECRET_KEY="0x4AAAAAABbCcDdEeFfGgHhIi"';
const PRIVATE_KEY_BLOCK = '-----BEGIN OPENSSH PRIVATE KEY-----';

describe('secret leak scanning', () => {
  it('names an OpenRouter API key embedded in publishable bytes', () => {
    expect(
      findSecrets(`globalThis.config={endpoint:"${OPENROUTER_KEY}"};`),
    ).toEqual(['OpenRouter API key']);
  });

  it('names every recognizable secret shape carried by one artifact', () => {
    expect(
      findSecrets(
        [
          `const key="${OPENROUTER_KEY}";`,
          `const env={${ASSIGNED_SECRET}};`,
          `const pem="${PRIVATE_KEY_BLOCK}";`,
        ].join('\n'),
      ),
    ).toEqual([
      'OpenRouter API key',
      'assigned server-side AI secret',
      'private key block',
    ]);
  });

  it.each([
    ['a bound secret the Worker only reads', 'await verify(env.TURNSTILE_SECRET_KEY, token);'],
    ['a minified binding destructure', 'const{TURNSTILE_SECRET_KEY:e,APP_ORIGIN:t}=n;'],
    ['a public site key', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x4AAAAAABbCcDdEeFfGgHhIi"'],
    ['a value too short to be a key', 'const key="sk-or-v1-abcdef";'],
  ])('reports no finding for %s', (_description, text) => {
    expect(findSecrets(text)).toEqual([]);
  });

  it('reports the same findings however often an artifact is scanned', () => {
    const text = `const key="${OPENROUTER_KEY}";`;
    expect(findSecrets(text)).toEqual(findSecrets(text));
    expect(findSecrets(text)).toEqual(['OpenRouter API key']);
  });
});
