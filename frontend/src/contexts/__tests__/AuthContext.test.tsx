/**
 * Tests for AuthContext — the security-critical auth state machine.
 *
 * Covers all three runtime modes:
 *  - 'dev'   the development identity picker (localStorage DEV_AUTH_BYPASS),
 *            including the mock-user password gate and session persistence,
 *  - 'logto' the OIDC path, where the provider bootstraps from the same-origin
 *            route handlers `/api/auth/session` and `/api/auth/token`, holds
 *            the access token in memory only, and signs out on a dead session,
 *  - 'none'  a locked-down build with nothing configured, which must fail
 *            closed rather than bypass authentication.
 *
 * There is no SDK to mock: the browser never speaks to Logto directly, so the
 * two server routes are stubbed through `global.fetch`.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider, useAuth, refreshDelaySeconds } from '../AuthContext';

const PROFILE = {
  id: 'u-1',
  email: 'real@calricula.com',
  full_name: 'Real User',
  role: 'Admin' as const,
  department_name: 'Mathematics',
};

/** Route `fetch` by URL to the two auth endpoints. */
function mockAuthRoutes(options: {
  session?: { status?: number; body?: unknown };
  token?: { status?: number; body?: unknown };
}) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const spec = url.includes('/api/auth/session') ? options.session : options.token;
    const status = spec?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => spec?.body ?? {},
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// A test consumer that renders the context and exposes the auth methods via
// buttons so tests can drive them through real user interactions.
function Consumer() {
  const auth = useAuth();
  const [tokenOut, setTokenOut] = React.useState<string>('');
  return (
    <div>
      <span data-testid="mode">{auth.mode}</span>
      <span data-testid="user">{auth.user ? auth.user.email : 'none'}</span>
      <span data-testid="role">{auth.user?.role ?? ''}</span>
      <span data-testid="authed">{String(auth.isAuthenticated)}</span>
      <span data-testid="configured">{String(auth.isConfigured)}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="error">{auth.error ?? ''}</span>
      <span data-testid="token">{tokenOut}</span>
      <button onClick={() => auth.login('faculty@calricula.com', 'Test123!').catch(() => {})}>good-login</button>
      <button onClick={() => auth.login('faculty@calricula.com', 'wrong').catch(() => {})}>bad-login</button>
      <button onClick={() => auth.logout().catch(() => {})}>logout</button>
      <button onClick={() => auth.clearError()}>clear-error</button>
      <button onClick={() => auth.signInWithProvider()}>provider-signin</button>
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
let assignMock: jest.Mock;
const realLocation = window.location;

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete process.env.NEXT_PUBLIC_LOGTO_ENABLED;
  delete process.env.NEXT_PUBLIC_AUTH_DEV_MODE;
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
  // Quiet the (intentional) auth diagnostic logging.
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // jsdom does not implement navigation; capture it instead.
  assignMock = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...realLocation, assign: assignMock, href: realLocation.href },
  });
  global.fetch = jest.fn(async () => {
    throw new Error('unexpected fetch');
  }) as unknown as typeof fetch;
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

describe('refreshDelaySeconds', () => {
  it('refreshes a minute before expiry, never sooner than 30s', () => {
    expect(refreshDelaySeconds(3600)).toBe(3540);
    expect(refreshDelaySeconds(120)).toBe(60);
    expect(refreshDelaySeconds(60)).toBe(30);
    expect(refreshDelaySeconds(0)).toBe(30);
  });
});

