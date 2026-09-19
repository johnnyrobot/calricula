// ===========================================
// GET /api/auth/token — short-lived API access token
// ===========================================

import { getAccessToken, getLogtoContext } from '@logto/next/server-actions';
import {
  LOGTO_API_RESOURCE,
  json,
  logtoConfig,
  noContent,
  notConfigured,
  secondsUntilExpiry,
} from '@/lib/logto';

export const dynamic = 'force-dynamic';

export interface TokenResponse {
  access_token: string;
  /** Seconds until the token expires; the client refreshes shortly before. */
  expires_in: number;
}

/**
 * Returns the access token for `LOGTO_API_RESOURCE` (the backend's
 * `OIDC_AUDIENCE`), minting a fresh one from the refresh token when needed, or
 * 204 when the visitor is signed out. The token travels only in this JSON body
 * and the client keeps it in memory — never in web storage or a URL.
 */
export async function GET(): Promise<Response> {
  if (!logtoConfig) return notConfigured();

  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) return noContent();

  let accessToken: string;
  try {
    accessToken = await getAccessToken(logtoConfig, LOGTO_API_RESOURCE);
  } catch {
    // The refresh token is gone or was rejected: the session is over.
    return noContent();
  }

  const body: TokenResponse = {
    access_token: accessToken,
    expires_in: secondsUntilExpiry(accessToken),
  };
  return json(body);
}
