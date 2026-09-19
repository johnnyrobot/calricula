'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, CircleAlert } from 'lucide-react';
import { CourseBreadcrumb } from './CoursePrimitives';
import type { CourseCreateValues, CourseDepartment } from './types';

type FieldErrors = Partial<Record<keyof CourseCreateValues, string>>;

function validate(values: CourseCreateValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[A-Za-z]{2,10}$/.test(values.subjectCode.trim())) {
    errors.subjectCode = 'Enter 2–10 letters, such as ENGL or MATH.';
  }
  if (!/^[A-Za-z0-9-]{1,10}$/.test(values.courseNumber.trim())) {
    errors.courseNumber = 'Enter a course number using letters, numbers, or a hyphen.';
  }
  if (values.title.trim().length < 3) {
    errors.title = 'Enter the official course title.';
  } else if (values.title.trim().length > 200) {
    errors.title = 'Keep the title to 200 characters or fewer.';
  }
  if (!values.departmentId) {
    errors.departmentId = 'Choose the department responsible for this outline.';
  }
  return errors;
}

export function CourseCreateForm({
  departments,
  onCreate,
}: {
  departments: CourseDepartment[];
  onCreate: (values: CourseCreateValues) => Promise<{ id: string }>;
}) {
  const router = useRouter();
  const formId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<CourseCreateValues>({
    subjectCode: '',
    courseNumber: '',
    title: '',
    departmentId: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = (name: keyof CourseCreateValues, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
    setSubmitError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const created = await onCreate({
        subjectCode: values.subjectCode.trim().toUpperCase(),
        courseNumber: values.courseNumber.trim().toUpperCase(),
        title: values.title.trim(),
        departmentId: values.departmentId,
      });
      router.push(`/courses/edit/?id=${encodeURIComponent(created.id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The course could not be created.');
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const errorIds = Object.keys(errors).map((field) => `${formId}-${field}-error`);

  return (
    <div className="mx-auto max-w-3xl">
      <CourseBreadcrumb>New outline</CourseBreadcrumb>
      <header className="mb-7 border-b border-hairline-strong pb-6">
        <p className="font-mono text-xs uppercase tracking-[0.17em] text-gold-ink">
          Course Outline of Record
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink sm:text-4xl">
          Begin a new course
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
          Establish the catalog identity first. The outline opens as a local draft so you can add
          outcomes, content, requisites, and compliance evidence.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="luminous-card overflow-hidden">
        <div className="border-b border-hairline bg-surface-2 px-6 py-4">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.13em] text-muted">
            Catalog identity
          </h2>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          {submitError || errorIds.length ? (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              className="border border-seal-returned bg-seal-returned/5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
            >
              <div className="flex items-start gap-3">
                <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-seal-returned" />
                <div>
                  <h3 className="font-sans text-sm font-semibold text-seal-returned">
                    {submitError ? 'Course not created' : 'Review the highlighted fields'}
                  </h3>
                  {submitError ? (
                    <p className="mt-1 text-sm text-seal-returned">{submitError}</p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-seal-returned">
                      {Object.entries(errors).map(([field, message]) => (
                        <li key={field}>
                          <a href={`#${formId}-${field}`} className="underline">
                            {message}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-subjectCode`} className="luminous-label">
                Subject code <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${formId}-subjectCode`}
                name="subjectCode"
                value={values.subjectCode}
                onChange={(event) => setField('subjectCode', event.target.value)}
                className="luminous-input uppercase"
                maxLength={10}
                required
                aria-required="true"
                autoComplete="off"
                placeholder="ENGL"
                aria-invalid={Boolean(errors.subjectCode)}
                aria-describedby={errors.subjectCode ? `${formId}-subjectCode-error` : `${formId}-subjectCode-help`}
              />
              {errors.subjectCode ? (
                <p id={`${formId}-subjectCode-error`} className="mt-1.5 text-sm text-seal-returned">
                  {errors.subjectCode}
                </p>
              ) : (
                <p id={`${formId}-subjectCode-help`} className="mt-1.5 text-xs text-muted">
                  The catalog discipline abbreviation.
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${formId}-courseNumber`} className="luminous-label">
                Course number <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${formId}-courseNumber`}
                name="courseNumber"
                value={values.courseNumber}
                onChange={(event) => setField('courseNumber', event.target.value)}
                className="luminous-input uppercase"
                maxLength={10}
                required
                aria-required="true"
                autoComplete="off"
                placeholder="101"
                aria-invalid={Boolean(errors.courseNumber)}
                aria-describedby={errors.courseNumber ? `${formId}-courseNumber-error` : `${formId}-courseNumber-help`}
              />
              {errors.courseNumber ? (
                <p id={`${formId}-courseNumber-error`} className="mt-1.5 text-sm text-seal-returned">
                  {errors.courseNumber}
                </p>
              ) : (
                <p id={`${formId}-courseNumber-help`} className="mt-1.5 text-xs text-muted">
                  A local number; CCN review happens in the editor.
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-title`} className="luminous-label">
              Official course title <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${formId}-title`}
              name="title"
              value={values.title}
              onChange={(event) => setField('title', event.target.value)}
              className="luminous-input"
              maxLength={200}
              required
              aria-required="true"
              autoComplete="off"
              placeholder="Reading and Composition"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${formId}-title-error` : `${formId}-title-help`}
            />
            {errors.title ? (
              <p id={`${formId}-title-error`} className="mt-1.5 text-sm text-seal-returned">
                {errors.title}
              </p>
            ) : (
              <div id={`${formId}-title-help`} className="mt-1.5 flex justify-between gap-3 text-xs text-muted">
                <span>Use the title that should appear in the college catalog.</span>
                <span className="font-mono tabular-nums">{values.title.length}/200</span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor={`${formId}-departmentId`} className="luminous-label">
              Department <span aria-hidden="true">*</span>
            </label>
            <select
              id={`${formId}-departmentId`}
              name="departmentId"
              value={values.departmentId}
              required
              aria-required="true"
              onChange={(event) => setField('departmentId', event.target.value)}
              className="luminous-select"
              aria-invalid={Boolean(errors.departmentId)}
              aria-describedby={errors.departmentId ? `${formId}-departmentId-error` : `${formId}-departmentId-help`}
            >
              <option value="">Choose a department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} — {department.name}
                </option>
              ))}
            </select>
            {errors.departmentId ? (
              <p id={`${formId}-departmentId-error`} className="mt-1.5 text-sm text-seal-returned">
                {errors.departmentId}
              </p>
            ) : (
              <p id={`${formId}-departmentId-help`} className="mt-1.5 text-xs text-muted">
                This department owns the draft and initiates review.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-hairline bg-surface-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted">
            <BookOpen aria-hidden="true" className="h-4 w-4 text-gold-ink" />
            Required fields are marked with an asterisk.
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Link href="/courses/" className="luminous-button-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={submitting} className="luminous-button-primary">
              {submitting ? 'Creating…' : 'Create draft'}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
