import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AssetInventoryError,
  collectDeployableFiles,
  isClassifiedDeployableAsset,
  scanFilesForSecrets,
} from './static-asset-validation.mjs';

const directories = [];
const execute = promisify(execFile);
const LEAKED_SECRET = '-----BEGIN OPENSSH PRIVATE KEY-----';

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-static-assets-'),
  );
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('static asset publication inventory', () => {
  it.each([
    'private.pem',
    'environment',
    'renamed.txt',
    'renamed.unknown',
  ])(
    'scans secret-like text in %s instead of trusting its extension',
    async (name) => {
      const directory = await fixture();
      await writeFile(path.join(directory, name), LEAKED_SECRET);
      const files = await collectDeployableFiles(directory);
      expect(await scanFilesForSecrets(files)).toEqual([
        `private key block pattern found in ${name}`,
      ]);
    },
  );

  it.each([
    ['icon.png', [0x89, 0x50, 0x4e, 0x47]],
    ['favicon.ico', [0x00, 0x00, 0x01, 0x00]],
    ['font.woff2', [0x77, 0x4f, 0x46, 0x32]],
  ])(
    'scans %s with byte-preserving matching',
    async (name, header) => {
      const directory = await fixture();
      await writeFile(
        path.join(directory, name),
        Buffer.concat([
          Buffer.from(header),
          Buffer.from(LEAKED_SECRET, 'ascii'),
        ]),
      );
      const files = await collectDeployableFiles(directory);
      expect(await scanFilesForSecrets(files)).toHaveLength(1);
    },
  );

  it('rejects symlinks and never silently omits a deployable entry', async () => {
    const directory = await fixture();
    const target = path.join(directory, 'target.txt');
    await writeFile(target, 'safe');
    await symlink(target, path.join(directory, 'alias.txt'));
    await expect(collectDeployableFiles(directory)).rejects.toBeInstanceOf(
      AssetInventoryError,
    );
  });

  it('recursively inventories every regular file', async () => {
    const directory = await fixture();
    await mkdir(path.join(directory, 'nested'));
    await writeFile(path.join(directory, 'root.txt'), 'safe');
    await writeFile(path.join(directory, 'nested', 'font.woff2'), 'safe');
    const files = await collectDeployableFiles(directory);
    expect(files.map((file) => file.relativePath).sort()).toEqual([
      'nested/font.woff2',
      'root.txt',
    ]);
  });

  it('rejects special filesystem entries', async () => {
    const directory = await fixture();
    await execute('mkfifo', [path.join(directory, 'named-pipe')]);
    await expect(collectDeployableFiles(directory)).rejects.toBeInstanceOf(
      AssetInventoryError,
    );
  });

  it('classifies only the explicit release asset formats', () => {
    expect(isClassifiedDeployableAsset('icons/favicon.ico')).toBe(true);
    expect(isClassifiedDeployableAsset('fonts/demo.woff2')).toBe(true);
    expect(isClassifiedDeployableAsset('_headers')).toBe(true);
    expect(isClassifiedDeployableAsset('renamed.unknown')).toBe(false);
    expect(isClassifiedDeployableAsset('payload')).toBe(false);
  });
});
import { execFile } from 'node:child_process';