describe('Dev bypass mode (localStorage override)', () => {
  beforeEach(() => {
    // Opt into the runtime dev bypass the way a developer would.
    window.localStorage.setItem('DEV_AUTH_BYPASS', 'true');
  });

  it('reports dev mode and a configured build', async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('mode')).toHaveTextContent('dev');
    expect(screen.getByTestId('configured')).toHaveTextContent('true');
  });

  it('logs in a known dev user with a valid password and persists the session', async () => {
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByText('good-login'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('faculty@calricula.com'));
    expect(screen.getByTestId('role')).toHaveTextContent('Faculty');
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
    // Session is persisted for reloads (a mock profile, never a token).
    expect(window.sessionStorage.getItem('dev_user')).toContain('faculty@calricula.com');
    // No auth route was called in dev mode.
    expect(global.fetch).not.toHaveBeenCalled();
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
    // Dev logout must not navigate to the provider sign-out route.
    expect(assignMock).not.toHaveBeenCalled();
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
    // Should NOT have reached for a provider access token.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('signInWithProvider is inert in dev mode', async () => {
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByText('provider-signin'));
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe('Logto mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_LOGTO_ENABLED = 'true';
  });

  it('loads the profile and the access token from the server routes', async () => {
    const fetchMock = mockAuthRoutes({
      session: { body: { signedIn: true, profile: PROFILE } },
      token: { body: { access_token: 'at-1', expires_in: 3600 } },
    });

    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('real@calricula.com'));
    expect(screen.getByTestId('mode')).toHaveTextContent('logto');
    expect(screen.getByTestId('role')).toHaveTextContent('Admin');
    expect(screen.getByTestId('authed')).toHaveTextContent('true');

    // The session route is same-origin and uncacheable; no token is in the URL.
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(sessionUrl).toBe('/api/auth/session');
    expect(sessionInit).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });

    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('at-1'));

    // The access token is held in memory only.
    expect(JSON.stringify(window.localStorage)).not.toContain('at-1');
    expect(JSON.stringify(window.sessionStorage)).not.toContain('at-1');
  });

  it('stays signed out when the session route reports no session', async () => {
    const fetchMock = mockAuthRoutes({ session: { body: { signedIn: false } } });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    // No point asking for an access token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the demo-account gate (backend 403) as an error', async () => {
    mockAuthRoutes({ session: { body: { signedIn: false, error: 'forbidden' } } });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/demo account/i));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('does not authenticate when the token route reports a dead session (204)', async () => {
    mockAuthRoutes({
      session: { body: { signedIn: true, profile: PROFILE } },
      token: { status: 204 },
    });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('stays signed out when the session route itself fails', async () => {
    mockAuthRoutes({ session: { status: 502, body: { signedIn: false } } });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('getToken fetches on demand when no token is cached yet', async () => {
    mockAuthRoutes({
      session: { body: { signedIn: false } },
      token: { body: { access_token: 'at-lazy', expires_in: 3600 } },
    });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('at-lazy'));
  });

  it('refuses password sign-in', async () => {
    mockAuthRoutes({ session: { body: { signedIn: false } } });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('good-login'));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/Password sign-in is disabled/i));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('signInWithProvider navigates to the server sign-in route', async () => {
    mockAuthRoutes({ session: { body: { signedIn: false } } });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('provider-signin'));
    expect(assignMock).toHaveBeenCalledWith('/sign-in');
  });

  it('logout clears state and navigates to the server sign-out route', async () => {
    mockAuthRoutes({
      session: { body: { signedIn: true, profile: PROFILE } },
      token: { body: { access_token: 'at-1', expires_in: 3600 } },
    });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));

    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(assignMock).toHaveBeenCalledWith('/sign-out');

    // The cached token is dropped, so a later getToken re-asks the server
    // rather than handing out a token the session no longer backs.
    mockAuthRoutes({ token: { status: 204 } });
    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('null'));
  });
});

describe('No provider configured', () => {
  const realNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: realNodeEnv });
  });

  it('falls back to the dev picker in a non-production build', async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dev'));
    expect(window.localStorage.getItem('DEV_AUTH_BYPASS')).toBe('true');
  });

  it('fails closed in a production build (no bypass, nobody signed in)', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: 'production' });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('mode')).toHaveTextContent('none');
    expect(screen.getByTestId('configured')).toHaveTextContent('false');
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(window.localStorage.getItem('DEV_AUTH_BYPASS')).toBeNull();
  });

  it('getToken yields nothing when no provider is configured', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: 'production' });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    await user.click(screen.getByText('get-token'));
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('null'));
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
