'use client';

// ===========================================
// Authentication Context
// ===========================================
// Provides authentication state and methods to the entire app.
//
// Three runtime modes:
//   'dev'   — the local identity picker: a mock profile and a `dev-*` token the
//             backend accepts only while AUTH_DEV_MODE is on. Wins over 'logto'.
//   'logto' — OIDC via Logto. The session lives in an encrypted, HttpOnly
//             cookie owned by the server route handlers; this provider holds
//             only the short-lived API access token, in memory.
//   'none'  — no authentication configured; nobody is signed in.
//
// Tokens are never written to localStorage, sessionStorage or a URL. The OIDC
// ID token never reaches the browser at all: `/api/auth/session` exchanges it
// for the profile server-side.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';

// ===========================================
// Types
// ===========================================

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'Faculty' | 'CurriculumChair' | 'ArticulationOfficer' | 'Admin';
  department_id?: string;
  department_name?: string;
}

export type AuthMode = 'dev' | 'logto' | 'none';

/** Body of `GET /api/auth/session` (see `src/app/api/auth/session/route.ts`). */
interface SessionBody {
  signedIn: boolean;
  profile?: UserProfile;
  error?: string;
}

/** Body of `GET /api/auth/token` (see `src/app/api/auth/token/route.ts`). */
interface TokenBody {
  access_token: string;
  expires_in: number;
}

// Whether this build permits the runtime (localStorage) dev-auth override.
//
// SECURITY: the `DEV_AUTH_BYPASS` localStorage flag is settable by anyone via
// the browser console, so it must NOT be honored in a normal production build —
// otherwise any visitor could flip it to fake an authenticated session. We only
// respect the runtime override when the deployer explicitly opted in at build
// time (dev or demo mode) or when running a non-production build. The backend
// independently rejects dev tokens unless AUTH_DEV_MODE is enabled, so this is
// defense-in-depth for the client UI.
const isRuntimeBypassAllowed = (): boolean => {
  return (
    process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
};

// Development mode detection helper
// Enable dev bypass if NEXT_PUBLIC_AUTH_DEV_MODE is set to 'true', or via the
// localStorage override ONLY in builds where that override is permitted.
const isDevBypassEnabled = (): boolean => {
  if (typeof window === 'undefined') return false; // Server-side render

  // Runtime localStorage override — only honored when this build allows it.
  if (isRuntimeBypassAllowed()) {
    const manualDevMode = window.localStorage.getItem('DEV_AUTH_BYPASS') === 'true';
    if (manualDevMode) return true;
  }

  // Build-time environment variable (set by the deployer, not the visitor).
  return process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true';
};

// Logto availability is advertised by its own public flag, which the deployer
// sets alongside the server-only LOGTO_* variables. It is deliberately not
// derived from them: a half-configured server still 404s every auth route.
const isLogtoEnabled = (): boolean => process.env.NEXT_PUBLIC_LOGTO_ENABLED === 'true';

// Demo mode detection helper
// Enable demo mode if NEXT_PUBLIC_DEMO_MODE is set to 'true'
// Demo mode allows public access with limited features and daily resets
const isDemoModeEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
};

/** Seconds to wait before re-fetching a token that expires in `expiresIn` seconds. */
export const refreshDelaySeconds = (expiresIn: number): number =>
  Math.max(expiresIn - 60, 30);

