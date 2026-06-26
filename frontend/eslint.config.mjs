import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    // Non-application sources: Playwright e2e specs/fixtures (use Playwright's
    // `use` fixture, which trips React's rules-of-hooks), Jest mocks/helpers,
    // and build/tooling config files are out of scope for the Next app ruleset.
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'e2e/**',
      '__mocks__/**',
      'jest.config.js',
      'jest.setup.js',
      'playwright.config.ts',
      'test-sidebar.js',
      '*.config.js',
      '*.config.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // The Next.js 16 ESLint config newly enables the React Compiler rules from
    // eslint-plugin-react-hooks v6 and several stricter rules that the project
    // never enforced before (it previously shipped without an ESLint config).
    //
    // All groups are now enforced at `error`:
    // - `react/no-unescaped-entities` and `@typescript-eslint/no-explicit-any`
    //   (non-behavioral, fixed in a prior PR);
    // - the four React-Compiler hook rules below. Every remaining site has been
    //   either fixed properly or annotated with a SCOPED, justified
    //   `eslint-disable-next-line` (manual data-fetch effects, external-store
    //   syncs, post-mount flags, prop-driven resets, dynamic-icon selection,
    //   and the latest-ref pattern), so these are safe to enforce as errors.
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/immutability': 'error',
    },
  },
];

export default eslintConfig;
