import { describe, expect, it } from 'vitest';

import {
  WranglerConfigError,
  parseWranglerJsonc,
} from './wrangler-config.mjs';

describe('Wrangler JSONC parser', () => {
  it('parses comments and trailing commas without treating comment text as config', () => {
    expect(
      parseWranglerJsonc(`{
        // "name": "comment-decoy",
        "name": "calricula-demo",
        "vars": {
          "URL": "https://example.test/path//kept",
        },
      }`),
    ).toEqual({
      name: 'calricula-demo',
      vars: { URL: 'https://example.test/path//kept' },
    });
  });

  it('rejects malformed or unterminated configuration', () => {
    expect(() => parseWranglerJsonc('[]')).toThrow(
      WranglerConfigError,
    );
    expect(() => parseWranglerJsonc('{"name":"unterminated}')).toThrow(
      WranglerConfigError,
    );
    expect(() => parseWranglerJsonc('{/* unterminated')).toThrow(
      WranglerConfigError,
    );
  });
});
