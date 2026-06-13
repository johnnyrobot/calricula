'use client';

// ===========================================
// New Course Form Page
// ===========================================
// Allows faculty to create a new course with basic information
// Saves course in Draft status and redirects to editor
// Features real-time validation with inline error feedback

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import {
  FormField,
  FormInput,
  FormSelect,
  ValidationSummary,
  useFormValidation,
  validationRules,
} from '@/components/form';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useDepartments, invalidateCourseCache } from '@/lib/swr';

// ===========================================
// Form State Interface
// ===========================================

interface FormData {
  subject_code: string;
  course_number: string;
  title: string;
  department_id: string;
}

// ===========================================
// Validation Configuration
// ===========================================

const validationConfig = {
  subject_code: {
    label: 'Subject Code',
    rules: [
      validationRules.required('Subject code'),
      validationRules.maxLength(10, 'Subject code'),
      validationRules.pattern(
        /^[A-Za-z]+$/,
        'Subject code must contain only letters'
      ),
    ],
  },
  course_number: {
    label: 'Course Number',
    rules: [
      validationRules.required('Course number'),
      validationRules.maxLength(10, 'Course number'),
      validationRules.pattern(
        /^[A-Za-z0-9]+$/,
        'Course number must contain only letters and numbers'
      ),
    ],
  },
  title: {
    label: 'Course Title',
    rules: [
      validationRules.required('Course title'),
      validationRules.minLength(3, 'Course title'),
      validationRules.maxLength(200, 'Course title'),
    ],
  },
  department_id: {
    label: 'Department',
    rules: [
      validationRules.required('Department'),
    ],
  },
};

// ===========================================
// Main Component
// ===========================================

