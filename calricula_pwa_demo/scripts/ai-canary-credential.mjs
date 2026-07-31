import process from 'node:process';

export const AI_SESSION_COOKIE_NAME =
  '__Host-calricula_ai_session';

const MAX_TURNSTILE_TOKEN_LENGTH = 4_096;
const MAX_SESSION_PAYLOAD_LENGTH = 1_536;
const SESSION_SIGNATURE_LENGTH = 43;

export class AiCanaryCredentialError extends Error {}

function cleanEnvironmentValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateTurnstileToken(value) {
  if (
    value.length > MAX_TURNSTILE_TOKEN_LENGTH ||
    /[\u0000-\u0020\u007f;]/.test(value)
  ) {
    throw new AiCanaryCredentialError(
      'CALRICULA_TURNSTILE_TOKEN has an invalid format.',
    );
  }
  return value;
}

function validateSessionCookie(value) {
  const match = value.match(
    new RegExp(
      `^${AI_SESSION_COOKIE_NAME}=([A-Za-z0-9_-]{16,${MAX_SESSION_PAYLOAD_LENGTH}})\\.([A-Za-z0-9_-]{${SESSION_SIGNATURE_LENGTH}})$`,
    ),
  );
  if (!match) {
    throw new AiCanaryCredentialError(
      `CALRICULA_AI_SESSION_COOKIE must contain only ${AI_SESSION_COOKIE_NAME}=<signed-value>, without Cookie attributes.`,
    );
  }
  return value;
}

export function resolveAiCanaryCredential(environment = process.env) {
  const turnstileToken = cleanEnvironmentValue(
    environment.CALRICULA_TURNSTILE_TOKEN,
  );
  const sessionCookie = cleanEnvironmentValue(
    environment.CALRICULA_AI_SESSION_COOKIE,
  );
  if (turnstileToken && sessionCookie) {
    throw new AiCanaryCredentialError(
      'Set exactly one AI canary credential, not both CALRICULA_TURNSTILE_TOKEN and CALRICULA_AI_SESSION_COOKIE.',
    );
  }
  if (!turnstileToken && !sessionCookie) {
    throw new AiCanaryCredentialError(
      'Set exactly one AI canary credential: a fresh CALRICULA_TURNSTILE_TOKEN or CALRICULA_AI_SESSION_COOKIE.',
    );
  }
  if (turnstileToken) {
    return {
      kind: 'turnstile-token',
      value: validateTurnstileToken(turnstileToken),
    };
  }
  return {
    kind: 'existing-session-cookie',
    value: validateSessionCookie(sessionCookie),
  };
}
