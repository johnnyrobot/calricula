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
    // The two NON-behavioral groups have now been fixed and are enforced at the
    // default `error` severity (no override needed): `react/no-unescaped-entities`
    // (JSX text entities escaped) and `@typescript-eslint/no-explicit-any`
    // (catch-clause `any`s narrowed to `unknown`/precise error shapes).
    //
    // The four remaining rules below are the React-Compiler hook rules. Fixing
    // them is a behavioral refactor (e.g. removing setState-in-effect) that
    // requires runtime test coverage we are deliberately not adding now, so they
    // stay as warnings to keep the lint gate usable. Promoting them to errors is
    // tracked as separate follow-up work.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default eslintConfig;
