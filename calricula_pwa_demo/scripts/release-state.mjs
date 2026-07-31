import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { parseWranglerJsonc } from './wrangler-config.mjs';

export class ReleaseStateError extends Error {}

const GIT_RELEASE_SECRET_KEYS = [
  'AI_SESSION_HMAC_SECRET',
  'CALRICULA_AI_SESSION_COOKIE',
  'CALRICULA_SECRETS_FILE',
  'CALRICULA_TURNSTILE_TOKEN',
  'CF_ACCOUNT_ID',
  'CF_API_KEY',
  'CF_API_BASE_URL',
  'CF_API_TOKEN',
  'CF_EMAIL',
  'CLOUDFLARE_API_BASE_URL',
  'CLOUDFLARE_COMPLIANCE_REGION',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_EMAIL',
  'CLOUDFLARE_ENV',
  'OPENROUTER_API_KEY',
  'TURNSTILE_SECRET_KEY',
  'WRANGLER_API_ENVIRONMENT',
  'WRANGLER_CI_OVERRIDE_NAME',
  'WRANGLER_OUTPUT_FILE_PATH',
];

export function gitReleaseEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of GIT_RELEASE_SECRET_KEYS) {
    delete environment[name];
  }
  return environment;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function collectFiles(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath,
        size: (await stat(absolutePath)).size,
      });
    } else {
      throw new ReleaseStateError(
        `Release artifact is not a regular file: ${relativePath}`,
      );
    }
  }
  return files;
}

export async function computeArtifactFingerprint(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const files = [];
  for (const [directory, prefix] of [
    ['out', 'out'],
    [path.join('.wrangler', 'dry-run'), 'worker-dry-run'],
  ]) {
    try {
      files.push(
        ...(await collectFiles(path.join(cwd, directory), prefix)),
      );
    } catch {
      throw new ReleaseStateError(
        `Release artifact directory ${directory} is missing.`,
      );
    }
  }
  for (const relativePath of ['wrangler.jsonc']) {
    const absolutePath = path.join(cwd, relativePath);
    try {
      files.push({
        absolutePath,
        relativePath,
        size: (await stat(absolutePath)).size,
      });
    } catch {
      throw new ReleaseStateError(
        `Release artifact input ${relativePath} is missing.`,
      );
    }
  }
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(await readFile(file.absolutePath));
    hash.update('\0');
    totalBytes += file.size;
  }
  return {
    fingerprint: `sha256:${hash.digest('hex')}`,
    files: files.length,
    totalBytes,
  };
}

async function publicationFiles(directory) {
  const files = [];
  for (const [child, prefix] of [
    ['worker.js', 'worker.js'],
    ['wrangler.jsonc', 'wrangler.jsonc'],
  ]) {
    const absolutePath = path.join(directory, child);
    const file = await lstat(absolutePath);
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new ReleaseStateError(
        `Sealed publication input is not a regular file: ${child}`,
      );
    }
    files.push({
      absolutePath,
      relativePath: prefix,
      size: file.size,
    });
  }
  files.push(...(await collectFiles(path.join(directory, 'out'), 'out')));
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function computePublicationFingerprint(directory) {
  const files = await publicationFiles(directory);
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(await readFile(file.absolutePath));
    hash.update('\0');
    totalBytes += file.size;
  }
  return {
    fingerprint: `sha256:${hash.digest('hex')}`,
    files: files.length,
    totalBytes,
  };
}

async function makeReadOnly(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await makeReadOnly(absolutePath);
      await chmod(absolutePath, 0o500);
    } else if (entry.isFile()) {
      await chmod(absolutePath, 0o400);
    } else {
      throw new ReleaseStateError(
        `Sealed publication contains a non-regular entry: ${entry.name}`,
      );
    }
  }
}

