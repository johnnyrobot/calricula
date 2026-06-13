import { render, screen, fireEvent } from '@testing-library/react';
import { CCNAlignmentBadge, CCNAlignmentBadgeCompact, CCNAlignmentInfo, CCNStandard } from '../CCNAlignmentBadge';

describe('CCNAlignmentBadge', () => {
  const mockStandard: CCNStandard = {
    c_id: 'MATH C2210',
    discipline: 'MATH',
    title: 'Calculus I',
    descriptor: 'Introduction to differential calculus',
    minimum_units: 4,
    slo_requirements: ['Apply limits', 'Compute derivatives'],
    content_requirements: ['Limits', 'Derivatives', 'Integrals'],
  };

  const alignedInfo: CCNAlignmentInfo = {
    status: 'aligned',
    standard: mockStandard,
    confidence_score: 0.95,
    match_reasons: ['Subject code match', 'Title similarity'],
    units_sufficient: true,
  };

  const potentialInfo: CCNAlignmentInfo = {
    status: 'potential',
    standard: mockStandard,
    confidence_score: 0.65,
    match_reasons: ['Partial title match'],
    units_sufficient: true,
  };

  const noneInfo: CCNAlignmentInfo = {
    status: 'none',
  };

  describe('Aligned status', () => {
    it('renders aligned badge with C-ID', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      expect(screen.getByText('C-ID: MATH C2210')).toBeInTheDocument();
    });

    it('has green styling for aligned status', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-green-100');
    });

    it('shows tooltip on click when showTooltip is true', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} showTooltip={true} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Check tooltip content
      expect(screen.getByText('C-ID Aligned')).toBeInTheDocument();
      expect(screen.getByText('This course is aligned with a C-ID standard')).toBeInTheDocument();
    });

    it('displays standard info in tooltip', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('C-ID Standard')).toBeInTheDocument();
      expect(screen.getByText('Calculus I')).toBeInTheDocument();
    });

    it('shows match reasons in tooltip', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Subject code match')).toBeInTheDocument();
      expect(screen.getByText('Title similarity')).toBeInTheDocument();
    });
  });

  describe('Potential status', () => {
    it('renders potential badge with C-ID', () => {
      render(<CCNAlignmentBadge alignment={potentialInfo} />);

      expect(screen.getByText('Potential: MATH C2210')).toBeInTheDocument();
    });

    it('has amber styling for potential status', () => {
      render(<CCNAlignmentBadge alignment={potentialInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-amber-100');
    });

    it('shows confidence score in tooltip', () => {
      render(<CCNAlignmentBadge alignment={potentialInfo} />);

      fireEvent.click(screen.getByRole('button'));

      // Confidence score should be displayed as percentage
      expect(screen.getByText('65%')).toBeInTheDocument();
    });
  });

  describe('None status', () => {
    it('renders no match badge', () => {
      render(<CCNAlignmentBadge alignment={noneInfo} />);

      expect(screen.getByText('No C-ID Match')).toBeInTheDocument();
    });

    it('has slate styling for none status', () => {
      render(<CCNAlignmentBadge alignment={noneInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-100');
    });

    it('shows explanation in tooltip for none status', () => {
      render(<CCNAlignmentBadge alignment={noneInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('No matching C-ID standard found')).toBeInTheDocument();
      expect(screen.getByText(/Specialized or vocational courses/i)).toBeInTheDocument();
    });
  });

  describe('Size variants', () => {
    it('renders small size correctly', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} size="sm" />);

      const button = screen.getByRole('button');
      // Check individual classes in className string
      expect(button.className).toContain('px-2');
      expect(button.className).toContain('gap-1');
    });

    it('renders medium size correctly', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} size="md" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('px-2.5');
      expect(button.className).toContain('py-1');
    });

    it('renders large size correctly', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} size="lg" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('px-3');
      expect(button.className).toContain('py-1.5');
    });

    it('uses short label for small size with none status', () => {
      render(<CCNAlignmentBadge alignment={noneInfo} size="sm" />);

      expect(screen.getByText('No Match')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('calls onClick when provided', () => {
      const handleClick = jest.fn();
      render(<CCNAlignmentBadge alignment={alignedInfo} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('calls onViewComparison when View Full Comparison is clicked', () => {
      const handleViewComparison = jest.fn();
      render(
        <CCNAlignmentBadge
          alignment={alignedInfo}
          onViewComparison={handleViewComparison}
        />
      );

      // Open tooltip
      fireEvent.click(screen.getByRole('button'));

      // Click view comparison button
      const viewButton = screen.getByText('View Full Comparison');
      fireEvent.click(viewButton);

      expect(handleViewComparison).toHaveBeenCalledWith(mockStandard);
    });

    it('closes tooltip when backdrop is clicked', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      // Open tooltip
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('C-ID Aligned')).toBeInTheDocument();

      // Click backdrop (fixed inset div)
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      // Tooltip should be closed
      expect(screen.queryByText('This course is aligned with a C-ID standard')).not.toBeInTheDocument();
    });

    it('closes tooltip when close button is clicked', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      // Open tooltip
      fireEvent.click(screen.getByRole('button'));

      // Click close button
      const closeButton = screen.getByLabelText('Close tooltip');
      fireEvent.click(closeButton);

      // Tooltip content should be gone
      expect(screen.queryByText('This course is aligned with a C-ID standard')).not.toBeInTheDocument();
    });
  });

  describe('Units warning', () => {
    it('shows warning when units are insufficient', () => {
      const insufficientUnitsInfo: CCNAlignmentInfo = {
        ...alignedInfo,
        units_sufficient: false,
      };

      render(<CCNAlignmentBadge alignment={insufficientUnitsInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText(/below the minimum required/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'C-ID Aligned: MATH C2210');
    });

    it('has aria-expanded attribute when tooltip is open', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('tooltip has dialog role', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

describe('CCNAlignmentBadgeCompact', () => {
  const mockStandard: CCNStandard = {
    c_id: 'ENGL C1000',
    discipline: 'ENGL',
    title: 'English Composition',
    minimum_units: 3,
  };

  const alignedInfo: CCNAlignmentInfo = {
    status: 'aligned',
    standard: mockStandard,
  };

  const potentialInfo: CCNAlignmentInfo = {
    status: 'potential',
    standard: mockStandard,
  };

  const noneInfo: CCNAlignmentInfo = {
    status: 'none',
  };

  it('renders C-ID for aligned status', () => {
    render(<CCNAlignmentBadgeCompact alignment={alignedInfo} />);

    expect(screen.getByText('ENGL C1000')).toBeInTheDocument();
  });

  it('renders C-ID for potential status', () => {
    render(<CCNAlignmentBadgeCompact alignment={potentialInfo} />);

    expect(screen.getByText('ENGL C1000')).toBeInTheDocument();
  });

  it('returns null for none status', () => {
    const { container } = render(<CCNAlignmentBadgeCompact alignment={noneInfo} />);

    expect(container.firstChild).toBeNull();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<CCNAlignmentBadgeCompact alignment={alignedInfo} onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has correct title attribute', () => {
    render(<CCNAlignmentBadgeCompact alignment={alignedInfo} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'C-ID Aligned: English Composition');
  });
});
