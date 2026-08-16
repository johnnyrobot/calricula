import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { findSecrets } from './secret-scan.mjs';

export class AssetInventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssetInventoryError';
  }
}

const ALLOWED_ASSET_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.ico',
  '.js',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.woff2',
]);
const ALLOWED_EXTENSIONLESS_ASSETS = new Set([
  '.assetsignore',
  '_headers',
]);

export function isClassifiedDeployableAsset(relativePath) {
  return (
    ALLOWED_EXTENSIONLESS_ASSETS.has(relativePath) ||
    ALLOWED_ASSET_EXTENSIONS.has(
      path.posix.extname(relativePath).toLowerCase(),
    )
  );
}

export async function collectDeployableFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await collectDeployableFiles(absolutePath, relativePath)),
      );
      continue;
    }
    if (!entry.isFile()) {
      throw new AssetInventoryError(
        `Deployable asset inventory contains a non-regular entry: ${relativePath}`,
      );
    }
    files.push({
      relativePath,
      absolutePath,
      size: (await stat(absolutePath)).size,
    });
  }
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export async function scanFilesForSecrets(files) {
  const failures = [];
  for (const file of files) {
    const searchable = (await readFile(file.absolutePath)).toString('latin1');
    for (const name of findSecrets(searchable)) {
      failures.push(`${name} pattern found in ${file.relativePath}`);
    }
  }
  return failures;
}