export async function sealPublicationPackage(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sourceConfigPath = path.join(cwd, 'wrangler.jsonc');
  const sourceWorkerPath = path.join(
    cwd,
    '.wrangler',
    'dry-run',
    'index.js',
  );
  const sourceAssetsPath = path.join(cwd, 'out');
  let config;
  try {
    config = parseWranglerJsonc(
      await readFile(sourceConfigPath, 'utf8'),
    );
    const worker = await lstat(sourceWorkerPath);
    const assets = await lstat(sourceAssetsPath);
    if (
      !worker.isFile() ||
      worker.isSymbolicLink() ||
      !assets.isDirectory() ||
      assets.isSymbolicLink()
    ) {
      throw new Error('invalid publication inputs');
    }
  } catch {
    throw new ReleaseStateError(
      'Validated Worker, asset, and Wrangler inputs are required before sealing.',
    );
  }

  const root = path.join(cwd, '.release-artifacts', 'sealed');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(path.join(root, '.pending-'));
  try {
    await cp(sourceWorkerPath, path.join(temporary, 'worker.js'), {
      errorOnExist: true,
      force: false,
    });
    await cp(sourceAssetsPath, path.join(temporary, 'out'), {
      errorOnExist: true,
      force: false,
      recursive: true,
    });
    const sealedConfig = {
      ...config,
      main: './worker.js',
      assets: {
        ...config.assets,
        directory: './out',
      },
      upload_source_maps: false,
    };
    await writeFile(
      path.join(temporary, 'wrangler.jsonc'),
      `${JSON.stringify(sealedConfig, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    const publication = await computePublicationFingerprint(temporary);
    const destination = path.join(
      root,
      publication.fingerprint.slice('sha256:'.length),
    );
    const manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      publication,
      workerEntry: 'worker.js',
      assetsDirectory: 'out',
      configFile: 'wrangler.jsonc',
    };
    await writeFile(
      path.join(temporary, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    try {
      await rename(temporary, destination);
      await makeReadOnly(destination);
      await chmod(destination, 0o500);
    } catch (error) {
      if (error?.code !== 'EEXIST' && error?.code !== 'ENOTEMPTY') {
        throw error;
      }
      await rm(temporary, { force: true, recursive: true });
    }
    return verifySealedPublicationPackage(
      {
        ...publication,
        directory: destination,
      },
      { cwd },
    );
  } catch (error) {
    await rm(temporary, { force: true, recursive: true }).catch(
      () => undefined,
    );
    if (error instanceof ReleaseStateError) throw error;
    throw new ReleaseStateError('The publication package could not be sealed.');
  }
}

export async function verifySealedPublicationPackage(
  expected,
  options = {},
) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = await realpath(
    path.join(cwd, '.release-artifacts', 'sealed'),
  );
  const directory = await realpath(expected?.directory ?? '');
  if (
    directory === root ||
    !directory.startsWith(`${root}${path.sep}`) ||
    !/^sha256:[0-9a-f]{64}$/.test(expected?.fingerprint ?? '')
  ) {
    throw new ReleaseStateError(
      'Sealed publication metadata is invalid or outside the release directory.',
    );
  }
  const manifestStat = await lstat(path.join(directory, 'manifest.json'));
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new ReleaseStateError(
      'Sealed publication manifest is not a regular file.',
    );
  }
  const current = await computePublicationFingerprint(directory);
  if (
    current.fingerprint !== expected.fingerprint ||
    current.files !== expected.files ||
    current.totalBytes !== expected.totalBytes ||
    path.basename(directory) !==
      expected.fingerprint.slice('sha256:'.length)
  ) {
    throw new ReleaseStateError(
      'Sealed publication bytes no longer match release evidence.',
    );
  }
  return {
    ...current,
    directory,
    configPath: path.join(directory, 'wrangler.jsonc'),
    workerPath: path.join(directory, 'worker.js'),
    assetsPath: path.join(directory, 'out'),
  };
}

export function siteKeyDigest(siteKey) {
  if (typeof siteKey !== 'string' || !siteKey) return null;
  return `sha256:${createHash('sha256').update(siteKey).digest('hex')}`;
}

export function isRealTurnstileSiteKey(value) {
  return (
    typeof value === 'string' &&
    /^0x[A-Za-z0-9_-]{20,}$/.test(value.trim()) &&
    !/(?:replace|placeholder|example|test)/i.test(value)
  );
}

function parseDotenvValue(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=\\s*(.*)$`, 'm'),
  );
  if (!match) return '';
  const raw = match[1].trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw.replace(/\s+#.*$/, '').trim();
}

export async function resolveTurnstileSiteKey(
  environment = process.env,
  options = {},
) {
  if (environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
    return environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim();
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  for (const file of [
    '.env.production.local',
    '.env.local',
    '.env.production',
    '.env',
  ]) {
    try {
      const value = parseDotenvValue(
        await readFile(path.join(cwd, file), 'utf8'),
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      );
      if (value) return value;
    } catch {
      // Missing optional environment files are expected.
    }
  }
  return '';
}

export async function assertSiteKeyEmbedded(siteKey, options = {}) {
  if (!isRealTurnstileSiteKey(siteKey)) {
    throw new ReleaseStateError(
      'A real non-placeholder Turnstile site key is required.',
    );
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let files;
  try {
    files = await collectFiles(path.join(cwd, 'out'), 'out');
  } catch {
    throw new ReleaseStateError('The built out directory is missing.');
  }
  const publicFiles = files.filter((file) =>
    /\.(?:html|js|json|webmanifest)$/i.test(file.relativePath),
  );
  let matches = 0;
  for (const file of publicFiles) {
    const content = await readFile(file.absolutePath);
    if (content.includes(Buffer.from(siteKey))) matches += 1;
    if (
      content.includes(
        Buffer.from('replace-with-a-turnstile-site-key'),
      )
    ) {
      throw new ReleaseStateError(
        'The built output still contains the placeholder Turnstile site key.',
      );
    }
  }
  if (matches === 0) {
    throw new ReleaseStateError(
      'The expected Turnstile site key is not embedded in the built output.',
    );
  }
  return { digest: siteKeyDigest(siteKey), matches };
}

function parseReleaseSecrets(text) {
  let values;
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ReleaseStateError('Release secrets file is empty.');
  }
  if (trimmed.startsWith('{')) {
    try {
      values = JSON.parse(trimmed);
    } catch {
      throw new ReleaseStateError(
        'Release secrets file is not valid JSON.',
      );
    }
  } else {
    values = {};
    for (const line of text.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate || candidate.startsWith('#')) continue;
      const match = candidate.match(
        /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/,
      );
      if (!match || Object.hasOwn(values, match[1])) {
        throw new ReleaseStateError(
          'Release secrets file has an invalid or duplicate entry.',
        );
      }
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    }
  }
  if (!isRecord(values)) {
    throw new ReleaseStateError(
      'Release secrets file must contain a key-value object.',
    );
  }
  const required = [
    'AI_SESSION_HMAC_SECRET',
    'OPENROUTER_API_KEY',
    'TURNSTILE_SECRET_KEY',
  ];
  if (
    Object.keys(values).sort().join(',') !== required.sort().join(',')
  ) {
    throw new ReleaseStateError(
      'Release secrets file must contain exactly the three required Worker secrets.',
    );
  }
  if (
    typeof values.OPENROUTER_API_KEY !== 'string' ||
    !/^sk-or-v1-[A-Za-z0-9_-]{16,}$/.test(
      values.OPENROUTER_API_KEY
    ) ||
    typeof values.TURNSTILE_SECRET_KEY !== 'string' ||
    !/^0x[A-Za-z0-9_-]{20,}$/.test(
      values.TURNSTILE_SECRET_KEY,
    ) ||
    /(?:replace|placeholder|example)/i.test(
      values.TURNSTILE_SECRET_KEY,
    ) ||
    !validHmacSecret(values.AI_SESSION_HMAC_SECRET)
  ) {
    throw new ReleaseStateError(
      'Release secrets file contains an invalid or placeholder value.',
    );
  }
  return values;
}

export function validateReleaseSecrets(text) {
  parseReleaseSecrets(text);
  return true;
}

function validHmacSecret(value) {
  return (
    typeof value === 'string' &&
    (/^[A-Fa-f0-9]{64}$/.test(value) ||
      /^[A-Za-z0-9_-]{43,128}$/.test(value)) &&
    new Set(value).size >= 12 &&
    !/(?:replace|placeholder|example|test|password|secret)/i.test(
      value,
    )
  );
}

export async function resolveReleaseSecretsFile(
  environment = process.env,
  options = {},
) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const supplied = environment.CALRICULA_SECRETS_FILE?.trim() ?? '';
  if (!supplied || !path.isAbsolute(supplied)) {
    throw new ReleaseStateError(
      'Set CALRICULA_SECRETS_FILE to an absolute path outside the repository.',
    );
  }
  const resolved = path.resolve(supplied);
  let resolvedReal;
  let cwdReal;
  let suppliedStat;
  try {
    [resolvedReal, cwdReal, suppliedStat] = await Promise.all([
      realpath(resolved),
      realpath(cwd),
      lstat(resolved),
    ]);
  } catch {
    throw new ReleaseStateError(
      'CALRICULA_SECRETS_FILE could not be resolved.',
    );
  }
  if (
    suppliedStat.isSymbolicLink() ||
    resolvedReal === cwdReal ||
    resolvedReal.startsWith(`${cwdReal}${path.sep}`)
  ) {
    throw new ReleaseStateError(
      'CALRICULA_SECRETS_FILE must be a non-symlink outside the public source repository.',
    );
  }
  let fileStat;
  let content;
  try {
    [fileStat, content] = await Promise.all([
      stat(resolvedReal),
      readFile(resolvedReal, 'utf8'),
    ]);
  } catch {
    throw new ReleaseStateError(
      'CALRICULA_SECRETS_FILE could not be read.',
    );
  }
  if (
    !fileStat.isFile() ||
    fileStat.size > 64 * 1024 ||
    (fileStat.mode & 0o077) !== 0
  ) {
    throw new ReleaseStateError(
      'Release secrets file must be a private regular file no larger than 64 KiB.',
    );
  }
  const values = parseReleaseSecrets(content);
  return {
    path: resolvedReal,
    contentFingerprint: `sha256:${createHash('sha256')
      .update(content)
      .digest('hex')}`,
    openRouterCredentialFingerprint: `sha256:${createHash('sha256')
      .update(values.OPENROUTER_API_KEY)
      .digest('hex')}`,
  };
}

