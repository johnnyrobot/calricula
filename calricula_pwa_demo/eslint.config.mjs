import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.wrangler/**',
      'out/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      '.release-artifacts/**',
      '.release-evidence/**',
      'test-results/**',
      'openrouter-llms-full.txt',
      'next-env.d.ts',
      'public/sw.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ['worker/**/*.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default eslintConfig;
