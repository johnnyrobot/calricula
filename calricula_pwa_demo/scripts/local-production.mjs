import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { childEnvironment } from './child-environment.mjs';

const DEFAULT_PORT = 4197;
const START_TIMEOUT_MS = 45_000;

function wranglerExecutable() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  );
}

function boundedLog(chunks) {
  const joined = chunks.join('');
  return joined.length > 4_000 ? joined.slice(-4_000) : joined;
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

async function waitUntilReady(origin, child, logs) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Local Wrangler exited before becoming ready.\n${boundedLog(logs)}`,
      );
    }
    try {
      const response = await fetch(`${origin}/api/health`, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Local Wrangler did not become ready within 45 seconds.\n${boundedLog(logs)}`,
  );
}

export async function withLocalProduction(callback, options = {}) {
  const configuredPort = Number(
    options.port ??
      process.env.CALRICULA_LOCAL_RELEASE_PORT ??
      DEFAULT_PORT,
  );
  if (
    !Number.isSafeInteger(configuredPort) ||
    configuredPort < 1_024 ||
    configuredPort > 65_535
  ) {
    throw new Error('Local release port must be an integer from 1024 to 65535.');
  }

  const origin = `http://127.0.0.1:${configuredPort}`;
  const child = spawn(
    wranglerExecutable(),
    [
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(configuredPort),
      '--inspector-port',
      String(configuredPort + 1_000),
      '--var',
      'AI_ENABLED:false',
      '--var',
      `APP_ORIGIN:${origin}`,
      '--log-level',
      'error',
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const logs = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      logs.push(String(chunk));
      if (logs.length > 40) logs.shift();
    });
  }

  try {
    await waitUntilReady(origin, child, logs);
    return await callback(origin);
  } finally {
    await stopProcess(child);
  }
}
