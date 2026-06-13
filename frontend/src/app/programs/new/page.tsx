'use client';

// ===========================================
// New Program Page - Create Program Form
// ===========================================
// Features real-time validation with inline error feedback

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  ValidationSummary,
  useFormValidation,
  validationRules,
} from '@/components/form';
import { useAuth } from '@/contexts/AuthContext';
import { api, ProgramType } from '@/lib/api';
import { useDepartments, invalidateProgramCache } from '@/lib/swr';

// ===========================================
// Program Type Options
// ===========================================

const PROGRAM_TYPES: { value: ProgramType; label: string; description: string }[] = [
  {
    value: 'AA',
    label: 'Associate of Arts (AA)',
    description: 'General education degree in arts and humanities',
  },
  {
    value: 'AS',
    label: 'Associate of Science (AS)',
    description: 'General education degree in science and technical fields',
  },
  {
    value: 'AAT',
    label: 'AA for Transfer (AA-T)',
    description: 'Transfer degree guaranteed admission to CSU',
  },
  {
    value: 'AST',
    label: 'AS for Transfer (AS-T)',
    description: 'Transfer degree guaranteed admission to CSU',
  },
  {
    value: 'Certificate',
    label: 'Certificate of Achievement',
    description: 'Career-focused program typically 18+ units',
  },
  {
    value: 'ADT',
    label: 'Associate Degree for Transfer',
    description: 'Transfer pathway to UC/CSU',
  },
];

// ===========================================
// Validation Configuration
// ===========================================

const validationConfig = {
  title: {
    label: 'Program Title',
    rules: [
      validationRules.required('Program title'),
      validationRules.minLength(3, 'Program title'),
      validationRules.maxLength(200, 'Program title'),
    ],
  },
  department_id: {
    label: 'Department',
    rules: [
      validationRules.required('Department'),
    ],
  },
  total_units: {
    label: 'Total Units',
    rules: [
      validationRules.required('Total units'),
      validationRules.numeric('Total units'),
      validationRules.min(1, 'Total units'),
      validationRules.max(120, 'Total units'),
    ],
  },
  top_code: {
    label: 'TOP Code',
    rules: [
      validationRules.pattern(
        /^(\d{4}\.\d{2})?$/,
        'TOP code must be in format XXXX.XX (e.g., 0707.00)'
      ),
    ],
  },
  cip_code: {
    label: 'CIP Code',
    rules: [
      validationRules.pattern(
        /^(\d{2}\.\d{4})?$/,
        'CIP code must be in format XX.XXXX (e.g., 11.0701)'
      ),
    ],
  },
};

// ===========================================
// Main Component
// ===========================================

