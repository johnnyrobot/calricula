import process from 'node:process';

/**
 * Every environment variable that must not reach a child process spawned by
 * release tooling. Provider credentials, Cloudflare credentials, the signed AI
 * session cookie, and the Wrangler overrides a guarded release refuses to honour
 * are all listed here so one edit protects every spawn site.
 */
export const CHILD_SECRET_KEYS = [
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

/**
 * The three credentials Wrangler itself needs in order to authenticate against
 * the operator's own Cloudflare account. Every other child is denied them.
 * This is the only axis on which a release child's environment varies, so it is
 * named rather than left as an omission from a second key list.
 */
export const CLOUDFLARE_AUTH_KEYS = [
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_EMAIL',
];

function scrub(source, keys) {
  const environment = { ...source };
  for (const name of keys) {
    delete environment[name];
  }
  return environment;
}

/**
 * Build the environment for a child process that must receive no secret at all:
 * git, version probes, build steps, browser projects, and post-deploy checks.
 */
export function childEnvironment(source = process.env) {
  return scrub(source, CHILD_SECRET_KEYS);
}

/**
 * Build the environment for a child process that is Wrangler itself. Identical
 * to `childEnvironment` except that Cloudflare account credentials survive,
 * because Wrangler cannot authenticate without them.
 */
export function wranglerChildEnvironment(source = process.env) {
  return scrub(
    source,
    CHILD_SECRET_KEYS.filter(
      (name) => !CLOUDFLARE_AUTH_KEYS.includes(name),
    ),
  );
}
