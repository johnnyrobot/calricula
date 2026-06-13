import { render, screen } from '@testing-library/react';
import {
  Spinner,
  ButtonSpinner,
  InlineLoading,
  CenteredSpinner,
  FullPageSpinner,
  OverlaySpinner,
} from '../Spinner';

describe('Spinner', () => {
  it('renders with default props', () => {
    render(<Spinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<Spinner label="Saving..." />);

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('applies size classes correctly', () => {
    const { rerender } = render(<Spinner size="sm" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-4', 'w-4');

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-8', 'w-8');

    rerender(<Spinner size="xl" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-12', 'w-12');
  });

  it('applies variant classes correctly', () => {
    const { rerender } = render(<Spinner variant="primary" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('text-luminous-600');

    rerender(<Spinner variant="white" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('text-white');

    rerender(<Spinner variant="muted" />);
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('text-slate-400');
  });

  it('applies custom className', () => {
    render(<Spinner className="custom-class" />);

    expect(screen.getByRole('status')).toHaveClass('custom-class');
  });

  it('has accessible sr-only label', () => {
    render(<Spinner label="Processing data" />);

    const srOnlyText = screen.getByText('Processing data');
    expect(srOnlyText).toHaveClass('sr-only');
  });

  it('has aria-hidden on svg for accessibility', () => {
    render(<Spinner />);

    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ButtonSpinner', () => {
  it('renders small white spinner', () => {
    render(<ButtonSpinner />);

    const status = screen.getByRole('status');
    expect(status.querySelector('svg')).toHaveClass('h-4', 'w-4', 'text-white');
  });

  it('applies custom className', () => {
    render(<ButtonSpinner className="ml-2" />);

    expect(screen.getByRole('status')).toHaveClass('ml-2');
  });
});

describe('InlineLoading', () => {
  it('renders with default text', () => {
    render(<InlineLoading />);

    // Two "Loading..." texts: sr-only (from Spinner) and visible text
    expect(screen.getAllByText('Loading...')).toHaveLength(2);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<InlineLoading text="Fetching data..." />);

    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('applies size prop to spinner', () => {
    render(<InlineLoading size="lg" />);

    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-8', 'w-8');
  });

  it('applies custom className', () => {
    const { container } = render(<InlineLoading className="my-4" />);

    expect(container.firstChild).toHaveClass('my-4');
  });
});

describe('CenteredSpinner', () => {
  it('renders with default size', () => {
    render(<CenteredSpinner />);

    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-8', 'w-8');
  });

  it('renders with custom text', () => {
    render(<CenteredSpinner text="Loading courses..." />);

    expect(screen.getByText('Loading courses...')).toBeInTheDocument();
  });

  it('does not render text when not provided', () => {
    const { container } = render(<CenteredSpinner />);

    expect(container.querySelector('p')).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<CenteredSpinner className="min-h-screen" />);

    expect(container.firstChild).toHaveClass('min-h-screen');
  });
});

describe('FullPageSpinner', () => {
  it('renders with default text', () => {
    render(<FullPageSpinner />);

    // Two "Loading..." texts: sr-only (from Spinner) and visible paragraph
    expect(screen.getAllByText('Loading...')).toHaveLength(2);
  });

  it('renders with custom text', () => {
    render(<FullPageSpinner text="Initializing application..." />);

    // Only one occurrence of custom text (in the paragraph)
    expect(screen.getByText('Initializing application...')).toBeInTheDocument();
  });

  it('has fixed positioning and backdrop', () => {
    const { container } = render(<FullPageSpinner />);

    expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-50');
  });

  it('uses xl size spinner', () => {
    render(<FullPageSpinner />);

    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('h-12', 'w-12');
  });
});

describe('OverlaySpinner', () => {
  it('renders without text', () => {
    const { container } = render(<OverlaySpinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders with text', () => {
    render(<OverlaySpinner text="Saving changes..." />);

    expect(screen.getByText('Saving changes...')).toBeInTheDocument();
  });

  it('has absolute positioning', () => {
    const { container } = render(<OverlaySpinner />);

    expect(container.firstChild).toHaveClass('absolute', 'inset-0', 'z-10');
  });

  it('applies custom className', () => {
    const { container } = render(<OverlaySpinner className="rounded-xl" />);

    expect(container.firstChild).toHaveClass('rounded-xl');
  });
});
