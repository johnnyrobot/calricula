'use client';

import { useId, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  GripVertical,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { calculateConventionalUnits, toFiniteNumber } from '@/lib/compliance';
import type { CourseAggregate } from '@/lib/data';
import type { Department, TopCode } from '@/lib/domain';
import { CourseAIControls } from '@/components/ai/CourseAIControls';
import { ComplianceMark } from './CoursePrimitives';
import type {
  CCNMatchView,
  ComplianceAuditView,
  CourseContentItem,
  CourseEditorPatch,
  CourseRequisite,
  CourseSLO,
  CourseViewModel,
} from './types';

const BLOOM_LEVELS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
] as const;

const VALIDATION_TYPES = [
  'Content Review',
  'Statutory',
  'Sequential',
  'Health/Safety',
  'Recency',
  'Other',
] as const;

function temporaryId(prefix: string) {
  return `tmp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toText(value: unknown, keys: string[] = []) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return '';
}

function suggestionArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-hairline pb-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl font-sans text-sm leading-6 text-muted">{description}</p>
    </header>
  );
}

function AIBlock({
  aggregate,
  task,
  label,
  context,
  onApply,
}: {
  aggregate: CourseAggregate;
  task:
    | 'catalog-description'
    | 'slos'
    | 'content-outline'
    | 'top-code'
    | 'compliance-explanation';
  label: string;
  context?: unknown;
  onApply: (value: unknown) => void | Promise<void>;
}) {
  return (
    <aside
      className="space-y-4 border-l-2 border-gold bg-gold/5 p-4"
      aria-label={`${label} AI assistance`}
    >
      <div className="mb-3 flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold-ink" />
        <div>
          <h3 className="font-sans text-sm font-semibold text-ink">{label}</h3>
          <p className="mt-1 font-sans text-xs leading-5 text-muted">
            Suggestions stay separate from the official outline until you explicitly apply one.
          </p>
        </div>
      </div>
      <CourseAIControls
        course={aggregate.course}
        task={task}
        context={context}
        onApply={onApply}
      />
    </aside>
  );
}

export function OverviewSection({
  course,
  aggregate,
  departments,
  onChange,
}: {
  course: CourseViewModel;
  aggregate: CourseAggregate;
  departments: Department[];
  onChange: (patch: CourseEditorPatch) => void;
}) {
  const unitsId = useId();
  const total = toFiniteNumber(course.totalStudentHours);
  const conventionalUnits = calculateConventionalUnits(total);

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section I · Catalog record"
        title="Basic information"
        description="Define the official catalog language and the unit/hour relationship used throughout the Course Outline of Record."
      />

      <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
        <div>
          <label htmlFor="course-title" className="luminous-label">
            Official course title
          </label>
          <input
            id="course-title"
            value={course.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="luminous-input"
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="effective-term" className="luminous-label">
            Effective term
          </label>
          <input
            id="effective-term"
            value={course.effectiveTerm}
            onChange={(event) => onChange({ effectiveTerm: event.target.value })}
            className="luminous-input"
            placeholder="Fall 2027"
          />
        </div>
      </div>

      <div>
        <label htmlFor="course-department" className="luminous-label">
          Department
        </label>
        <select
          id="course-department"
          value={course.departmentId}
          onChange={(event) => onChange({ departmentId: event.target.value })}
          className="luminous-select"
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.code} — {department.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1.5 flex items-end justify-between gap-4">
          <label htmlFor="catalog-description" className="luminous-label mb-0">
            Catalog description
          </label>
          <span className="font-mono text-[10px] text-muted">
            {course.catalogDescription.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          id="catalog-description"
          value={course.catalogDescription}
          onChange={(event) => onChange({ catalogDescription: event.target.value })}
          rows={6}
          className="luminous-textarea"
          placeholder="In active voice, describe what students study and do in the course…"
        />
        <p className="mt-1.5 font-sans text-xs text-muted">
          Use active voice and present tense. Catalog descriptions are normally concise and student-facing.
        </p>
      </div>

      <AIBlock
        aggregate={aggregate}
        task="catalog-description"
        label="Catalog language assistant"
        context={{
          title: course.title,
          catalogDescription: course.catalogDescription,
          units: course.units,
          lectureHours: course.lectureHours,
          labHours: course.labHours,
          activityHours: course.activityHours,
          tbaHours: course.tbaHours,
          outsideOfClassHours: course.outsideHours,
        }}
        onApply={(value) => {
          const suggestion = toText(value, [
            'description',
            'catalogDescription',
            'catalog_description',
            'text',
          ]);
          if (suggestion) onChange({ catalogDescription: suggestion });
        }}
      />

      <fieldset className="border border-hairline bg-surface-2/50 p-5">
        <legend className="px-2 font-sans text-xs font-semibold uppercase tracking-[0.11em] text-muted">
          Weekly hours and units
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Units', 'units', course.units, '0.5'],
            ['Lecture hours', 'lectureHours', course.lectureHours, '0.25'],
            ['Lab hours', 'labHours', course.labHours, '0.25'],
            ['Activity hours', 'activityHours', course.activityHours, '0.25'],
            ['TBA hours', 'tbaHours', course.tbaHours, '0.25'],
            ['Outside-of-class hours', 'outsideHours', course.outsideHours, '0.25'],
          ].map(([label, field, value, step]) => (
            <div key={field}>
              <label htmlFor={`${unitsId}-${field}`} className="luminous-label">
                {label}
              </label>
              <input
                id={`${unitsId}-${field}`}
                type="number"
                min="0"
                step={step}
                value={value}
                onChange={(event) =>
                  onChange({ [field]: event.target.value } as CourseEditorPatch)
                }
                className="luminous-input font-mono"
              />
            </div>
          ))}
        </div>
        <div className="mt-5 border-l-2 border-hairline bg-surface px-4 py-3">
          <p className="font-sans text-sm font-semibold text-ink">
            Conventional unit reference
          </p>
          <p className="mt-1 font-sans text-xs text-muted">
            {total.toFixed(1)} total student hours ÷ 54 ={' '}
            {conventionalUnits.toFixed(2)} conventional units — a district
            convention, not the Title 5 minimum. Compliance is evaluated against
            the 48-hour minimum by the deterministic audit in Section VI.
          </p>
        </div>
      </fieldset>
    </div>
  );
}

export function SLOSection({
  course,
  aggregate,
  onChange,
}: {
  course: CourseViewModel;
  aggregate: CourseAggregate;
  onChange: (patch: CourseEditorPatch) => void;
}) {
  const update = (id: string, patch: Partial<CourseSLO>) =>
    onChange({ slos: course.slos.map((slo) => (slo.id === id ? { ...slo, ...patch } : slo)) });
  const reorder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= course.slos.length) return;
    const items = [...course.slos];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    onChange({ slos: items.map((item, sequence) => ({ ...item, sequence: sequence + 1 })) });
  };

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section II · Bloom-aligned"
        title="Student Learning Outcomes"
        description="Write observable, assessable statements. Each outcome should begin with a precise action verb and describe what a student can demonstrate."
      />

      <AIBlock
        aggregate={aggregate}
        task="slos"
        label="Outcome drafting assistant"
        context={{
          title: course.title,
          catalogDescription: course.catalogDescription,
          existingSlos: course.slos.map((slo) => slo.outcomeText).filter(Boolean),
        }}
        onApply={(value) => {
          const suggestions = suggestionArray(value, ['slos', 'outcomes', 'items']);
          const next = suggestions
            .map((item, index): CourseSLO | null => {
              const outcomeText = toText(item, ['outcomeText', 'outcome_text', 'text']);
              if (!outcomeText) return null;
              const bloom = toText(item, ['bloomLevel', 'bloom_level']);
              return {
                id: temporaryId('slo'),
                sequence: index + 1,
                outcomeText,
                bloomLevel: BLOOM_LEVELS.includes(bloom as (typeof BLOOM_LEVELS)[number])
                  ? (bloom as CourseSLO['bloomLevel'])
                  : 'Apply',
                performanceCriteria: toText(item, [
                  'performanceCriteria',
                  'performance_criteria',
                ]),
              };
            })
            .filter((item): item is CourseSLO => Boolean(item));
          if (next.length) {
            onChange({
              slos: next,
              contentItems: course.contentItems.map((item) => ({
                ...item,
                linkedSloIds: [],
              })),
            });
          }
        }}
      />

      <ol className="space-y-4">
        {course.slos.map((slo, index) => (
          <li key={slo.id} className="border border-hairline bg-surface">
            <div className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-4 py-2">
              <GripVertical aria-hidden="true" className="h-4 w-4 text-muted" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                Outcome {index + 1}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => reorder(index, -1)}
                  disabled={index === 0}
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-navy"
                  aria-label={`Move outcome ${index + 1} up`}
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => reorder(index, 1)}
                  disabled={index === course.slos.length - 1}
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-navy"
                  aria-label={`Move outcome ${index + 1} down`}
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      slos: course.slos
                        .filter((item) => item.id !== slo.id)
                        .map((item, sequence) => ({ ...item, sequence: sequence + 1 })),
                      contentItems: course.contentItems.map((item) => ({
                        ...item,
                        linkedSloIds: item.linkedSloIds.filter(
                          (linkedId) => linkedId !== slo.id,
                        ),
                      })),
                    })
                  }
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-seal-returned"
                  aria-label={`Delete outcome ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_170px]">
              <div>
                <label htmlFor={`slo-${slo.id}`} className="luminous-label">
                  Outcome statement
                </label>
                <textarea
                  id={`slo-${slo.id}`}
                  value={slo.outcomeText}
                  onChange={(event) => update(slo.id, { outcomeText: event.target.value })}
                  rows={3}
                  className="luminous-textarea"
                />
              </div>
              <div>
                <label htmlFor={`bloom-${slo.id}`} className="luminous-label">
                  Bloom level
                </label>
                <select
                  id={`bloom-${slo.id}`}
                  value={slo.bloomLevel}
                  onChange={(event) =>
                    update(slo.id, { bloomLevel: event.target.value as CourseSLO['bloomLevel'] })
                  }
                  className="luminous-select"
                >
                  <option value="">Choose level</option>
                  {BLOOM_LEVELS.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`criteria-${slo.id}`} className="luminous-label">
                  Performance criteria
                </label>
                <input
                  id={`criteria-${slo.id}`}
                  value={slo.performanceCriteria || ''}
                  onChange={(event) =>
                    update(slo.id, { performanceCriteria: event.target.value })
                  }
                  className="luminous-input"
                  placeholder="Optional evidence or threshold used to assess this outcome"
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() =>
          onChange({
            slos: [
              ...course.slos,
              {
                id: temporaryId('slo'),
                sequence: course.slos.length + 1,
                outcomeText: '',
                bloomLevel: 'Apply',
              },
            ],
          })
        }
        className="luminous-button-secondary"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add outcome
      </button>
    </div>
  );
}

