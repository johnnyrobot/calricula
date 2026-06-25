'use client';

// ===========================================
// Course Editor Page - Three-Panel Layout
// ===========================================
// Implements the main course editing interface with:
// - Left panel: Navigation stepper
// - Center panel: Form content for current section
// - Right panel: AI Assistant (collapsible)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';
import {
  DocumentTextIcon,
  Cog6ToothIcon,
  AcademicCapIcon,
  ListBulletIcon,
  LinkIcon,
  ClipboardDocumentCheckIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
} from '@heroicons/react/24/solid';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import { useAuth } from '@/contexts/AuthContext';
import { api, CourseDetail, CourseUpdateData, SLOItem, ContentItem, RequisiteItem } from '@/lib/api';
import { invalidateCourseCache } from '@/lib/swr';
import { CBCodeWizard, CBCodes, CCNJustification } from '@/components/cb-codes';
import { SLOEditor } from '@/components/slo';
import { ContentOutlineEditor, SLOOption } from '@/components/content';
import { AIAssistantPanel, AIInsightCard } from '@/components/ai';
import { RequisitesEditor } from '@/components/requisites';
import { ReviewSection } from '@/components/review';
import { ComplianceAuditSidebar } from '@/components/compliance';
import { CommentPanel } from '@/components/comments';
import { DocumentUploadPanel } from '@/components/documents';
import { CrossListingEditor } from '@/components/cross-listing';
import { LMIPanel } from '@/components/lmi';
import { FieldLabel, HelpText } from '@/components/ui';

// ===========================================
// Types & Constants
// ===========================================

