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
  // measured global coverage so the gate can't flake but still fails the build
  // if coverage regresses. Measured (2026-06): statements 6.07%, branches 5.72%,
  // functions 5.41%, lines 6.28%. Raise these as coverage improves.
  coverageThreshold: {
    global: {
      branches: 4,
      functions: 4,
      lines: 5,
      statements: 5,
    },
  },
};

module.exports = config;
