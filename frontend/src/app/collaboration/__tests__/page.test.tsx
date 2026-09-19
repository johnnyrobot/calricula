import { render, screen, waitFor } from '@testing-library/react';
import CollaborationPage from '../page';

const auth = { user: { id: 'u' } as { id: string } | null, loading: false, isAuthenticated: true };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ ...auth, getToken: async () => 'tok' }),
}));

const status = jest.fn();
jest.mock('@/hooks/useApplicationXStatus', () => ({ useApplicationXStatus: () => status() }));

jest.mock('@/components/layout/PageShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const resolveContext = jest.fn();
jest.mock('@/lib/applicationx/client', () => ({
  ...jest.requireActual('@/lib/applicationx/client'),
  resolveContext: (...a: unknown[]) => resolveContext(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
  auth.user = { id: 'u' };
  auth.loading = false;
  auth.isAuthenticated = true;
  status.mockReturnValue({ status: { enabled: true, standalone_url: null }, loading: false });
});

test('mapping_required from the empty context shows the WorkspaceSelector', async () => {
  resolveContext.mockResolvedValueOnce({ state: 'mapping_required', message: 'No workspace.', retryable: false });
  render(<CollaborationPage />);
  expect(await screen.findByText('Open a program page and choose Collaboration to enter its workspace.')).toBeInTheDocument();
  expect(resolveContext.mock.calls[0][1]).toMatchObject({ program_id: null, workspace_id: null });
});

test('access_required shows the HostStatePanel', async () => {
  resolveContext.mockResolvedValueOnce({ state: 'access_required', message: 'Ask your dean.', retryable: false });
  render(<CollaborationPage />);
  expect(await screen.findByText('You do not have ApplicationX access for this organization.')).toBeInTheDocument();
});

test('disabled embed: not-enabled card with Programs link, broker never called', async () => {
  status.mockReturnValue({ status: { enabled: false, standalone_url: null }, loading: false });
  render(<CollaborationPage />);
  expect(screen.getByText('Employer & Career Collaboration is not enabled for this college.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Programs' })).toHaveAttribute('href', '/programs');
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => expect(resolveContext).not.toHaveBeenCalled());
});

test('auth still loading: no session_expired alert on first mount', () => {
  auth.user = null;
  auth.loading = true;
  auth.isAuthenticated = false;
  render(<CollaborationPage />);
  expect(screen.queryByRole('alert')).toBeNull();
});
