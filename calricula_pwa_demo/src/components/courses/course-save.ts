import type {
  CourseContentInput,
  CourseRequisiteInput,
  SaveCourseAggregateInput,
  StudentLearningOutcomeInput,
} from '@/lib/data';
import { planCCNAdoption } from '@/lib/compliance';
import type { CCNStandard, Course, TopCode, UpdateCourseInput } from '@/lib/domain';
import { editorPatchToCourseUpdate } from './adapters';
import type { CourseViewModel } from './types';

/**
 * What planning a save needs to know beyond the draft itself: the saved record
 * the plan is applied to, and the reference data a selection is validated
 * against. The course id is deliberately absent — a plan describes what to
 * save, not where to put it.
 */
export interface CourseSaveContext {
  course: Course;
  topCodes: readonly TopCode[];
  ccnStandards: readonly CCNStandard[];
}

export type CourseSavePlan =
  | { ok: true; command: SaveCourseAggregateInput }
  | { ok: false; issues: string[] };

/**
 * A child row already persisted keeps its id; a draft-only row is created by
 * the repository, which matches it back by clientId. The `tmp-` prefix is
 * assigned by the editor when it adds a row.
 */
function childId(id: string) {
  return id.startsWith('tmp-') ? undefined : id;
}

function canonicalNonNegative(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : '0';
}

/**
 * Project an editor draft into the single command `saveCourseAggregate` takes,
 * or into the reasons it cannot be saved.
 *
 * Pure: no repository, no React, no side effects. Validation is fail-fast, so
 * `issues` carries the first reason only — the shape is an array so collecting
 * every reason later needs no interface change.
 */
export function planCourseSave(
  view: CourseViewModel,
  context: CourseSaveContext,
): CourseSavePlan {
  if (
    view.ccnDisposition === 'non-match' &&
    view.ccnJustification.trim().length < 40
  ) {
    return {
      ok: false,
      issues: [
        'The CCN non-match justification must contain at least 40 characters.',
      ],
    };
  }
  if (view.ccnDisposition === 'non-match' && !view.ccnCandidateCode.trim()) {
    return {
      ok: false,
      issues: [
        'Select the CCN standard this course does not match before saving the justification.',
      ],
    };
  }

  const normalizedTopCode = view.topCode.trim();
  const localTopCodes = new Set(context.topCodes.map(({ code }) => code));
  if (normalizedTopCode && !localTopCodes.has(normalizedTopCode)) {
    return {
      ok: false,
      issues: [
        `Select a TOP code from this demo's ${context.topCodes.length}-code reference list.`,
      ],
    };
  }

  const validSlos = view.slos.filter((slo) => slo.outcomeText.trim());
  const sloInputs: StudentLearningOutcomeInput[] = validSlos.map(
    (slo, index) => ({
      ...(childId(slo.id) ? { id: slo.id } : {}),
      clientId: slo.id,
      sequence: index + 1,
      outcomeText: slo.outcomeText.trim(),
      bloomLevel: slo.bloomLevel || 'Apply',
      performanceCriteria: slo.performanceCriteria?.trim() || null,
    }),
  );
  const validViewSloIds = new Set(validSlos.map((slo) => slo.id));

  const validContent = view.contentItems.filter((item) => item.topic.trim());
  const contentInputs: CourseContentInput[] = validContent.map(
    (item, index) => ({
      ...(childId(item.id) ? { id: item.id } : {}),
      sequence: index + 1,
      topic: item.topic.trim(),
      subtopics: item.subtopics.map((value) => value.trim()).filter(Boolean),
      hoursAllocated: canonicalNonNegative(item.hours),
      linkedSloIds: item.linkedSloIds.filter((sloId) =>
        validViewSloIds.has(sloId),
      ),
    }),
  );

  const validRequisites = view.requisites.filter(
    (requisite) => requisite.courseId || requisite.text?.trim(),
  );
  const requisiteInputs: CourseRequisiteInput[] = validRequisites.map(
    (requisite) => ({
      ...(childId(requisite.id) ? { id: requisite.id } : {}),
      type: requisite.type,
      validationType: requisite.validationType || null,
      requisiteCourseId: requisite.courseId || null,
      requisiteText: requisite.courseId ? null : requisite.text?.trim() || null,
      contentReview: requisite.contentReview?.trim() || null,
    }),
  );

  const coursePatch = editorPatchToCourseUpdate({
    title: view.title,
    departmentId: view.departmentId,
    catalogDescription: view.catalogDescription,
    units: canonicalNonNegative(view.units),
    lectureHours: canonicalNonNegative(view.lectureHours),
    labHours: canonicalNonNegative(view.labHours),
    activityHours: canonicalNonNegative(view.activityHours),
    tbaHours: canonicalNonNegative(view.tbaHours),
    outsideHours: canonicalNonNegative(view.outsideHours),
    totalStudentHours: canonicalNonNegative(view.totalStudentHours),
    effectiveTerm: view.effectiveTerm,
    topCode: view.topCode.trim(),
    ccnCode: view.ccnDisposition === 'adopted' ? view.ccnCode : '',
  }) as UpdateCourseInput;

  if (view.ccnDisposition === 'adopted' && view.ccnCode) {
    const standard = context.ccnStandards.find(
      (candidate) => candidate.ccnCode === view.ccnCode,
    );
    if (!standard) {
      return {
        ok: false,
        issues: [
          'The selected CCN standard is not available in this demo reference set.',
        ],
      };
    }
    const adoption = planCCNAdoption(context.course, standard);
    if (!adoption.success || !adoption.coursePatch) {
      return {
        ok: false,
        issues: [
          adoption.errors.join(' ') ||
            'The selected CCN standard could not be adopted.',
        ],
      };
    }
    Object.assign(coursePatch, adoption.coursePatch);
    const plannedCbCodes = { ...(adoption.coursePatch.cbCodes || {}) };
    const impliedTopCode =
      typeof adoption.cbCodesUpdated.CB03 === 'string'
        ? adoption.cbCodesUpdated.CB03
        : null;
    if (impliedTopCode && localTopCodes.has(impliedTopCode)) {
      coursePatch.topCode = impliedTopCode;
      plannedCbCodes.CB03 = impliedTopCode;
    } else if (
      typeof plannedCbCodes.CB03 !== 'string' ||
      !localTopCodes.has(plannedCbCodes.CB03) ||
      plannedCbCodes.CB03 !== coursePatch.topCode
    ) {
      // CB03 must never name a TOP code this demo cannot offer.
      delete plannedCbCodes.CB03;
    }
    coursePatch.cbCodes = plannedCbCodes;
  }

  return {
    ok: true,
    command: {
      course: coursePatch,
      slos: sloInputs,
      content: contentInputs,
      requisites: requisiteInputs,
      ccnJustification:
        view.ccnDisposition === 'non-match'
          ? {
              ccnCode: view.ccnCandidateCode,
              justification: view.ccnJustification.trim(),
              evidence: [],
            }
          : null,
    },
  };
}
