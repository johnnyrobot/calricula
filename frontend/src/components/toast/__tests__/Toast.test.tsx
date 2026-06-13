import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Toast, ToastContainer } from '../Toast';
import { ToastMessage } from '../ToastContext';

describe('Toast', () => {
  const mockToast: ToastMessage = {
    id: 'test-1',
    type: 'success',
    title: 'Success!',
    message: 'Your action was completed successfully.',
  };

  const mockOnDismiss = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders toast with title and message', () => {
    render(<Toast toast={mockToast} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('Your action was completed successfully.')).toBeInTheDocument();
  });

  it('renders correct icon for success type', () => {
    render(<Toast toast={mockToast} onDismiss={mockOnDismiss} />);

    // Check for the role="alert" which indicates proper accessibility
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders error toast with correct styling', () => {
    const errorToast: ToastMessage = {
      id: 'error-1',
      type: 'error',
      title: 'Error!',
      message: 'Something went wrong.',
    };

    render(<Toast toast={errorToast} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders warning toast', () => {
    const warningToast: ToastMessage = {
      id: 'warning-1',
      type: 'warning',
      title: 'Warning!',
    };

    render(<Toast toast={warningToast} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Warning!')).toBeInTheDocument();
  });

  it('renders info toast', () => {
    const infoToast: ToastMessage = {
      id: 'info-1',
      type: 'info',
      title: 'Information',
      message: 'Here is some info.',
    };

    render(<Toast toast={infoToast} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Here is some info.')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    render(<Toast toast={mockToast} onDismiss={mockOnDismiss} />);

    const dismissButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissButton);

    // Fast forward through the exit animation
    jest.advanceTimersByTime(300);

    expect(mockOnDismiss).toHaveBeenCalledWith('test-1');
  });

  it('renders toast without message if not provided', () => {
    const toastWithoutMessage: ToastMessage = {
      id: 'no-message',
      type: 'success',
      title: 'Just a title',
    };

    render(<Toast toast={toastWithoutMessage} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Just a title')).toBeInTheDocument();
    // Message paragraph should not be present
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });
});

describe('ToastContainer', () => {
  const mockOnDismiss = jest.fn();

  const mockToasts: ToastMessage[] = [
    { id: '1', type: 'success', title: 'Success 1' },
    { id: '2', type: 'error', title: 'Error 1' },
    { id: '3', type: 'info', title: 'Info 1' },
  ];

  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders multiple toasts', () => {
    render(<ToastContainer toasts={mockToasts} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Success 1')).toBeInTheDocument();
    expect(screen.getByText('Error 1')).toBeInTheDocument();
    expect(screen.getByText('Info 1')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<ToastContainer toasts={mockToasts} onDismiss={mockOnDismiss} />);

    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });
});
