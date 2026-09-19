// ===========================================
// GET /sign-in — start the OIDC authorization-code flow
// ===========================================

import { signIn } from '@logto/next/server-actions';
import { LOGTO_BASE_URL, logtoConfig, notConfigured } from '@/lib/logto';

export const dynamic = 'force-dynamic';

/**
 * Redirects the browser to the Logto sign-in page. The redirect URI is built
 * from `LOGTO_BASE_URL` and never from a request parameter, so this route
 * cannot be turned into an open redirect. The requested scopes
 * (`openid profile email`) and the API resource come from `logtoConfig`.
 */
export async function GET(): Promise<Response> {
  if (!logtoConfig) return notConfigured();
  // `signIn` writes the PKCE state to the session cookie and throws Next's
  // redirect to Logto, so nothing after it runs on the happy path.
  await signIn(logtoConfig, { redirectUri: `${LOGTO_BASE_URL}/callback` });
  return new Response(null, { status: 500 }); // unreachable
}
