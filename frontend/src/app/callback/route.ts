// ===========================================
// GET /callback — OIDC redirect URI
// ===========================================

import { redirect } from 'next/navigation';
import { handleSignIn } from '@logto/next/server-actions';
import { logtoConfig, notConfigured } from '@/lib/logto';

export const dynamic = 'force-dynamic';

/**
 * Exchanges the authorization code for tokens (kept in the encrypted, HttpOnly
 * session cookie — never handed to the browser) and then sends the user to the
 * dashboard. The landing path is fixed here rather than read from the query, so
 * a crafted callback URL cannot redirect the user off-site.
 */
export async function GET(request: Request): Promise<Response> {
  if (!logtoConfig) return notConfigured();
  // Pass only the query string: the SDK rebuilds the callback URL from
  // `baseUrl`, so the host Next sees behind a proxy need not match the
  // redirect URI registered with Logto.
  await handleSignIn(logtoConfig, new URL(request.url).searchParams);
  redirect('/dashboard');
}
