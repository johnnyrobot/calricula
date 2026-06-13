'use client';

// ===========================================
// Cross-Listing Editor Component
// ===========================================
// Allows users to manage cross-listed courses.
// Cross-listed courses must have identical SLOs, content, and units.

import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { LinkIcon as LinkSolidIcon } from '@heroicons/react/24/solid';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/toast';
import {
  api,
  CrossListingResponse,
  CrossListedCourseInfo,
  CrossListingValidationResponse,
  DetailedComparisonResponse,
  ValidationIssue,
} from '@/lib/api';

// ===========================================
// Types
// ===========================================

interface CrossListingEditorProps {
  courseId: string;
  readOnly?: boolean;
}

// ===========================================
// Course Search Modal
// ===========================================

interface CourseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (course: CrossListedCourseInfo) => void;
  excludeCourseId: string;
}

function CourseSearchModal({
  isOpen,
  onClose,
  onSelect,
  excludeCourseId,
}: CourseSearchModalProps) {
  const { getToken } = useAuth();
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<CrossListedCourseInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const searchCourses = useCallback(async () => {
    if (!search.trim() || search.trim().length < 2) {
      setCourses([]);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const results = await api.searchCoursesForCrossListing(search.trim(), excludeCourseId);
      setCourses(results);
    } catch (err) {
      console.error('Failed to search courses:', err);
    } finally {
      setLoading(false);
    }
  }, [search, excludeCourseId, getToken]);

  useEffect(() => {
    const timer = setTimeout(searchCourses, 300);
    return () => clearTimeout(timer);
  }, [searchCourses]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setCourses([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Add Cross-Listed Course
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Search for a course to cross-list
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by course code or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="luminous-input pl-10 w-full"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-luminous-500 border-t-transparent" />
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {search.trim().length >= 2
                ? 'No courses found'
                : 'Type at least 2 characters to search'}
            </div>
          ) : (
            <ul className="space-y-1">
              {courses.map((course) => (
                <li key={course.id}>
                  <button
                    onClick={() => {
                      onSelect(course);
                    }}
                    className="w-full text-left px-3 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {course.subject_code} {course.course_number}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {course.title}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
                          {course.units} units
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {course.department_code || 'Unknown Dept'}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Validation Preview Modal
// ===========================================

interface ValidationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  validation: CrossListingValidationResponse | null;
  comparison: DetailedComparisonResponse | null;
  targetCourse: CrossListedCourseInfo | null;
  isLoading: boolean;
  isCreating: boolean;
}

function ValidationPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  validation,
  comparison,
  targetCourse,
  isLoading,
  isCreating,
}: ValidationPreviewModalProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Cross-Listing Validation
            </h3>
            {targetCourse && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {targetCourse.subject_code} {targetCourse.course_number}: {targetCourse.title}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-luminous-500 border-t-transparent mb-3" />
              <p className="text-slate-500 dark:text-slate-400">Validating cross-listing requirements...</p>
            </div>
          ) : validation ? (
            <div className="space-y-4">
              {/* Validation Status */}
              <div className={`p-4 rounded-lg border-2 ${
                validation.is_valid
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-3">
                  {validation.is_valid ? (
                    <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <ExclamationCircleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <div className={`font-semibold ${
                      validation.is_valid
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {validation.is_valid ? 'Validation Passed' : 'Validation Failed'}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {validation.summary}
                    </div>
                  </div>
                </div>
              </div>

              {/* Issues */}
              {validation.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-slate-900 dark:text-white">
                    {validation.is_valid ? 'Warnings' : 'Issues to Resolve'}
                  </h4>
                  <ul className="space-y-2">
                    {validation.issues.map((issue, idx) => (
                      <li
                        key={idx}
                        className={`p-3 rounded-lg ${
                          issue.severity === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {issue.severity === 'error' ? (
                            <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <div className={`font-medium ${
                              issue.severity === 'error'
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-yellow-700 dark:text-yellow-300'
                            }`}>
                              {issue.message}
                            </div>
                            {(issue.primary_value || issue.cross_listed_value) && (
                              <div className="text-xs mt-1 text-slate-600 dark:text-slate-400">
                                <span className="font-medium">Primary:</span> {issue.primary_value || 'N/A'}
                                <span className="mx-2">|</span>
                                <span className="font-medium">Target:</span> {issue.cross_listed_value || 'N/A'}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Comparison Toggle */}
              {comparison && (
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-2 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:text-luminous-700 dark:hover:text-luminous-300"
                  >
                    {showDetails ? (
                      <ChevronUpIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                    {showDetails ? 'Hide' : 'Show'} Detailed Comparison
                  </button>

                  {showDetails && (
                    <div className="mt-4 space-y-4">
                      {/* Units Comparison */}
                      <div className={`p-3 rounded-lg ${
                        comparison.units_match
                          ? 'bg-green-50 dark:bg-green-900/20'
                          : 'bg-red-50 dark:bg-red-900/20'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Units</span>
                          <div className="flex items-center gap-4">
                            <span className="text-sm">{comparison.primary_units} units</span>
                            <ArrowsRightLeftIcon className="h-4 w-4 text-slate-400" />
                            <span className="text-sm">{comparison.cross_listed_units} units</span>
                            {comparison.units_match ? (
                              <CheckCircleIcon className="h-5 w-5 text-green-500" />
                            ) : (
                              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* SLOs Comparison */}
                      <div>
                        <div className={`flex items-center justify-between mb-2 ${
                          comparison.slos_match
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          <span className="font-medium">SLOs</span>
                          <span className="text-sm">
                            {comparison.slo_comparison.filter(s => s.matches).length} / {comparison.slo_comparison.length} match
                          </span>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {comparison.slo_comparison.map((slo) => (
                            <div
                              key={slo.sequence}
                              className={`p-2 rounded text-sm ${
                                slo.matches
                                  ? 'bg-green-50 dark:bg-green-900/20'
                                  : 'bg-red-50 dark:bg-red-900/20'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="font-medium text-slate-500 w-8">#{slo.sequence}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-slate-700 dark:text-slate-300 truncate">
                                    {slo.primary_text || '(empty)'}
                                  </p>
                                  {!slo.matches && slo.cross_listed_text && (
                                    <p className="text-red-600 dark:text-red-400 truncate mt-1">
                                      vs: {slo.cross_listed_text}
                                    </p>
                                  )}
                                </div>
                                {slo.matches ? (
                                  <CheckCircleIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <ExclamationCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Content Comparison */}
                      <div>
                        <div className={`flex items-center justify-between mb-2 ${
                          comparison.content_matches
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          <span className="font-medium">Content Topics</span>
                          <span className="text-sm">
                            {comparison.content_comparison.filter(c => c.matches).length} / {comparison.content_comparison.length} match
                          </span>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {comparison.content_comparison.map((content) => (
                            <div
                              key={content.sequence}
                              className={`p-2 rounded text-sm ${
                                content.matches
                                  ? 'bg-green-50 dark:bg-green-900/20'
                                  : 'bg-red-50 dark:bg-red-900/20'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="font-medium text-slate-500 w-8">#{content.sequence}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-slate-700 dark:text-slate-300 truncate">
                                    {content.primary_topic || '(empty)'}
                                  </p>
                                  {!content.matches && content.cross_listed_topic && (
                                    <p className="text-red-600 dark:text-red-400 truncate mt-1">
                                      vs: {content.cross_listed_topic}
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500">
                                  {content.primary_hours}h
                                </span>
                                {content.matches ? (
                                  <CheckCircleIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <ExclamationCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No validation data available
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!validation?.is_valid || isCreating}
            className="px-4 py-2 text-sm font-medium bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4" />
                Create Cross-Listing
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Cross-Listing Card Component
// ===========================================

interface CrossListingCardProps {
  crossListing: CrossListingResponse;
  currentCourseId: string;
  onRemove: (id: string) => void;
  onSync: (crossListingId: string) => void;
  isRemoving: boolean;
  isSyncing: boolean;
  readOnly?: boolean;
}

function CrossListingCard({
  crossListing,
  currentCourseId,
  onRemove,
  onSync,
  isRemoving,
  isSyncing,
  readOnly = false,
}: CrossListingCardProps) {
  // Determine which course to display (the "other" course)
  const isPrimary = crossListing.primary_course_id === currentCourseId;
  const linkedCourse = isPrimary
    ? crossListing.cross_listed_course
    : crossListing.primary_course;

  return (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-luminous-100 dark:bg-luminous-900/30 rounded-lg">
            <LinkSolidIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {linkedCourse.subject_code} {linkedCourse.course_number}
              </span>
              {!isPrimary && (
                <span className="px-2 py-0.5 text-xs font-medium bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 rounded">
                  Primary
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
              {linkedCourse.title}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{linkedCourse.units} units</span>
              <span>|</span>
              <span>{linkedCourse.department_name || linkedCourse.department_code}</span>
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1">
            {/* Sync Button - Only show if this course is cross-listed (not primary) */}
            {!isPrimary && (
              <button
                onClick={() => onSync(crossListing.id)}
                disabled={isSyncing}
                className="p-2 text-luminous-600 dark:text-luminous-400 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 rounded-lg transition-colors disabled:opacity-50"
                title="Sync from primary course (copy SLOs, content, and units)"
              >
                {isSyncing ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-luminous-500 border-t-transparent" />
                ) : (
                  <ArrowsRightLeftIcon className="h-5 w-5" />
                )}
              </button>
            )}

            <button
              onClick={() => onRemove(crossListing.id)}
              disabled={isRemoving}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              title="Remove cross-listing"
            >
              {isRemoving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-500 border-t-transparent" />
              ) : (
                <TrashIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================
// Main Cross-Listing Editor Component
// ===========================================

export function CrossListingEditor({ courseId, readOnly = false }: CrossListingEditorProps) {
  const { getToken } = useAuth();
  const toast = useToast();

  // State
  const [crossListings, setCrossListings] = useState<CrossListingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CrossListedCourseInfo | null>(null);
  const [validation, setValidation] = useState<CrossListingValidationResponse | null>(null);
  const [comparison, setComparison] = useState<DetailedComparisonResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Fetch cross-listings
  // Uses .then()/.catch() pattern to prevent Next.js error overlay
  const fetchCrossListings = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (token) api.setToken(token);

    api.listCrossListings(courseId)
      .then((data) => {
        setCrossListings(data);
      })
      .catch((err: Error) => {
        console.error('Failed to fetch cross-listings:', err);
        toast.error('Failed to load cross-listings', err.message || undefined);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [courseId, getToken, toast]);

  useEffect(() => {
    fetchCrossListings();
  }, [fetchCrossListings]);

  // Handle course selection (validate before creating)
  // Uses .then()/.catch() pattern to prevent Next.js error overlay
  const handleCourseSelect = async (course: CrossListedCourseInfo) => {
    setSelectedCourse(course);
    setSearchModalOpen(false);
    setValidationModalOpen(true);
    setIsValidating(true);
    setValidation(null);
    setComparison(null);

    const token = await getToken();
    if (token) api.setToken(token);

    // Fetch both validation and comparison in parallel
    Promise.all([
      api.validateCrossListing(courseId, course.id),
      api.compareCrossListingCourses(courseId, course.id),
    ])
      .then(([validationResult, comparisonResult]) => {
        setValidation(validationResult);
        setComparison(comparisonResult);
      })
      .catch((err: Error) => {
        console.error('Failed to validate cross-listing:', err);
        toast.error('Failed to validate cross-listing', err.message || 'Please check the server connection');
        setValidationModalOpen(false);
      })
      .finally(() => {
        setIsValidating(false);
      });
  };

  // Create cross-listing
  // Uses .then()/.catch() pattern to prevent Next.js error overlay
  const handleCreateCrossListing = async () => {
    if (!selectedCourse) return;

    setIsCreating(true);
    const token = await getToken();
    if (token) api.setToken(token);

    api.createCrossListing(courseId, selectedCourse.id)
      .then(() => {
        toast.success('Cross-listing created successfully');
        setValidationModalOpen(false);
        setSelectedCourse(null);
        fetchCrossListings();
      })
      .catch((err: Error) => {
        console.error('Failed to create cross-listing:', err);
        toast.error('Failed to create cross-listing', err.message || undefined);
      })
      .finally(() => {
        setIsCreating(false);
      });
  };

  // Remove cross-listing
  // Uses .then()/.catch() pattern to prevent Next.js error overlay
  const handleRemoveCrossListing = async (crossListingId: string) => {
    setRemovingId(crossListingId);
    const token = await getToken();
    if (token) api.setToken(token);

    api.deleteCrossListing(courseId, crossListingId)
      .then(() => {
        toast.success('Cross-listing removed');
        setCrossListings((prev) => prev.filter((cl) => cl.id !== crossListingId));
      })
      .catch((err: Error) => {
        console.error('Failed to remove cross-listing:', err);
        toast.error('Failed to remove cross-listing', err.message || undefined);
      })
      .finally(() => {
        setRemovingId(null);
      });
  };

  // Sync from primary course
  // Uses .then()/.catch() pattern to prevent Next.js error overlay
  const handleSyncFromPrimary = async (crossListingId: string) => {
    setSyncingId(crossListingId);
    const token = await getToken();
    if (token) api.setToken(token);

    api.syncCrossListing(courseId, crossListingId)
      .then((result) => {
        if (result.success) {
          toast.success(
            'Synced from primary course',
            `Updated ${result.slos_synced} SLOs, ${result.content_topics_synced} content topics${result.units_updated ? ', and units' : ''}`
          );
        } else {
          toast.error('Sync failed', result.message);
        }
      })
      .catch((err: Error) => {
        console.error('Failed to sync from primary:', err);
        toast.error('Failed to sync from primary course', err.message || undefined);
      })
      .finally(() => {
        setSyncingId(null);
      });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Cross-Listings
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Cross-listed courses are offered in multiple departments with identical content, SLOs, and units.
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-luminous-50 dark:bg-luminous-900/20 border border-luminous-200 dark:border-luminous-800 rounded-lg">
        <div className="flex items-start gap-3">
          <ArrowsRightLeftIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-luminous-700 dark:text-luminous-300">
            <p className="font-medium mb-1">Cross-Listing Requirements</p>
            <ul className="list-disc list-inside space-y-0.5 text-luminous-600 dark:text-luminous-400">
              <li>Courses must have identical unit values</li>
              <li>Student Learning Outcomes must match exactly</li>
              <li>Content outlines must be the same</li>
              <li>Cross-listed courses are typically in different departments</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Cross-Listings List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-luminous-500 border-t-transparent" />
        </div>
      ) : crossListings.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          <LinkIcon className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 mb-1">
            No cross-listings
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            This course is not cross-listed with any other courses.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {crossListings.map((crossListing) => (
            <CrossListingCard
              key={crossListing.id}
              crossListing={crossListing}
              currentCourseId={courseId}
              onRemove={handleRemoveCrossListing}
              onSync={handleSyncFromPrimary}
              isRemoving={removingId === crossListing.id}
              isSyncing={syncingId === crossListing.id}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Add Cross-Listing Button */}
      {!readOnly && (
        <button
          onClick={() => setSearchModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:border-luminous-500 hover:text-luminous-600 dark:hover:border-luminous-500 dark:hover:text-luminous-400 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          Add Cross-Listed Course
        </button>
      )}

      {/* Modals */}
      <CourseSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelect={handleCourseSelect}
        excludeCourseId={courseId}
      />

      <ValidationPreviewModal
        isOpen={validationModalOpen}
        onClose={() => {
          setValidationModalOpen(false);
          setSelectedCourse(null);
        }}
        onConfirm={handleCreateCrossListing}
        validation={validation}
        comparison={comparison}
        targetCourse={selectedCourse}
        isLoading={isValidating}
        isCreating={isCreating}
      />
    </div>
  );
}

export default CrossListingEditor;