export async function sealReleaseSecretsFile(
  expected,
  options = {},
) {
  if (
    !expected?.path ||
    !expected.contentFingerprint ||
    !expected.openRouterCredentialFingerprint
  ) {
    throw new ReleaseStateError(
      'Validated release secrets metadata is required.',
    );
  }
  const current = await resolveReleaseSecretsFile(
    { CALRICULA_SECRETS_FILE: expected.path },
    options,
  );
  if (
    current.contentFingerprint !== expected.contentFingerprint ||
    current.openRouterCredentialFingerprint !==
      expected.openRouterCredentialFingerprint
  ) {
    throw new ReleaseStateError(
      'Release secrets file changed after preflight.',
    );
  }
  const content = await readFile(current.path, 'utf8');
  if (
    `sha256:${createHash('sha256').update(content).digest('hex')}` !==
    expected.contentFingerprint
  ) {
    throw new ReleaseStateError(
      'Release secrets file changed while it was being sealed.',
    );
  }
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-secrets-'),
  );
  await chmod(directory, 0o700);
  const sealedPath = path.join(directory, 'worker-secrets.env');
  await writeFile(sealedPath, content, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  return {
    path: sealedPath,
    async cleanup() {
      await rm(directory, { force: true, recursive: true });
    },
  };
}

