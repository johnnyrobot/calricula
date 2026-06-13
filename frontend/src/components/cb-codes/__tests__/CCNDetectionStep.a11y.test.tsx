/**
 * CCNDetectionStep Accessibility Tests - CUR-247
 *
 * Tests accessibility features of the CCNDetectionStep component including:
 * - Loading state announcements
 * - Error state alerts
 * - Status announcements for screen readers
 * - axe-core automated checks
 *
 * Note: This component has complex async behavior with auth token fetching
 * and API calls. Tests focus on stable, observable accessibility behaviors.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CCNDetectionStep } from '../CCNDetectionStep';

// Track the mock token function for verification
const mockGetToken = jest.fn().mockResolvedValue('mock-token');

// Mock the auth context
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

expect.extend(toHaveNoViolations);

describe('CCNDetectionStep Accessibility', () => {
  const createProps = () => ({
    courseId: 'test-course-123',
    courseTitle: 'Calculus I',
    subjectCode: 'MATH',
    courseUnits: 4,
    courseDescription: 'Introduction to differential calculus',
    onCCNAdopted: jest.fn(),
    onCCNSkipped: jest.fn(),
    onNext: jest.fn(),
  });

  const mockNoMatchResponse = {
    best_match: null,
  };

  const mockMatchResponse = {
    best_match: {
      c_id: 'MATH C2210',
      discipline: 'MATH',
      title: 'Calculus I',
      minimum_units: 4,
      confidence_score: 0.95,
      match_reasons: ['Subject code match', 'Title match'],
      slo_requirements: [],
      content_requirements: [],
      alignment_status: 'aligned',
      units_sufficient: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockGetToken.mockResolvedValue('mock-token');
  });

  describe('Loading State', () => {
    beforeEach(() => {
      // Keep component in loading state with a promise that never resolves
      mockFetch.mockImplementation(() => new Promise(() => {}));
    });

    it('loading state has role="status" with aria-live for screen readers', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      const loadingStatus = screen.getByRole('status');
      expect(loadingStatus).toBeInTheDocument();
      expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    });

    it('loading state has descriptive heading text', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      expect(screen.getByText('Checking CCN Standards')).toBeInTheDocument();
      expect(screen.getByText(/Searching for Common Course Numbering matches/i)).toBeInTheDocument();
    });

    it('loading spinner icon is hidden from screen readers with aria-hidden', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      const hiddenIcons = document.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });

    it('loading state has no axe violations', async () => {
      let container: HTMLElement;
      await act(async () => {
        const result = render(<CCNDetectionStep {...createProps()} />);
        container = result.container;
      });

      const results = await axe(container!);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Header Section (always visible)', () => {
    beforeEach(() => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
    });

    it('has descriptive heading with "Common Course Numbering"', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      const heading = screen.getByRole('heading', { name: /Common Course Numbering/i });
      expect(heading).toBeInTheDocument();
    });

    it('has explanatory text about AB 1111 requirement', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      expect(screen.getByText(/Per AB 1111, we'll check if this course aligns/i)).toBeInTheDocument();
    });

    it('decorative header icon has aria-hidden', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      const headerIcon = document.querySelector('svg[aria-hidden="true"]');
      expect(headerIcon).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    beforeEach(() => {
      mockFetch.mockRejectedValue(new Error('Network error'));
    });

    it('displays error message when fetch fails', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('provides Retry button for error recovery', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /Retry/i });
        expect(retryButton).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('provides Skip CCN Check button as alternative action', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        const skipButton = screen.getByRole('button', { name: /Skip CCN Check/i });
        expect(skipButton).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('error state has no axe violations', async () => {
      let container: HTMLElement;
      await act(async () => {
        const result = render(<CCNDetectionStep {...createProps()} />);
        container = result.container;
      });

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      const results = await axe(container!);
      expect(results).toHaveNoViolations();
    });
  });

  describe('No Match State', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });
    });

    it('displays "No CCN Standard Found" heading', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByText('No CCN Standard Found')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('shows AB 1111 compliance warning', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByText('AB 1111 Compliance Note')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('provides accessible action buttons', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Provide Justification/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Skip for Now/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('mentions subject code in message for context', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByText(/No matching C-ID standard was found for this MATH course/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('no match state has no axe violations', async () => {
      let container: HTMLElement;
      await act(async () => {
        const result = render(<CCNDetectionStep {...createProps()} />);
        container = result.container;
      });

      await waitFor(() => {
        expect(screen.getByText('No CCN Standard Found')).toBeInTheDocument();
      }, { timeout: 3000 });

      const results = await axe(container!);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Match Found State', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });
    });

    it('displays matched CCN standard identifier', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        // Multiple elements contain the C-ID - just verify at least one is present
        const elements = screen.getAllByText(/MATH C2210/i);
        expect(elements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('shows benefits of CCN alignment', async () => {
      await act(async () => {
        render(<CCNDetectionStep {...createProps()} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Benefits of CCN Alignment')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('match found state has no axe violations', async () => {
      let container: HTMLElement;
      await act(async () => {
        const result = render(<CCNDetectionStep {...createProps()} />);
        container = result.container;
      });

      await waitFor(() => {
        // Multiple elements contain the C-ID - just verify at least one is present
        const elements = screen.getAllByText(/MATH C2210/i);
        expect(elements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      const results = await axe(container!);
      expect(results).toHaveNoViolations();
    });
  });
});