export default function NewProgramPage() {
  const router = useRouter();
  const { getToken, user, loading: authLoading } = useAuth();
  const toast = useToast();

  // Auth token for API calls
  const [token, setToken] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [programType, setProgramType] = useState<ProgramType>('AA');
  const [departmentId, setDepartmentId] = useState('');
  const [catalogDescription, setCatalogDescription] = useState('');
  const [totalUnits, setTotalUnits] = useState('60');
  const [topCode, setTopCode] = useState('');
  const [cipCode, setCipCode] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
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
  const { departments, isLoading: loadingDepts, error: departmentsError } = useDepartments(token);

  // Set error if departments failed to load
  if (departmentsError && !generalError) {
    setGeneralError('Failed to load departments. Please refresh the page.');
  }

  // Handle field changes with validation
  const handleFieldChange = useCallback((field: string, value: string) => {
    validation.handleChange(field as keyof typeof validationConfig, value);
    if (generalError) setGeneralError(null);
  }, [validation, generalError]);

  // Handle field blur
  const handleFieldBlur = useCallback((field: string, value: string) => {
    validation.handleBlur(field as keyof typeof validationConfig, value);
  }, [validation]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    validation.setSubmitted();

    // Build form data for validation
    const formData = {
      title,
      department_id: departmentId,
      total_units: totalUnits,
      top_code: topCode,
      cip_code: cipCode,
    };

    // Validate all fields
    const isValid = validation.validateAll(formData);
    if (!isValid) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const program = await api.createProgram({
        title: title.trim(),
        type: programType,
        department_id: departmentId,
        catalog_description: catalogDescription.trim() || undefined,
        total_units: parseFloat(totalUnits) || 60,
        top_code: topCode.trim() || undefined,
        cip_code: cipCode.trim() || undefined,
      });

      toast.success(
        'Program created successfully!',
        `${program.title} (${program.type})`
      );

      // Invalidate program cache to update list pages
      await invalidateProgramCache();

      // Redirect to program builder
      router.push(`/programs/${program.id}/edit`);
    } catch (err) {
      console.error('Failed to create program:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create program';
      setGeneralError(errorMessage);
      toast.error('Failed to create program', errorMessage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  // Get field props helper
  const getFieldState = (name: keyof typeof validationConfig) => {
    return validation.getFieldProps(name);
  };

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <Link
          href="/programs"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Programs
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-luminous-100 dark:bg-luminous-900/30 rounded-lg">
              <AcademicCapIcon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Create New Program
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Set up a new degree or certificate program
          </p>
        </div>

        {/* Form */}
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
                <p className="text-red-700 dark:text-red-400">{generalError}</p>
              </div>
            )}

            {/* Program Title */}
            <FormField
              label="Program Title"
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
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  handleFieldChange('title', e.target.value);
                }}
                onBlur={(e) => handleFieldBlur('title', e.target.value)}
                placeholder="e.g., Computer Science for Transfer"
                hasError={getFieldState('title').hasError}
                isValid={getFieldState('title').isValid}
              />
            </FormField>

            {/* Program Type */}
            <div>
              <label className="luminous-label">
                Program Type <span className="text-red-500">*</span>
              </label>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                {PROGRAM_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors ${
                      programType === type.value
                        ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="programType"
                      value={type.value}
                      checked={programType === type.value}
                      onChange={(e) => setProgramType(e.target.value as ProgramType)}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <span className={`block text-sm font-medium ${
                        programType === type.value
                          ? 'text-luminous-700 dark:text-luminous-300'
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        {type.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        {type.description}
                      </span>
                    </div>
                    {programType === type.value && (
                      <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-luminous-500 flex items-center justify-center">
                        <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                        </svg>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Department */}
            <FormField
              label="Department"
              name="department_id"
              required
              error={getFieldState('department_id').error}
              isValid={getFieldState('department_id').isValid}
              helperText="The academic department that owns this program"
              showSuccess
            >
              {loadingDepts ? (
                <div className="luminous-input w-full bg-slate-100 dark:bg-slate-700 animate-pulse flex items-center">
                  Loading departments...
                </div>
              ) : (
                <FormSelect
                  id="department_id"
                  name="department_id"
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    handleFieldChange('department_id', e.target.value);
                  }}
                  onBlur={(e) => handleFieldBlur('department_id', e.target.value)}
                  hasError={getFieldState('department_id').hasError}
                  isValid={getFieldState('department_id').isValid}
                >
                  <option value="">Select a department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </FormSelect>
              )}
            </FormField>

            {/* Total Units */}
            <FormField
              label="Total Units"
              name="total_units"
              required
              error={getFieldState('total_units').error}
              isValid={getFieldState('total_units').isValid}
              helperText="Standard is 60 units for degrees. This can be adjusted later."
              showSuccess
            >
              <FormInput
                type="number"
                id="total_units"
                name="total_units"
                value={totalUnits}
                onChange={(e) => {
                  setTotalUnits(e.target.value);
                  handleFieldChange('total_units', e.target.value);
                }}
                onBlur={(e) => handleFieldBlur('total_units', e.target.value)}
                min="1"
                max="120"
                step="0.5"
                hasError={getFieldState('total_units').hasError}
                isValid={getFieldState('total_units').isValid}
              />
            </FormField>

            {/* Catalog Description */}
            <FormField
              label="Catalog Description"
              name="catalog_description"
              helperText="Brief description of the program for the college catalog"
            >
              <FormTextarea
                id="catalog_description"
                name="catalog_description"
                value={catalogDescription}
                onChange={(e) => setCatalogDescription(e.target.value)}
                rows={4}
                placeholder="Brief description of the program for the college catalog..."
              />
            </FormField>

            {/* Optional Fields */}
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                label="TOP Code"
                name="top_code"
                error={getFieldState('top_code').error}
                helperText="Taxonomy of Programs code (e.g., 0707.00)"
              >
                <FormInput
                  type="text"
                  id="top_code"
                  name="top_code"
                  value={topCode}
                  onChange={(e) => {
                    setTopCode(e.target.value);
                    handleFieldChange('top_code', e.target.value);
                  }}
                  onBlur={(e) => handleFieldBlur('top_code', e.target.value)}
                  placeholder="e.g., 0707.00"
                  hasError={getFieldState('top_code').hasError}
                />
              </FormField>

              <FormField
                label="CIP Code"
                name="cip_code"
                error={getFieldState('cip_code').error}
                helperText="Classification of Instructional Programs code"
              >
                <FormInput
                  type="text"
                  id="cip_code"
                  name="cip_code"
                  value={cipCode}
                  onChange={(e) => {
                    setCipCode(e.target.value);
                    handleFieldChange('cip_code', e.target.value);
                  }}
                  onBlur={(e) => handleFieldBlur('cip_code', e.target.value)}
                  placeholder="e.g., 11.0701"
                  hasError={getFieldState('cip_code').hasError}
                />
              </FormField>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Link
                href="/programs"
                className="luminous-button-secondary"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || loadingDepts}
                className="luminous-button-primary disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 mr-2 animate-spin rounded-full border-2 border-white border-r-transparent" />
                    Creating...
                  </>
                ) : (
                  'Create Program'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageShell>
  );
}
