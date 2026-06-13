'use client';

import React, { useState, useMemo } from 'react';
import { RadioGroup } from '@headlessui/react';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { AnimatedModal } from '@/components/animations/AnimatedModal';
import { useToast } from '@/components/toast';
import { CourseListItem } from '@/lib/api';

export interface WageData {
  soc_code?: string;
  occupation_title: string;
  area?: string;
}

export interface CourseSelectionModalProps {
  /** Whether the modal is open */
  isOpen: boolean;

  /** Callback when modal should close */
  onClose: () => void;

  /** Selected occupation to display */
  selectedOccupation: WageData | null;

  /** Callback when user selects a course and confirms */
  onCourseSelect: (courseId: string, courseName: string) => Promise<void>;

  /** List of available courses for the user */
  courses: CourseListItem[];

  /** Whether courses are loading */
  isLoadingCourses?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Course Selection Modal Component
 *
 * Modal dialog that allows users to select a course to attach LMI data to.
 * - Shows selected occupation summary
 * - Lists user's CTE courses
 * - Search/filter functionality
 * - Radio button single selection
 * - Loading and error states
 */
export const CourseSelectionModal: React.FC<CourseSelectionModalProps> = ({
  isOpen,
  onClose,
  selectedOccupation,
  onCourseSelect,
  courses = [],
  isLoadingCourses = false,
  className = '',
}) => {
  const toast = useToast();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter courses based on search query
  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;

    const query = searchQuery.toLowerCase();
    return courses.filter(
      (course) =>
        course.subject_code.toLowerCase().includes(query) ||
        course.course_number.toLowerCase().includes(query) ||
        course.title.toLowerCase().includes(query)
    );
  }, [courses, searchQuery]);

  // Get selected course details
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId),
    [courses, selectedCourseId]
  );

  // Handle attachment
  const handleAttach = async () => {
    if (!selectedCourseId || !selectedCourse) {
      setError('Please select a course');
      return;
    }

    setIsAttaching(true);
    setError(null);

    try {
      const courseName = `${selectedCourse.subject_code} ${selectedCourse.course_number}`;
      await onCourseSelect(selectedCourseId, courseName);
      toast.success('Success', `LMI attached to ${courseName}`);

      // Reset state and close modal
      setTimeout(() => {
        setSelectedCourseId(null);
        setSearchQuery('');
        onClose();
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to attach LMI';
      setError(message);
    } finally {
      setIsAttaching(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (!isAttaching) {
      setSelectedCourseId(null);
      setSearchQuery('');
      setError(null);
      onClose();
    }
  };

  return (
    <>
      <AnimatedModal
        isOpen={isOpen}
        onBackdropClick={handleClose}
        className="fixed inset-0 flex items-center justify-center p-4"
      >
        <div
          className={`bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col ${className}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Attach LMI to Course
            </h2>
            <button
              onClick={handleClose}
              disabled={isAttaching}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Close modal"
            >
              <XMarkIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Selected Occupation Summary */}
            {selectedOccupation && (
              <div className="bg-luminous-50 dark:bg-luminous-900/20 rounded-lg p-4 border border-luminous-200 dark:border-luminous-800">
                <p className="text-sm text-luminous-900 dark:text-luminous-200">
                  <span className="font-semibold">Selected Occupation:</span>
                </p>
                <p className="text-base font-medium text-luminous-900 dark:text-luminous-100 mt-1">
                  {selectedOccupation.soc_code && (
                    <span className="text-luminous-700 dark:text-luminous-300 font-mono text-sm mr-2">
                      {selectedOccupation.soc_code}
                    </span>
                  )}
                  {selectedOccupation.occupation_title}
                </p>
                {selectedOccupation.area && (
                  <p className="text-sm text-luminous-700 dark:text-luminous-300 mt-2">
                    Area: {selectedOccupation.area}
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4" />

            {/* Course Search */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Select a course to attach this LMI data:
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search courses by code or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={isAttaching || isLoadingCourses}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-luminous-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Course List */}
            {isLoadingCourses ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-luminous-600" />
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">
                  {searchQuery
                    ? 'No courses match your search'
                    : 'No CTE courses available'}
                </p>
              </div>
            ) : (
              <RadioGroup
                value={selectedCourseId || ''}
                onChange={setSelectedCourseId}
              >
                <RadioGroup.Label className="sr-only">
                  Select a course
                </RadioGroup.Label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredCourses.map((course) => {
                    const isSelected = selectedCourseId === course.id;
                    const courseLabel = `${course.subject_code} ${course.course_number}`;

                    return (
                      <RadioGroup.Option
                        key={course.id}
                        value={course.id}
                        className="relative cursor-pointer"
                      >
                        {({ checked }) => (
                          <div
                            className={`
                              p-4 rounded-lg border-2 transition-all
                              focus-within:outline-none focus-within:ring-2 focus-within:ring-luminous-500 focus-within:ring-offset-2
                              dark:focus-within:ring-offset-slate-800
                              ${
                                checked
                                  ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-luminous-300 dark:hover:border-luminous-700'
                              }
                            `}
                          >
                            <div className="flex items-start gap-3">
                              {/* Radio Button */}
                              <div className="flex-shrink-0 mt-1">
                                <div
                                  className={`
                                    w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                                    ${
                                      checked
                                        ? 'border-luminous-600 bg-luminous-600'
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                    }
                                  `}
                                >
                                  {checked && (
                                    <div className="w-2 h-2 bg-white rounded-full" />
                                  )}
                                </div>
                              </div>

                              {/* Course Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {courseLabel}
                                </p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                                  {course.title}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  <span>{course.units} units</span>
                                  <span className="capitalize px-2 py-1 rounded bg-slate-100 dark:bg-slate-700">
                                    {course.status}
                                  </span>
                                </div>
                              </div>

                              {/* Checkmark for selected */}
                              {checked && (
                                <CheckCircleIcon className="w-5 h-5 text-luminous-600 flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        )}
                      </RadioGroup.Option>
                    );
                  })}
                </div>
              </RadioGroup>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <button
              onClick={handleClose}
              disabled={isAttaching}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAttach}
              disabled={isAttaching || !selectedCourseId || isLoadingCourses}
              className="px-4 py-2 rounded-lg bg-luminous-600 hover:bg-luminous-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              {isAttaching && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              )}
              {isAttaching ? 'Attaching...' : 'Attach to Course'}
            </button>
          </div>
        </div>
      </AnimatedModal>

    </>
  );
};

export default CourseSelectionModal;
