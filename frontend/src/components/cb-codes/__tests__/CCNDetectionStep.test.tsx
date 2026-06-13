import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CCNDetectionStep } from '../CCNDetectionStep';

// Mock useAuth hook
const mockGetToken = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CCNDetectionStep', () => {
  const defaultProps = {
    courseId: 'course-123',
    courseTitle: 'Introduction to Calculus',
    subjectCode: 'MATH',
    courseUnits: 4,
    courseDescription: 'An introduction to differential calculus',
    onCCNAdopted: jest.fn(),
    onCCNSkipped: jest.fn(),
    onNext: jest.fn(),
  };

  const mockMatchResponse = {
    best_match: {
      c_id: 'MATH C2210',
      discipline: 'MATH',
      title: 'Calculus I',
      descriptor: 'Introduction to differential and integral calculus',
      minimum_units: 4,
      confidence_score: 0.85,
      match_reasons: ['Subject code match', 'Title similarity'],
      slo_requirements: ['Apply limits', 'Compute derivatives'],
      content_requirements: ['Limits', 'Derivatives'],
      alignment_status: 'aligned',
      units_sufficient: true,
    },
  };

  const mockNoMatchResponse = {
    best_match: null,
  };

  const mockLowConfidenceResponse = {
    best_match: {
      ...mockMatchResponse.best_match,
      confidence_score: 0.3, // Below 0.5 threshold
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    // Default: return a valid token
    mockGetToken.mockResolvedValue('mock-auth-token');
  });

  describe('Loading state', () => {
    it('shows loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<CCNDetectionStep {...defaultProps} />);

      expect(screen.getByText('Checking CCN Standards')).toBeInTheDocument();
      expect(screen.getByText(/Searching for Common Course Numbering/)).toBeInTheDocument();
    });

    it('has role status for accessibility during loading', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<CCNDetectionStep {...defaultProps} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('displays CCN header with sparkles icon', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Common Course Numbering (CCN)')).toBeInTheDocument();
      });

      expect(screen.getByText(/Per AB 1111/)).toBeInTheDocument();
    });
  });

  describe('Match found state', () => {
    it('displays match when high confidence match found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('C-ID Standard Match Found')).toBeInTheDocument();
      });

      // Use getAllByText since C-ID appears in multiple places
      const cIdElements = screen.getAllByText('MATH C2210');
      expect(cIdElements.length).toBeGreaterThan(0);
    });

    it('shows benefits panel when match is found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Benefits of CCN Alignment')).toBeInTheDocument();
      });

      expect(screen.getByText(/CB05 auto-set to "A"/)).toBeInTheDocument();
      expect(screen.getByText(/CB03 auto-populated/)).toBeInTheDocument();
    });

    it('calls API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/compliance/ccn-match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            title: 'Introduction to Calculus',
            description: 'An introduction to differential calculus',
            subject_code: 'MATH',
            units: 4,
          }),
        });
      });
    });
  });

  describe('No match state', () => {
    it('displays no match when no CCN standard found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No CCN Standard Found')).toBeInTheDocument();
      });

      expect(screen.getByText(/No matching C-ID standard was found/)).toBeInTheDocument();
    });

    it('displays no match when confidence is below threshold', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLowConfidenceResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No CCN Standard Found')).toBeInTheDocument();
      });
    });

    it('shows AB 1111 compliance note', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('AB 1111 Compliance Note')).toBeInTheDocument();
      });
    });

    it('shows Provide Justification and Skip buttons', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Provide Justification')).toBeInTheDocument();
        expect(screen.getByText('Skip for Now')).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('displays error state when API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to Check CCN Standards')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('shows skip button on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Skip CCN Check')).toBeInTheDocument();
      });
    });

    it('retries API call when retry is clicked', async () => {
      const user = userEvent.setup();

      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      await user.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('C-ID Standard Match Found')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Adoption flow', () => {
    it('calls onCCNAdopted and onNext when adopting', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Adopt Standard')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Adopt Standard'));

      expect(defaultProps.onCCNAdopted).toHaveBeenCalledWith(
        'MATH C2210',
        expect.objectContaining({
          cb05: 'A',
          cb03: '1701.00', // MATH TOP code
        })
      );
      expect(defaultProps.onNext).toHaveBeenCalled();
    });

    it('auto-populates cb03 with TOP code based on discipline', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          best_match: {
            ...mockMatchResponse.best_match,
            discipline: 'PSYCH',
          },
        }),
      });

      render(<CCNDetectionStep {...defaultProps} subjectCode="PSYCH" />);

      await waitFor(() => {
        expect(screen.getByText('Adopt Standard')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Adopt Standard'));

      expect(defaultProps.onCCNAdopted).toHaveBeenCalledWith(
        'MATH C2210',
        expect.objectContaining({
          cb05: 'A',
          cb03: '2001.00', // PSYCH TOP code
        })
      );
    });
  });

  describe('Skip flow', () => {
    it('calls onCCNSkipped and onNext when skip is clicked (no match)', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Skip for Now')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Skip for Now'));

      expect(defaultProps.onCCNSkipped).toHaveBeenCalledWith();
      expect(defaultProps.onNext).toHaveBeenCalled();
    });

    it('calls onCCNSkipped and onNext when skip is clicked (error)', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Skip CCN Check')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Skip CCN Check'));

      expect(defaultProps.onCCNSkipped).toHaveBeenCalled();
      expect(defaultProps.onNext).toHaveBeenCalled();
    });
  });

  describe('Justification flow', () => {
    it('shows justification form when Provide Justification is clicked', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Provide Justification')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Provide Justification'));

      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();
      expect(screen.getByText('Specialized Course')).toBeInTheDocument();
    });

    it('shows justification form when dismissing match', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Dismiss'));

      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();
    });

    it('submits justification to API', async () => {
      const user = userEvent.setup();

      // First call - CCN match check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Provide Justification')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Provide Justification'));

      // Select reason and enter justification
      await user.click(screen.getByText('Vocational/CTE Course').closest('label')!);
      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'This is a vocational automotive course.');

      // Mock justification API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await user.click(screen.getByText('Submit Justification'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenLastCalledWith('/api/compliance/ccn-non-match-justification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            course_id: 'course-123',
            reason_code: 'vocational',
            justification_text: 'This is a vocational automotive course.',
          }),
        });
      });

      expect(defaultProps.onCCNSkipped).toHaveBeenCalledWith({
        reasonCode: 'vocational',
        text: 'This is a vocational automotive course.',
      });
      expect(defaultProps.onNext).toHaveBeenCalled();
    });

    it('goes back from justification form to no match state', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNoMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Provide Justification')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Provide Justification'));
      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();

      await user.click(screen.getByText('Back'));

      expect(screen.getByText('No CCN Standard Found')).toBeInTheDocument();
    });

    it('goes back from justification form to match state', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMatchResponse),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Dismiss'));
      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();

      await user.click(screen.getByText('Back'));

      expect(screen.getByText('C-ID Standard Match Found')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('loading spinner icons have aria-hidden', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<CCNDetectionStep {...defaultProps} />);

      const hiddenIcons = document.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });
  });
});
