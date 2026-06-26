/** @type {import('jest').Config} */
const config = {
  // Use Next.js SWC compiler for faster tests
  testEnvironment: 'jsdom',

  // Setup files to run before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Module path aliases matching tsconfig
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Handle CSS imports (with CSS modules)
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    // Handle CSS imports (without CSS modules)
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Handle image imports
    '^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },

  // Transform TypeScript/JavaScript files
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
        },
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }],
  },

  // Always collect coverage so the global threshold gate below is enforced on
  // every `npm test` run (CI runs `npm test`), not only when `--coverage` is
  // passed explicitly.
  collectCoverage: true,

  // Files to collect coverage from
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts', // type-only declaration files
    '!src/**/index.ts', // barrel re-exports
    '!src/app/**/*.tsx', // Exclude Next.js pages for now
    '!src/**/__tests__/**', // test suites
    '!src/**/*.{test,spec}.{ts,tsx}', // test/spec files
    '!src/**/*.stories.{ts,tsx}', // Storybook stories
  ],

  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx}',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Coverage thresholds: a ratchet FLOOR set a couple points below the current
  // measured coverage so the gate can't flake but still fails the build if
  // coverage regresses.
  //
  // Measured overall coverage (2026-06, after high-risk-flow tests): statements
  // 14.71%, branches 10.26%, functions 12.61%, lines 15.05% (up from ~6%).
  //
  // NOTE: Jest SUBTRACTS files matched by the per-path keys below from the
  // `global` pool and applies `global` only to the *remaining* files. With the
  // four high-risk modules pinned separately, the remaining-files coverage
  // measures statements 7.09%, branches 6.25%, functions 6.20%, lines 7.29%, so
  // the global floor is set a couple points under that to ratchet without
  // flaking. The per-module pins below lock in the high coverage we added.
  // Raise these as coverage improves.
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 5,
      lines: 6,
      statements: 6,
    },
    // Pure compliance util (LMI data-age gating) — fully covered, keep it so.
    './src/utils/lmiValidation.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    // Form validation gating course/program creation.
    './src/components/form/useFormValidation.ts': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    // Security-critical auth state machine.
    './src/contexts/AuthContext.tsx': {
      branches: 55,
      functions: 60,
      lines: 70,
      statements: 70,
    },
    // API client: request building, auth header injection, error normalization.
    './src/lib/api.ts': {
      branches: 16,
      functions: 25,
      lines: 24,
      statements: 22,
    },
  },
};

module.exports = config;
