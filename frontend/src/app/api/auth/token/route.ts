// ===========================================
// GET /api/auth/token — short-lived API access token
// ===========================================

import { getAccessToken, getLogtoContext } from '@logto/next/server-actions';
import {
  json,
  logtoConfig,
  noContent,
  notConfigured,
  resolveResourceIndicator,
  secondsUntilExpiry,
} from '@/lib/logto';

export const dynamic = 'force-dynamic';

export interface TokenResponse {
  access_token: string;
  /** Seconds until the token expires; the client refreshes shortly before. */
  expires_in: number;
}

/**
 * Returns the access token for `?resource=` (`calricula`, the default, or
 * `applicationx` — the embedded-workspace broker's ApplicationX-scoped
 * token, host plan), minting a fresh one from the refresh token when needed.
 *
 *   - 400 `{error:"unknown_resource"}` for any other `resource` value.
 *   - 404 `{error:"resource_not_configured"}` for a recognized resource this
 *     deployment hasn't configured (e.g. `applicationx` before
 *     `LOGTO_APPLICATIONX_RESOURCE` is set).
 *   - 204 when the visitor is signed out — never a token, for either resource.
 *
 * The token travels only in this JSON body and the client keeps it in memory
 * — never in web storage or a URL.
 */
export async function GET(request: Request): Promise<Response> {
  if (!logtoConfig) return notConfigured();

  const { searchParams } = new URL(request.url);
  const lookup = resolveResourceIndicator(searchParams.get('resource'));
  if (!lookup.ok) {
    return json({ error: lookup.error }, lookup.error === 'unknown_resource' ? 400 : 404);
  }

  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) return noContent();

  let accessToken: string;
  try {
    accessToken = await getAccessToken(logtoConfig, lookup.indicator);
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
