/**
 * Hook for fetching user's courses with filtering and search
 *
 * Provides:
 * - Fetching all user's courses
 * - Filtering by CTE status (CB04)
 * - Search/filter by query
 * - Loading and error states
 */

import { useEffect, useState } from 'react';
import { CourseListItem, CourseListResponse } from '@/lib/api';

interface UseUserCoursesOptions {
  /** Filter for CTE courses only */
  cteOnly?: boolean;

  /** Initial search query */
  initialQuery?: string;

  /** Whether to immediately fetch on mount */
  autoFetch?: boolean;
}

interface UseUserCoursesResult {
  /** List of courses */
  courses: CourseListItem[];

  /** Whether data is loading */
  isLoading: boolean;

  /** Error message if fetch failed */
  error: string | null;

  /** Fetch function to manually trigger fetch */
  fetchCourses: (query?: string) => Promise<void>;

  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook to fetch and manage user's courses
 */
export function useUserCourses({
  cteOnly = true,
  initialQuery = '',
  autoFetch = true,
}: UseUserCoursesOptions = {}): UseUserCoursesResult {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = async (query: string = initialQuery) => {
    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
      const url = new URL('/api/courses', baseUrl);

      // Add parameters
      url.searchParams.append('author', 'me');
      if (cteOnly) {
        url.searchParams.append('cb04', 'cte');
      }
      if (query) {
        url.searchParams.append('q', query);
      }
      url.searchParams.append('limit', '100'); // Get up to 100 courses

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          // Auth token will be added by fetch interceptor if available
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch courses: ${response.statusText}`);
      }

      const data: CourseListResponse = await response.json();
      setCourses(data.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setCourses([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchCourses(initialQuery);
    }
  }, [autoFetch, initialQuery]);

  return {
    courses,
    isLoading,
    error,
    fetchCourses,
    clearError: () => setError(null),
  };
}

export default useUserCourses;
