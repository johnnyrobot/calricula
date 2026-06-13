/**
 * CCNAlignmentBadge Accessibility Tests - CUR-247
 *
 * Tests accessibility features of the CCNAlignmentBadge component including:
 * - ARIA attributes
 * - Keyboard navigation
 * - Screen reader compatibility
 * - axe-core automated checks
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  CCNAlignmentBadge,
  CCNAlignmentBadgeCompact,
  CCNAlignmentInfo,
  CCNStandard
} from '../CCNAlignmentBadge';

expect.extend(toHaveNoViolations);

describe('CCNAlignmentBadge Accessibility', () => {
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

  describe('ARIA Attributes', () => {
    it('has proper aria-label on button', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'C-ID Aligned: MATH C2210');
    });

    it('has aria-label without standard when none status', () => {
      render(<CCNAlignmentBadge alignment={noneInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'No C-ID Match');
    });

    it('has aria-expanded attribute that changes when tooltip opens', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} showTooltip={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-haspopup attribute indicating dialog', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('tooltip has dialog role when open', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('tooltip dialog has descriptive aria-label', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-label', 'C-ID alignment details');
    });

    it('close button has aria-label', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      const closeButton = screen.getByLabelText('Close tooltip');
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('button is focusable with Tab', async () => {
      const user = userEvent.setup();
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('opens tooltip with Enter key', async () => {
      const user = userEvent.setup();
      render(<CCNAlignmentBadge alignment={alignedInfo} showTooltip={true} />);

      const button = screen.getByRole('button');
      button.focus();

      await user.keyboard('{Enter}');

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens tooltip with Space key', async () => {
      const user = userEvent.setup();
      render(<CCNAlignmentBadge alignment={alignedInfo} showTooltip={true} />);

      const button = screen.getByRole('button');
      button.focus();

      await user.keyboard(' ');

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has visible focus indicator styles', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      // Check that focus-visible classes are present in className
      expect(button.className).toContain('focus-visible:ring-2');
      expect(button.className).toContain('focus-visible:ring-luminous-500');
    });
  });

  describe('axe-core Automated Checks', () => {
    it('CCNAlignmentBadge aligned has no a11y violations', async () => {
      const { container } = render(<CCNAlignmentBadge alignment={alignedInfo} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('CCNAlignmentBadge potential has no a11y violations', async () => {
      const { container } = render(<CCNAlignmentBadge alignment={potentialInfo} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('CCNAlignmentBadge none status has no a11y violations', async () => {
      const { container } = render(<CCNAlignmentBadge alignment={noneInfo} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('CCNAlignmentBadge with open tooltip has no a11y violations', async () => {
      const { container } = render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Screen Reader Compatibility', () => {
    it('badge text is readable by screen readers', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      // The button with aria-label contains the readable text
      expect(screen.getByRole('button', { name: /C-ID Aligned: MATH C2210/i })).toBeInTheDocument();
    });

    it('tooltip content is accessible when open', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      // Important information should be in the document
      expect(screen.getByText('This course is aligned with a C-ID standard')).toBeInTheDocument();
      expect(screen.getByText('Calculus I')).toBeInTheDocument();
    });

    it('match reasons are visible to screen readers', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Subject code match')).toBeInTheDocument();
      expect(screen.getByText('Title similarity')).toBeInTheDocument();
    });

    it('confidence score is readable for potential matches', () => {
      render(<CCNAlignmentBadge alignment={potentialInfo} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('65%')).toBeInTheDocument();
    });
  });

  describe('Size Variants Accessibility', () => {
    it('small size maintains accessible touch target', () => {
      render(<CCNAlignmentBadge alignment={alignedInfo} size="sm" />);

      const button = screen.getByRole('button');
      // Should still have padding for touch target
      expect(button.className).toContain('px-2');
      expect(button.className).toContain('py-0.5');
    });

    it('large size maintains accessibility features', async () => {
      const { container } = render(<CCNAlignmentBadge alignment={alignedInfo} size="lg" />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});

describe('CCNAlignmentBadgeCompact Accessibility', () => {
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

  describe('axe-core Automated Checks', () => {
    it('CCNAlignmentBadgeCompact has no a11y violations', async () => {
      const { container } = render(<CCNAlignmentBadgeCompact alignment={alignedInfo} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Accessibility Features', () => {
    it('has descriptive title attribute', () => {
      render(<CCNAlignmentBadgeCompact alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'C-ID Aligned: English Composition');
    });

    it('is keyboard accessible', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      render(<CCNAlignmentBadgeCompact alignment={alignedInfo} onClick={handleClick} />);

      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('has visible focus styles', () => {
      render(<CCNAlignmentBadgeCompact alignment={alignedInfo} />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('focus-visible:ring-2');
    });
  });
});
