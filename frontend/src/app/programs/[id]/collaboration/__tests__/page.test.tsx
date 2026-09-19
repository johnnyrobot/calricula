import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProgramCollaborationPage from '../page';

const auth = { user: { id: 'u' } as { id: string } | null, loading: false, isAuthenticated: true };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ ...auth, getToken: async () => 'tok' }),
}));

const status = jest.fn();
jest.mock('@/hooks/useApplicationXStatus', () => ({ useApplicationXStatus: () => status() }));

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'p1' }) }));
jest.mock('@/components/layout/PageShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const getProgram = jest.fn();
jest.mock('@/lib/api', () => ({ api: { setToken: jest.fn(), getProgram: (...a: unknown[]) => getProgram(...a) } }));

const resolveContext = jest.fn();
jest.mock('@/lib/applicationx/client', () => ({ resolveContext: (...a: unknown[]) => resolveContext(...a) }));

const program = (updated_at: string) => ({ id: 'p1', title: 'CS AS-T', updated_at });

beforeEach(() => {
  jest.clearAllMocks();
  auth.user = { id: 'u' };
  auth.loading = false;
  auth.isAuthenticated = true;
  status.mockReturnValue({ status: { enabled: true, standalone_url: null }, loading: false });
});

test('Retry after context_stale refetches the program and resolves the new context', async () => {
  getProgram.mockResolvedValueOnce(program('v1')).mockResolvedValueOnce(program('v2'));
  resolveContext
    .mockResolvedValueOnce({ state: 'context_stale', message: 'Program changed.', retryable: true })
    .mockResolvedValueOnce({ state: 'ready', workspace_id: 'w', workspace_title: 'W', program_title: 'CS AS-T', campus_label: 'LACC', revision_label: 'Rev 2', api_version: '1' });

  render(<ProgramCollaborationPage />);
  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(resolveContext.mock.calls[0][1]).toMatchObject({ program_id: 'p1', context_id: 'p1:v1' });

  fireEvent.click(retry);
  await screen.findByRole('region', { name: 'Workspace context' });
  expect(getProgram).toHaveBeenCalledTimes(2);
  expect(resolveContext.mock.calls[1][1]).toMatchObject({ program_id: 'p1', context_id: 'p1:v2' });
  expect(screen.getByText('Rev 2')).toBeInTheDocument();
});

test('disabled embed: shows the not-enabled card and never calls the broker', async () => {
  status.mockReturnValue({ status: { enabled: false, standalone_url: null }, loading: false });
  render(<ProgramCollaborationPage />);
  expect(screen.getByText('Employer & Career Collaboration is not enabled for this college.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to program' })).toHaveAttribute('href', '/programs/p1');
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => expect(getProgram).not.toHaveBeenCalled());
  expect(resolveContext).not.toHaveBeenCalled();
});

test('auth still loading: no session_expired alert is written on first mount', () => {
  auth.user = null;
  auth.loading = true;
  auth.isAuthenticated = false;
  render(<ProgramCollaborationPage />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Checking workspace access');
});

test('signed out after auth settled: session_expired alert', () => {
  auth.user = null;
  auth.loading = false;
  auth.isAuthenticated = false;
  render(<ProgramCollaborationPage />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login');
});
