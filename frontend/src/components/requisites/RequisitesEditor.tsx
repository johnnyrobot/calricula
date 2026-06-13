'use client';

// ===========================================
// Requisites Editor Component
// ===========================================
// Allows users to add, edit, and remove prerequisites,
// corequisites, and advisories for a course.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PlusIcon,
  TrashIcon,
  LinkIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  RequisiteItem,
  RequisiteType,
  CourseSearchItem,
  SLOItem,
  CourseDetail,
} from '@/lib/api';

// ===========================================
// Types
// ===========================================

interface RequisitesEditorProps {
  courseId: string;
  requisites: RequisiteItem[];
  onChange: (requisites: RequisiteItem[]) => void;
  readOnly?: boolean;
}

const REQUISITE_TYPES: { value: RequisiteType; label: string; description: string }[] = [
  {
    value: 'Prerequisite',
    label: 'Prerequisite',
    description: 'Must be completed before enrolling in this course',
  },
  {
    value: 'Corequisite',
    label: 'Corequisite',
    description: 'Must be taken concurrently with this course',
  },
  {
    value: 'Advisory',
    label: 'Advisory',
    description: 'Recommended but not required',
  },
];

// ===========================================
// Course Search Modal
// ===========================================

interface CourseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (course: CourseSearchItem) => void;
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
  const [courses, setCourses] = useState<CourseSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async () => {
    if (!search.trim()) {
      setCourses([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (token) api.setToken(token);

      // Use the new dedicated search endpoint
      const response = await api.searchCourses({
        q: search.trim(),
        exclude_id: excludeCourseId,
        limit: 10,
      });

      setCourses(response.items);
    } catch (err) {
      console.error('Failed to search courses:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [search, excludeCourseId, getToken]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

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
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Search Courses
          </h3>
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
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-luminous-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {search.trim()
                ? 'No courses found'
                : 'Type to search for courses'}
            </div>
          ) : (
            <ul className="space-y-1">
              {courses.map((course) => (
                <li key={course.id}>
                  <button
                    onClick={() => {
                      onSelect(course);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="font-medium text-slate-900 dark:text-white">
                      {course.subject_code} {course.course_number}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {course.title}
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
// Content Review Modal (Title 5 § 55003 Compliance)
// ===========================================

interface SLOMapping {
  prerequisiteSloId: string;
  currentCourseSloId: string;
}

interface ContentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contentReview: string) => void;
  currentCourseId: string;
  prerequisiteCourseId: string;
  prerequisiteCourseName: string;
  initialContentReview: string;
}

function ContentReviewModal({
  isOpen,
  onClose,
  onSave,
  currentCourseId,
  prerequisiteCourseId,
  prerequisiteCourseName,
  initialContentReview,
}: ContentReviewModalProps) {
  const { getToken } = useAuth();
  const [currentCourseSLOs, setCurrentCourseSLOs] = useState<SLOItem[]>([]);
  const [prerequisiteSLOs, setPrerequisiteSLOs] = useState<SLOItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<SLOMapping[]>([]);
  const [justification, setJustification] = useState(initialContentReview);
  const [saving, setSaving] = useState(false);
  const [currentCourseName, setCurrentCourseName] = useState('');

  // Fetch SLOs from both courses
  useEffect(() => {
    if (!isOpen) return;

    const fetchSLOs = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (token) api.setToken(token);

        const [currentCourse, prereqCourse] = await Promise.all([
          api.getCourse(currentCourseId),
          api.getCourse(prerequisiteCourseId),
        ]);

        setCurrentCourseSLOs(currentCourse.slos || []);
        setPrerequisiteSLOs(prereqCourse.slos || []);
        setCurrentCourseName(
          `${currentCourse.subject_code} ${currentCourse.course_number}`
        );

        // Parse existing mappings from content review if possible
        if (initialContentReview) {
          setJustification(initialContentReview);
        }
      } catch (err) {
        console.error('Failed to fetch course SLOs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSLOs();
  }, [isOpen, currentCourseId, prerequisiteCourseId, getToken, initialContentReview]);

  const toggleMapping = (prereqSloId: string, currentSloId: string) => {
    const existingIndex = mappings.findIndex(
      (m) => m.prerequisiteSloId === prereqSloId && m.currentCourseSloId === currentSloId
    );

    if (existingIndex >= 0) {
      setMappings(mappings.filter((_, i) => i !== existingIndex));
    } else {
      setMappings([...mappings, { prerequisiteSloId: prereqSloId, currentCourseSloId: currentSloId }]);
    }
  };

  const isMapped = (prereqSloId: string, currentSloId: string) => {
    return mappings.some(
      (m) => m.prerequisiteSloId === prereqSloId && m.currentCourseSloId === currentSloId
    );
  };

  const getMappedCount = (prereqSloId: string) => {
    return mappings.filter((m) => m.prerequisiteSloId === prereqSloId).length;
  };

  const handleSave = async () => {
    setSaving(true);

    // Generate content review text from mappings and justification
    let contentReviewText = '';

    if (mappings.length > 0) {
      contentReviewText += '## SLO Skill Mappings\n\n';

      const prereqSlosWithMappings = prerequisiteSLOs.filter(
        (slo) => mappings.some((m) => m.prerequisiteSloId === slo.id)
      );

      prereqSlosWithMappings.forEach((prereqSlo) => {
        const mappedCurrentSlos = mappings
          .filter((m) => m.prerequisiteSloId === prereqSlo.id)
          .map((m) => currentCourseSLOs.find((s) => s.id === m.currentCourseSloId))
          .filter(Boolean);

        contentReviewText += `**Exit Skill from ${prerequisiteCourseName}:**\n`;
        contentReviewText += `- SLO ${prereqSlo.sequence}: ${prereqSlo.outcome_text}\n\n`;
        contentReviewText += `**Supports Entry Skills for ${currentCourseName}:**\n`;
        mappedCurrentSlos.forEach((slo) => {
          if (slo) {
            contentReviewText += `- SLO ${slo.sequence}: ${slo.outcome_text}\n`;
          }
        });
        contentReviewText += '\n---\n\n';
      });
    }

    if (justification.trim()) {
      contentReviewText += '## Justification\n\n';
      contentReviewText += justification.trim();
    }

    onSave(contentReviewText);
    setSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Content Review Documentation
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Title 5 § 55003 - Match prerequisite exit skills to course entry requirements
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-luminous-500 border-t-transparent" />
              <span className="ml-3 text-slate-500">Loading course SLOs...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Explanation */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                  Per Title 5, Prerequisites Require Content Review
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Document how the prerequisite course&apos;s exit skills (what students learn)
                  directly support the entry-level requirements of this course. Click on SLOs
                  below to create mappings between exit and entry skills.
                </p>
              </div>

              {/* SLO Mapping Grid */}
              <div className="grid grid-cols-2 gap-6">
                {/* Left: Prerequisite Course SLOs (Exit Skills) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-medium">
                      Exit Skills
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {prerequisiteCourseName}
                    </span>
                  </div>

                  {prerequisiteSLOs.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                      <p className="text-slate-500 dark:text-slate-400">
                        No SLOs defined for this course
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                      {prerequisiteSLOs.map((slo) => (
                        <div
                          key={slo.id}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            getMappedCount(slo.id) > 0
                              ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-medium">
                              SLO {slo.sequence}
                            </span>
                            {getMappedCount(slo.id) > 0 && (
                              <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs">
                                {getMappedCount(slo.id)} mapped
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                            {slo.outcome_text}
                          </p>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Bloom&apos;s Level: {slo.bloom_level}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Current Course SLOs (Entry Skills) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-400 px-3 py-1 rounded-full text-sm font-medium">
                      Entry Requirements
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {currentCourseName}
                    </span>
                  </div>

                  {currentCourseSLOs.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                      <p className="text-slate-500 dark:text-slate-400">
                        No SLOs defined for this course
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                      {currentCourseSLOs.map((slo) => (
                        <div
                          key={slo.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-start gap-2">
                            <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-medium">
                              SLO {slo.sequence}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                            {slo.outcome_text}
                          </p>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Bloom&apos;s Level: {slo.bloom_level}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mapping Interface */}
              {prerequisiteSLOs.length > 0 && currentCourseSLOs.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Create Skill Mappings
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Click cells to map prerequisite exit skills to course entry requirements
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                            Prereq SLO →
                          </th>
                          {currentCourseSLOs.map((slo) => (
                            <th
                              key={slo.id}
                              className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700"
                            >
                              Entry SLO {slo.sequence}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {prerequisiteSLOs.map((prereqSlo) => (
                          <tr key={prereqSlo.id}>
                            <td className="p-2 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                              Exit SLO {prereqSlo.sequence}
                            </td>
                            {currentCourseSLOs.map((currentSlo) => (
                              <td
                                key={currentSlo.id}
                                className="p-2 text-center border-b border-slate-200 dark:border-slate-700"
                              >
                                <button
                                  onClick={() => toggleMapping(prereqSlo.id, currentSlo.id)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                    isMapped(prereqSlo.id, currentSlo.id)
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                                  }`}
                                >
                                  {isMapped(prereqSlo.id, currentSlo.id) ? (
                                    <CheckCircleSolidIcon className="h-5 w-5" />
                                  ) : (
                                    <CheckCircleIcon className="h-5 w-5 text-slate-400" />
                                  )}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Justification Text Area */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Additional Justification
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain how the prerequisite course's skills and knowledge directly prepare students for success in this course..."
                  rows={4}
                  className="luminous-input w-full"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Provide context for the SLO mappings and explain the content review rationale.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {mappings.length} skill mapping{mappings.length !== 1 ? 's' : ''} created
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="luminous-button-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="luminous-button-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Content Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Requisite Card Component
// ===========================================

interface RequisiteCardProps {
  requisite: RequisiteItem;
  currentCourseId: string;
  onDelete: () => void;
  onUpdateContentReview: (contentReview: string) => void;
  readOnly?: boolean;
}

function RequisiteCard({
  requisite,
  currentCourseId,
  onDelete,
  onUpdateContentReview,
  readOnly,
}: RequisiteCardProps) {
  const [showContentReview, setShowContentReview] = useState(
    Boolean(requisite.content_review)
  );
  const [contentReview, setContentReview] = useState(
    requisite.content_review || ''
  );
  const [showContentReviewModal, setShowContentReviewModal] = useState(false);

  const typeConfig = REQUISITE_TYPES.find((t) => t.value === requisite.type);

  const typeColors: Record<RequisiteType, string> = {
    Prerequisite: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    Corequisite: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    Advisory: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[requisite.type]}`}>
              {requisite.type}
            </span>
          </div>

          {requisite.requisite_course ? (
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-900 dark:text-white">
                {requisite.requisite_course.subject_code}{' '}
                {requisite.requisite_course.course_number}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                - {requisite.requisite_course.title}
              </span>
            </div>
          ) : requisite.requisite_text ? (
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="h-4 w-4 text-slate-400" />
              <span className="text-slate-700 dark:text-slate-300">
                {requisite.requisite_text}
              </span>
            </div>
          ) : null}
        </div>

        {!readOnly && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Remove requisite"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content Review Section (Title 5 Compliance) */}
      {requisite.type === 'Prerequisite' && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
          {!showContentReview && !requisite.content_review ? (
            <button
              onClick={() => {
                // If this is a linked course, open the SLO mapping modal
                if (requisite.requisite_course_id) {
                  setShowContentReviewModal(true);
                } else {
                  // For text-based prerequisites, use simple text input
                  setShowContentReview(true);
                }
              }}
              className="text-sm text-luminous-600 dark:text-luminous-400 hover:underline"
              disabled={readOnly}
            >
              + Add Content Review Documentation
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Content Review (Title 5 § 55003)
                </label>
                {requisite.requisite_course_id && !readOnly && (
                  <button
                    onClick={() => setShowContentReviewModal(true)}
                    className="text-xs text-luminous-600 dark:text-luminous-400 hover:underline"
                  >
                    Edit in SLO Mapper
                  </button>
                )}
              </div>
              {requisite.requisite_course_id ? (
                // For linked courses, show the content review as formatted text
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {contentReview || (
                    <span className="text-slate-400 italic">
                      No content review documentation yet. Click &quot;Edit in SLO Mapper&quot; to add.
                    </span>
                  )}
                </div>
              ) : (
                // For text-based prerequisites, use simple text input
                <textarea
                  value={contentReview}
                  onChange={(e) => setContentReview(e.target.value)}
                  onBlur={() => onUpdateContentReview(contentReview)}
                  placeholder="Document how the prerequisite course's exit skills align with this course's entry-level requirements..."
                  rows={3}
                  className="luminous-input w-full text-sm"
                  disabled={readOnly}
                />
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Per Title 5, prerequisite content review must document the specific skills
                students need from the prerequisite to succeed in this course.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Content Review Modal */}
      {requisite.requisite_course_id && (
        <ContentReviewModal
          isOpen={showContentReviewModal}
          onClose={() => setShowContentReviewModal(false)}
          onSave={(newContentReview) => {
            setContentReview(newContentReview);
            onUpdateContentReview(newContentReview);
            setShowContentReview(true);
          }}
          currentCourseId={currentCourseId}
          prerequisiteCourseId={requisite.requisite_course_id}
          prerequisiteCourseName={
            requisite.requisite_course
              ? `${requisite.requisite_course.subject_code} ${requisite.requisite_course.course_number}`
              : 'Prerequisite Course'
          }
          initialContentReview={requisite.content_review || ''}
        />
      )}
    </div>
  );
}

// ===========================================
// Add Requisite Form
// ===========================================

interface AddRequisiteFormProps {
  courseId: string;
  onAdd: (requisite: RequisiteItem) => void;
}

function AddRequisiteForm({ courseId, onAdd }: AddRequisiteFormProps) {
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<RequisiteType>('Prerequisite');
  const [mode, setMode] = useState<'course' | 'text'>('course');
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchItem | null>(null);
  const [requisiteText, setRequisiteText] = useState('');
  const [showCourseSearch, setShowCourseSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for the text input to handle programmatic value changes (for testing)
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (mode === 'course' && !selectedCourse) {
      setError('Please select a course');
      return;
    }

    // For text mode, check both React state AND the actual DOM value
    // This handles cases where Puppeteer or other automation sets the value directly
    const textValue = requisiteText.trim() || textInputRef.current?.value?.trim() || '';

    if (mode === 'text' && !textValue) {
      setError('Please enter requisite text');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const data: {
        type: RequisiteType;
        requisite_course_id?: string;
        requisite_text?: string;
      } = {
        type,
      };

      if (mode === 'course' && selectedCourse) {
        data.requisite_course_id = selectedCourse.id;
      } else if (mode === 'text') {
        // Use the validated textValue that checks both React state and DOM
        data.requisite_text = textValue;
      }

      const newRequisite = await api.createCourseRequisite(courseId, data);
      onAdd(newRequisite);

      // Reset form
      setIsOpen(false);
      setType('Prerequisite');
      setMode('course');
      setSelectedCourse(null);
      setRequisiteText('');
    } catch (err) {
      console.error('Failed to create requisite:', err);
      setError(err instanceof Error ? err.message : 'Failed to add requisite');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="luminous-button-secondary w-full"
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        Add Requisite
      </button>
    );
  }

  return (
    <div className="border border-luminous-200 dark:border-luminous-800 rounded-lg p-4 bg-luminous-50 dark:bg-luminous-900/20 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-slate-900 dark:text-white">
          Add New Requisite
        </h4>
        <button
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Type Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Requisite Type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {REQUISITE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === t.value
                  ? 'bg-luminous-500 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-luminous-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {REQUISITE_TYPES.find((t) => t.value === type)?.description}
        </p>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Requisite Definition
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('course')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'course'
                ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 border-2 border-luminous-500'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <LinkIcon className="h-4 w-4 inline mr-1" />
            Link to Course
          </button>
          <button
            onClick={() => setMode('text')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'text'
                ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 border-2 border-luminous-500'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <DocumentTextIcon className="h-4 w-4 inline mr-1" />
            Custom Text
          </button>
        </div>
      </div>

      {/* Course or Text Input */}
      {mode === 'course' ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Select Course
          </label>
          {selectedCourse ? (
            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {selectedCourse.subject_code} {selectedCourse.course_number}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedCourse.title}
                </div>
              </div>
              <button
                onClick={() => setSelectedCourse(null)}
                className="text-slate-400 hover:text-red-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCourseSearch(true)}
              className="w-full p-3 text-left border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-luminous-500 hover:text-luminous-600 transition-colors"
            >
              <MagnifyingGlassIcon className="h-5 w-5 inline mr-2" />
              Search for a course...
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Requisite Text
          </label>
          <input
            ref={textInputRef}
            type="text"
            value={requisiteText}
            onChange={(e) => setRequisiteText(e.target.value)}
            onInput={(e) => setRequisiteText((e.target as HTMLInputElement).value)}
            onBlur={(e) => setRequisiteText(e.target.value)}
            placeholder='e.g., "Eligibility for ENGL 101" or "High school algebra"'
            className="luminous-input w-full"
            data-testid="requisite-text-input"
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setIsOpen(false)}
          className="luminous-button-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="luminous-button-primary"
          disabled={saving}
        >
          {saving ? 'Adding...' : 'Add Requisite'}
        </button>
      </div>

      {/* Course Search Modal */}
      <CourseSearchModal
        isOpen={showCourseSearch}
        onClose={() => setShowCourseSearch(false)}
        onSelect={setSelectedCourse}
        excludeCourseId={courseId}
      />
    </div>
  );
}

// ===========================================
// Main Requisites Editor Component
// ===========================================

export function RequisitesEditor({
  courseId,
  requisites,
  onChange,
  readOnly = false,
}: RequisitesEditorProps) {
  const { getToken } = useAuth();

  const handleDelete = async (requisiteId: string) => {
    try {
      const token = await getToken();
      if (token) api.setToken(token);

      await api.deleteCourseRequisite(courseId, requisiteId);
      onChange(requisites.filter((r) => r.id !== requisiteId));
    } catch (err) {
      console.error('Failed to delete requisite:', err);
    }
  };

  const handleUpdateContentReview = async (
    requisiteId: string,
    contentReview: string
  ) => {
    try {
      const token = await getToken();
      if (token) api.setToken(token);

      await api.updateCourseRequisite(courseId, requisiteId, {
        content_review: contentReview,
      });

      onChange(
        requisites.map((r) =>
          r.id === requisiteId ? { ...r, content_review: contentReview } : r
        )
      );
    } catch (err) {
      console.error('Failed to update content review:', err);
    }
  };

  const handleAdd = (newRequisite: RequisiteItem) => {
    onChange([...requisites, newRequisite]);
  };

  // Group requisites by type
  const prerequisites = requisites.filter((r) => r.type === 'Prerequisite');
  const corequisites = requisites.filter((r) => r.type === 'Corequisite');
  const advisories = requisites.filter((r) => r.type === 'Advisory');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Prerequisites & Corequisites
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Define the courses or skills students need before or during enrollment.
          Prerequisites require Content Review documentation per Title 5 § 55003.
        </p>
      </div>

      {/* Requisites List */}
      {requisites.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
          <LinkIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 mb-1">
            No requisites defined
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Add prerequisites, corequisites, or advisories for this course.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Prerequisites */}
          {prerequisites.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Prerequisites ({prerequisites.length})
              </h4>
              <div className="space-y-2">
                {prerequisites.map((req) => (
                  <RequisiteCard
                    key={req.id}
                    requisite={req}
                    currentCourseId={courseId}
                    onDelete={() => handleDelete(req.id)}
                    onUpdateContentReview={(cr) =>
                      handleUpdateContentReview(req.id, cr)
                    }
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Corequisites */}
          {corequisites.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Corequisites ({corequisites.length})
              </h4>
              <div className="space-y-2">
                {corequisites.map((req) => (
                  <RequisiteCard
                    key={req.id}
                    requisite={req}
                    currentCourseId={courseId}
                    onDelete={() => handleDelete(req.id)}
                    onUpdateContentReview={(cr) =>
                      handleUpdateContentReview(req.id, cr)
                    }
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Advisories */}
          {advisories.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Advisories ({advisories.length})
              </h4>
              <div className="space-y-2">
                {advisories.map((req) => (
                  <RequisiteCard
                    key={req.id}
                    requisite={req}
                    currentCourseId={courseId}
                    onDelete={() => handleDelete(req.id)}
                    onUpdateContentReview={(cr) =>
                      handleUpdateContentReview(req.id, cr)
                    }
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Requisite Form */}
      {!readOnly && (
        <AddRequisiteForm courseId={courseId} onAdd={handleAdd} />
      )}
    </div>
  );
}
