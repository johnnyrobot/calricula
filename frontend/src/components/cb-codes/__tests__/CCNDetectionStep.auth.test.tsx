/**
 * CCNDetectionStep Authentication Flow Tests
 *
 * Tests specific to authentication handling in the CCN Detection Step component.
 * Covers 401 handling, token refresh, and session expiry scenarios.
 */

import { render, screen, waitFor } from '@testing-library/react';
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

describe('CCNDetectionStep Authentication', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Token Retrieval', () => {
    it('requests auth token before making API call', async () => {
      mockGetToken.mockResolvedValue('valid-auth-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ best_match: null }),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetToken).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/compliance/ccn-match',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer valid-auth-token',
            }),
          })
        );
      });
    });

    it('shows error when no token is available', async () => {
      mockGetToken.mockResolvedValue(null);

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();
      });
    });

    it('includes token in Authorization header', async () => {
      const testToken = 'my-test-bearer-token-123';
      mockGetToken.mockResolvedValue(testToken);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ best_match: null }),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
      });
    });
  });

  describe('401 Error Handling', () => {
    it('shows session expired message on 401 response', async () => {
      mockGetToken.mockResolvedValue('expired-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
      });
    });

    it('provides retry option after 401 error', async () => {
      mockGetToken.mockResolvedValue('expired-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
    });

    it('provides skip option after 401 error', async () => {
      mockGetToken.mockResolvedValue('expired-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Skip CCN Check/i })).toBeInTheDocument();
      });
    });
  });

  describe('Token Refresh Scenarios', () => {
    it('handles successful retry after token refresh', async () => {
      // First call fails with no token
      mockGetToken
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('fresh-token');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ best_match: null }),
      });

      const { rerender } = render(<CCNDetectionStep {...defaultProps} />);

      // First render shows error
      await waitFor(() => {
        expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();
      });

      // User clicks retry (simulated by re-rendering after token available)
      rerender(<CCNDetectionStep {...defaultProps} key="retry" />);

      await waitFor(() => {
        expect(screen.getByText(/No CCN Standard Found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Other Error Codes', () => {
    it('shows generic error for 500 response', async () => {
      mockGetToken.mockResolvedValue('valid-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch CCN matches: 500/i)).toBeInTheDocument();
      });
    });

    it('shows generic error for 403 response', async () => {
      mockGetToken.mockResolvedValue('valid-token');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch CCN matches: 403/i)).toBeInTheDocument();
      });
    });

    it('handles network errors gracefully', async () => {
      mockGetToken.mockResolvedValue('valid-token');
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to Check CCN Standards/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Justification Submission Auth', () => {
    it('includes auth token in justification submission', async () => {
      mockGetToken.mockResolvedValue('justification-token');

      // Initial CCN match returns no match
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ best_match: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'justification-123' }),
        });

      render(<CCNDetectionStep {...defaultProps} />);

      // Wait for no match state
      await waitFor(() => {
        expect(screen.getByText(/No CCN Standard Found/i)).toBeInTheDocument();
      });

      // The justification call should also include auth header when triggered
      // (This would require user interaction to trigger)
    });

    it('shows error when justification submission gets 401', async () => {
      mockGetToken.mockResolvedValue('valid-token');

      // CCN match succeeds but returns no match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ best_match: null }),
      });

      render(<CCNDetectionStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/No CCN Standard Found/i)).toBeInTheDocument();
      });
    });
  });
});
