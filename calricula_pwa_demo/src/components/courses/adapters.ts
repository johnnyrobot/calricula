import type {
  Actor,
  Course,
  CourseAggregate,
  Department,
} from '@/lib/domain';
import type { ComplianceAudit } from '@/lib/compliance/types';
import type {
  ComplianceAuditView,
  CourseEditorPatch,
  CourseViewModel,
} from './types';

function actorName(actorId: string, actors: readonly Actor[]) {
  return actors.find((actor) => actor.id === actorId)?.fullName || 'Curriculum user';
}

function departmentName(departmentId: string, departments: readonly Department[]) {
  return departments.find((department) => department.id === departmentId)?.name || 'Department pending';
}

export function courseRecordToView(
  course: Course,
  departments: readonly Department[] = [],
): CourseViewModel {
  return {
    id: course.id,
    subjectCode: course.subjectCode,
    courseNumber: course.courseNumber,
    title: course.title,
    departmentId: course.departmentId,
    departmentName: departmentName(course.departmentId, departments),
    catalogDescription: course.catalogDescription || '',
    units: course.units,
    lectureHours: course.lectureHours,
    labHours: course.labHours,
    activityHours: course.activityHours,
    tbaHours: course.tbaHours,
    outsideHours: course.outsideOfClassHours,
    totalStudentHours: course.totalStudentLearningHours,
    status: course.status,
    version: course.version,
    effectiveTerm: course.effectiveTerm || '',
    topCode: course.topCode || '',
    cId: course.cId || '',
    ccnCode: course.ccnCode || '',
    ccnCandidateCode: '',
    ccnDisposition: course.ccnCode ? 'adopted' : 'unreviewed',
    ccnJustification: '',
    slos: [],
    contentItems: [],
    requisites: [],
    comments: [],
    history: [],
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    approvedAt: course.approvedAt || undefined,
  };
}

export function aggregateToView(
  aggregate: CourseAggregate,
  {
    departments = [],
    courses = [],
    actors = [],
  }: {
    departments?: readonly Department[];
    courses?: readonly Course[];
    actors?: readonly Actor[];
  } = {},
): CourseViewModel {
  const base = courseRecordToView(aggregate.course, departments);
  return {
    ...base,
    ccnDisposition: aggregate.course.ccnCode
      ? 'adopted'
      : aggregate.ccnJustification
        ? 'non-match'
        : 'unreviewed',
    ccnJustification: aggregate.ccnJustification?.justification || '',
    ccnCandidateCode: aggregate.ccnJustification?.ccnCode || '',
    slos: aggregate.slos
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((slo) => ({
        id: slo.id,
        sequence: slo.sequence,
        outcomeText: slo.outcomeText,
        bloomLevel: slo.bloomLevel,
        performanceCriteria: slo.performanceCriteria || undefined,
      })),
    contentItems: aggregate.content
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((item) => ({
        id: item.id,
        sequence: item.sequence,
        topic: item.topic,
        subtopics: item.subtopics,
        hours: item.hoursAllocated,
        linkedSloIds: item.linkedSloIds,
      })),
    requisites: aggregate.requisites.map((requisite) => {
      const linkedCourse = courses.find((course) => course.id === requisite.requisiteCourseId);
      return {
        id: requisite.id,
        type: requisite.type,
        validationType: requisite.validationType || undefined,
        courseId: requisite.requisiteCourseId || undefined,
        courseCode: linkedCourse
          ? `${linkedCourse.subjectCode} ${linkedCourse.courseNumber}`
          : undefined,
        courseTitle: linkedCourse?.title,
        text: requisite.requisiteText || undefined,
        contentReview: requisite.contentReview || undefined,
      };
    }),
    comments: aggregate.comments
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((comment) => ({
        id: comment.id,
        authorName: actorName(comment.authorId, actors),
        authorRole: actors.find((actor) => actor.id === comment.authorId)?.role || 'reviewer',
        body: comment.content,
        section: comment.section || 'General',
        resolved: comment.resolved,
        createdAt: comment.createdAt,
      })),
    history: aggregate.history
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ({
        id: entry.id,
        action: entry.toStatus,
        actorName: actorName(entry.changedBy, actors),
        detail:
          entry.comment ||
          (entry.fromStatus
            ? `Moved from ${entry.fromStatus} to ${entry.toStatus}.`
            : `Created in ${entry.toStatus}.`),
        createdAt: entry.createdAt,
      })),
  };
}

export function auditToView(audit: ComplianceAudit): ComplianceAuditView {
  return {
    overallStatus: audit.overallStatus,
    complianceScore: audit.complianceScore,
    totalChecks: audit.totalChecks,
    passed: audit.passed,
    failed: audit.failed,
    warnings: audit.warnings,
    results: audit.results.map((result) => ({
      ruleId: result.ruleId,
      ruleName: result.ruleName,
      category: result.category,
      status: result.status,
      message: result.message,
      section: result.section,
      citation: result.citation,
      recommendation: result.recommendation,
    })),
  };
}

export function editorPatchToCourseUpdate(patch: CourseEditorPatch) {
  return {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
    ...(patch.catalogDescription !== undefined
      ? { catalogDescription: patch.catalogDescription || null }
      : {}),
    ...(patch.units !== undefined ? { units: patch.units } : {}),
    ...(patch.lectureHours !== undefined ? { lectureHours: patch.lectureHours } : {}),
    ...(patch.labHours !== undefined ? { labHours: patch.labHours } : {}),
    ...(patch.activityHours !== undefined ? { activityHours: patch.activityHours } : {}),
    ...(patch.tbaHours !== undefined ? { tbaHours: patch.tbaHours } : {}),
    ...(patch.outsideHours !== undefined
      ? { outsideOfClassHours: patch.outsideHours }
      : {}),
    ...(patch.totalStudentHours !== undefined
      ? { totalStudentLearningHours: patch.totalStudentHours }
      : {}),
    ...(patch.effectiveTerm !== undefined
      ? { effectiveTerm: patch.effectiveTerm || null }
      : {}),
    ...(patch.topCode !== undefined ? { topCode: patch.topCode || null } : {}),
    ...(patch.ccnCode !== undefined ? { ccnCode: patch.ccnCode || null } : {}),
  };
}
