import { render, screen } from '@testing-library/react';
import PageShell from '../PageShell';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u', email: 'f@calricula.com', full_name: 'F', role: 'Faculty' },
    loading: false,
    isAuthenticated: true,
    logout: jest.fn(),
    getToken: async () => 't',
  }),
}));

const status = jest.fn();
jest.mock('@/hooks/useApplicationXStatus', () => ({
  useApplicationXStatus: () => status(),
}));

jest.mock('@/components/notifications', () => ({ NotificationBell: () => null }));
jest.mock('@/components/theme', () => ({ ThemeToggle: () => null }));

describe('PageShell ApplicationX navigation', () => {
  test('nav shows collaboration only when embed enabled', () => {
    status.mockReturnValue({ status: { enabled: true }, loading: false });
    render(<PageShell><div>x</div></PageShell>);
    // Desktop + mobile sidebars both render the nav; assert at least one and its href.
    const links = screen.getAllByRole('link', { name: /Employer & Career Collaboration/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/collaboration');
  });

  test('nav hides collaboration when disabled', () => {
    status.mockReturnValue({ status: { enabled: false }, loading: false });
    render(<PageShell><div>x</div></PageShell>);
    expect(screen.queryByRole('link', { name: /Employer & Career Collaboration/ })).toBeNull();
  });

  test('nav hides collaboration while status is unknown', () => {
    status.mockReturnValue({ status: null, loading: true });
    render(<PageShell><div>x</div></PageShell>);
    expect(screen.queryByRole('link', { name: /Employer & Career Collaboration/ })).toBeNull();
  });

  test('other nav items still render regardless of embed status', () => {
    status.mockReturnValue({ status: { enabled: false }, loading: false });
    render(<PageShell><div>x</div></PageShell>);
    expect(screen.getAllByRole('link', { name: /Programs/ })[0]).toHaveAttribute('href', '/programs');
  });
});
