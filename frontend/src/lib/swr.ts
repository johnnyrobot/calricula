/**
 * SWR Configuration and Custom Hooks for Data Caching
 *
 * Provides stale-while-revalidate caching for API data.
 * Reference data (departments, TOP codes, CCN standards) is cached
 * with longer revalidation intervals since it changes infrequently.
 */

import useSWR, { SWRConfiguration, mutate } from 'swr';
import { useEffect, useState, useCallback } from 'react';
import { api, DepartmentListResponse, DepartmentItem } from './api';

// =============================================================================
// SWR Configuration
// =============================================================================

/**
 * Default SWR configuration for the app.
 * - Revalidate on focus for fresh data when user returns
 * - Dedupe requests within 2 seconds
 * - Show stale data while revalidating
 */
export const defaultSWRConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
  shouldRetryOnError: true,
  errorRetryCount: 3,
};

/**
 * Configuration for reference data (rarely changes).
 * - Longer cache time (5 minutes)
 * - Don't revalidate on focus for static data
 */
export const referenceDataConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 300000, // 5 minutes
  refreshInterval: 0, // Don't auto-refresh
  shouldRetryOnError: true,
  errorRetryCount: 2,
};

// =============================================================================
// API Fetcher with Auth
// =============================================================================

/**
 * Generic fetcher that uses the API client.
 * The API client handles auth token automatically.
 */
export async function fetcher<T>(key: string): Promise<T> {
  // Parse the key to determine what to fetch
  // Keys are in format: '/api/endpoint' or '/api/endpoint?params'
  const url = key.startsWith('/') ? key : `/${key}`;

  // Use fetch directly since SWR needs a simple fetcher
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = new Error('An error occurred while fetching the data.');
    throw error;
  }

  return response.json();
}

/**
 * Authenticated fetcher that includes the auth token.
 * Use this for endpoints that require authentication.
 */
export function createAuthFetcher(token: string | null) {
  return async function authFetcher<T>(key: string): Promise<T> {
    const url = key.startsWith('/') ? key : `/${key}`;
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, { headers });

    if (!response.ok) {
      const error = new Error('An error occurred while fetching the data.');
      throw error;
    }

    return response.json();
  };
}

// =============================================================================
// Cache Keys
// =============================================================================

export const CACHE_KEYS = {
  DEPARTMENTS: '/api/departments',
  TOP_CODES: '/api/reference/top-codes',
  CCN_STANDARDS: '/api/reference/ccn-standards',
  BLOOMS_VERBS: '/api/reference/blooms-verbs',
  GE_PATTERNS: '/api/reference/ge-patterns',
  COURSES: (params?: string) => `/api/courses${params ? `?${params}` : ''}`,
  COURSE: (id: string) => `/api/courses/${id}`,
  PROGRAMS: (params?: string) => `/api/programs${params ? `?${params}` : ''}`,
  PROGRAM: (id: string) => `/api/programs/${id}`,
} as const;

// =============================================================================
// Custom Hooks for Reference Data
// =============================================================================

/**
 * Hook to fetch and cache departments list.
 * Departments rarely change, so we use longer cache times.
 *
 * @param token - Optional auth token. If not provided, uses a public endpoint.
 *                For authenticated endpoints, pass the token from useAuth().
 */
export function useDepartments(token?: string | null) {
  // Create fetcher that uses auth token
  const departmentFetcher = useCallback(async () => {
    if (token) {
      api.setToken(token);
    }
    return api.listDepartments();
  }, [token]);

  // Only fetch when we have a token (skip until authenticated)
  const { data, error, isLoading, isValidating, mutate: refresh } = useSWR<DepartmentListResponse>(
    token ? CACHE_KEYS.DEPARTMENTS : null, // Skip fetching if no token
    departmentFetcher,
    referenceDataConfig
  );

  return {
    departments: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading: token ? isLoading : true, // Show loading if waiting for token
    isValidating,
    error,
    refresh,
  };
}

/**
 * Hook to fetch and cache TOP codes.
 * TOP codes are static reference data from California CCC.
 */
export interface TOPCode {
  code: string;
  title: string;
  is_vocational: boolean;
  cip_code: string | null;
}

export interface TOPCodesResponse {
  items: TOPCode[];
  total: number;
}

export function useTOPCodes(search?: string) {
  const key = search
    ? `${CACHE_KEYS.TOP_CODES}?search=${encodeURIComponent(search)}`
    : CACHE_KEYS.TOP_CODES;

  const { data, error, isLoading, isValidating } = useSWR<TOPCodesResponse>(
    key,
    fetcher,
    referenceDataConfig
  );

  return {
    topCodes: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    error,
  };
}

