import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseInputError,
  RELEASE_INPUT_ROOT_FILES,
  assertTrackedReleaseInputs,
  collectReleaseInputFiles,
} from './release-inputs.mjs';

const execute = promisify(execFile);
const directories = [];

async function git(cwd, ...args) {
  await execute('git', args, { cwd });
}

async function createProject({ nested = true } = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-inputs-'),
  );
  directories.push(root);
  const cwd = nested ? path.join(root, 'demo') : root;
  await mkdir(cwd, { recursive: true });
  for (const directory of ['e2e', 'public', 'scripts', 'src/lib', 'worker']) {
    await mkdir(path.join(cwd, directory), { recursive: true });
    await writeFile(path.join(cwd, directory, '.keep'), directory);
  }
  for (const relativePath of RELEASE_INPUT_ROOT_FILES) {
    await writeFile(path.join(cwd, relativePath), `${relativePath}\n`);
  }
  await writeFile(path.join(root, '.gitignore'), 'lib/\n');
  await git(root, 'init', '-q');
  await git(root, 'config', 'user.name', 'Calricula Test');
  await git(root, 'config', 'user.email', 'noreply@anthropic.com');
  await git(root, 'add', '-A');
  await git(root, 'commit', '-qm', 'fixture');
  return { cwd, root };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('release input provenance', () => {
  it('rejects a runtime input ignored by a parent lib rule', async () => {
    const { cwd } = await createProject();
    await expect(assertTrackedReleaseInputs({ cwd })).rejects.toThrow(
      'Release inputs are absent from the recorded Git tree',
    );
  });

  it('accepts the same nested project after src/lib is re-included and committed', async () => {
    const { cwd, root } = await createProject();
    await writeFile(
      path.join(cwd, '.gitignore'),
      '!src/lib/\n!src/lib/**\n',
    );
    await git(root, 'add', '-A');
    await git(root, 'commit', '-qm', 'track runtime');
    await expect(assertTrackedReleaseInputs({ cwd })).resolves.toMatchObject({
      missing: [],
    });
  });

  it('supports a repository-root project with an empty Git prefix', async () => {
    const { cwd, root } = await createProject({ nested: false });
    await writeFile(
      path.join(cwd, '.gitignore'),
      'lib/\n!src/lib/\n!src/lib/**\n',
    );
    await git(root, 'add', '-A');
    await git(root, 'commit', '-qm', 'track root runtime');
    await expect(assertTrackedReleaseInputs({ cwd })).resolves.toMatchObject({
      prefix: '',
    });
  });

  it('rejects symlinks under a release input root', async () => {
    const { cwd } = await createProject();
    await symlink(
      path.join(cwd, 'worker', '.keep'),
      path.join(cwd, 'worker', 'alias.ts'),
    );
    await expect(collectReleaseInputFiles(cwd)).rejects.toBeInstanceOf(
      ReleaseInputError,
    );
  });

  it('rejects a missing canonical root input', async () => {
    const { cwd } = await createProject();
    await unlink(path.join(cwd, 'package.json'));
    await expect(collectReleaseInputFiles(cwd)).rejects.toThrow(
      'Required release input is missing: package.json',
    );
  });

  it('treats path casing as part of the recorded Git identity', async () => {
    const { cwd, root } = await createProject();
    await writeFile(
      path.join(cwd, '.gitignore'),
      '!src/lib/\n!src/lib/**\n',
    );
    await git(root, 'add', '-A');
    await git(root, 'commit', '-qm', 'track runtime');
    await rename(
      path.join(cwd, 'worker', '.keep'),
      path.join(cwd, 'worker', '.KEEP'),
    );
    await expect(assertTrackedReleaseInputs({ cwd })).rejects.toThrow(
      'worker/.KEEP',
    );
  });
});
