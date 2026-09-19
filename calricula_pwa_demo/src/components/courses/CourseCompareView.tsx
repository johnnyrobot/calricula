'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Check, FileDiff, Minus, Plus } from 'lucide-react';
import { CourseBreadcrumb, CourseCode, CourseStatusBadge } from './CoursePrimitives';
import type {
  CourseContentItem,
  CourseRequisite,
  CourseSLO,
  CourseViewModel,
} from './types';

function changed(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

function CompareCell({
  value,
  different,
}: {
  value: React.ReactNode;
  different: boolean;
}) {
  return (
    <td className={`px-4 py-3 align-top font-sans text-sm leading-6 ${different ? 'bg-gold/10 text-ink' : 'text-ink-soft'}`}>
      {value || <span className="italic text-muted">Not set</span>}
    </td>
  );
}

function listBySequence<T extends { sequence: number }>(items: T[]) {
  return items.slice().sort((a, b) => a.sequence - b.sequence);
}

function sloValue(slo: CourseSLO | undefined) {
  return slo
    ? {
        outcomeText: slo.outcomeText,
        bloomLevel: slo.bloomLevel,
        performanceCriteria: slo.performanceCriteria || '',
      }
    : null;
}

function contentValue(
  item: CourseContentItem | undefined,
  sloSequenceById: ReadonlyMap<string, number>,
) {
  return item
    ? {
        topic: item.topic,
        subtopics: item.subtopics,
        hours: item.hours,
        linkedSlos: item.linkedSloIds
          .map((id) => sloSequenceById.get(id))
          .filter((sequence): sequence is number => sequence !== undefined)
          .sort((left, right) => left - right),
      }
    : null;
}

function requisiteValue(requisite: CourseRequisite | undefined) {
  return requisite
    ? {
        type: requisite.type,
        validationType: requisite.validationType || '',
        courseCode: requisite.courseCode || '',
        courseTitle: requisite.courseTitle || '',
        text: requisite.text || '',
        contentReview: requisite.contentReview || '',
      }
    : null;
}

function ComparisonHeader({
  itemLabel,
  source,
  target,
}: {
  itemLabel: string;
  source: CourseViewModel;
  target: CourseViewModel;
}) {
  return (
    <thead>
      <tr className="border-b border-hairline bg-surface-2">
        <th className="w-40 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          {itemLabel}
        </th>
        <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Version {source.version.toFixed(1)}
        </th>
        <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Version {target.version.toFixed(1)}
        </th>
      </tr>
    </thead>
  );
}

function ChangeMark({ type }: { type: 'same' | 'added' | 'removed' | 'changed' }) {
  const content = {
    same: { icon: Check, label: 'Same', className: 'text-seal-approved' },
    added: { icon: Plus, label: 'Added', className: 'text-seal-approved' },
    removed: { icon: Minus, label: 'Removed', className: 'text-seal-returned' },
    changed: { icon: FileDiff, label: 'Changed', className: 'text-gold-ink' },
  }[type];
  const Icon = content.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] ${content.className}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {content.label}
    </span>
  );
}

