export const SECRET_PATTERNS = [
  {
    name: 'OpenRouter API key',
    pattern: /\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/,
  },
  {
    name: 'assigned server-side AI secret',
    pattern:
      /\b(?:OPENROUTER_API_KEY|TURNSTILE_SECRET_KEY|AI_SESSION_HMAC_SECRET)["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/,
  },
  {
    name: 'private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

export function findSecrets(text) {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ name }) => name,
  );
}