/**
 * Hook to fetch and cache CCN (Common Course Numbering) standards.
 * These are CCN descriptors from the state (AB 1111).
 */
export interface CCNStandard {
  id: string;
  ccn_code: string;
  title: string;
  minimum_units: number;
  slo_requirements: string[];
  content_requirements: string[];
}

export interface CCNStandardsResponse {
  items: CCNStandard[];
  total: number;
}

export function useCCNStandards(search?: string) {
  const key = search
    ? `${CACHE_KEYS.CCN_STANDARDS}?search=${encodeURIComponent(search)}`
    : CACHE_KEYS.CCN_STANDARDS;

  const { data, error, isLoading, isValidating } = useSWR<CCNStandardsResponse>(
    key,
    fetcher,
    referenceDataConfig
  );

  return {
    standards: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    error,
  };
}

/**
 * Hook to fetch and cache Bloom's Taxonomy verbs.
 */
export interface BloomsVerb {
  verb: string;
  level: number;
  level_name: string;
  category: string;
}

export interface BloomsVerbsResponse {
  verbs: BloomsVerb[];
  levels: Array<{ level: number; name: string; description: string }>;
}

export function useBloomsVerbs() {
  const { data, error, isLoading } = useSWR<BloomsVerbsResponse>(
    CACHE_KEYS.BLOOMS_VERBS,
    fetcher,
    referenceDataConfig
  );

  return {
    verbs: data?.verbs ?? [],
    levels: data?.levels ?? [],
    isLoading,
    error,
  };
}

/**
 * Hook to fetch and cache GE patterns.
 */
export interface GEPattern {
  id: string;
  name: string;
  areas: Array<{ code: string; title: string; units: number }>;
}

export interface GEPatternsResponse {
  patterns: GEPattern[];
}

export function useGEPatterns() {
  const { data, error, isLoading } = useSWR<GEPatternsResponse>(
    CACHE_KEYS.GE_PATTERNS,
    fetcher,
    referenceDataConfig
  );

  return {
    patterns: data?.patterns ?? [],
    isLoading,
    error,
  };
}

// =============================================================================
// Cache Invalidation Helpers
// =============================================================================

/**
 * Invalidate all reference data caches.
 * Call this when reference data might have changed (e.g., admin updates).
 */
export async function invalidateReferenceData() {
  await Promise.all([
    mutate(CACHE_KEYS.DEPARTMENTS),
    mutate(CACHE_KEYS.TOP_CODES),
    mutate(CACHE_KEYS.CCN_STANDARDS),
    mutate(CACHE_KEYS.BLOOMS_VERBS),
    mutate(CACHE_KEYS.GE_PATTERNS),
  ]);
}

/**
 * Invalidate course-related caches.
 * Call this after creating, updating, or deleting a course.
 */
export async function invalidateCourseCache(courseId?: string) {
  // Invalidate course list (all variations)
  await mutate(
    (key) => typeof key === 'string' && key.startsWith('/api/courses'),
    undefined,
    { revalidate: true }
  );

  // Invalidate specific course if provided
  if (courseId) {
    await mutate(CACHE_KEYS.COURSE(courseId));
  }
}

/**
 * Invalidate program-related caches.
 * Call this after creating, updating, or deleting a program.
 */
export async function invalidateProgramCache(programId?: string) {
  // Invalidate program list (all variations)
  await mutate(
    (key) => typeof key === 'string' && key.startsWith('/api/programs'),
    undefined,
    { revalidate: true }
  );

  // Invalidate specific program if provided
  if (programId) {
    await mutate(CACHE_KEYS.PROGRAM(programId));
  }
}

/**
 * Invalidate department cache.
 * Call this after department data changes.
 */
export async function invalidateDepartmentCache() {
  await mutate(CACHE_KEYS.DEPARTMENTS);
}

// =============================================================================
// Prefetch Helpers
// =============================================================================

/**
 * Prefetch reference data on app load.
 * This warms the cache so data is ready when needed.
 */
export async function prefetchReferenceData() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

  // Prefetch in parallel
  await Promise.allSettled([
    mutate(CACHE_KEYS.DEPARTMENTS, fetch(`${API_BASE_URL}${CACHE_KEYS.DEPARTMENTS}`).then(r => r.json())),
    mutate(CACHE_KEYS.TOP_CODES, fetch(`${API_BASE_URL}${CACHE_KEYS.TOP_CODES}`).then(r => r.json())),
    mutate(CACHE_KEYS.BLOOMS_VERBS, fetch(`${API_BASE_URL}${CACHE_KEYS.BLOOMS_VERBS}`).then(r => r.json())),
  ]);
}
