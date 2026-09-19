import { render, screen, fireEvent } from '@testing-library/react';
import { HostStatePanel } from '../HostStatePanel';
import type { HostFailure } from '@/lib/applicationx/types';

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
  });

  test('mapping_required: explains and tells the user who can map it', () => {
    render(<HostStatePanel resolution={failure('mapping_required')} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(screen.getByText('This program is not mapped to an ApplicationX workspace.')).toBeInTheDocument();
    expect(screen.getByText(/Ask an ApplicationX administrator to map it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  test('context_stale: shows message and Retry calls onRetry', () => {
    const onRetry = jest.fn();
    render(<HostStatePanel resolution={failure('context_stale', { message: 'The program changed.', retryable: true })} onRetry={onRetry} standaloneUrl={null} />);
    expect(screen.getByText('The program changed.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Retry' });
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
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
