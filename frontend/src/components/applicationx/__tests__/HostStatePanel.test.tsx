import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceShell } from '@johnnyrobot/workspace-ui';
import { HostStatePanel } from '../HostStatePanel';
import type { HostFailure, WorkspaceHostAdapter, WorkspaceHostContext } from '@/lib/applicationx/types';

const failure = (state: HostFailure['state'], overrides: Partial<HostFailure> = {}): HostFailure => ({
  state,
  message: `server message for ${state}`,
  retryable: false,
  ...overrides,
});

describe('HostStatePanel', () => {
  test('access_required: explains and surfaces the server note, no retry, no data', () => {
    render(<HostStatePanel resolution={failure('access_required', { message: 'Contact your dean.' })} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.getByText('You do not have ApplicationX access for this organization.')).toBeInTheDocument();
    expect(screen.getByText('How to request access')).toBeInTheDocument();
    expect(screen.getByText('Contact your dean.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('mapping_required: explains and tells the user who can map it', () => {
    render(<HostStatePanel resolution={failure('mapping_required')} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.getByText('This program is not mapped to an ApplicationX workspace.')).toBeInTheDocument();
    expect(screen.getByText(/Ask an ApplicationX administrator to map it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('context_stale: shows message and Retry calls onRetry', () => {
    const onRetry = jest.fn();
    render(<HostStatePanel resolution={failure('context_stale', { message: 'The program changed.', retryable: true })} onRetry={onRetry} standaloneUrl={null} />);
    expect(screen.getByText('The program changed.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Retry' });
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('session_expired: alert with Sign in again link to /login', () => {
    render(<HostStatePanel resolution={failure('session_expired')} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  test('service_unavailable (retryable): alert, Retry, and curriculum-unaffected note', () => {
    const onRetry = jest.fn();
    render(<HostStatePanel resolution={failure('service_unavailable', { retryable: true })} onRetry={onRetry} standaloneUrl={null} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Curriculum editing is unaffected.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('service_unavailable (not retryable): no Retry button', () => {
    render(<HostStatePanel resolution={failure('service_unavailable', { retryable: false })} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  test('version_mismatch: explanatory text and standalone link when available', () => {
    render(<HostStatePanel resolution={failure('version_mismatch')} onRetry={jest.fn()} standaloneUrl="https://ax.example.edu" />);
    expect(screen.getByText(/newer version of ApplicationX/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open in ApplicationX/ });
    expect(link).toHaveAttribute('href', 'https://ax.example.edu');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('version_mismatch: no standalone link without a URL', () => {
    render(<HostStatePanel resolution={failure('version_mismatch')} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.queryByRole('link', { name: /Open in ApplicationX/ })).toBeNull();
  });

  test('unknown state: falls back to the version_mismatch copy with a heading (M-7)', () => {
    const unknown = { state: 'brand_new_state', message: 'm', retryable: false } as unknown as HostFailure;
    render(<HostStatePanel resolution={unknown} onRetry={jest.fn()} standaloneUrl="https://ax.example.edu" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('This embedded workspace needs an update.');
    expect(screen.getByText('ApplicationX returned a response this version of Calricula cannot display.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in ApplicationX/ })).toHaveAttribute('href', 'https://ax.example.edu');
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  test('never renders workspace data even if a ready-shaped object is forced in', () => {
    const forced = {
      state: 'context_stale',
      message: 'stale',
      retryable: true,
      workspace_title: 'SECRET WORKSPACE',
      workspace_id: 'ws-1',
    } as unknown as HostFailure;
    render(<HostStatePanel resolution={forced} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.queryByText(/SECRET WORKSPACE/)).toBeNull();
    expect(screen.queryByText(/ws-1/)).toBeNull();
  });
});

// Task 8 smoke test: the shared shell is embeddable inside Calricula's card
// without competing landmarks — it renders a labelled <section>, never a
// <main>, and its ask box is a labelled textbox.
describe('WorkspaceShell (shared package) inside a luminous-card', () => {
  const context: WorkspaceHostContext = {
    host: 'calricula',
    organization_ref: 'lamc',
    campus_ref: 'LAMC',
    program_ref: { source_app: 'calricula', external_id: 'p1', revision: '2026-09-19T00:00:00Z' },
    workspace_id: null,
    context_id: 'p1:2026-09-19T00:00:00Z',
  };
  const adapter: WorkspaceHostAdapter = {
    resolveContext: async () => ({
      state: 'ready',
      workspace_id: 'w1',
      workspace_title: 'CS workspace',
      program_title: 'Computer Science',
      campus_label: 'LAMC',
      revision_label: 'Revision 1',
      api_version: '1.0.0',
    }),
    request: async () => {
      throw new Error('not used');
    },
    async *subscribe() {},
    navigateToProgram: jest.fn(),
    openStandalone: jest.fn(),
  };

  test('renders a labelled section with a labelled chat textbox and no <main>', async () => {
    const { container } = render(
      <div className="luminous-card">
        <WorkspaceShell adapter={adapter} context={context} />
      </div>,
    );
    const region = await screen.findByRole('region', { name: 'CS workspace' });
    expect(region.tagName).toBe('SECTION');
    expect(region.closest('.luminous-card')).not.toBeNull();
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Ask about classes, programs and campus services' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(region).toHaveTextContent('Computer Science');
  });
});
