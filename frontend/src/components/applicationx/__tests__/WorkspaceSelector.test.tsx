import { render, screen } from '@testing-library/react';
import { WorkspaceSelector } from '../WorkspaceSelector';

test('WorkspaceSelector points the user at the Programs list', () => {
  render(<WorkspaceSelector />);
  expect(screen.getByText('Open a program page and choose Collaboration to enter its workspace.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Programs/ })).toHaveAttribute('href', '/programs');
});
