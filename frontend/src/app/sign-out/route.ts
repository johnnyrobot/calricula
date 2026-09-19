// ===========================================
// GET /sign-out — end the Logto session
// ===========================================

import { signOut } from '@logto/next/server-actions';
import { LOGTO_BASE_URL, logtoConfig, notConfigured } from '@/lib/logto';

export const dynamic = 'force-dynamic';

/**
 * Clears the encrypted session cookie and ends the session at Logto, which
 * sends the browser back to this app's home page. The post-sign-out URI is
 * built from `LOGTO_BASE_URL`, never from a request parameter.
 */
export async function GET(): Promise<Response> {
  if (!logtoConfig) return notConfigured();
  await signOut(logtoConfig, `${LOGTO_BASE_URL}/`);
  return new Response(null, { status: 500 }); // unreachable
}
