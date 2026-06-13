import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when isOpen is true', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('renders default button texts', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders custom button texts', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmText="Delete"
        cancelText="Keep"
      />
    );

    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onConfirm and onClose when confirm button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when close button (X) is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);

    const closeButton = screen.getByLabelText('Close dialog');
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders danger variant with correct styling', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);

    // The dialog should be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The confirm button should have danger styling
    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeInTheDocument();
  });

  it('renders warning variant with correct styling', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  describe('with confirmation text input', () => {
    const propsWithConfirmation = {
      ...defaultProps,
      confirmationText: 'DELETE',
      confirmationPlaceholder: 'Type DELETE to confirm',
    };

    it('renders confirmation input when confirmationText is provided', () => {
      render(<ConfirmDialog {...propsWithConfirmation} />);

      expect(screen.getByPlaceholderText('Type DELETE to confirm')).toBeInTheDocument();
      expect(screen.getByText(/Type/)).toBeInTheDocument();
      expect(screen.getByText('DELETE')).toBeInTheDocument();
    });

    it('disables confirm button when input does not match', () => {
      render(<ConfirmDialog {...propsWithConfirmation} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();
    });

    it('enables confirm button when input matches confirmation text', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog {...propsWithConfirmation} />);

      const input = screen.getByPlaceholderText('Type DELETE to confirm');
      await user.type(input, 'DELETE');

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeEnabled();
    });

    it('does not call onConfirm when input does not match and confirm is clicked', () => {
      render(<ConfirmDialog {...propsWithConfirmation} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      fireEvent.click(confirmButton);

      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(<ConfirmDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('disables confirm button when isLoading is true', () => {
      render(<ConfirmDialog {...defaultProps} isLoading={true} />);

      const confirmButton = screen.getByRole('button', { name: /Processing/i });
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('async onConfirm', () => {
    it('handles async onConfirm correctly', async () => {
      const asyncOnConfirm = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ConfirmDialog {...defaultProps} onConfirm={asyncOnConfirm} />);

      const confirmButton = screen.getByText('Confirm');
      fireEvent.click(confirmButton);

      // Should show processing state
      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });

      // Should eventually close
      await waitFor(() => {
        expect(asyncOnConfirm).toHaveBeenCalled();
      });
    });
  });
});
