import { render, screen } from '@testing-library/react';
import { ContextBanner } from '../ContextBanner';

describe('ContextBanner', () => {
  test('renders labelled region with context, back link and standalone link', () => {
    render(
      <ContextBanner
        campusLabel="Los Angeles City College"
        programTitle="Computer Science AS-T"
        revisionLabel="Rev 2026-09-01"
        standaloneUrl="https://ax.example.edu/w/1"
        backHref="/programs/p1"
      />,
    );
    expect(screen.getByRole('region', { name: 'Workspace context' })).toBeInTheDocument();
    expect(screen.getByText('Los Angeles City College')).toBeInTheDocument();
    expect(screen.getByText('Computer Science AS-T')).toBeInTheDocument();
    expect(screen.getByText('Rev 2026-09-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to program' })).toHaveAttribute('href', '/programs/p1');
    const open = screen.getByRole('link', { name: /Open in ApplicationX/ });
    expect(open).toHaveAttribute('href', 'https://ax.example.edu/w/1');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('omits the standalone link when no URL', () => {
    render(<ContextBanner campusLabel="C" programTitle="P" revisionLabel="R" standaloneUrl={null} backHref="/programs/p1" />);
    expect(screen.queryByRole('link', { name: /Open in ApplicationX/ })).toBeNull();
  });
});
