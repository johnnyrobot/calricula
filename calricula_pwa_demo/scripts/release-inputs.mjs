import { execFile } from 'node:child_process';
import {
  lstat,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { childEnvironment } from './child-environment.mjs';

const execute = promisify(execFile);

export const RELEASE_INPUT_ROOT_FILES = [
  '.assetsignore',
  '.env.example',
  '.gitignore',
  'README.md',
  'eslint.config.mjs',
  'lighthouse.thresholds.json',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'vitest.config.ts',
  'vitest.worker.config.ts',
  'wrangler.jsonc',
];

export const RELEASE_INPUT_DIRECTORIES = [
  'e2e',
  'public',
  'scripts',
  'shared',
  'src',
  'worker',
];

export class ReleaseInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseInputError';
  }
}

async function collectDirectory(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDirectory(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    } else {
      throw new ReleaseInputError(
        `Release input is not a regular file: ${relativePath}`,
      );
    }
  }
  return files;
}

export async function collectReleaseInputFiles(cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const files = [];
  for (const relativePath of RELEASE_INPUT_ROOT_FILES) {
    const absolutePath = path.join(root, relativePath);
    try {
      const file = await lstat(absolutePath);
      if (!file.isFile() || file.isSymbolicLink()) {
        throw new ReleaseInputError(
          `Release input is not a regular file: ${relativePath}`,
        );
      }
      files.push({ absolutePath, relativePath });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      throw new ReleaseInputError(
        `Required release input is missing: ${relativePath}`,
      );
    }
  }
  for (const directory of RELEASE_INPUT_DIRECTORIES) {
    files.push(
      ...(await collectDirectory(path.join(root, directory), directory)),
    );
  }
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function gitOutput(cwd, args, run) {
  try {
    const { stdout } = await run('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      // git is a third-party child like any other and receives no release
      // secret. Omitting `env` entirely would inherit all of process.env,
      // which is how this call site sat outside childEnvironment() until now.
      env: childEnvironment(),
    });
    return stdout;
  } catch {
    throw new ReleaseInputError(
      `Could not verify release inputs with git ${args.join(' ')}.`,
    );
  }
}

export async function assertTrackedReleaseInputs(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const run = options.execute ?? execute;
  const [files, prefixOutput, topLevelOutput] = await Promise.all([
    collectReleaseInputFiles(cwd),
    gitOutput(cwd, ['rev-parse', '--show-prefix'], run),
    gitOutput(cwd, ['rev-parse', '--show-toplevel'], run),
  ]);
  const prefix = prefixOutput.trim().replace(/\\/g, '/');
  const treeOutput = await gitOutput(
    topLevelOutput.trim(),
    ['ls-tree', '-r', '-z', '--name-only', 'HEAD'],
    run,
  );
  const tracked = new Set(treeOutput.split('\0').filter(Boolean));
  const missing = files
    .map((file) => `${prefix}${file.relativePath}`)
    .filter((relativePath) => !tracked.has(relativePath));
  if (missing.length > 0) {
    throw new ReleaseInputError(
      `Release inputs are absent from the recorded Git tree: ${missing
        .slice(0, 10)
        .join(', ')}`,
    );
  }
  return {
    prefix,
    files: files.length,
    missing,
  };
}
