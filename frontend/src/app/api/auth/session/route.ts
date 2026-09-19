// ===========================================
// GET /api/auth/session — who is signed in
// ===========================================

import LogtoClient, { getLogtoContext } from '@logto/next/server-actions';
import { API_BASE_URL, json, logtoConfig, notConfigured } from '@/lib/logto';

export const dynamic = 'force-dynamic';

/** The app profile the browser is allowed to see (mirrors `UserProfile` in AuthContext). */
export interface SessionProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'Faculty' | 'CurriculumChair' | 'ArticulationOfficer' | 'Admin';
  department_id?: string;
  department_name?: string;
}

export interface SessionResponse {
  signedIn: boolean;
  profile?: SessionProfile;
  /** `forbidden` when a demo deployment refused the account; `profile_unavailable` otherwise. */
  error?: string;
}

/** Shape of the backend's `POST /api/auth/login` body (only the fields we surface). */
interface BackendLoginResponse {
  user?: {
    id?: string;
    email?: string;
    full_name?: string;
    role?: SessionProfile['role'];
    department_id?: string | null;
    department?: { id?: string; name?: string; code?: string } | null;
  };
}

function toProfile(body: BackendLoginResponse): SessionProfile | null {
  const user = body.user;
  if (!user?.id || !user.email || !user.role) return null;
  return {
    id: String(user.id),
    email: user.email,
    full_name: user.full_name ?? user.email,
    role: user.role,
    ...(user.department_id ? { department_id: String(user.department_id) } : {}),
    ...(user.department?.name ? { department_name: user.department.name } : {}),
  };
}

/**
 * Reports whether the visitor has a Logto session and, if so, their Calricula
 * profile.
 *
 * The ID token is read from the session cookie and exchanged for the profile
 * here, server-side: `POST /api/auth/login` is the only backend route that
 * accepts an ID token, and the token itself never reaches the browser. The
 * browser only ever holds the short-lived API access token from
 * `/api/auth/token`.
 */
export async function GET(): Promise<Response> {
  if (!logtoConfig) return notConfigured();

  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) return json({ signedIn: false } satisfies SessionResponse);

  // `getLogtoContext` exposes the decoded claims but not the raw ID token, and
  // the backend needs the raw JWT to verify it; the Node client reads it from
  // the same encrypted cookie.
  const nodeClient = await new LogtoClient(logtoConfig).createNodeClient();
  const idToken = await nodeClient.getIdToken();
  if (!idToken) return json({ signedIn: false } satisfies SessionResponse);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
  } catch {
    return json({ signedIn: false, error: 'profile_unavailable' } satisfies SessionResponse, 502);
  }

  // The demo gate: the deployment only admits demo accounts. The visitor has a
  // valid Logto session but no Calricula identity, so they are not signed in.
  if (response.status === 403) {
    return json({ signedIn: false, error: 'forbidden' } satisfies SessionResponse, 200);
  }
  if (!response.ok) {
    return json({ signedIn: false, error: 'profile_unavailable' } satisfies SessionResponse, 502);
  }

  const profile = toProfile((await response.json()) as BackendLoginResponse);
  if (!profile) {
    return json({ signedIn: false, error: 'profile_unavailable' } satisfies SessionResponse, 502);
  }

  return json({ signedIn: true, profile } satisfies SessionResponse);
}