// Mock user profiles for development mode
const DEV_USERS: Record<string, UserProfile> = {
  'demo@calricula.com': {
    id: 'dev-demo-001',
    email: 'demo@calricula.com',
    full_name: 'Demo User',
    role: 'Faculty',
    department_name: 'General',
  },
  'faculty@calricula.com': {
    id: 'dev-faculty-001',
    email: 'faculty@calricula.com',
    full_name: 'Dr. Maria Garcia',
    role: 'Faculty',
    department_name: 'Mathematics',
  },
  'faculty2@calricula.com': {
    id: 'dev-faculty-002',
    email: 'faculty2@calricula.com',
    full_name: 'Prof. James Chen',
    role: 'Faculty',
    department_name: 'English',
  },
  'faculty3@calricula.com': {
    id: 'dev-faculty-003',
    email: 'faculty3@calricula.com',
    full_name: 'Dr. Sarah Johnson',
    role: 'Faculty',
    department_name: 'Computer Science',
  },
  'chair@calricula.com': {
    id: 'dev-chair-001',
    email: 'chair@calricula.com',
    full_name: 'Dr. Robert Williams',
    role: 'CurriculumChair',
  },
  'articulation@calricula.com': {
    id: 'dev-articulation-001',
    email: 'articulation@calricula.com',
    full_name: 'Ms. Lisa Thompson',
    role: 'ArticulationOfficer',
  },
  'admin@calricula.com': {
    id: 'dev-admin-001',
    email: 'admin@calricula.com',
    full_name: 'Mr. David Martinez',
    role: 'Admin',
  },
};

export interface AuthContextType {
  // Which sign-in mechanism this build is using
  mode: AuthMode;
  // App user profile (from our database)
  user: UserProfile | null;
  // Loading states
  loading: boolean;
  profileLoading: boolean;
  // Error state
  error: string | null;
  // Is user authenticated?
  isAuthenticated: boolean;
  // Is a sign-in mechanism configured?
  isConfigured: boolean;
  // Is demo mode enabled?
  isDemoMode: boolean;
  // Dev-mode sign-in (identity picker). Rejected in every other mode.
  login: (email: string, password: string) => Promise<void>;
  // Logto sign-in: hands the browser to the server-side /sign-in route.
  signInWithProvider: () => void;
  logout: () => Promise<void>;
  // Get the bearer token for API calls (dev identity or Logto access token)
  getToken: () => Promise<string | null>;
  // Clear error
  clearError: () => void;
}

// Default context value
const defaultContext: AuthContextType = {
  mode: 'none',
  user: null,
  loading: true,
  profileLoading: false,
  error: null,
  isAuthenticated: false,
  isConfigured: false,
  isDemoMode: false,
  login: async () => {},
  signInWithProvider: () => {},
  logout: async () => {},
  getToken: async () => null,
  clearError: () => {},
};

// Create context
const AuthContext = createContext<AuthContextType>(defaultContext);

// ===========================================
// Auth Provider Component
// ===========================================

interface AuthProviderProps {
  children: ReactNode;
}

const DEV_LOGIN_HINT =
  'Invalid email or password. Dev users: demo@calricula.com, faculty@calricula.com, chair@calricula.com, admin@calricula.com';

const FORBIDDEN_MESSAGE =
  'This deployment only admits demo accounts. Please sign in with a demo account.';

const UNAVAILABLE_MESSAGE =
  'Could not reach the Calricula server to load your profile. Please try again in a moment.';

const UNCONFIGURED_MESSAGE =
  'Single sign-on is not configured on this server. Please contact an administrator.';

/** The in-memory access token and the moment it should be replaced. */
interface CachedToken {
  value: string;
  /** Epoch ms at which the token is considered stale (mirrors the refresh timer). */
  refreshAt: number;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Logto access token lives here and nowhere else: no web storage, no
  // cookie the page script can read, no URL.
  const tokenRef = useRef<CachedToken | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // De-duplicates concurrent callers: several widgets mount at once and each
  // asks for a token, but only one request should go out.
  const inflightRef = useRef<Promise<string | null> | null>(null);
  const mountedRef = useRef(true);
  // Lets the refresh timer call the current fetcher without the fetcher having
  // to depend on itself. Assigned in an effect; the timer only fires ≥30s later.
  const fetchRef = useRef<() => Promise<string | null>>(async () => null);

  // Dev bypass is checked on every render because it can be flipped at runtime
  // via localStorage (only in builds where that is permitted).
  const devModeActive = isDevBypassEnabled();
  const mode: AuthMode = devModeActive ? 'dev' : isLogtoEnabled() ? 'logto' : 'none';

