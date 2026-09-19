import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4177);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const localServerMode = process.env.CALRICULA_E2E_SERVER ?? "wrangler";
if (!["wrangler", "static"].includes(localServerMode)) {
  throw new Error("CALRICULA_E2E_SERVER must be wrangler or static.");
}
const localWorkerCommand = [
  'npx wrangler dev',
  '--ip 127.0.0.1',
  `--port ${port}`,
  // Keep browser tests deterministic even when the operator has a live
  // `.dev.vars`: the release suite must never spend OpenRouter quota.
  '--var AI_ENABLED:false',
  `--var APP_ORIGIN:${baseURL}`,
  '--log-level warn',
].join(' ');
const localStaticCommand = [
  "node scripts/serve-static-export.mjs",
  `--port ${port}`,
].join(" ");

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 15 Pro'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Serve the built static export and Worker together. This exercises
        // production routing, headers, service-worker registration, and the
        // fail-closed AI boundary instead of Next's development server.
        command:
          localServerMode === "static"
            ? localStaticCommand
            : localWorkerCommand,
        url: baseURL,
        reuseExistingServer:
          process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
        timeout: 120_000,
      },
});
