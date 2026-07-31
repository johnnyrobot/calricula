import { describe, expect, it } from 'vitest';

import { STATIC_EXPORT_CSP } from './serve-static-export.mjs';

describe('static export E2E server', () => {
  it('permits the inline Next.js bootstrap used by the production policy', () => {
    expect(STATIC_EXPORT_CSP).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    );
    expect(STATIC_EXPORT_CSP).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(STATIC_EXPORT_CSP).toContain("object-src 'none'");
    expect(STATIC_EXPORT_CSP).toContain("frame-ancestors 'none'");
  });
});
