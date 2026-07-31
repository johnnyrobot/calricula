import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseStateError,
  assertSiteKeyEmbedded,
  computeArtifactFingerprint,
  gitReleaseEnvironment,
  requireCleanGitReleaseState,
  resolveReleaseSecretsFile,
  sealPublicationPackage,
  sealReleaseSecretsFile,
  siteKeyDigest,
  validateReleaseSecrets,
  verifySealedPublicationPackage,
} from './release-state.mjs';

const temporaryDirectories = [];
const SITE_KEY = '0x4AAAAAAReleaseVerificationSiteKey';
const HMAC_SECRET =
  'A1b2C3d4E5f6G7h8I9j0K_lMnOpQrStUvWxYz-12345';

async function fixture() {
  const cwd = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-state-'),
  );
  temporaryDirectories.push(cwd);
  await mkdir(path.join(cwd, 'out'), { recursive: true });
  await mkdir(path.join(cwd, '.wrangler', 'dry-run'), {
    recursive: true,
  });
  await writeFile(
    path.join(cwd, 'out', 'app.js'),
    `globalThis.siteKey="${SITE_KEY}";`,
  );
  await writeFile(
    path.join(cwd, '.wrangler', 'dry-run', 'index.js'),
    'export default {};',
  );
  await writeFile(
    path.join(cwd, 'wrangler.jsonc'),
    '{"name":"calricula-demo"}',
  );
  return cwd;
}

async function unlockTree(directory) {
  let entries;
  try {
    await chmod(directory, 0o700);
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await unlockTree(absolutePath);
    } else {
      await chmod(absolutePath, 0o600);
    }
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await unlockTree(directory);
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe('release artifact state', () => {
  it('keeps release credentials out of Git child processes', () => {
    expect(
      gitReleaseEnvironment({
        CALRICULA_AI_SESSION_COOKIE: 'session-cookie',
        CALRICULA_TURNSTILE_TOKEN: 'turnstile-token',
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        OPENROUTER_API_KEY: 'provider-secret',
        SAFE_GIT_CONTEXT: 'kept',
      }),
    ).toEqual({ SAFE_GIT_CONTEXT: 'kept' });
  });

  it('changes the sealed fingerprint when deployable output is mutated', async () => {
    const cwd = await fixture();
    const before = await computeArtifactFingerprint({ cwd });
    await writeFile(
      path.join(cwd, 'out', 'app.js'),
      `globalThis.siteKey="${SITE_KEY}";globalThis.changed=true;`,
    );
    const after = await computeArtifactFingerprint({ cwd });
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.files).toBe(before.files);
  });

  it('seals exact Worker, asset, and effective configuration bytes', async () => {
    const cwd = await fixture();
    const sealed = await sealPublicationPackage({ cwd });
    const workerBefore = await readFile(sealed.workerPath, 'utf8');
    await writeFile(
      path.join(cwd, '.wrangler', 'dry-run', 'index.js'),
      'export default { changed: true };',
    );
    await writeFile(path.join(cwd, 'out', 'app.js'), 'changed');
    await writeFile(
      path.join(cwd, 'wrangler.jsonc'),
      '{"name":"changed"}',
    );
    await expect(
      verifySealedPublicationPackage(sealed, { cwd }),
    ).resolves.toMatchObject({
      fingerprint: sealed.fingerprint,
      files: sealed.files,
      totalBytes: sealed.totalBytes,
    });
    await expect(readFile(sealed.workerPath, 'utf8')).resolves.toBe(
      workerBefore,
    );
    const changed = await sealPublicationPackage({ cwd });
    expect(changed.fingerprint).not.toBe(sealed.fingerprint);
  });

  it.each([
    ['Worker', 'worker.js'],
    ['asset', path.join('out', 'app.js')],
    ['configuration', 'wrangler.jsonc'],
  ])('rejects changed sealed %s bytes', async (_kind, relativePath) => {
    const cwd = await fixture();
    const sealed = await sealPublicationPackage({ cwd });
    const target = path.join(sealed.directory, relativePath);
    await chmod(target, 0o600);
    await writeFile(target, 'tampered');
    await expect(
      verifySealedPublicationPackage(sealed, { cwd }),
    ).rejects.toThrow('no longer match');
  });

  it('proves the exact expected site key is compiled without exposing it', async () => {
    const cwd = await fixture();
    await expect(
      assertSiteKeyEmbedded(SITE_KEY, { cwd }),
    ).resolves.toEqual({
      digest: siteKeyDigest(SITE_KEY),
      matches: 1,
    });
    await expect(
      assertSiteKeyEmbedded(
        '0x4AAAAAADifferentReleaseSiteKey',
        { cwd },
      ),
    ).rejects.toThrow('not embedded');
  });

  it('requires a committed clean Git identity for a release seal', () => {
    expect(
      requireCleanGitReleaseState({
        clean: true,
        commit: 'a'.repeat(40),
        tree: 'b'.repeat(40),
      }),
    ).toMatchObject({ clean: true });
    expect(() =>
      requireCleanGitReleaseState({
        clean: false,
        commit: 'a'.repeat(40),
        tree: 'b'.repeat(40),
      }),
    ).toThrow(ReleaseStateError);
  });

  it('accepts only the exact three non-placeholder Worker secrets', () => {
    expect(
      validateReleaseSecrets(
        [
          `OPENROUTER_API_KEY=sk-or-v1-${'a'.repeat(20)}`,
          'TURNSTILE_SECRET_KEY=0x4AAAAAABbCcDdEeFfGgHhIi',
          `AI_SESSION_HMAC_SECRET=${HMAC_SECRET}`,
        ].join('\n'),
      ),
    ).toBe(true);
    expect(() =>
      validateReleaseSecrets(
        [
          `OPENROUTER_API_KEY=sk-or-v1-${'a'.repeat(20)}`,
          'TURNSTILE_SECRET_KEY=0x4AAAAAABbCcDdEeFfGgHhIi',
          'AI_SESSION_HMAC_SECRET=ccccccccccccccccccccccccccccccccccccccccccc',
          'UNEXPECTED_SECRET=no',
        ].join('\n'),
      ),
    ).toThrow('exactly the three');
  });

  it('seals the exact private secrets bytes and rejects pre-publish changes', async () => {
    const cwd = await fixture();
    const secretDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'calricula-secret-source-'),
    );
    temporaryDirectories.push(secretDirectory);
    const secretPath = path.join(secretDirectory, 'release.env');
    const content = [
      `OPENROUTER_API_KEY=sk-or-v1-${'a'.repeat(20)}`,
      'TURNSTILE_SECRET_KEY=0x4AAAAAABbCcDdEeFfGgHhIi',
      `AI_SESSION_HMAC_SECRET=${HMAC_SECRET}`,
    ].join('\n');
    await writeFile(secretPath, content, { mode: 0o600 });
    await chmod(secretPath, 0o600);
    const metadata = await resolveReleaseSecretsFile(
      { CALRICULA_SECRETS_FILE: secretPath },
      { cwd },
    );
    const sealed = await sealReleaseSecretsFile(metadata, { cwd });
    await expect(
      import('node:fs/promises').then(({ readFile }) =>
        readFile(sealed.path, 'utf8'),
      ),
    ).resolves.toBe(content);
    await sealed.cleanup();

    await writeFile(secretPath, `${content}\n# changed\n`, {
      mode: 0o600,
    });
    await expect(
      sealReleaseSecretsFile(metadata, { cwd }),
    ).rejects.toThrow('changed after preflight');
  });
});
