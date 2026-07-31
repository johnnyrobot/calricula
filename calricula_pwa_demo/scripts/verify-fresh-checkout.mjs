import { spawn } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
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
import {
  assertTrackedReleaseInputs,
  collectReleaseInputFiles,
} from './release-inputs.mjs';

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
  const [repositoryRoot, prefix, source] = await Promise.all([
    captureGit(['rev-parse', '--show-toplevel']),
    captureGit(['rev-parse', '--show-prefix']),
    computeReleaseFingerprint({ cwd }),
  ]);
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-fresh-release-'),
  );
  const canonicalCheckout = path.join(temporary, 'checkout');
  try {
    await mkdir(canonicalCheckout, { mode: 0o700 });
    for (const file of await collectReleaseInputFiles(cwd)) {
      const destination = path.join(
        canonicalCheckout,
        file.relativePath,
      );
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file.absolutePath, destination, {
        errorOnExist: true,
        force: false,
      });
    }
    await run('npm', ['ci'], { cwd: canonicalCheckout });
    await run('npm', ['run', 'build'], { cwd: canonicalCheckout });
    await run('npm', ['run', 'deploy:dry-run'], {
      cwd: canonicalCheckout,
    });
    const filesystemSource = await computeReleaseFingerprint({
      cwd: canonicalCheckout,
    });
    const filesystemPublication = await sealPublicationPackage({
      cwd: canonicalCheckout,
    });
    await unlockTree(canonicalCheckout);
    await rm(canonicalCheckout, { force: true, recursive: true });
    await mkdir(canonicalCheckout, { mode: 0o700 });

    await extractRecordedTree(
      canonicalCheckout,
      repositoryRoot,
      prefix,
    );
    await run('npm', ['ci'], { cwd: canonicalCheckout });
    await run('npm', ['run', 'build'], { cwd: canonicalCheckout });
    await run('npm', ['run', 'deploy:dry-run'], {
      cwd: canonicalCheckout,
    });
    const [freshSource, freshArtifacts] = await Promise.all([
      computeReleaseFingerprint({ cwd: canonicalCheckout }),
      computeArtifactFingerprint({ cwd: canonicalCheckout }),
    ]);
    const freshPublication = await sealPublicationPackage({
      cwd: canonicalCheckout,
    });
    const mismatches = [
      ...(freshSource !== source ? ['recorded source'] : []),
      ...(filesystemSource !== source ? ['filesystem source'] : []),
      ...(freshPublication.fingerprint !==
      filesystemPublication.fingerprint
        ? ['publication package']
        : []),
    ];
    if (mismatches.length > 0) {
      throw new Error(
        `The exact recorded commit did not reproduce: ${mismatches.join(
          ', ',
        )}.`,
      );
    }
    for (const relativePath of [
      'out',
      path.join('.wrangler', 'dry-run'),
    ]) {
      const destination = path.join(cwd, relativePath);
      await rm(destination, { force: true, recursive: true });
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(canonicalCheckout, relativePath), destination, {
        errorOnExist: true,
        force: false,
        recursive: true,
      });
    }
    const copiedArtifacts = await computeArtifactFingerprint({ cwd });
    const copiedPublication = await sealPublicationPackage({ cwd });
    if (
      copiedArtifacts.fingerprint !== freshArtifacts.fingerprint ||
      copiedPublication.fingerprint !== freshPublication.fingerprint
    ) {
      throw new Error(
        'The verified exact-commit build changed while it was copied into the release workspace.',
      );
    }
    console.log(
      '[fresh-checkout] Filesystem source and exact Git commit reproduced at one canonical path; the verified build and sealed publication package were copied into the release workspace unchanged.',
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
