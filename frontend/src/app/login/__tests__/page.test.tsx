/**
 * Login page: the `?error=` values the server-side auth routes redirect with
 * must reach the visitor as a message, not vanish into a blank form.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import LoginPage from '../page';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const authState = {
  login: jest.fn(),
  loading: false,
  mode: 'logto' as const,
  isAuthenticated: false,
  error: null as string | null,
};
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const visit = (path: string) => window.history.pushState({}, '', path);

beforeEach(() => {
  jest.clearAllMocks();
  authState.error = null;
  visit('/login');
});

describe('LoginPage redirect errors', () => {
  it('shows a message when /callback sends the visitor back with ?error=callback', async () => {
    visit('/login?error=callback');

    render(<LoginPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Sign-in could not be completed/i);
    // The sign-in link is still offered so the visitor can retry at once.
    expect(screen.getByRole('link', { name: /sign in with your college account/i })).toHaveAttribute(
      'href',
      '/sign-in'
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows nothing for an unknown error value', async () => {
    visit('/login?error=something-else');

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole('link', { name: /college account/i })).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets a provider error take precedence over the redirect error', async () => {
    visit('/login?error=callback');
    authState.error = 'This deployment only admits demo accounts.';

    render(<LoginPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/demo accounts/i);
    expect(alert).not.toHaveTextContent(/could not be completed/i);
  });
});