export default function NewCoursePage() {
  const router = useRouter();
  const { getToken, user, loading: authLoading } = useAuth();
  const toast = useToast();

  // Auth token for API calls
  const [token, setToken] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    subject_code: '',
    course_number: '',
    title: '',
    department_id: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Validation hook
  const validation = useFormValidation(validationConfig);

  // Get auth token when user is available
  useEffect(() => {
    const fetchToken = async () => {
      if (!authLoading && user) {
        const t = await getToken();
        setToken(t);
      }
    };
    fetchToken();
  }, [getToken, user, authLoading]);

  // Departments for dropdown - using SWR for caching
  const { departments, isLoading: loadingDepartments, error: departmentsError } = useDepartments(token);

  // Set error if departments failed to load
  if (departmentsError && !generalError) {
    setGeneralError('Failed to load departments. Please try again.');
  }

  // Handle input changes with validation
  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    validation.handleChange(name as keyof typeof validationConfig, value);

    // Clear general error when user makes changes
    if (generalError) {
      setGeneralError(null);
    }
  }, [validation, generalError]);

  // Handle blur for validation
  const handleBlur = useCallback((
    e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    validation.handleBlur(name as keyof typeof validationConfig, value);
  }, [validation]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    validation.setSubmitted();

    // Validate all fields
    const isValid = validation.validateAll(formData as unknown as Record<string, unknown>);
    if (!isValid) {
      // Scroll to validation summary
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const course = await api.createCourse({
        subject_code: formData.subject_code.toUpperCase().trim(),
        course_number: formData.course_number.trim(),
        title: formData.title.trim(),
        department_id: formData.department_id,
      });

      toast.success(
        'Course created successfully!',
        `${course.subject_code} ${course.course_number} - ${course.title}`
      );

      // Invalidate course cache to update list pages
      await invalidateCourseCache();

      // Redirect to the course editor
      router.push(`/courses/${course.id}/edit`);
    } catch (err) {
      console.error('Failed to create course:', err);
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to create course. Please try again.';
      setGeneralError(errorMessage);
      toast.error('Failed to create course', errorMessage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get field props helper
  const getFieldState = (name: keyof typeof validationConfig) => {
    return validation.getFieldProps(name);
  };

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/courses"
          className="inline-flex items-center text-sm text-slate-500 dark:text-slate-400 hover:text-luminous-600 dark:hover:text-luminous-400 mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Courses
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-luminous-100 dark:bg-luminous-900/30 rounded-lg">
              <AcademicCapIcon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Create New Course
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Start a new Course Outline of Record. You&apos;ll be able to add details,
            SLOs, and content after creating.
          </p>
        </div>

        {/* Form Card */}
        <div className="luminous-card">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Validation Summary */}
            {validation.submitted && validation.validationErrors.length > 0 && (
              <ValidationSummary
                errors={validation.validationErrors}
                title="Please fix the following errors before submitting:"
              />
            )}

            {/* General Error */}
            {generalError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-fadeIn">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {generalError}
                </p>
              </div>
            )}

            {/* Subject Code and Course Number */}
            <div className="grid grid-cols-2 gap-4">
              {/* Subject Code */}
              <FormField
                label="Subject Code"
                name="subject_code"
                required
                error={getFieldState('subject_code').error}
                isValid={getFieldState('subject_code').isValid}
                helperText="e.g., MATH, ENGL, CS"
                showSuccess
              >
                <FormInput
                  type="text"
                  id="subject_code"
                  name="subject_code"
                  value={formData.subject_code}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="MATH"
                  className="uppercase"
                  maxLength={10}
                  hasError={getFieldState('subject_code').hasError}
                  isValid={getFieldState('subject_code').isValid}
                  aria-describedby="subject_code-error subject_code-helper"
                />
              </FormField>

              {/* Course Number */}
              <FormField
                label="Course Number"
                name="course_number"
                required
                error={getFieldState('course_number').error}
                isValid={getFieldState('course_number').isValid}
                helperText="e.g., 101, 201A"
                showSuccess
              >
                <FormInput
                  type="text"
                  id="course_number"
                  name="course_number"
                  value={formData.course_number}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="101"
                  maxLength={10}
                  hasError={getFieldState('course_number').hasError}
                  isValid={getFieldState('course_number').isValid}
                  aria-describedby="course_number-error course_number-helper"
                />
              </FormField>
            </div>

            {/* Course Title */}
            <FormField
              label="Course Title"
              name="title"
              required
              error={getFieldState('title').error}
              isValid={getFieldState('title').isValid}
              helperText="The official title as it will appear in the catalog"
              showSuccess
            >
              <FormInput
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Introduction to Calculus"
                maxLength={200}
                hasError={getFieldState('title').hasError}
                isValid={getFieldState('title').isValid}
                aria-describedby="title-error title-helper"
              />
            </FormField>

            {/* Department */}
            <FormField
              label="Department"
              name="department_id"
              required
              error={getFieldState('department_id').error}
              isValid={getFieldState('department_id').isValid}
              helperText="Select the academic department for this course"
              showSuccess
            >
              <FormSelect
                id="department_id"
                name="department_id"
                value={formData.department_id}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loadingDepartments}
                hasError={getFieldState('department_id').hasError}
                isValid={getFieldState('department_id').isValid}
                aria-describedby="department_id-error department_id-helper"
              >
                <option value="">
                  {loadingDepartments
                    ? 'Loading departments...'
                    : 'Select a department'}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.code} - {dept.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Link
                href="/courses"
                className="luminous-button-secondary"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || loadingDepartments}
                className="luminous-button-primary"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Course'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-luminous-50 dark:bg-luminous-900/20 rounded-lg">
          <h3 className="text-sm font-medium text-luminous-900 dark:text-luminous-100 mb-2">
            What happens next?
          </h3>
          <p className="text-sm text-luminous-700 dark:text-luminous-300">
            After creating, your course will be saved as a <strong>Draft</strong>.
            You can then add the catalog description, Student Learning Outcomes (SLOs),
            content outline, and configure CB codes before submitting for review.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
