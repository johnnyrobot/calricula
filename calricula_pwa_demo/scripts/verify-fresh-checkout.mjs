import { spawn } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  readdir,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { computeReleaseFingerprint } from './release-evidence.mjs';
import {
  computeArtifactFingerprint,
  sealPublicationPackage,
} from './release-state.mjs';
import { assertTrackedReleaseInputs } from './release-inputs.mjs';

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}.`));
    });
  });
}

function captureGit(args) {
  const child = spawn('git', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else {
        reject(
          new Error(
            `git ${args.join(' ')} failed: ${stderr.trim().slice(-500)}`,
          ),
        );
      }
    });
  });
}

async function extractRecordedTree(destination, repositoryRoot, prefix) {
  const pathspec = prefix.replace(/\/$/, '');
  const archiveArgs = ['archive', '--format=tar', 'HEAD'];
  if (pathspec) archiveArgs.push('--', pathspec);
  const archive = spawn('git', archiveArgs, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const segments = pathspec ? pathspec.split('/').filter(Boolean).length : 0;
  const extractArgs = ['-xf', '-', '-C', destination];
  if (segments > 0) {
    extractArgs.push('--strip-components', String(segments));
  }
  const extract = spawn('tar', extractArgs, {
    env: process.env,
    stdio: [archive.stdout, 'inherit', 'inherit'],
  });
  const results = await Promise.all([
    new Promise((resolve, reject) => {
      archive.once('error', reject);
      archive.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`git archive exited with code ${code ?? 1}.`)),
      );
    }),
    new Promise((resolve, reject) => {
      extract.once('error', reject);
      extract.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`tar exited with code ${code ?? 1}.`)),
      );
    }),
  ]);
  return results;
}

async function unlockTree(directory) {
  let entries;
  try {
    await chmod(directory, 0o700);
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await unlockTree(absolutePath);
      else await chmod(absolutePath, 0o600).catch(() => undefined);
    }),
  );
}

export async function verifyFreshCheckout() {
  const cwd = process.cwd();
  await assertTrackedReleaseInputs({ cwd });
  const [repositoryRoot, prefix, source, artifacts] = await Promise.all([
    captureGit(['rev-parse', '--show-toplevel']),
    captureGit(['rev-parse', '--show-prefix']),
    computeReleaseFingerprint({ cwd }),
    computeArtifactFingerprint({ cwd }),
  ]);
  const publication = await sealPublicationPackage({ cwd });
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-fresh-release-'),
  );
  try {
    await extractRecordedTree(temporary, repositoryRoot, prefix);
    await run('npm', ['ci'], { cwd: temporary });
    await run('npm', ['run', 'build'], { cwd: temporary });
    await run('npm', ['run', 'deploy:dry-run'], { cwd: temporary });
    const [freshSource, freshArtifacts] = await Promise.all([
      computeReleaseFingerprint({ cwd: temporary }),
      computeArtifactFingerprint({ cwd: temporary }),
    ]);
    const freshPublication = await sealPublicationPackage({
      cwd: temporary,
    });
    if (
      freshSource !== source ||
      freshArtifacts.fingerprint !== artifacts.fingerprint ||
      freshPublication.fingerprint !== publication.fingerprint
    ) {
      throw new Error(
        'The exact recorded commit did not reproduce the validated source, build, and publication fingerprints.',
      );
    }
    console.log(
      '[fresh-checkout] Exact recorded commit reproduced the source, build, and sealed publication package.',
    );
  } finally {
    await unlockTree(temporary);
    await rm(temporary, { force: true, recursive: true });
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  verifyFreshCheckout().catch((error) => {
    console.error(
      `[fresh-checkout] ${
        error instanceof Error ? error.message : 'Verification failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
