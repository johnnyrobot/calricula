import { execFile } from 'node:child_process';
import {
  mkdir,
  readdir,
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

import { CHILD_SECRET_KEYS } from './child-environment.mjs';
import {
  ReleaseInputError,
  RELEASE_INPUT_DIRECTORIES,
  RELEASE_INPUT_ROOT_FILES,
  assertTrackedReleaseInputs,
  collectReleaseInputFiles,
} from './release-inputs.mjs';

const execute = promisify(execFile);
const directories = [];

async function git(cwd, ...args) {
  await execute('git', args, { cwd });
}

/**
 * Directories at the demo root that deliberately are not release inputs.
 * Everything else holding source has to be enumerated, so adding a new one —
 * `shared/` was added and missed, which would have made
 * `verify-fresh-checkout` rebuild a tree with unresolved imports — fails here
 * instead of at release time.
 *
 * `tests/` is excluded because Worker unit tests are not a build input. That is
 * a deliberate exclusion, not an oversight: it does mean a change under
 * `tests/` leaves the source fingerprint unchanged.
 */
const NON_INPUT_DIRECTORIES = new Set([
  'coverage',
  'docs',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'tests',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

async function holdsSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await holdsSource(absolutePath)) return true;
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      return true;
    }
  }
  return false;
}

async function createProject({ nested = true } = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-inputs-'),
  );
  directories.push(root);
  const cwd = nested ? path.join(root, 'demo') : root;
  await mkdir(cwd, { recursive: true });
  for (const directory of [
    'e2e',
    'public',
    'scripts',
    'shared',
    'src/lib',
    'worker',
  ]) {
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

  it('denies release secrets to every git child it spawns', async () => {
    const { cwd, root } = await createProject();
    await writeFile(
      path.join(cwd, '.gitignore'),
      '!src/lib/\n!src/lib/**\n',
    );
    await git(root, 'add', '-A');
    await git(root, 'commit', '-qm', 'track runtime');

    const observed = [];
    const spy = (file, args, options) => {
      observed.push(options.env);
      return execute(file, args, options);
    };

    await assertTrackedReleaseInputs({ cwd, execute: spy });

    expect(observed.length).toBeGreaterThan(0);
    for (const environment of observed) {
      for (const name of CHILD_SECRET_KEYS) {
        expect(environment, `${name} must not reach git`).not.toHaveProperty(
          name,
        );
      }
      // Scrubbing must not cost git the environment it needs to run at all.
      expect(environment.PATH).toBe(process.env.PATH);
    }
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

describe('release input directory coverage', () => {
  it('enumerates every directory at the demo root that ships source', async () => {
    const demoRoot = path.resolve(import.meta.dirname, '..');
    const entries = await readdir(demoRoot, { withFileTypes: true });
    const shipsSource = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (NON_INPUT_DIRECTORIES.has(entry.name)) continue;
      if (await holdsSource(path.join(demoRoot, entry.name))) {
        shipsSource.push(entry.name);
      }
    }
    // A subset check, not equality: `public/` is a release input that ships
    // static assets and no source, so it legitimately never appears here.
    const unenumerated = shipsSource.filter(
      (name) => !RELEASE_INPUT_DIRECTORIES.includes(name),
    );
    expect(unenumerated).toEqual([]);
  });
});
