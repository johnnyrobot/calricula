import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(projectDirectory, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./scripts/vitest.setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'scripts/**/*.test.mjs',
    ],
    exclude: [
      'worker/**',
      'e2e/**',
      'node_modules/**',
      '.next/**',
      'out/**',
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/app/manifest.ts',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
        'src/lib/data/repository.ts': {
          lines: 90,
          branches: 85,
        },
        'src/lib/ai/client.ts': {
          lines: 90,
          branches: 85,
        },
        'src/lib/ai/session.ts': {
          lines: 90,
          branches: 85,
        },
        'src/components/approvals/workflow.ts': {
          lines: 90,
          branches: 85,
        },
      },
    },
  },
});