  const clearRefresh = useCallback(() => {
    if (refreshRef.current !== null) {
      clearTimeout(refreshRef.current);
      refreshRef.current = null;
    }
  }, []);

  const signedOut = useCallback(() => {
    clearRefresh();
    tokenRef.current = null;
    if (mountedRef.current) setUser(null);
  }, [clearRefresh]);

  /**
   * Mints (or renews) the API access token from the same-origin route handler
   * and schedules the next renewal.
   *
   * Defined from the very first render — not inside the bootstrap effect —
   * because React runs child effects before the provider's own: a descendant
   * that calls `getToken()` in its mount effect (e.g. `useUserCourses` with
   * `autoFetch`) must get a real token rather than a stub that answers `null`
   * once and never retries.
   */
  const fetchAccessToken = useCallback(async (): Promise<string | null> => {
    if (inflightRef.current) return inflightRef.current;

    const request = (async (): Promise<string | null> => {
      try {
        const response = await fetch('/api/auth/token', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (response.status !== 200) {
          // 204 (signed out) or an error: the session is over.
          signedOut();
          return null;
        }
        const { access_token: accessToken, expires_in: expiresIn } =
          (await response.json()) as TokenBody;
        const delaySeconds = refreshDelaySeconds(expiresIn);
        tokenRef.current = { value: accessToken, refreshAt: Date.now() + delaySeconds * 1000 };
        if (mountedRef.current) {
          clearRefresh();
          refreshRef.current = setTimeout(() => {
            refreshRef.current = null;
            void fetchRef.current();
          }, delaySeconds * 1000);
        }
        return accessToken;
      } catch (err) {
        // A transport failure is indistinguishable from a dead session here;
        // fail closed rather than hand out a token we could not confirm.
        console.warn(
          'Could not obtain an access token:',
          err instanceof Error ? err.message : err
        );
        signedOut();
        return null;
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = request;
    return request;
  }, [clearRefresh, signedOut]);

  useEffect(() => {
    fetchRef.current = fetchAccessToken;
  }, [fetchAccessToken]);

  // Stop the refresh timer (and any state writes) once the provider unmounts.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearRefresh();
    };
  }, [clearRefresh]);

  useEffect(() => {
    // ---- Dev bypass: restore the picked identity from sessionStorage -------
    if (mode === 'dev') {
      if (typeof window !== 'undefined') {
        const storedUser = window.sessionStorage.getItem('dev_user');
        if (storedUser) {
          try {
            const devUser = JSON.parse(storedUser) as UserProfile;
            console.log('[DEV MODE] Restored session for:', devUser.email);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a persisted dev session from sessionStorage (external store) on mount
            setUser(devUser);
          } catch {
            console.warn('[DEV MODE] Failed to restore session');
          }
        }
      }
      setLoading(false);
      return;
    }

    // ---- No provider configured ------------------------------------------
    if (mode === 'none') {
      if (isRuntimeBypassAllowed() && typeof window !== 'undefined') {
        // Dev/demo builds with nothing configured fall back to the identity
        // picker so the app is usable locally. Writing the flag re-renders us
        // into 'dev' mode on the next pass, which restores any stored session.
        // A locked-down production build must fail closed instead.
        console.log('[AUTH] No provider configured - enabling dev mode automatically');
        window.localStorage.setItem('DEV_AUTH_BYPASS', 'true');
      } else {
        console.warn('[AUTH] No authentication provider configured');
      }
      setLoading(false);
      return;
    }

    // ---- Logto ------------------------------------------------------------
    let cancelled = false;

    const bootstrap = async () => {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (cancelled) return;
      const session = (await response.json().catch(() => null)) as SessionBody | null;
      if (cancelled) return;

      if (!session?.signedIn) {
        // Tell the visitor *why* they are not signed in: a refused demo
        // account and a backend outage need different responses from them.
        if (session?.error === 'forbidden') {
          setError(FORBIDDEN_MESSAGE);
        } else if (session?.error === 'logto_not_configured') {
          setError(UNCONFIGURED_MESSAGE);
        } else if (session?.error === 'profile_unavailable' || !response.ok) {
          setError(UNAVAILABLE_MESSAGE);
        }
        return;
      }

      await fetchAccessToken();
      if (cancelled || tokenRef.current === null || !session.profile) return;
      setUser(session.profile);
      setError(null);
    };

    setProfileLoading(true);
    bootstrap()
      .catch((err) => {
        console.warn('Could not restore session:', err instanceof Error ? err.message : err);
        signedOut();
      })
      .finally(() => {
        if (cancelled) return;
        setProfileLoading(false);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, clearRefresh, signedOut, fetchAccessToken]);

  // Dev-mode sign-in (the identity picker on /login). Real sign-in goes
  // through the provider; there is no password for this app to check.
  const login = async (email: string, password: string) => {
    setError(null);
    setProfileLoading(true);

    try {
      if (mode !== 'dev') {
        throw new Error('Password sign-in is disabled. Use your college account to sign in.');
      }
      const devUser = DEV_USERS[email.toLowerCase()];
      // Accept Test123! for dev users OR the real demo password
      const validPasswords = ['Test123!', 'dont4get'];
      if (devUser && validPasswords.includes(password)) {
        console.log('[DEV MODE] Signing in as:', email);
        setUser(devUser);
        // Store in sessionStorage for persistence (a mock profile, not a token)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('dev_user', JSON.stringify(devUser));
        }
        return;
      }
      throw new Error(DEV_LOGIN_HINT);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setProfileLoading(false);
    }
  };

  // Logto sign-in: the server route starts the authorization-code flow. A plain
  // navigation, so it works without JS and never puts a token in the URL.
  const signInWithProvider = () => {
    if (mode !== 'logto') return;
    window.location.assign('/sign-in');
  };

  // Logout function
  const logout = async () => {
    setError(null);
    clearRefresh();
    tokenRef.current = null;
    setUser(null);

    if (mode === 'dev') {
      console.log('[DEV MODE] Logging out');
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('dev_user');
      }
      return;
    }

    if (mode === 'logto') {
      // The server route clears the session cookie and ends the Logto session.
      window.location.assign('/sign-out');
    }
  };

  // Bearer token for API calls
  const getToken = async (): Promise<string | null> => {
    // In dev bypass mode the mock user's id IS the token; the backend resolves
    // `dev-*` tokens only while AUTH_DEV_MODE is on.
    if (mode === 'dev') {
      return user ? user.id : null;
    }
    if (mode !== 'logto') return null;
    const cached = tokenRef.current;
    // Renew a token that is inside its refresh margin rather than handing out
    // one that is about to expire — the scheduled timer does not run while the
    // tab is frozen, so the cached copy can be arbitrarily old.
    if (cached && Date.now() < cached.refreshAt) return cached.value;
    return fetchAccessToken();
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    mode,
    user,
    loading,
    profileLoading,
    error,
    isAuthenticated: !!user,
    isConfigured: mode !== 'none',
    isDemoMode: isDemoModeEnabled(),
    login,
    signInWithProvider,
    logout,
    getToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// ===========================================
// Hook to use auth context
// ===========================================

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// ===========================================
// Higher-order component for protected routes
// ===========================================

interface WithAuthOptions {
  redirectTo?: string;
  requiredRoles?: UserProfile['role'][];
}

export const withAuth = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithAuthOptions = {}
) => {
  const { redirectTo = '/login', requiredRoles } = options;

  return function WithAuthComponent(props: P) {
    const { isAuthenticated, loading, user } = useAuth();

    // Show loading state
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600"></div>
        </div>
      );
    }

    // Redirect if not authenticated
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }
      return null;
    }

    // Check role requirements
    if (requiredRoles && user && !requiredRoles.includes(user.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">
              You don&apos;t have permission to access this page.
            </p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
};

export default AuthContext;