interface EditorSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const EDITOR_SECTIONS: EditorSection[] = [
  {
    id: 'basic',
    label: 'Basic Info',
    icon: DocumentTextIcon,
    description: 'Course title, description, units, hours',
  },
  {
    id: 'cb-codes',
    label: 'CB Codes',
    icon: Cog6ToothIcon,
    description: 'California compliance codes',
  },
  {
    id: 'slos',
    label: 'SLOs',
    icon: AcademicCapIcon,
    description: 'Student Learning Outcomes',
  },
  {
    id: 'content',
    label: 'Content',
    icon: ListBulletIcon,
    description: 'Course content outline',
  },
  {
    id: 'requisites',
    label: 'Requisites',
    icon: LinkIcon,
    description: 'Prerequisites and corequisites',
  },
  {
    id: 'cross-listing',
    label: 'Cross-Listing',
    icon: ArrowsRightLeftIcon,
    description: 'Cross-listed courses',
  },
  {
    id: 'lmi',
    label: 'LMI Data',
    icon: ChartBarIcon,
    description: 'Labor Market Information for CTE',
  },
  {
    id: 'review',
    label: 'Review',
    icon: ClipboardDocumentCheckIcon,
    description: 'Final review and submit',
  },
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ===========================================
// Navigation Stepper Component
// ===========================================

interface NavigationStepperProps {
  sections: EditorSection[];
  currentSection: string;
  completedSections: Set<string>;
  onSectionChange: (sectionId: string) => void;
}

function NavigationStepper({
  sections,
  currentSection,
  completedSections,
  onSectionChange,
}: NavigationStepperProps) {
  const completionPercentage = Math.round(
    (completedSections.size / sections.length) * 100
  );

  return (
    <div className="h-full flex flex-col">
      {/* Progress Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Progress
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-luminous-500 transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-luminous-600 dark:text-luminous-400">
            {completionPercentage}%
          </span>
        </div>
      </div>

      {/* Section List */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <ul className="space-y-1">
          {sections.map((section, index) => {
            const isActive = currentSection === section.id;
            const isCompleted = completedSections.has(section.id);
            const Icon = section.icon;

            return (
              <li key={section.id}>
                <button
                  onClick={() => onSectionChange(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {/* Step Number or Check */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-luminous-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </div>

                  {/* Label and Icon */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 ${
                          isActive
                            ? 'text-luminous-600 dark:text-luminous-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      <span className="font-medium truncate">{section.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {section.description}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// ===========================================
// Basic Info Section Component
// ===========================================

interface BasicInfoSectionProps {
  course: CourseDetail;
  onChange: (updates: Partial<CourseDetail>) => void;
  onBlur?: () => void;
}

// Course type options for the selector
type CourseType = 'lecture' | 'lab' | 'lecture_lab' | 'activity';

const COURSE_TYPES: { value: CourseType; label: string; description: string }[] = [
  { value: 'lecture', label: 'Lecture Only', description: 'Standard lecture course' },
  { value: 'lab', label: 'Lab Only', description: 'Laboratory-based course' },
  { value: 'lecture_lab', label: 'Lecture + Lab', description: 'Combined lecture and lab' },
  { value: 'activity', label: 'Activity', description: 'Physical education or performance' },
];

function BasicInfoSection({ course, onChange, onBlur }: BasicInfoSectionProps) {
  // State for AI suggestion
  const [descriptionSuggestion, setDescriptionSuggestion] = useState<string | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

  // Determine current course type based on hours
  const getCurrentCourseType = (): CourseType => {
    const hasLecture = (course.lecture_hours || 0) > 0;
    const hasLab = (course.lab_hours || 0) > 0;
    const hasActivity = (course.activity_hours || 0) > 0;

    if (hasActivity) return 'activity';
    if (hasLecture && hasLab) return 'lecture_lab';
    if (hasLab) return 'lab';
    return 'lecture';
  };

  const [courseType, setCourseType] = useState<CourseType>(getCurrentCourseType);

  // Auto-calculate hours when units or course type changes
  const handleUnitsChange = (newUnits: number) => {
    onChange({ units: newUnits });

    // Auto-calculate suggested hours based on course type
    if (newUnits > 0) {
      autoCalculateHours(newUnits, courseType);
    }
  };

  const handleCourseTypeChange = (newType: CourseType) => {
    setCourseType(newType);

    // Auto-calculate hours for the new type
    if (course.units > 0) {
      autoCalculateHours(course.units, newType);
    }
  };

  // Auto-calculate hours based on units and course type
  // Following the 54-hour rule: Total Student Hours / 54 = Units
  const autoCalculateHours = (units: number, type: CourseType) => {
    const totalHoursNeeded = units * 54; // Target total student hours

    let lectureHours = 0;
    let labHours = 0;
    let activityHours = 0;
    let outsideHours = 0;

    switch (type) {
      case 'lecture':
        // For lecture-only: lecture hrs/wk * 18 + outside hrs/wk * 18 = total
        // Standard ratio: 2 hours outside for every 1 hour lecture
        // So: lecture * 18 + (lecture * 2) * 18 = lecture * 54 = total
        // Therefore: lecture hrs/wk = units (for 3 units, 3 hrs lecture/wk)
        lectureHours = units;
        outsideHours = units * 2; // 2:1 ratio for homework
        break;

      case 'lab':
        // For lab-only: lab hrs/wk * 54 = total (labs count 1:1)
        // Therefore: lab hrs/wk = units
        labHours = units;
        break;

      case 'lecture_lab':
        // Split between lecture and lab
        // Common pattern: 2 units lecture + 1 unit lab for 3-unit course
        const lectureUnits = Math.ceil(units * 2 / 3);
        const labUnits = units - lectureUnits;
        lectureHours = lectureUnits;
        outsideHours = lectureUnits * 2;
        labHours = labUnits;
        break;

      case 'activity':
        // Activity courses: similar to lab (1:1 ratio)
        activityHours = units;
        break;
    }

    onChange({
      lecture_hours: lectureHours,
      lab_hours: labHours,
      activity_hours: activityHours,
      outside_of_class_hours: outsideHours,
    });
  };

  // Handler to request AI suggestion for catalog description
  const handleRequestDescriptionSuggestion = async () => {
    setIsLoadingSuggestion(true);
    setDescriptionSuggestion(null);
    try {
      const response = await api.suggestCatalogDescription({
        course_title: course.title,
        subject_code: course.subject_code,
        course_number: course.course_number,
        units: course.units,
        existing_description: course.catalog_description || undefined,
        slos: course.slos?.map(s => s.outcome_text),
      });
      setDescriptionSuggestion(response.text);
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
      setDescriptionSuggestion('Failed to generate suggestion. Please try again.');
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  // Handler to apply suggestion
  const handleApplyDescriptionSuggestion = (suggestion: string) => {
    onChange({ catalog_description: suggestion });
    setDescriptionSuggestion(null);
  };

  // Calculate total student hours using the 54-hour rule (Title 5 § 55002.5)
  // Users enter WEEKLY hours, we calculate SEMESTER totals:
  // - Lecture: weekly hours × 18 weeks per semester
  // - Lab: weekly hours × 54 (labs count 1:1 with student hours)
  // - Homework: typically 2× lecture semester hours for standard courses
  // Total Student Hours / 54 = Units
  const lectureHoursPerWeek = course.lecture_hours || 0;
  const labHoursPerWeek = course.lab_hours || 0;
  const outsideOfClassHoursPerWeek = course.outside_of_class_hours || 0;

  // Semester calculations
  const lectureSemesterHours = lectureHoursPerWeek * 18; // 18 weeks × weekly lecture
  const labSemesterHours = labHoursPerWeek * 54; // Labs: 1 hour = 54 student hours over semester
  const outsideOfClassSemesterHours = outsideOfClassHoursPerWeek * 18; // 18 weeks × weekly outside-of-class

  const calculatedTotalHours = lectureSemesterHours + labSemesterHours + outsideOfClassSemesterHours;
  const calculatedUnits = calculatedTotalHours / 54;
  const unitsMatch = Math.abs(calculatedUnits - (course.units || 0)) < 0.1;
  const isValid = calculatedTotalHours > 0 && unitsMatch;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Basic Information
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Essential course details including title, description, and unit/hour calculations.
        </p>
      </div>

      {/* Course Code Display */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Course Code</span>
            <p className="text-2xl font-bold text-luminous-600 dark:text-luminous-400">
              {course.subject_code} {course.course_number}
            </p>
          </div>
          <div className="flex-1">
            <span className="text-sm text-slate-500 dark:text-slate-400">Status</span>
            <p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                course.status === 'Approved'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : course.status === 'Draft'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {course.status}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className="luminous-label">
          Course Title
        </label>
        <input
          type="text"
          id="title"
          value={course.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={onBlur}
          className="luminous-input"
          placeholder="Introduction to..."
        />
      </div>

      {/* Catalog Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="catalog_description" className="luminous-label mb-0">
            Catalog Description
          </label>
          <button
            type="button"
            onClick={handleRequestDescriptionSuggestion}
            disabled={isLoadingSuggestion}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-luminous-600 dark:text-luminous-400 bg-luminous-50 dark:bg-luminous-900/30 hover:bg-luminous-100 dark:hover:bg-luminous-900/50 rounded-md transition-colors disabled:opacity-50"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            {isLoadingSuggestion ? 'Generating...' : 'AI Suggest'}
          </button>
        </div>
        <textarea
          id="catalog_description"
          value={course.catalog_description || ''}
          onChange={(e) => onChange({ catalog_description: e.target.value })}
          onBlur={onBlur}
          rows={4}
          className="luminous-input"
          placeholder="A comprehensive course covering..."
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Write in active voice. Aim for approximately 50 words.
        </p>

        {/* AI Suggestion Card */}
        {(descriptionSuggestion || isLoadingSuggestion) && (
          <AIInsightCard
            title="Suggested Catalog Description"
            suggestion={descriptionSuggestion || ''}
            isLoading={isLoadingSuggestion}
            fieldName="Catalog Description"
            onApply={handleApplyDescriptionSuggestion}
            onRegenerate={handleRequestDescriptionSuggestion}
            onDismiss={() => setDescriptionSuggestion(null)}
            className="mt-3"
          />
        )}
      </div>

      {/* Course Type Selector */}
      <div>
        <label className="luminous-label">Course Type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {COURSE_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => handleCourseTypeChange(type.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                courseType === type.value
                  ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`text-sm font-medium ${
                courseType === type.value
                  ? 'text-luminous-700 dark:text-luminous-300'
                  : 'text-slate-700 dark:text-slate-300'
              }`}>
                {type.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {type.description}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Selecting a type auto-calculates recommended hours based on your units.
        </p>
      </div>

      {/* Units and Hours */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <FieldLabel
            label="Units"
            htmlFor="units"
            tooltip="Total unit value for this course. Units are calculated using the 54-hour rule: Total Student Hours ÷ 54 = Units."
          />
          <input
            type="number"
            id="units"
            value={course.units}
            onChange={(e) => handleUnitsChange(parseFloat(e.target.value) || 0)}
            className="luminous-input"
            min={0}
            step={0.5}
          />
        </div>
        <div>
          <FieldLabel
            label="Lecture Hours/Week"
            htmlFor="lecture_hours"
            tooltip="Weekly hours of in-class lecture instruction. Multiplied by 18 weeks per semester for total lecture hours."
          />
          <input
            type="number"
            id="lecture_hours"
            value={course.lecture_hours}
            onChange={(e) => onChange({ lecture_hours: parseFloat(e.target.value) || 0 })}
            className="luminous-input"
            min={0}
            step={0.5}
            disabled={courseType === 'lab' || courseType === 'activity'}
          />
        </div>
        <div>
          <FieldLabel
            label="Lab Hours/Week"
            htmlFor="lab_hours"
            tooltip="Weekly lab/activity hours. Labs count 1:1 with student hours (1 hr/wk = 54 hrs/semester) per Title 5."
          />
          <input
            type="number"
            id="lab_hours"
            value={course.lab_hours}
            onChange={(e) => onChange({ lab_hours: parseFloat(e.target.value) || 0 })}
            className="luminous-input"
            min={0}
            step={0.5}
            disabled={courseType === 'lecture' || courseType === 'activity'}
          />
        </div>
        <div>
          <FieldLabel
            label="Outside Hours/Week"
            htmlFor="outside_of_class_hours"
            tooltip="Expected weekly hours students spend on homework, reading, and study outside of class. Typically 2× lecture hours."
          />
          <input
            type="number"
            id="outside_of_class_hours"
            value={course.outside_of_class_hours}
            onChange={(e) => onChange({ outside_of_class_hours: parseFloat(e.target.value) || 0 })}
            className="luminous-input"
            min={0}
            step={0.5}
            disabled={courseType === 'lab' || courseType === 'activity'}
          />
        </div>
      </div>

      {/* Total Hours Display - Unit Calculator */}
      <div className={`p-4 rounded-lg border-2 ${
        isValid
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : calculatedTotalHours > 0
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-luminous-50 dark:bg-luminous-900/20 border-luminous-200 dark:border-luminous-800'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${
            isValid
              ? 'text-green-700 dark:text-green-300'
              : calculatedTotalHours > 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-luminous-700 dark:text-luminous-300'
          }`}>
            Total Student Hours (Semester)
          </span>
          <span className={`text-lg font-bold ${
            isValid
              ? 'text-green-600 dark:text-green-400'
              : calculatedTotalHours > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-luminous-600 dark:text-luminous-400'
          }`}>
            {calculatedTotalHours}
          </span>
        </div>

        {/* Visual Bar Chart Breakdown */}
        {calculatedTotalHours > 0 && (
          <div className="mb-4">
            <div className="flex h-6 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700">
              {lectureSemesterHours > 0 && (
                <div
                  className="bg-blue-500 dark:bg-blue-400 flex items-center justify-center"
                  style={{ width: `${(lectureSemesterHours / calculatedTotalHours) * 100}%` }}
                  title={`Lecture: ${lectureSemesterHours} hrs`}
                >
                  {lectureSemesterHours > calculatedTotalHours * 0.15 && (
                    <span className="text-xs text-white font-medium">
                      {lectureSemesterHours}
                    </span>
                  )}
                </div>
              )}
              {labSemesterHours > 0 && (
                <div
                  className="bg-emerald-500 dark:bg-emerald-400 flex items-center justify-center"
                  style={{ width: `${(labSemesterHours / calculatedTotalHours) * 100}%` }}
                  title={`Lab: ${labSemesterHours} hrs`}
                >
                  {labSemesterHours > calculatedTotalHours * 0.15 && (
                    <span className="text-xs text-white font-medium">
                      {labSemesterHours}
                    </span>
                  )}
                </div>
              )}
              {outsideOfClassSemesterHours > 0 && (
                <div
                  className="bg-amber-500 dark:bg-amber-400 flex items-center justify-center"
                  style={{ width: `${(outsideOfClassSemesterHours / calculatedTotalHours) * 100}%` }}
                  title={`Outside-of-Class: ${outsideOfClassSemesterHours} hrs`}
                >
                  {outsideOfClassSemesterHours > calculatedTotalHours * 0.15 && (
                    <span className="text-xs text-white font-medium">
                      {outsideOfClassSemesterHours}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2 text-xs">
              {lectureSemesterHours > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-500 dark:bg-blue-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    Lecture: {lectureSemesterHours} hrs ({lectureHoursPerWeek}/wk × 18)
                  </span>
                </div>
              )}
              {labSemesterHours > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-500 dark:bg-emerald-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    Lab: {labSemesterHours} hrs ({labHoursPerWeek}/wk × 54)
                  </span>
                </div>
              )}
              {outsideOfClassSemesterHours > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-amber-500 dark:bg-amber-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    Outside: {outsideOfClassSemesterHours} hrs ({outsideOfClassHoursPerWeek}/wk × 18)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Text Breakdown (shown when no hours entered) */}
        {calculatedTotalHours === 0 && (
          <div className="text-xs space-y-1 mb-3 text-slate-500 dark:text-slate-400">
            <p className="italic">Enter units and select a course type to see the hours breakdown.</p>
          </div>
        )}

        {/* Unit calculation */}
        <div className={`pt-2 border-t ${
          isValid
            ? 'border-green-200 dark:border-green-700'
            : calculatedTotalHours > 0
              ? 'border-red-200 dark:border-red-700'
              : 'border-luminous-200 dark:border-luminous-700'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Calculated Units: {calculatedTotalHours} ÷ 54 =
            </span>
            <span className={`font-bold ${
              unitsMatch
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {calculatedUnits.toFixed(2)} units
            </span>
          </div>
          {!unitsMatch && calculatedTotalHours > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              ⚠️ Hours don&apos;t match the {course.units} units entered. Adjust hours or units.
            </p>
          )}
          {isValid && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Hours comply with Title 5 § 55002.5 (54-hour rule)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================
// CB Codes Section Component
// ===========================================

interface CBCodesSectionProps {
  course: CourseDetail;
  onChange: (updates: Partial<CourseDetail>) => void;
}

function CBCodesSection({ course, onChange }: CBCodesSectionProps) {
  const handleCBCodesChange = useCallback((codes: CBCodes) => {
    onChange({ cb_codes: codes });
  }, [onChange]);

  const handleCBCodesComplete = useCallback((codes: CBCodes) => {
    onChange({ cb_codes: codes });
    // Could trigger save here or show success message
  }, [onChange]);

  // CUR-222: Handle CCN adoption - merge CCN-implied CB codes into course
  const handleCCNAdopted = useCallback((ccnId: string, cbCodes: Record<string, string>) => {
    // Store CCN adoption info and merge CB codes
    const updatedCBCodes = {
      ...((course.cb_codes as CBCodes) || {}),
      ...cbCodes, // CCN-implied codes (CB05="A", CB03=TOP code)
    };
    onChange({
      ccn_code: ccnId,
      cb_codes: updatedCBCodes,
    });
  }, [course.cb_codes, onChange]);

  // CUR-222: Handle CCN skip/justification
  const handleCCNSkipped = useCallback((justification?: CCNJustification) => {
    if (justification) {
      // Store justification for compliance records
      onChange({
        ccn_justification: justification as unknown as Record<string, unknown>,
      });
    }
    // CCN detection was skipped or justified - proceed normally
  }, [onChange]);

  return (
    <CBCodeWizard
      initialCodes={(course.cb_codes as CBCodes) || {}}
      onChange={handleCBCodesChange}
      onComplete={handleCBCodesComplete}
      // CUR-222: Pass course context for CCN detection
      courseId={course.id}
      courseTitle={course.title}
      subjectCode={course.subject_code}
      courseUnits={course.units}
      courseDescription={course.catalog_description || undefined}
      enableCCNDetection={true}
      onCCNAdopted={handleCCNAdopted}
      onCCNSkipped={handleCCNSkipped}
    />
  );
}

// ===========================================
// SLO Section Component
// ===========================================

interface SLOSectionProps {
  course: CourseDetail;
  onChange: (updates: Partial<CourseDetail>) => void;
}

function SLOSection({ course, onChange }: SLOSectionProps) {
  // Initialize SLOs from course data or with defaults
  const slos: SLOItem[] = course.slos?.length > 0 ? course.slos : [
    { id: 'slo-1', sequence: 1, outcome_text: '', bloom_level: '', performance_criteria: null },
    { id: 'slo-2', sequence: 2, outcome_text: '', bloom_level: '', performance_criteria: null },
    { id: 'slo-3', sequence: 3, outcome_text: '', bloom_level: '', performance_criteria: null },
  ];

  const handleSLOsChange = useCallback((newSLOs: SLOItem[]) => {
    onChange({ slos: newSLOs });
  }, [onChange]);

  return (
    <SLOEditor
      slos={slos}
      onChange={handleSLOsChange}
      minSLOs={3}
      maxSLOs={8}
    />
  );
}

// ===========================================
// Content Section Component
// ===========================================

interface ContentSectionProps {
  course: CourseDetail;
  onChange: (updates: Partial<CourseDetail>) => void;
}

function ContentSection({ course, onChange }: ContentSectionProps) {
  // Initialize content items from course data or with one empty item
  const contentItems: ContentItem[] = course.content_items?.length > 0 ? course.content_items : [
    { id: 'content-1', sequence: 1, topic: '', subtopics: [], hours_allocated: 0, linked_slos: [] },
  ];

  // Convert SLOs to SLOOption format for the editor
  const sloOptions: SLOOption[] = (course.slos || []).map((slo) => ({
    id: slo.id,
    sequence: slo.sequence,
    outcome_text: slo.outcome_text,
    bloom_level: slo.bloom_level,
  }));

  // Calculate total course hours (lecture + lab + activity) per week × 18 weeks
  const totalCourseHours = (course.lecture_hours + course.lab_hours + (course.activity_hours || 0)) * 18;

  const handleContentChange = useCallback((newItems: ContentItem[]) => {
    onChange({ content_items: newItems });
  }, [onChange]);

  return (
    <ContentOutlineEditor
      contentItems={contentItems}
      onChange={handleContentChange}
      slos={sloOptions}
      totalCourseHours={totalCourseHours || 54}
    />
  );
}

// ===========================================
// Placeholder Section Components
// ===========================================

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          {title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>
      <div className="flex items-center justify-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
        <div className="text-center">
          <Cog6ToothIcon className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            This section is coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Requisites Section Component
// ===========================================

interface RequisitesSectionProps {
  course: CourseDetail;
  onChange: (updates: Partial<CourseDetail>) => void;
}

function RequisitesSection({ course, onChange }: RequisitesSectionProps) {
  const handleRequisitesChange = (requisites: RequisiteItem[]) => {
    onChange({ ...course, requisites });
  };

  return (
    <RequisitesEditor
      courseId={course.id}
      requisites={course.requisites || []}
      onChange={handleRequisitesChange}
      readOnly={course.status !== 'Draft'}
    />
  );
}

// ===========================================
// Review Section Wrapper Component
// ===========================================

interface ReviewSectionWrapperProps {
  course: CourseDetail;
  onSubmitForReview: () => void;
}

function ReviewSectionWrapper({ course, onSubmitForReview }: ReviewSectionWrapperProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitForReview();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ReviewSection
      course={course}
      onSubmitForReview={handleSubmit}
      isSubmitting={isSubmitting}
    />
  );
}

// ===========================================
// Main Course Editor Component
// ===========================================

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { user, getToken } = useAuth();
  const toast = useToast();
  const courseId = params.id as string;

  // State
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState('basic');
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [aiPanelOpen, setAiPanelOpen] = useState(false); // Start closed on mobile
  const [compliancePanelOpen, setCompliancePanelOpen] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Section labels for comments
  const SECTION_LABELS: Record<string, string> = {
    basic: 'Basic Info',
    'cb-codes': 'CB Codes',
    slos: 'SLOs',
    content: 'Content',
    requisites: 'Requisites',
    'cross-listing': 'Cross-Listing',
    review: 'Review',
  };

  // Ref for debounced save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<CourseUpdateData>({});

  // Fetch course data
  useEffect(() => {
    const fetchCourse = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        const data = await api.getCourse(courseId);
        setCourse(data);
      } catch (err) {
        console.error('Failed to fetch course:', err);
        setError(err instanceof Error ? err.message : 'Failed to load course');
      } finally {
        setLoading(false);
      }
    };

    if (courseId) {
      fetchCourse();
    }
  }, [courseId, getToken]);

  // Permission check: Redirect non-owners to view page
  // Only Admin or course creator can edit. Reviewers should use the view page
  // where they can approve or return with comments (compliant workflow).
  useEffect(() => {
    if (!course || !user || isRedirecting) return;

    const isAdmin = user.role === 'Admin';
    // Compare by email since dev mode uses different IDs than the database
    const isOwner = course.creator_email === user.email;

    if (!isAdmin && !isOwner) {
      // Set flag to prevent multiple redirects
      setIsRedirecting(true);
      // Redirect to view page where reviewer actions are available
      toast.info(
        'View Only',
        'Reviewers can approve or return courses with comments from the course view page.'
      );
      router.replace(`/courses/${courseId}`);
    }
  }, [course, user, courseId, router, toast, isRedirecting]);

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save course to API
  // Uses .then()/.catch() pattern instead of try/await to prevent Next.js error overlay
  const saveCourse = useCallback(async (updates: CourseUpdateData) => {
    if (!courseId) return;

    setSaveStatus('saving');
    const token = await getToken();
    if (token) {
      api.setToken(token);
    }

    // Use promise chain to catch errors without triggering React error boundary
    api.updateCourse(courseId, updates)
      .then(async () => {
        // Invalidate course cache
        await invalidateCourseCache(courseId);
        setSaveStatus('saved');
        // Reset to idle after showing "Saved" for 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
      })
      .catch((err: Error) => {
        console.error('Failed to save course:', err);
        setSaveStatus('error');
        toast.error(
          'Failed to save changes',
          err.message || 'Please try again'
        );
        // Reset to idle after showing error for 3 seconds
        setTimeout(() => setSaveStatus('idle'), 3000);
      });
  }, [courseId, getToken, toast]);

  // Handle course updates with debounced auto-save
  const handleCourseChange = useCallback((updates: CourseUpdateData) => {
    // Update local state immediately
    setCourse((prev) => (prev ? { ...prev, ...updates } : null));

    // Accumulate pending changes
    pendingChangesRef.current = { ...pendingChangesRef.current, ...updates };
    setSaveStatus('saving');

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save - wait 2 seconds after last change
    saveTimeoutRef.current = setTimeout(() => {
      const changes = pendingChangesRef.current;
      pendingChangesRef.current = {};
      saveCourse(changes);
    }, 2000);
  }, [saveCourse]);

  // Flush pending saves immediately (called on blur)
  const flushSave = useCallback(() => {
    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // If there are pending changes, save them immediately
    const changes = pendingChangesRef.current;
    if (Object.keys(changes).length > 0) {
      pendingChangesRef.current = {};
      saveCourse(changes);
    }
  }, [saveCourse]);

  // Handle submit for review - transition course status
  const handleSubmitForReview = useCallback(async () => {
    if (!course || course.status !== 'Draft') return;

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      // Transition to DeptReview status
      await api.transitionCourseStatus(courseId, {
        new_status: 'DeptReview',
        comment: 'Submitted for departmental review',
      });

      // Update local course state
      setCourse((prev) => prev ? { ...prev, status: 'DeptReview' } : null);

      toast.success(
        'Course Submitted',
        'Your course has been submitted for departmental review.'
      );

      // Navigate to the course detail page
      router.push(`/courses/${courseId}`);
    } catch (err) {
      console.error('Failed to submit course:', err);
      toast.error(
        'Submission Failed',
        err instanceof Error ? err.message : 'Please try again'
      );
    }
  }, [course, courseId, getToken, toast, router]);

  // Render section content
  const renderSectionContent = () => {
    if (!course) return null;

    switch (currentSection) {
      case 'basic':
        return <BasicInfoSection course={course} onChange={handleCourseChange} onBlur={flushSave} />;
      case 'cb-codes':
        return (
          <CBCodesSection course={course} onChange={handleCourseChange} />
        );
      case 'slos':
        return <SLOSection course={course} onChange={handleCourseChange} />;
      case 'content':
        return <ContentSection course={course} onChange={handleCourseChange} />;
      case 'requisites':
        return (
          <RequisitesSection course={course} onChange={handleCourseChange} />
        );
      case 'cross-listing':
        return (
          <CrossListingEditor
            courseId={course.id}
            readOnly={course.status !== 'Draft'}
          />
        );
      case 'lmi':
        // Check if this is a CTE course
        const isCTE = course.cb_codes?.CB04 === 'C' || course.cb_codes?.sam_code !== 'E';
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Labor Market Information
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Add labor market data for this CTE course to demonstrate career outcomes and labor demand.
              </p>
            </div>
            <LMIPanel
              lmiData={course.lmi_soc_code ? {
                soc_code: course.lmi_soc_code || undefined,
                occupation_title: course.lmi_occupation_title || undefined,
                area: (course.lmi_wage_data as Record<string, unknown>)?.area as string || 'Los Angeles County',
                retrieved_at: course.lmi_retrieved_at || undefined,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                wage_data: course.lmi_wage_data as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                projection_data: course.lmi_projection_data as any,
                narrative: course.lmi_narrative || undefined,
              } : null}
              isCTECourse={isCTE}
              onUpdate={(lmiData) => {
                // Save LMI data to individual fields (CUR-190 structure)
                handleCourseChange({
                  lmi_data: lmiData as Record<string, unknown> | null,
                  lmi_soc_code: lmiData?.soc_code || null,
                  lmi_occupation_title: lmiData?.occupation_title || null,
                  lmi_wage_data: (lmiData?.wage_data as unknown) as Record<string, unknown> | null,
                  lmi_projection_data: (lmiData?.projection_data as unknown) as Record<string, unknown> | null,
                  lmi_narrative: lmiData?.narrative || null,
                  lmi_retrieved_at: lmiData?.retrieved_at || null,
                });
                flushSave();
              }}
              onSearch={() => {
                window.location.href = '/lmi-data';
              }}
              courseTitle={course.title}
              courseDescription={course.catalog_description || undefined}
              objectives={course.content_items?.map(item => item.topic || '')}
              slos={course.slos?.map(s => s.outcome_text || '')}
              topCode={course.cb_codes?.top_code as string | undefined}
              department={course.subject_code}
            />
          </div>
        );
      case 'review':
        return (
          <ReviewSectionWrapper
            course={course}
            onSubmitForReview={handleSubmitForReview}
          />
        );
      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-500" />
        </div>
      </PageShell>
    );
  }

  // Error state
  if (error || !course) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ExclamationCircleIcon className="h-16 w-16 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load Course
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {error || 'Course not found'}
          </p>
          <Link href="/courses" className="luminous-button-primary">
            Back to Courses
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Editor Layout */}
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {/* Left: Back & Breadcrumb */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Link
              href="/courses"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              {/* Breadcrumb - Hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>Courses</span>
                <ChevronRightIcon className="h-4 w-4" />
                <span>{course.subject_code} {course.course_number}</span>
                <ChevronRightIcon className="h-4 w-4" />
                <span className="text-luminous-600 dark:text-luminous-400">
                  {EDITOR_SECTIONS.find((s) => s.id === currentSection)?.label}
                </span>
              </div>
              <h1 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                <span className="sm:hidden">{course.subject_code} {course.course_number} - </span>
                {course.title}
              </h1>
            </div>
          </div>

          {/* Right: Save Status & Actions */}
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            {/* Save Status */}
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              {saveStatus === 'saving' && (
                <>
                  <CloudArrowUpIcon className="h-4 w-4 text-yellow-500 animate-pulse" />
                  <span className="hidden sm:inline text-yellow-600 dark:text-yellow-400">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  <span className="hidden sm:inline text-green-600 dark:text-green-400">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
                  <span className="hidden sm:inline text-red-600 dark:text-red-400">Error</span>
                </>
              )}
            </div>

            {/* Documents Toggle */}
            <button
              onClick={() => {
                setDocumentPanelOpen(!documentPanelOpen);
                if (!documentPanelOpen) {
                  setAiPanelOpen(false);
                  setCompliancePanelOpen(false);
                  setCommentPanelOpen(false);
                }
              }}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${
                documentPanelOpen
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Course Materials"
            >
              <DocumentArrowUpIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Materials</span>
            </button>

            {/* Comments Toggle */}
            <button
              onClick={() => {
                setCommentPanelOpen(!commentPanelOpen);
                if (!commentPanelOpen) {
                  setAiPanelOpen(false);
                  setCompliancePanelOpen(false);
                  setDocumentPanelOpen(false);
                }
              }}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${
                commentPanelOpen
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Comments"
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Comments</span>
            </button>

            {/* Compliance Toggle */}
            <button
              onClick={() => {
                setCompliancePanelOpen(!compliancePanelOpen);
                if (!compliancePanelOpen) {
                  setAiPanelOpen(false);
                  setCommentPanelOpen(false);
                  setDocumentPanelOpen(false);
                }
              }}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${
                compliancePanelOpen
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Compliance Audit"
            >
              <ShieldCheckIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Compliance</span>
            </button>

            {/* AI Toggle */}
            <button
              onClick={() => {
                setAiPanelOpen(!aiPanelOpen);
                if (!aiPanelOpen) {
                  setCompliancePanelOpen(false);
                  setCommentPanelOpen(false);
                  setDocumentPanelOpen(false);
                }
              }}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[44px] ${
                aiPanelOpen
                  ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="AI Assistant"
            >
              <SparklesIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">AI Assist</span>
            </button>
          </div>
        </div>

        {/* Three-Panel Layout */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Panel: Navigation - Hidden on mobile, slide-in drawer */}
          <div className={`
            ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:translate-x-0
            fixed lg:relative
            inset-y-0 left-0
            z-40 lg:z-auto
            w-64 flex-shrink-0
            border-r border-slate-200 dark:border-slate-700
            bg-white dark:bg-slate-900
            overflow-hidden
            transition-transform duration-300 ease-in-out
            lg:block
          `}>
            <NavigationStepper
              sections={EDITOR_SECTIONS}
              currentSection={currentSection}
              completedSections={completedSections}
              onSectionChange={(sectionId) => {
                setCurrentSection(sectionId);
                setMobileNavOpen(false);
              }}
            />
          </div>

          {/* Mobile Nav Overlay */}
          {mobileNavOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}

          {/* Center Panel: Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            {/* Mobile Section Selector */}
            <div className="lg:hidden sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const section = EDITOR_SECTIONS.find(s => s.id === currentSection);
                    const Icon = section?.icon || DocumentTextIcon;
                    return (
                      <>
                        <Icon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" />
                        <span className="font-medium text-slate-900 dark:text-white">
                          {section?.label || 'Select Section'}
                        </span>
                      </>
                    );
                  })()}
                </div>
                <ChevronRightIcon className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
              {renderSectionContent()}

              {/* Navigation Buttons - Hidden on CB Codes section which has its own wizard navigation */}
              {currentSection !== 'cb-codes' && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      const currentIndex = EDITOR_SECTIONS.findIndex(
                        (s) => s.id === currentSection
                      );
                      if (currentIndex > 0) {
                        setCurrentSection(EDITOR_SECTIONS[currentIndex - 1].id);
                      }
                    }}
                    disabled={currentSection === EDITOR_SECTIONS[0].id}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  <button
                    onClick={() => {
                      const currentIndex = EDITOR_SECTIONS.findIndex(
                        (s) => s.id === currentSection
                      );
                      if (currentIndex < EDITOR_SECTIONS.length - 1) {
                        setCurrentSection(EDITOR_SECTIONS[currentIndex + 1].id);
                      }
                    }}
                    disabled={currentSection === EDITOR_SECTIONS[EDITOR_SECTIONS.length - 1].id}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: AI Assistant, Compliance Audit, or Comments - Slide-in on mobile */}
          {(aiPanelOpen || compliancePanelOpen || commentPanelOpen) && (
            <>
              {/* Mobile overlay */}
              <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => {
                  setAiPanelOpen(false);
                  setCompliancePanelOpen(false);
                  setCommentPanelOpen(false);
                  setDocumentPanelOpen(false);
                }}
              />
              <div className={`
                fixed lg:relative
                inset-y-0 right-0
                z-50 lg:z-auto
                w-full sm:w-80
                flex-shrink-0
                border-l border-slate-200 dark:border-slate-700
                overflow-hidden
                bg-white dark:bg-slate-900
              `}>
                {aiPanelOpen && (
                  <AIAssistantPanel
                    isOpen={aiPanelOpen}
                    onClose={() => setAiPanelOpen(false)}
                    course={course}
                    currentSection={currentSection}
                  />
                )}
                {compliancePanelOpen && (
                  <ComplianceAuditSidebar
                    isOpen={compliancePanelOpen}
                    onClose={() => setCompliancePanelOpen(false)}
                    course={course}
                    currentSection={currentSection}
                  />
                )}
                {commentPanelOpen && (
                  <CommentPanel
                    entityType="Course"
                    entityId={courseId}
                    currentSection={currentSection}
                    sectionLabels={SECTION_LABELS}
                    onClose={() => setCommentPanelOpen(false)}
                  />
                )}
              </div>
            </>
          )}

          {/* Document Upload Panel - Uses fixed positioning */}
          <DocumentUploadPanel
            courseId={courseId}
            isOpen={documentPanelOpen}
            onClose={() => setDocumentPanelOpen(false)}
          />
        </div>
      </div>
    </PageShell>
  );
}