async function capture(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? gitReleaseEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new ReleaseStateError(
      `${command} ${args.join(' ')} failed: ${stderr.trim().slice(-500)}`,
    );
  }
  return stdout.trim();
}

export async function inspectGitReleaseState(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const [repositoryRoot, commit, prefix, status] = await Promise.all([
    capture('git', ['rev-parse', '--show-toplevel'], { cwd }),
    capture('git', ['rev-parse', 'HEAD'], { cwd }),
    capture('git', ['rev-parse', '--show-prefix'], { cwd }),
    capture(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all', '--', '.'],
      { cwd },
    ),
  ]);
  if (status.length > 0) {
    return {
      clean: false,
      commit,
      repositoryRoot,
      tree: '',
    };
  }
  const cleanPrefix = prefix.replace(/\/$/, '');
  const tree = await capture(
    'git',
    [
      'rev-parse',
      cleanPrefix ? `HEAD:${cleanPrefix}` : 'HEAD^{tree}',
    ],
    { cwd },
  );
  return {
    clean: status.length === 0,
    commit,
    repositoryRoot,
    tree,
  };
}

export function requireCleanGitReleaseState(state) {
  if (
    !isRecord(state) ||
    state.clean !== true ||
    !/^[0-9a-f]{40,64}$/i.test(state.commit ?? '') ||
    !/^[0-9a-f]{40,64}$/i.test(state.tree ?? '')
  ) {
    throw new ReleaseStateError(
      'Release source must be committed and clean before sealing or publishing.',
    );
  }
  return state;
}