export function CourseCompareView({
  source,
  target,
  versions,
}: {
  source: CourseViewModel;
  target: CourseViewModel | null;
  versions: CourseViewModel[];
}) {
  const router = useRouter();
  const chooseTarget = (targetId: string) => {
    const query = new URLSearchParams({ source: source.id });
    if (targetId) query.set('target', targetId);
    router.push(`/courses/compare/?${query.toString()}`);
  };

  if (!target) {
    return (
      <div className="mx-auto max-w-3xl">
        <CourseBreadcrumb>
          <CourseCode subjectCode={source.subjectCode} courseNumber={source.courseNumber} /> / Compare
        </CourseBreadcrumb>
        <section className="luminous-card p-7 sm:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.17em] text-gold-ink">Version comparison</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">Choose a record to compare</h1>
          <p className="mt-3 font-sans text-sm leading-6 text-muted">
            The source is Version {source.version.toFixed(1)} of{' '}
            <CourseCode subjectCode={source.subjectCode} courseNumber={source.courseNumber} />. Select
            another record in this lineage.
          </p>
          <label htmlFor="compare-target" className="luminous-label mt-6">
            Comparison target
          </label>
          <select
            id="compare-target"
            defaultValue=""
            onChange={(event) => chooseTarget(event.target.value)}
            className="luminous-select"
          >
            <option value="">Choose a version</option>
            {versions
              .filter((version) => version.id !== source.id)
              .map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version.toFixed(1)} · {version.status} · {version.title}
                </option>
              ))}
          </select>
          {versions.length <= 1 ? (
            <p className="mt-3 border-l-2 border-gold pl-3 font-sans text-sm text-muted">
              No other version exists yet. Duplicate the draft or create a new version from an approved
              record, then return here.
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  const sourceSlos = listBySequence(source.slos);
  const targetSlos = listBySequence(target.slos);
  const sourceContent = listBySequence(source.contentItems);
  const targetContent = listBySequence(target.contentItems);
  const sourceSloSequenceById = new Map(
    sourceSlos.map((slo) => [slo.id, slo.sequence]),
  );
  const targetSloSequenceById = new Map(
    targetSlos.map((slo) => [slo.id, slo.sequence]),
  );
  const sourceRequisites = source.requisites;
  const targetRequisites = target.requisites;
  const maxSlo = Math.max(sourceSlos.length, targetSlos.length);
  const maxContent = Math.max(sourceContent.length, targetContent.length);
  const maxRequisites = Math.max(
    sourceRequisites.length,
    targetRequisites.length,
  );

  return (
    <div>
      <CourseBreadcrumb>
        <CourseCode subjectCode={source.subjectCode} courseNumber={source.courseNumber} /> / Compare
      </CourseBreadcrumb>
      <header className="mb-6 border-y-2 border-t-navy border-b-hairline-strong bg-surface px-6 py-6">
        <p className="font-mono text-xs uppercase tracking-[0.17em] text-gold-ink">Version comparison</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
          <CourseCode subjectCode={source.subjectCode} courseNumber={source.courseNumber} />
          <span aria-hidden="true"> — </span>
          {source.title}
        </h1>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="compare-source" className="luminous-label">
              Source
            </label>
            <select id="compare-source" value={source.id} disabled className="luminous-select bg-surface-2">
              <option value={source.id}>Version {source.version.toFixed(1)} · {source.status}</option>
            </select>
          </div>
          <ArrowRight aria-hidden="true" className="mb-3 hidden h-5 w-5 text-gold-ink sm:block" />
          <div className="flex-1">
            <label htmlFor="compare-target" className="luminous-label">
              Target
            </label>
            <select
              id="compare-target"
              value={target.id}
              onChange={(event) => chooseTarget(event.target.value)}
              className="luminous-select"
            >
              {versions
                .filter((version) => version.id !== source.id)
                .map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version.toFixed(1)} · {version.status}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <section className="overflow-x-auto border border-hairline bg-surface">
          <h2 className="border-b border-hairline bg-surface-2 px-5 py-4 font-serif text-xl font-semibold text-ink">
            Catalog record
          </h2>
          <table className="w-full min-w-[740px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <th className="w-40 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Field
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Version {source.version.toFixed(1)}
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Version {target.version.toFixed(1)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {[
                ['Title', source.title, target.title],
                ['Description', source.catalogDescription, target.catalogDescription],
                ['Units', source.units, target.units],
                ['Lecture hours', source.lectureHours, target.lectureHours],
                ['Lab hours', source.labHours, target.labHours],
                ['Outside hours', source.outsideHours, target.outsideHours],
                ['Effective term', source.effectiveTerm, target.effectiveTerm],
                ['TOP code', source.topCode, target.topCode],
                ['CCN code', source.ccnCode, target.ccnCode],
              ].map(([label, left, right]) => {
                const different = changed(left, right);
                return (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-3 text-left font-sans text-sm font-semibold text-ink">
                      {label}
                      <span className="mt-1 block">
                        <ChangeMark type={different ? 'changed' : 'same'} />
                      </span>
                    </th>
                    <CompareCell value={left} different={different} />
                    <CompareCell value={right} different={different} />
                  </tr>
                );
              })}
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-sans text-sm font-semibold text-ink">
                  Status
                </th>
                <td className="px-4 py-3"><CourseStatusBadge status={source.status} /></td>
                <td className="px-4 py-3"><CourseStatusBadge status={target.status} /></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto border border-hairline bg-surface">
          <h2 className="border-b border-hairline bg-surface-2 px-5 py-4 font-serif text-xl font-semibold text-ink">
            Student Learning Outcomes
          </h2>
          <table className="w-full min-w-[740px] table-fixed border-collapse">
            <ComparisonHeader
              itemLabel="Outcome"
              source={source}
              target={target}
            />
            <tbody className="divide-y divide-hairline">
              {maxSlo ? (
                Array.from({ length: maxSlo }, (_, index) => {
                  const left = sourceSlos[index] as CourseSLO | undefined;
                  const right = targetSlos[index] as CourseSLO | undefined;
                  const type = !left
                    ? 'added'
                    : !right
                      ? 'removed'
                      : changed(sloValue(left), sloValue(right))
                        ? 'changed'
                        : 'same';
                  const render = (slo?: CourseSLO) =>
                    slo ? (
                      <>
                        <p>{slo.outcomeText}</p>
                        <p className="mt-1 font-mono text-[10px] text-gold-ink">
                          {slo.bloomLevel}
                        </p>
                        {slo.performanceCriteria ? (
                          <p className="mt-2 text-xs text-muted">
                            Performance criteria: {slo.performanceCriteria}
                          </p>
                        ) : null}
                      </>
                    ) : null;
                  return (
                    <tr key={`slo-${index}`}>
                      <th scope="row" className="w-40 px-4 py-3 text-left align-top">
                        <span className="font-sans text-sm font-semibold text-ink">
                          SLO {index + 1}
                        </span>
                        <span className="mt-1 block">
                          <ChangeMark type={type} />
                        </span>
                      </th>
                      <CompareCell value={render(left)} different={type !== 'same'} />
                      <CompareCell value={render(right)} different={type !== 'same'} />
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                    Neither version contains student learning outcomes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto border border-hairline bg-surface">
          <h2 className="border-b border-hairline bg-surface-2 px-5 py-4 font-serif text-xl font-semibold text-ink">
            Course Content
          </h2>
          <table className="w-full min-w-[740px] table-fixed border-collapse">
            <ComparisonHeader
              itemLabel="Topic"
              source={source}
              target={target}
            />
            <tbody className="divide-y divide-hairline">
              {maxContent ? (
                Array.from({ length: maxContent }, (_, index) => {
                  const left = sourceContent[index] as CourseContentItem | undefined;
                  const right = targetContent[index] as CourseContentItem | undefined;
                  const type = !left
                    ? 'added'
                    : !right
                      ? 'removed'
                      : changed(
                            contentValue(left, sourceSloSequenceById),
                            contentValue(right, targetSloSequenceById),
                          )
                        ? 'changed'
                        : 'same';
                  const render = (
                    item: CourseContentItem | undefined,
                    sloSequenceById: ReadonlyMap<string, number>,
                  ) =>
                    item ? (
                      <>
                        <p className="font-semibold">{item.topic}</p>
                        {item.subtopics.length ? (
                          <p className="mt-1">{item.subtopics.join(' · ')}</p>
                        ) : null}
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          {item.hours} semester hours
                        </p>
                        {item.linkedSloIds.length ? (
                          <p className="mt-1 text-xs text-muted">
                            Linked SLOs:{' '}
                            {item.linkedSloIds
                              .map((id) => sloSequenceById.get(id))
                              .filter(
                                (sequence): sequence is number =>
                                  sequence !== undefined,
                              )
                              .sort((a, b) => a - b)
                              .join(', ')}
                          </p>
                        ) : null}
                      </>
                    ) : null;
                  return (
                    <tr key={`content-${index}`}>
                      <th scope="row" className="w-40 px-4 py-3 text-left align-top">
                        <span className="font-sans text-sm font-semibold text-ink">
                          Topic {index + 1}
                        </span>
                        <span className="mt-1 block">
                          <ChangeMark type={type} />
                        </span>
                      </th>
                      <CompareCell
                        value={render(left, sourceSloSequenceById)}
                        different={type !== 'same'}
                      />
                      <CompareCell
                        value={render(right, targetSloSequenceById)}
                        different={type !== 'same'}
                      />
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                    Neither version contains course content.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto border border-hairline bg-surface">
          <h2 className="border-b border-hairline bg-surface-2 px-5 py-4 font-serif text-xl font-semibold text-ink">
            Requisites
          </h2>
          <table className="w-full min-w-[740px] table-fixed border-collapse">
            <ComparisonHeader
              itemLabel="Requirement"
              source={source}
              target={target}
            />
            <tbody className="divide-y divide-hairline">
              {maxRequisites ? (
                Array.from({ length: maxRequisites }, (_, index) => {
                  const left = sourceRequisites[index];
                  const right = targetRequisites[index];
                  const type = !left
                    ? 'added'
                    : !right
                      ? 'removed'
                      : changed(requisiteValue(left), requisiteValue(right))
                        ? 'changed'
                        : 'same';
                  const render = (requisite?: CourseRequisite) =>
                    requisite ? (
                      <>
                        <p className="font-semibold">
                          {requisite.type}:{' '}
                          {requisite.courseCode
                            ? `${requisite.courseCode} — ${requisite.courseTitle || ''}`
                            : requisite.text || 'Requirement not specified'}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Validation basis: {requisite.validationType || 'Not set'}
                        </p>
                        {requisite.contentReview ? (
                          <p className="mt-2 text-xs text-muted">
                            Content review: {requisite.contentReview}
                          </p>
                        ) : null}
                      </>
                    ) : null;
                  return (
                    <tr key={`requisite-${index}`}>
                      <th scope="row" className="w-40 px-4 py-3 text-left align-top">
                        <span className="font-sans text-sm font-semibold text-ink">
                          Requisite {index + 1}
                        </span>
                        <span className="mt-1 block">
                          <ChangeMark type={type} />
                        </span>
                      </th>
                      <CompareCell value={render(left)} different={type !== 'same'} />
                      <CompareCell value={render(right)} different={type !== 'same'} />
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                    Neither version contains requisites.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