export function ContentSection({
  course,
  aggregate,
  onChange,
}: {
  course: CourseViewModel;
  aggregate: CourseAggregate;
  onChange: (patch: CourseEditorPatch) => void;
}) {
  const update = (id: string, patch: Partial<CourseContentItem>) =>
    onChange({
      contentItems: course.contentItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const reorder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= course.contentItems.length) return;
    const items = [...course.contentItems];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    onChange({
      contentItems: items.map((item, sequence) => ({ ...item, sequence: sequence + 1 })),
    });
  };
  const allocated = course.contentItems.reduce((sum, item) => sum + Number(item.hours || 0), 0);

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section III · Scope and sequence"
        title="Course content"
        description="Arrange the major topics in instructional order, allocate hours, and explicitly link each topic to the outcomes it supports."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-gold bg-gold/10 px-4 py-3">
        <p className="font-sans text-sm text-ink">
          Allocated semester instructional time
          <span className="ml-2 font-mono font-semibold">{allocated.toFixed(1)} hours</span>
        </p>
        <span className="font-sans text-xs text-muted">
          {course.contentItems.filter((item) => item.linkedSloIds.length).length}/{course.contentItems.length}{' '}
          topics linked to SLOs
        </span>
      </div>

      <AIBlock
        aggregate={aggregate}
        task="content-outline"
        label="Outline drafting assistant"
        context={{
          title: course.title,
          catalogDescription: course.catalogDescription,
          slos: course.slos.map((slo) => ({
            sequence: slo.sequence,
            outcomeText: slo.outcomeText,
          })),
          currentTopics: course.contentItems.map((item) => item.topic).filter(Boolean),
        }}
        onApply={(value) => {
          const suggestions = suggestionArray(value, [
            'topics',
            'content',
            'contentItems',
            'outline',
            'items',
          ]);
          const next = suggestions
            .map((item, index): CourseContentItem | null => {
              const topic = toText(item, ['topic', 'title']);
              if (!topic) return null;
              const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
              const rawSubtopics = record.subtopics;
              const rawSloNumbers = record.relatedSloNumbers;
              return {
                id: temporaryId('content'),
                sequence: index + 1,
                topic,
                subtopics: Array.isArray(rawSubtopics)
                  ? rawSubtopics.filter((entry): entry is string => typeof entry === 'string')
                  : [],
                hours:
                  toText(item, [
                    'contactHours',
                    'hours',
                    'hoursAllocated',
                    'hours_allocated',
                  ]) || '0',
                linkedSloIds: Array.isArray(rawSloNumbers)
                  ? rawSloNumbers
                      .map((sequence) =>
                        course.slos.find((slo) => slo.sequence === Number(sequence))?.id,
                      )
                      .filter((id): id is string => Boolean(id))
                  : [],
              };
            })
            .filter((item): item is CourseContentItem => Boolean(item));
          if (next.length) onChange({ contentItems: next });
        }}
      />

      <ol className="space-y-4">
        {course.contentItems.map((item, index) => (
          <li key={item.id} className="border border-hairline bg-surface">
            <div className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-4 py-2">
              <GripVertical aria-hidden="true" className="h-4 w-4 text-muted" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                Topic {index + 1}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => reorder(index, -1)}
                  disabled={index === 0}
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-navy"
                  aria-label={`Move topic ${index + 1} up`}
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => reorder(index, 1)}
                  disabled={index === course.contentItems.length - 1}
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-navy"
                  aria-label={`Move topic ${index + 1} down`}
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      contentItems: course.contentItems
                        .filter((entry) => entry.id !== item.id)
                        .map((entry, sequence) => ({ ...entry, sequence: sequence + 1 })),
                    })
                  }
                  className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-seal-returned"
                  aria-label={`Delete topic ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid gap-5 p-4 md:grid-cols-[1fr_130px]">
              <div>
                <label htmlFor={`topic-${item.id}`} className="luminous-label">
                  Major topic
                </label>
                <input
                  id={`topic-${item.id}`}
                  value={item.topic}
                  onChange={(event) => update(item.id, { topic: event.target.value })}
                  className="luminous-input"
                />
              </div>
              <div>
                <label htmlFor={`hours-${item.id}`} className="luminous-label">
                  Semester hours
                </label>
                <input
                  id={`hours-${item.id}`}
                  type="number"
                  min="0"
                  step="0.25"
                  value={item.hours}
                  onChange={(event) => update(item.id, { hours: event.target.value })}
                  className="luminous-input font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`subtopics-${item.id}`} className="luminous-label">
                  Subtopics <span className="font-normal text-muted">(one per line)</span>
                </label>
                <textarea
                  id={`subtopics-${item.id}`}
                  value={item.subtopics.join('\n')}
                  onChange={(event) =>
                    update(item.id, {
                      subtopics: event.target.value.split('\n'),
                    })
                  }
                  rows={3}
                  className="luminous-textarea"
                />
              </div>
              <fieldset className="md:col-span-2">
                <legend className="luminous-label">Linked student learning outcomes</legend>
                {course.slos.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {course.slos.map((slo) => (
                      <label
                        key={slo.id}
                        className="flex min-h-11 cursor-pointer items-start gap-3 border border-hairline px-3 py-2 text-sm text-ink-soft hover:border-gold"
                      >
                        <input
                          type="checkbox"
                          checked={item.linkedSloIds.includes(slo.id)}
                          onChange={(event) =>
                            update(item.id, {
                              linkedSloIds: event.target.checked
                                ? [...item.linkedSloIds, slo.id]
                                : item.linkedSloIds.filter((id) => id !== slo.id),
                            })
                          }
                          className="mt-1 h-4 w-4 accent-navy"
                        />
                        <span>
                          <span className="font-mono text-[10px] text-gold-ink">
                            SLO {slo.sequence}
                          </span>
                          <span className="mt-0.5 block line-clamp-2">{slo.outcomeText || 'Untitled outcome'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Add SLOs before linking content.</p>
                )}
              </fieldset>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() =>
          onChange({
            contentItems: [
              ...course.contentItems,
              {
                id: temporaryId('content'),
                sequence: course.contentItems.length + 1,
                topic: '',
                subtopics: [],
                hours: '0',
                linkedSloIds: [],
              },
            ],
          })
        }
        className="luminous-button-secondary"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add content topic
      </button>
    </div>
  );
}

export function RequisitesSection({
  course,
  courseOptions,
  circularError,
  onChange,
}: {
  course: CourseViewModel;
  courseOptions: CourseViewModel[];
  circularError?: string;
  onChange: (patch: CourseEditorPatch) => void;
}) {
  const update = (id: string, patch: Partial<CourseRequisite>) =>
    onChange({
      requisites: course.requisites.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section IV · Title 5 § 55003"
        title="Requisites"
        description="Document prerequisites, corequisites, and advisories together with the basis that makes each requirement legally and academically defensible."
      />

      {circularError ? (
        <div className="flex items-start gap-3 border border-seal-returned bg-seal-returned/5 p-4" role="alert">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-seal-returned" />
          <div>
            <h3 className="font-sans text-sm font-semibold text-seal-returned">
              Circular requisite detected
            </h3>
            <p className="mt-1 font-sans text-sm leading-6 text-seal-returned">{circularError}</p>
          </div>
        </div>
      ) : null}

      <div className="border-l-2 border-gold bg-gold/10 px-4 py-3">
        <p className="font-sans text-sm leading-6 text-ink">
          The repository validates the full local requisite graph on save. Indirect cycles are rejected
          and remain visible here until corrected.
        </p>
      </div>

      <div className="space-y-4">
        {course.requisites.map((requisite, index) => (
          <fieldset key={requisite.id} className="border border-hairline bg-surface p-5">
            <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Requisite {index + 1}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`requisite-type-${requisite.id}`} className="luminous-label">
                  Type
                </label>
                <select
                  id={`requisite-type-${requisite.id}`}
                  value={requisite.type}
                  onChange={(event) =>
                    update(requisite.id, {
                      type: event.target.value as CourseRequisite['type'],
                    })
                  }
                  className="luminous-select"
                >
                  {['Prerequisite', 'Corequisite', 'Advisory'].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`validation-${requisite.id}`} className="luminous-label">
                  Validation basis
                </label>
                <select
                  id={`validation-${requisite.id}`}
                  value={requisite.validationType || ''}
                  onChange={(event) =>
                    update(requisite.id, {
                      validationType: event.target
                        .value as CourseRequisite['validationType'],
                    })
                  }
                  className="luminous-select"
                >
                  <option value="">Choose basis</option>
                  {VALIDATION_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`linked-course-${requisite.id}`} className="luminous-label">
                  Linked course
                </label>
                <select
                  id={`linked-course-${requisite.id}`}
                  value={requisite.courseId || ''}
                  onChange={(event) => {
                    const selected = courseOptions.find((option) => option.id === event.target.value);
                    update(requisite.id, {
                      courseId: selected?.id,
                      courseCode: selected
                        ? `${selected.subjectCode} ${selected.courseNumber}`
                        : undefined,
                      courseTitle: selected?.title,
                    });
                  }}
                  className="luminous-select"
                >
                  <option value="">Use free-text requirement</option>
                  {courseOptions
                    .filter((option) => option.id !== course.id)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.subjectCode} {option.courseNumber} — {option.title}
                      </option>
                    ))}
                </select>
              </div>
              {!requisite.courseId ? (
                <div className="sm:col-span-2">
                  <label htmlFor={`requisite-text-${requisite.id}`} className="luminous-label">
                    Requirement text
                  </label>
                  <input
                    id={`requisite-text-${requisite.id}`}
                    value={requisite.text || ''}
                    onChange={(event) => update(requisite.id, { text: event.target.value })}
                    className="luminous-input"
                    placeholder="Eligibility for ENGL C1000 or equivalent"
                  />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label htmlFor={`content-review-${requisite.id}`} className="luminous-label">
                  Content review evidence
                </label>
                <textarea
                  id={`content-review-${requisite.id}`}
                  value={requisite.contentReview || ''}
                  onChange={(event) =>
                    update(requisite.id, { contentReview: event.target.value })
                  }
                  rows={4}
                  className="luminous-textarea"
                  placeholder="Identify the entry skills required and how the linked course supplies them…"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  requisites: course.requisites.filter((item) => item.id !== requisite.id),
                })
              }
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-seal-returned hover:underline"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Remove requisite
            </button>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onChange({
            requisites: [
              ...course.requisites,
              {
                id: temporaryId('requisite'),
                type: 'Prerequisite',
                validationType: 'Content Review',
                text: '',
                contentReview: '',
              },
            ],
          })
        }
        className="luminous-button-secondary"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add requisite
      </button>
    </div>
  );
}

export function CCNSection({
  course,
  aggregate,
  matches,
  topCodes,
  onChange,
}: {
  course: CourseViewModel;
  aggregate: CourseAggregate;
  matches: CCNMatchView[];
  topCodes: TopCode[];
  onChange: (patch: CourseEditorPatch) => void;
}) {
  const [selectedMatch, setSelectedMatch] = useState(matches[0]?.standardId || '');
  const [topCodeSuggestionError, setTopCodeSuggestionError] = useState('');
  const selected = matches.find((match) => match.standardId === selectedMatch) || matches[0];
  const selectedLocalTopCode =
    selected?.impliedTopCode &&
    topCodes.some(({ code }) => code === selected.impliedTopCode)
      ? selected.impliedTopCode
      : undefined;

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section V · AB 1111 and MIS coding"
        title="CCN match & course coding"
        description="Review deterministic Common Course Numbering candidates, adopt a state template when appropriate, or document why this local course does not match."
      />

      <AIBlock
        aggregate={aggregate}
        task="top-code"
        label="TOP code assistant"
        context={{
          title: course.title,
          catalogDescription: course.catalogDescription,
          currentTopCode: course.topCode,
          ccnCode: course.ccnCode,
        }}
        onApply={(value) => {
          const suggestions = suggestionArray(value, ['suggestions', 'items']);
          const topCode =
            toText(value, ['topCode', 'top_code', 'code', 'text']) ||
            toText(suggestions[0], ['code', 'topCode', 'top_code']);
          const normalized = topCode.trim();
          if (!normalized) return;
          if (!topCodes.some(({ code }) => code === normalized)) {
            setTopCodeSuggestionError(
              `The assistant suggested ${normalized}, which is not in this demo's local TOP-code reference set.`,
            );
            return;
          }
          setTopCodeSuggestionError('');
          onChange({ topCode: normalized });
        }}
      />
      {topCodeSuggestionError ? (
        <p
          className="border-l-2 border-gold pl-3 font-sans text-sm leading-6 text-ink"
          role="alert"
        >
          {topCodeSuggestionError}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="top-code" className="luminous-label">
            TOP code
          </label>
          <select
            id="top-code"
            value={course.topCode}
            onChange={(event) => {
              setTopCodeSuggestionError('');
              onChange({ topCode: event.target.value });
            }}
            className="luminous-select font-mono"
          >
            <option value="">No TOP code selected</option>
            {topCodes.map((topCode) => (
              <option key={topCode.id} value={topCode.code}>
                {topCode.code} — {topCode.title}
              </option>
            ))}
          </select>
          <p className="mt-1 font-sans text-xs leading-5 text-muted">
            Only codes included in this demo&apos;s local reference set can be
            saved.
          </p>
        </div>
        <div>
          <label htmlFor="ccn-code" className="luminous-label">
            Adopted CCN
          </label>
          <input
            id="ccn-code"
            value={course.ccnCode}
            readOnly
            className="luminous-input bg-surface-2 font-mono"
            placeholder="No standard adopted"
          />
        </div>
      </div>

      {matches.length ? (
        <fieldset>
          <legend className="font-serif text-xl font-semibold text-ink">Potential state standards</legend>
          <p className="mt-1 font-sans text-xs leading-5 text-muted">
            Candidate ranking is local and deterministic. The official CCN template remains authoritative.
          </p>
          <div className="mt-4 space-y-3">
            {matches.map((match) => (
              <label
                key={match.standardId}
                className={`block cursor-pointer border p-4 ${
                  selected?.standardId === match.standardId
                    ? 'border-navy bg-navy/5'
                    : 'border-hairline bg-surface hover:border-gold'
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="ccn-match"
                    value={match.standardId}
                    checked={selected?.standardId === match.standardId}
                    onChange={() => setSelectedMatch(match.standardId)}
                    className="mt-1 h-4 w-4 accent-navy"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-sm font-semibold text-ink">{match.ccnCode}</span>
                      <span className="font-mono text-xs text-gold-ink">
                        {Math.round(match.confidenceScore * 100)}% candidate confidence
                      </span>
                    </span>
                    <span className="mt-1 block font-serif text-lg text-ink">{match.title}</span>
                    <span className="mt-2 block font-sans text-xs leading-5 text-muted">
                      Minimum {match.minimumUnits} units · {match.matchReasons.join(' · ')}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="flex items-start gap-3 border border-gold/50 bg-gold/10 p-4">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold-ink" />
          <p className="font-sans text-sm leading-6 text-ink">
            No CCN standard is available for comparison. Confirm the course identity and reference
            data before documenting a non-match.
          </p>
        </div>
      )}

      <fieldset className="border border-hairline bg-surface p-5">
        <legend className="px-2 font-sans text-xs font-semibold uppercase tracking-[0.11em] text-muted">
          Faculty disposition
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onChange({
                ccnDisposition: 'adopted',
                ccnCode: selected.ccnCode,
                ccnJustification: '',
                ...(selectedLocalTopCode
                  ? { topCode: selectedLocalTopCode }
                  : {}),
              });
            }}
            className={`min-h-24 border p-4 text-left ${
              course.ccnDisposition === 'adopted'
                ? 'border-seal-approved bg-seal-approved/10'
                : 'border-hairline hover:border-seal-approved'
            }`}
          >
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-seal-approved" />
            <span className="mt-2 block font-sans text-sm font-semibold text-ink">Adopt selected standard</span>
            <span className="mt-1 block font-sans text-xs leading-5 text-muted">
              Apply its CCN code and any implied coding available in the local
              reference set.
            </span>
          </button>
          <button
            type="button"
            disabled={!selected && !course.ccnCandidateCode}
            onClick={() =>
              onChange({
                ccnDisposition: 'non-match',
                ccnCode: '',
                ccnCandidateCode: selected?.ccnCode || course.ccnCandidateCode,
              })
            }
            className={`min-h-24 border p-4 text-left ${
              course.ccnDisposition === 'non-match'
                ? 'border-gold bg-gold/10'
                : 'border-hairline hover:border-gold'
            }`}
          >
            <FileCheck2 aria-hidden="true" className="h-5 w-5 text-gold-ink" />
            <span className="mt-2 block font-sans text-sm font-semibold text-ink">Document non-match</span>
            <span className="mt-1 block font-sans text-xs leading-5 text-muted">
              Preserve a faculty-authored explanation for technical review.
            </span>
          </button>
        </div>
        {course.ccnDisposition === 'non-match' ? (
          <div className="mt-5">
            <label htmlFor="ccn-justification" className="luminous-label">
              Non-match justification
            </label>
            <textarea
              id="ccn-justification"
              value={course.ccnJustification}
              onChange={(event) => onChange({ ccnJustification: event.target.value })}
              rows={5}
              className="luminous-textarea"
              aria-describedby="ccn-justification-help"
              placeholder="Explain the specialized, vocational, or locally distinct scope that prevents adoption…"
            />
            <p
              id="ccn-justification-help"
              className={`mt-1.5 font-sans text-xs ${
                course.ccnJustification.trim().length >= 40 ? 'text-muted' : 'text-seal-returned'
              }`}
            >
              Provide at least 40 characters of specific curricular rationale. Current length:{' '}
              {course.ccnJustification.trim().length}.
            </p>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

export function ComplianceSection({
  audit,
  aggregate,
}: {
  audit: ComplianceAuditView;
  aggregate: CourseAggregate;
}) {
  const categories = useMemo(
    () => Array.from(new Set(audit.results.map((result) => result.category))),
    [audit.results],
  );

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Section VI · Deterministic guardrails"
        title="Compliance audit"
        description="Rules run locally against the current draft. Citations distinguish regulatory requirements, official guidance, and demo heuristics."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="border border-hairline bg-surface p-4 sm:col-span-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Score</p>
          <p className="mt-2 font-serif text-4xl text-ink">{audit.complianceScore}%</p>
          <ComplianceMark status={audit.overallStatus} label={audit.overallStatus} />
        </div>
        {[
          ['Passed', audit.passed, 'text-seal-approved'],
          ['Warnings', audit.warnings, 'text-gold-ink'],
          ['Failed', audit.failed, 'text-seal-returned'],
        ].map(([label, value, className]) => (
          <div key={String(label)} className="border border-hairline bg-surface p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
            <p className={`mt-2 font-serif text-3xl ${className}`}>{value}</p>
          </div>
        ))}
      </div>

      <AIBlock
        aggregate={aggregate}
        task="compliance-explanation"
        label="Compliance explanation"
        context={{
          overallStatus: audit.overallStatus,
          complianceScore: audit.complianceScore,
          findings: audit.results.map((result) => ({
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            status: result.status,
            message: result.message,
            recommendation: result.recommendation,
            citation: result.citation,
          })),
        }}
        onApply={() => {
          // Explanations are advisory. Applying acknowledges the suggestion inside the
          // AI component but intentionally does not mutate deterministic audit results.
        }}
      />

      <div className="space-y-6">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-gold-ink" />
              {category}
            </h3>
            <div className="mt-3 divide-y divide-hairline border border-hairline bg-surface">
              {audit.results
                .filter((result) => result.category === category)
                .map((result) => (
                  <article key={result.ruleId} className="grid gap-3 p-4 sm:grid-cols-[100px_1fr]">
                    <div>
                      <ComplianceMark status={result.status} label={result.status} />
                    </div>
                    <div>
                      <h4 className="font-sans text-sm font-semibold text-ink">{result.ruleName}</h4>
                      <p className="mt-1 font-sans text-sm leading-6 text-ink-soft">{result.message}</p>
                      {result.recommendation ? (
                        <p className="mt-2 border-l-2 border-gold pl-3 font-sans text-xs leading-5 text-muted">
                          {result.recommendation}
                        </p>
                      ) : null}
                      {result.citation ? (
                        <p className="mt-2 font-mono text-[10px] leading-5 text-muted">{result.citation}</p>
                      ) : null}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex items-start gap-3 border-l-2 border-navy bg-navy/5 p-4">
        <BookOpenCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
        <p className="font-sans text-xs leading-5 text-muted">
          A passing local audit is evidence of technical readiness, not approval. Faculty, articulation,
          and curriculum reviewers retain decision authority.
        </p>
      </div>
    </div>
  );
}
