import { spawn } from 'node:child_process';
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  computeReleaseFingerprint,
  currentToolVersions,
} from './release-evidence.mjs';
import {
  assertSiteKeyEmbedded,
  computeArtifactFingerprint,
  inspectGitReleaseState,
  isRealTurnstileSiteKey,
  requireCleanGitReleaseState,
  resolveTurnstileSiteKey,
  sealPublicationPackage,
  siteKeyDigest,
} from './release-state.mjs';
import { assertTrackedReleaseInputs } from './release-inputs.mjs';

export const RELEASE_GATE_STEPS = [
  'audit:production',
  'lint',
  'typecheck',
  'test:coverage',
  'test:worker',
  'release:clean-generated',
  'build',
  'deploy:dry-run',
  'release:fresh-checkout',
  'test:e2e:full',
  'verify:production:local',
  'lighthouse:local',
  'release:evidence:predeploy',
];
export const BOOTSTRAP_RELEASE_GATE_STEPS =
  RELEASE_GATE_STEPS.filter(
    (step) => step !== 'release:evidence:predeploy',
  );
export const LOCAL_GATE_EVIDENCE_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'local-gate.json',
);
const RELEASE_CHILD_SECRET_KEYS = [
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

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function releaseGateEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of RELEASE_CHILD_SECRET_KEYS) {
    delete environment[name];
  }
  delete environment.PLAYWRIGHT_BASE_URL;
  delete environment.PLAYWRIGHT_REUSE_SERVER;
  delete environment.CALRICULA_E2E_SERVER;
  return environment;
}

export async function runNpmScript(script, options = {}) {
  const child = spawn(npmExecutable(), ['run', script], {
    cwd: process.cwd(),
    env: options.env ?? releaseGateEnvironment(),
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(
      `Release gate stopped because npm run ${script} exited with code ${exitCode}.`,
    );
  }
}

async function recordLocalGate(mode, steps, context) {
  const sealedPublication = await sealPublicationPackage();
  const [sourceFingerprint, toolVersions, artifacts, git] = await Promise.all([
    computeReleaseFingerprint(),
    currentToolVersions(),
    computeArtifactFingerprint(),
    inspectGitReleaseState().then(requireCleanGitReleaseState),
    assertTrackedReleaseInputs(),
  ]);
  if (
    git.commit !== context.git.commit ||
    git.tree !== context.git.tree
  ) {
    throw new Error(
      'Committed release source changed while the gate was running.',
    );
  }
  if (mode === 'full') {
    await assertSiteKeyEmbedded(context.siteKey);
  }
  const evidence = {
    schemaVersion: 3,
    mode,
    completedAt: new Date().toISOString(),
    sourceFingerprint,
    toolVersions,
    artifacts,
    publication: {
      fingerprint: sealedPublication.fingerprint,
      files: sealedPublication.files,
      totalBytes: sealedPublication.totalBytes,
    },
    git: {
      commit: git.commit,
      tree: git.tree,
    },
    turnstileSiteKeyDigest:
      mode === 'full' ? siteKeyDigest(context.siteKey) : null,
    steps,
  };
  await mkdir(path.dirname(LOCAL_GATE_EVIDENCE_PATH), {
    recursive: true,
  });
  const temporary = `${LOCAL_GATE_EVIDENCE_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, LOCAL_GATE_EVIDENCE_PATH);
  await chmod(LOCAL_GATE_EVIDENCE_PATH, 0o600);
  return evidence;
}

function parseArguments(argv) {
  if (argv.length === 0) return { bootstrap: false };
  if (argv.length === 1 && argv[0] === '--bootstrap') {
    return { bootstrap: true };
  }
  throw new Error('The release gate accepts only the optional --bootstrap flag.');
}

export async function runReleaseGate(argv = process.argv.slice(2)) {
  const { bootstrap } = parseArguments(argv);
  const git = requireCleanGitReleaseState(
    await inspectGitReleaseState(),
  );
  await assertTrackedReleaseInputs();
  const siteKey = bootstrap
    ? ''
    : await resolveTurnstileSiteKey(process.env);
  if (!bootstrap && !isRealTurnstileSiteKey(siteKey)) {
    throw new Error(
      'A full release gate requires a real non-placeholder NEXT_PUBLIC_TURNSTILE_SITE_KEY.',
    );
  }
  const steps = bootstrap
    ? BOOTSTRAP_RELEASE_GATE_STEPS
    : RELEASE_GATE_STEPS;
  const versions = await currentToolVersions();
  console.log(
    `[release-gate] mode=${
      bootstrap ? 'bootstrap' : 'full'
    }; node=${versions.node}; npm=${versions.npm}; wrangler=${
      versions.wrangler
    }; playwright=${versions.playwright}; lighthouse=${
      versions.lighthouse
    }.`,
  );
  for (const step of steps) {
    console.log(`[release-gate] Running npm run ${step}.`);
    await runNpmScript(step);
    if (step === 'build' && !bootstrap) {
      await assertSiteKeyEmbedded(siteKey);
    }
  }
  await recordLocalGate(bootstrap ? 'bootstrap' : 'full', steps, {
    git,
    siteKey,
  });
  console.log(
    `[release-gate] ${
      bootstrap ? 'Bootstrap' : 'Full'
    } local release gate passed and was recorded.`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runReleaseGate().catch((error) => {
    console.error(
      `[release-gate] ${
        error instanceof Error ? error.message : 'Release gate failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
