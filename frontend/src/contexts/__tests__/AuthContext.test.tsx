/**
 * Tests for AuthContext — the security-critical auth state machine.
 *
 * Covers both runtime paths:
 *  - the development bypass (localStorage DEV_AUTH_BYPASS) used for local/demo
 *    builds, including the mock-user password gate and session persistence, and
 *  - the real Firebase path, including JIT profile fetch, 401/404 handling,
 *    login/logout, and token retrieval.
 *
 * Firebase is fully mocked; the profile fetch uses a stubbed global.fetch.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mock the firebase wrapper module -------------------------------------
jest.mock('@/lib/firebase', () => ({
  auth: {},
  signIn: jest.fn(),
  signOut: jest.fn(),
  onAuthChange: jest.fn(),
  getIdToken: jest.fn(),
  isFirebaseConfigured: jest.fn(),
}));

import {
  signIn,
  signOut,
  onAuthChange,
  getIdToken,
  isFirebaseConfigured,
} from '@/lib/firebase';
import { AuthProvider, useAuth } from '../AuthContext';

const mockSignIn = signIn as jest.Mock;
const mockSignOut = signOut as jest.Mock;
const mockOnAuthChange = onAuthChange as jest.Mock;
const mockGetIdToken = getIdToken as jest.Mock;
const mockIsConfigured = isFirebaseConfigured as jest.Mock;

// A test consumer that renders the context and exposes the auth methods via
// buttons so tests can drive them through real user interactions.
function Consumer() {
  const auth = useAuth();
  const [tokenOut, setTokenOut] = React.useState<string>('');
  return (
    <div>
      <span data-testid="user">{auth.user ? auth.user.email : 'none'}</span>
      <span data-testid="role">{auth.user?.role ?? ''}</span>
      <span data-testid="authed">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="error">{auth.error ?? ''}</span>
      <span data-testid="token">{tokenOut}</span>
      <button onClick={() => auth.login('faculty@calricula.com', 'Test123!').catch(() => {})}>good-login</button>
      <button onClick={() => auth.login('faculty@calricula.com', 'wrong').catch(() => {})}>bad-login</button>
      <button onClick={() => auth.logout().catch(() => {})}>logout</button>
      <button onClick={() => auth.clearError()}>clear-error</button>
      <button
        onClick={async () => {
          const t = await auth.getToken();
          setTokenOut(t ?? 'null');
        }}
      >
        get-token
      </button>
    </div>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  // Quiet the (intentional) auth diagnostic logging, including the
  // console.error the profile-fetch catch emits on the expected 401 path.
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // Default: Firebase reports "not connected" until a test opts in.
  mockIsConfigured.mockReturnValue(false);
  // Default onAuthChange: no user, returns an unsubscribe fn.
  mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
    cb(null);
    return jest.fn();
  });
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('Dev bypass mode (localStorage override)', () => {
  beforeEach(() => {
    // Opt into the runtime dev bypass the way a developer would.
    window.localStorage.setItem('DEV_AUTH_BYPASS', 'true');
    mockIsConfigured.mockReturnValue(false);
  });

  it('logs in a known dev user with a valid password and persists the session', async () => {
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByText('good-login'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('faculty@calricula.com'));
    expect(screen.getByTestId('role')).toHaveTextContent('Faculty');
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
    // Session is persisted for reloads.
    expect(window.sessionStorage.getItem('dev_user')).toContain('faculty@calricula.com');
    // Real Firebase signIn must NOT have been called in bypass mode.
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('rejects an invalid dev password and records an error', async () => {
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByText('bad-login'));

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/Invalid email or password/i));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(window.sessionStorage.getItem('dev_user')).toBeNull();
  });

  it('clearError resets a prior error', async () => {
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('bad-login'));
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''));

    await user.click(screen.getByText('clear-error'));
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('logout clears the user and the persisted session', async () => {
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('good-login'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));

    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(window.sessionStorage.getItem('dev_user')).toBeNull();
  });

  it('restores a persisted dev session from sessionStorage on mount', async () => {
    window.sessionStorage.setItem(
      'dev_user',
      JSON.stringify({ id: 'dev-chair-001', email: 'chair@calricula.com', full_name: 'Chair', role: 'CurriculumChair' })
    );
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('chair@calricula.com'));
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
  });

  it('tolerates a corrupt persisted session without crashing', async () => {
    window.sessionStorage.setItem('dev_user', '{not valid json');
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('getToken returns the dev user id (used as the backend token)', async () => {
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('good-login'));
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));

    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('dev-faculty-001'));
    // Should NOT have reached for a real Firebase token.
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });
});

describe('Firebase mode', () => {
  beforeEach(() => {
    // No dev bypass; Firebase reports configured.
    mockIsConfigured.mockReturnValue(true);
  });

  it('fetches the user profile (JIT) when Firebase reports a signed-in user', async () => {
    const fbUser = { getIdToken: jest.fn().mockResolvedValue('fb-id-token') };
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(fbUser);
      return jest.fn();
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u1', email: 'real@calricula.com', full_name: 'Real User', role: 'Admin' }),
    }) as unknown as typeof fetch;

    renderAuth();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('real@calricula.com'));
    expect(screen.getByTestId('role')).toHaveTextContent('Admin');
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
    // The profile request carried the firebase ID token as a bearer.
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer fb-id-token');
  });

  it('leaves the user unauthenticated when Firebase reports no user', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(null);
      return jest.fn();
    });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('does not authenticate when the profile fetch returns 401', async () => {
    const fbUser = { getIdToken: jest.fn().mockResolvedValue('fb-id-token') };
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(fbUser);
      return jest.fn();
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'expired' }),
    }) as unknown as typeof fetch;

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('logs in through Firebase and loads the profile', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(null);
      return jest.fn();
    });
    mockSignIn.mockResolvedValue({ user: { getIdToken: jest.fn().mockResolvedValue('login-token') } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u9', email: 'login@calricula.com', full_name: 'L', role: 'Faculty' }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('good-login'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('login@calricula.com'));
    expect(mockSignIn).toHaveBeenCalledWith('faculty@calricula.com', 'Test123!');
  });

  it('records and rethrows an error when Firebase login fails', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(null);
      return jest.fn();
    });
    mockSignIn.mockRejectedValue(new Error('auth/wrong-password'));

    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('good-login'));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('auth/wrong-password'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('logout calls Firebase signOut and clears the user', async () => {
    const fbUser = { getIdToken: jest.fn().mockResolvedValue('fb-id-token') };
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(fbUser);
      return jest.fn();
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u1', email: 'real@calricula.com', full_name: 'R', role: 'Admin' }),
    }) as unknown as typeof fetch;
    mockSignOut.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));

    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('getToken delegates to Firebase getIdToken', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: unknown) => void) => {
      cb(null);
      return jest.fn();
    });
    mockGetIdToken.mockResolvedValue('fresh-token');

    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('fresh-token'));
    expect(mockGetIdToken).toHaveBeenCalled();
  });
});

describe('useAuth outside a provider', () => {
  it('returns the default context (does not throw with the default value present)', () => {
    // The provider supplies a default context value, so a bare consumer renders
    // the unauthenticated defaults rather than crashing.
    function Bare() {
      const { isAuthenticated } = useAuth();
      return <span data-testid="bare">{String(isAuthenticated)}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId('bare')).toHaveTextContent('false');
  });
});
