import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProgramCollaborationPage from '../page';

const auth = { user: { id: 'u' } as { id: string } | null, loading: false, isAuthenticated: true };
const getToken = jest.fn<Promise<string | null>, [string?]>(async () => 'tok');
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ ...auth, getToken: (r?: string) => getToken(r) }),
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
jest.mock('@/lib/applicationx/client', () => ({
  ...jest.requireActual('@/lib/applicationx/client'),
  resolveContext: (...a: unknown[]) => resolveContext(...a),
}));

const program = (updated_at: string) => ({ id: 'p1', title: 'CS AS-T', updated_at });

beforeEach(() => {
  jest.clearAllMocks();
  getToken.mockImplementation(async () => 'tok');
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

test('non-ready host state: one "Back to program" link under the panel (outage isolation)', async () => {
  getProgram.mockResolvedValueOnce(program('v1'));
  resolveContext.mockResolvedValueOnce({ state: 'service_unavailable', message: 'Down.', retryable: true });
  render(<ProgramCollaborationPage />);
  await screen.findByRole('alert');
  const links = screen.getAllByRole('link', { name: 'Back to program' });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute('href', '/programs/p1');
});

test('ready state: the banner is the only "Back to program" link', async () => {
  getProgram.mockResolvedValueOnce(program('v1'));
  resolveContext.mockResolvedValueOnce({ state: 'ready', workspace_id: 'w', workspace_title: 'W', program_title: 'CS AS-T', campus_label: 'LACC', revision_label: 'Rev 1', api_version: '1' });
  render(<ProgramCollaborationPage />);
  const region = await screen.findByRole('region', { name: 'Workspace context' });
  const links = screen.getAllByRole('link', { name: 'Back to program' });
  expect(links).toHaveLength(1);
  expect(region).toContainElement(links[0]);
  expect(links[0]).toHaveAttribute('href', '/programs/p1');
});

test('Calricula token present but no ApplicationX token: "not configured" outage, not session_expired (I-2)', async () => {
  getToken.mockImplementation(async (resource?: string) => (resource === 'applicationx' ? null : 'tok'));
  render(<ProgramCollaborationPage />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveAttribute('data-host-state', 'service_unavailable');
  expect(alert).toHaveTextContent('ApplicationX sign-in is not configured for this deployment.');
  expect(screen.queryByRole('link', { name: 'Sign in again' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(getProgram).not.toHaveBeenCalled();
  expect(resolveContext).not.toHaveBeenCalled();
});

test('both tokens missing: session_expired', async () => {
  getToken.mockImplementation(async () => null);
  render(<ProgramCollaborationPage />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveAttribute('data-host-state', 'session_expired');
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login');
});

test('ready state: "Open in ApplicationX" links to the resolved workspace (M-8)', async () => {
  status.mockReturnValue({ status: { enabled: true, standalone_url: 'https://ax.example.edu/' }, loading: false });
  getProgram.mockResolvedValueOnce(program('v1'));
  resolveContext.mockResolvedValueOnce({ state: 'ready', workspace_id: 'ws 1/2', workspace_title: 'W', program_title: 'CS AS-T', campus_label: 'LACC', revision_label: 'Rev 1', api_version: '1' });
  render(<ProgramCollaborationPage />);
  await screen.findByRole('region', { name: 'Workspace context' });
  expect(screen.getByRole('link', { name: /Open in ApplicationX/ })).toHaveAttribute('href', 'https://ax.example.edu/workspaces/ws%201%2F2');
});

test('embed reported disabled after a ready resolution: banner and workspace placeholder are hidden (M-10)', async () => {
  status.mockReturnValue({ status: null, loading: true });
  getProgram.mockResolvedValueOnce(program('v1'));
  resolveContext.mockResolvedValueOnce({ state: 'ready', workspace_id: 'w', workspace_title: 'W', program_title: 'CS AS-T', campus_label: 'LACC', revision_label: 'Rev 1', api_version: '1' });
  const { rerender } = render(<ProgramCollaborationPage />);
  await screen.findByRole('region', { name: 'Workspace context' });
  expect(screen.getByRole('region', { name: 'Workspace' })).toBeInTheDocument();

  status.mockReturnValue({ status: { enabled: false, standalone_url: null }, loading: false });
  rerender(<ProgramCollaborationPage />);
  expect(screen.getByText('Employer & Career Collaboration is not enabled for this college.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Workspace context' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Workspace' })).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Back to program' })).toHaveLength(1);
});
