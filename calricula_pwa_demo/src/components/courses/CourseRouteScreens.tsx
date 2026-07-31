'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  auditCourse,
  findCCNMatches,
  planCCNAdoption,
} from '@/lib/compliance';
import {
  curriculumRepository,
  RepositoryError,
  useActivePersona,
  useCourse,
  usePersonas,
  useReferences,
  useRepositoryQuery,
  type CourseAggregate,
  type CourseContentInput,
  type CourseQuery,
  type CourseRequisiteInput,
  type PageResult,
  type StudentLearningOutcomeInput,
} from '@/lib/data';
import type { CCNStandard, Course, UpdateCourseInput } from '@/lib/domain';
import { getCourseSubmissionAvailability } from '@/components/approvals/workflow';
import { CourseCompareView } from './CourseCompareView';
import { CourseCatalogHeader } from './CourseCatalogHeader';
import { CourseCreateForm } from './CourseCreateForm';
import { CourseDetailView } from './CourseDetailView';
import { CourseEditor } from './CourseEditor';
import { CourseLoading, CourseMessage } from './CoursePrimitives';
import { CoursesList } from './CoursesList';
import {
  aggregateToView,
  auditToView,
  courseRecordToView,
  editorPatchToCourseUpdate,
} from './adapters';
import type {
  CCNMatchView,
  CourseCreateValues,
  CourseViewModel,
} from './types';

const REPOSITORY_PAGE_SIZE = 100;
const EMPTY_COURSE_PAGE: PageResult<Course> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: REPOSITORY_PAGE_SIZE,
  pageCount: 0,
};

function useAllCourses(
  sortBy: NonNullable<CourseQuery['sortBy']>,
  sortDirection: NonNullable<CourseQuery['sortDirection']>,
) {
  const load = useCallback(async (): Promise<PageResult<Course>> => {
    const first = await curriculumRepository.listCourses({
      page: 1,
      pageSize: REPOSITORY_PAGE_SIZE,
      sortBy,
      sortDirection,
    });
    if (first.pageCount <= 1) return first;

    const remaining = await Promise.all(
      Array.from({ length: first.pageCount - 1 }, (_, index) =>
        curriculumRepository.listCourses({
          page: index + 2,
          pageSize: REPOSITORY_PAGE_SIZE,
          sortBy,
          sortDirection,
        }),
      ),
    );
    const items = [first, ...remaining].flatMap((page) => page.items);
    return {
      items,
      total: first.total,
      page: 1,
      pageSize: items.length || REPOSITORY_PAGE_SIZE,
      pageCount: items.length ? 1 : 0,
    };
  }, [sortBy, sortDirection]);

  return useRepositoryQuery(
    load,
    [sortBy, sortDirection],
    EMPTY_COURSE_PAGE,
  );
}

function routeError(title: string, error: Error, retry?: () => void) {
  return (
    <CourseMessage
      title={title}
      message={error.message}
      tone="error"
      action={
        retry ? (
          <button type="button" onClick={retry} className="luminous-button-primary">
            Try again
          </button>
        ) : undefined
      }
    />
  );
}

function useSharedCourseData() {
  const references = useReferences();
  const allCourses = useAllCourses('courseCode', 'asc');
  const personas = usePersonas();
  return { references, allCourses, personas };
}

function aggregateAudit(
  aggregate: CourseAggregate,
  ccnStandards: readonly CCNStandard[],
) {
  const standard = ccnStandards?.find(
    (candidate) => candidate.ccnCode === aggregate.course.ccnCode,
  );
  return auditCourse({
    course: aggregate.course,
    slos: aggregate.slos,
    contentItems: aggregate.content,
    requisites: aggregate.requisites,
    ccnStandard: standard,
    ccnJustification: aggregate.ccnJustification,
  });
}

export function CoursesRouteScreen() {
  const courses = useAllCourses('updatedAt', 'desc');
  const references = useReferences();

  if (courses.loading || references.loading) {
    return (
      <>
        <CourseCatalogHeader />
        <CourseLoading label="Opening the course catalog…" />
      </>
    );
  }
  if (courses.error) return routeError('The course catalog could not be opened', courses.error, courses.refresh);
  if (references.error)
    return routeError('Reference data could not be opened', references.error, references.refresh);

  const views = courses.data.items.map((course) =>
    courseRecordToView(course, references.data?.departments || []),
  );
  return (
    <CoursesList
      courses={views}
      onDelete={(courseId) => curriculumRepository.deleteCourse(courseId)}
    />
  );
}

export function CourseNewRouteScreen() {
  const references = useReferences();
  if (references.loading) return <CourseLoading label="Preparing the new course form…" />;
  if (references.error)
    return routeError('Departments could not be loaded', references.error, references.refresh);

  const create = async (values: CourseCreateValues) => {
    const aggregate = await curriculumRepository.createCourse({
      subjectCode: values.subjectCode,
      courseNumber: values.courseNumber,
      title: values.title,
      departmentId: values.departmentId,
    });
    return { id: aggregate.course.id };
  };

  return (
    <CourseCreateForm
      departments={references.data?.departments || []}
      onCreate={create}
    />
  );
}

export function CourseViewRouteScreen() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id')?.trim() || null;
  const aggregate = useCourse(id);
  const { references, allCourses, personas } = useSharedCourseData();

  if (!id) {
    return (
      <CourseMessage
        title="Choose a course to view"
        message="This address is missing a course ID. Open the catalog and select a Course Outline of Record."
        tone="warning"
      />
    );
  }
  if (aggregate.loading || references.loading || allCourses.loading || personas.loading) {
    return <CourseLoading label="Opening the Course Outline of Record…" />;
  }
  if (aggregate.error) return routeError('The course could not be opened', aggregate.error, aggregate.refresh);
  if (!aggregate.data) {
    return (
      <CourseMessage
        title="Course not found"
        message="No local Course Outline of Record matches this ID. It may have been deleted or replaced by a newer demo record."
        tone="warning"
      />
    );
  }
  if (references.error) return routeError('Reference data could not be opened', references.error, references.refresh);
  if (allCourses.error) return routeError('Related courses could not be opened', allCourses.error, allCourses.refresh);
  if (personas.error) return routeError('Course authors could not be opened', personas.error, personas.refresh);

  const view = aggregateToView(aggregate.data, {
    departments: references.data?.departments,
    courses: allCourses.data.items,
    actors: personas.data,
  });
  const audit = auditToView(
    aggregateAudit(aggregate.data, references.data?.ccnStandards || []),
  );

  return (
    <CourseDetailView
      course={view}
      audit={audit}
      exportValue={aggregate.data}
      onDelete={() => curriculumRepository.deleteCourse(id)}
      onDuplicate={async () => {
        const result = await curriculumRepository.duplicateCourse(id);
        return { id: result.course.id };
      }}
      onCreateVersion={async () => {
        const result = await curriculumRepository.createNewCourseVersion(id);
        return { id: result.course.id };
      }}
    />
  );
}

function makeCCNMatches(
  aggregate: CourseAggregate,
  standards: NonNullable<ReturnType<typeof useReferences>['data']>['ccnStandards'],
  topCodes: NonNullable<ReturnType<typeof useReferences>['data']>['topCodes'],
): CCNMatchView[] {
  const input = {
    title: aggregate.course.title,
    description: aggregate.course.catalogDescription,
    subjectCode: aggregate.course.subjectCode,
    units: aggregate.course.units,
    slos: aggregate.slos.map((slo) => slo.outcomeText),
    contentTopics: aggregate.content.map((item) => item.topic),
  };
  const strongMatches = findCCNMatches(input, standards, {
    limit: 5,
    minimumConfidence: 0.2,
  });
  const matches = strongMatches.length
    ? strongMatches
    : findCCNMatches(input, standards, {
        limit: 5,
        minimumConfidence: 0,
      });

  const localTopCodes = new Set(topCodes.map(({ code }) => code));
  return matches.map((match) => {
    const impliedTopCode =
      typeof match.impliedCbCodes.CB03 === 'string' &&
      localTopCodes.has(match.impliedCbCodes.CB03)
        ? match.impliedCbCodes.CB03
        : undefined;
    return {
      standardId: match.standardId || match.ccnCode,
      ccnCode: match.ccnCode,
      title: match.title,
      minimumUnits: String(match.minimumUnits),
      confidenceScore: match.confidenceScore,
      matchReasons: [...match.matchReasons],
      ...(impliedTopCode ? { impliedTopCode } : {}),
    };
  });
}

function childId(id: string) {
  return id.startsWith('tmp-') ? undefined : id;
}

export function CourseEditRouteScreen() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id')?.trim() || null;
  const aggregate = useCourse(id);
  const activePersona = useActivePersona();
  const { references, allCourses, personas } = useSharedCourseData();

  const initialView = useMemo(() => {
    if (!aggregate.data) return null;
    return aggregateToView(aggregate.data, {
      departments: references.data?.departments,
      courses: allCourses.data.items,
      actors: personas.data,
    });
  }, [
    aggregate.data,
    allCourses.data.items,
    personas.data,
    references.data?.departments,
  ]);

  if (!id) {
    return (
      <CourseMessage
        title="Choose a course to edit"
        message="This address is missing a course ID. Open the catalog and select Edit on a draft outline."
        tone="warning"
      />
    );
  }
  if (
    aggregate.loading ||
    activePersona.loading ||
    references.loading ||
    allCourses.loading ||
    personas.loading
  ) {
    return <CourseLoading label="Preparing the course editor…" />;
  }
  if (aggregate.error) return routeError('The course could not be opened', aggregate.error, aggregate.refresh);
  if (!aggregate.data || !initialView) {
    return (
      <CourseMessage
        title="Course not found"
        message="No local Course Outline of Record matches this ID. Return to the catalog to choose another outline."
        tone="warning"
      />
    );
  }
  if (aggregate.data.course.status === 'Approved') {
    return (
      <CourseMessage
        title="Approved records are immutable"
        message="This official Course Outline of Record cannot be edited in place. Open the record and choose Create new version."
        tone="warning"
        action={
          <Link
            href={`/courses/view/?id=${encodeURIComponent(id)}`}
            className="luminous-button-primary"
          >
            View approved course
          </Link>
        }
      />
    );
  }
  if (references.error)
    return routeError('Reference data could not be opened', references.error, references.refresh);
  if (allCourses.error)
    return routeError('Related courses could not be opened', allCourses.error, allCourses.refresh);
  if (personas.error)
    return routeError('Course authors could not be opened', personas.error, personas.refresh);
  if (activePersona.error)
    return routeError(
      'The active demo persona could not be opened',
      activePersona.error,
      activePersona.refresh,
    );
  if (!references.data) {
    return (
      <CourseMessage
        title="Reference data unavailable"
        message="Departments and state standards are required before this editor can open."
        tone="error"
      />
    );
  }
  const referenceData = references.data;
  const aggregateData = aggregate.data;
  const submission = getCourseSubmissionAvailability(
    aggregateData.course,
    activePersona.data,
  );

  const save = async (view: CourseViewModel) => {
    if (
      view.ccnDisposition === 'non-match' &&
      view.ccnJustification.trim().length < 40
    ) {
      throw new RepositoryError(
        'validation',
        'The CCN non-match justification must contain at least 40 characters.',
      );
    }
    if (
      view.ccnDisposition === 'non-match' &&
      !view.ccnCandidateCode.trim()
    ) {
      throw new RepositoryError(
        'validation',
        'Select the CCN standard this course does not match before saving the justification.',
      );
    }
    const normalizedTopCode = view.topCode.trim();
    const localTopCodes = new Set(
      referenceData.topCodes.map(({ code }) => code),
    );
    if (normalizedTopCode && !localTopCodes.has(normalizedTopCode)) {
      throw new RepositoryError(
        'validation',
        `Select a TOP code from this demo's ${referenceData.topCodes.length}-code reference list.`,
      );
    }

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
      topCode: normalizedTopCode,
      ccnCode: view.ccnDisposition === 'adopted' ? view.ccnCode : '',
    }) as UpdateCourseInput;

    if (view.ccnDisposition === 'adopted' && view.ccnCode) {
      const standard = referenceData.ccnStandards.find(
        (candidate) => candidate.ccnCode === view.ccnCode,
      );
      if (!standard) {
        throw new RepositoryError(
          'validation',
          'The selected CCN standard is not available in this demo reference set.',
        );
      }
      const plan = planCCNAdoption(aggregateData.course, standard);
      if (!plan.success || !plan.coursePatch) {
        throw new RepositoryError(
          'validation',
          plan.errors.join(' ') || 'The selected CCN standard could not be adopted.',
        );
      }
      Object.assign(coursePatch, plan.coursePatch);
      const plannedCbCodes = { ...(plan.coursePatch.cbCodes || {}) };
      const impliedTopCode =
        typeof plan.cbCodesUpdated.CB03 === 'string'
          ? plan.cbCodesUpdated.CB03
          : null;
      if (impliedTopCode && localTopCodes.has(impliedTopCode)) {
        coursePatch.topCode = impliedTopCode;
        plannedCbCodes.CB03 = impliedTopCode;
      } else if (
        typeof plannedCbCodes.CB03 !== 'string' ||
        !localTopCodes.has(plannedCbCodes.CB03) ||
        plannedCbCodes.CB03 !== coursePatch.topCode
      ) {
        delete plannedCbCodes.CB03;
      }
      coursePatch.cbCodes = plannedCbCodes;
    }

    const validSlos = view.slos.filter((slo) => slo.outcomeText.trim());
    const sloInputs: StudentLearningOutcomeInput[] = validSlos.map((slo, index) => ({
      ...(childId(slo.id) ? { id: slo.id } : {}),
      clientId: slo.id,
      sequence: index + 1,
      outcomeText: slo.outcomeText.trim(),
      bloomLevel: slo.bloomLevel || 'Apply',
      performanceCriteria: slo.performanceCriteria?.trim() || null,
    }));
    const validViewSloIds = new Set(validSlos.map((slo) => slo.id));

    const validContent = view.contentItems.filter((item) => item.topic.trim());
    const contentInputs: CourseContentInput[] = validContent.map((item, index) => ({
      ...(childId(item.id) ? { id: item.id } : {}),
      sequence: index + 1,
      topic: item.topic.trim(),
      subtopics: item.subtopics.map((value) => value.trim()).filter(Boolean),
      hoursAllocated: canonicalNonNegative(item.hours),
      linkedSloIds: item.linkedSloIds.filter((sloId) =>
        validViewSloIds.has(sloId),
      ),
    }));

    const validRequisites = view.requisites.filter(
      (requisite) => requisite.courseId || requisite.text?.trim(),
    );
    const requisiteInputs: CourseRequisiteInput[] = validRequisites.map((requisite) => ({
      ...(childId(requisite.id) ? { id: requisite.id } : {}),
      type: requisite.type,
      validationType: requisite.validationType || null,
      requisiteCourseId: requisite.courseId || null,
      requisiteText: requisite.courseId ? null : requisite.text?.trim() || null,
      contentReview: requisite.contentReview?.trim() || null,
    }));

    await curriculumRepository.saveCourseAggregate(id, {
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
    });
  };

  const audit = auditToView(
    aggregateAudit(aggregateData, referenceData.ccnStandards),
  );
  const courseOptions = allCourses.data.items.map((course) =>
    courseRecordToView(course, referenceData.departments),
  );

  return (
    <CourseEditor
      key={aggregateData.course.id}
      initialCourse={initialView}
      aggregate={aggregateData}
      departments={referenceData.departments}
      courseOptions={courseOptions}
      ccnMatches={makeCCNMatches(
        aggregateData,
        referenceData.ccnStandards,
        referenceData.topCodes,
      )}
      topCodes={referenceData.topCodes}
      audit={audit}
      onSave={save}
      onAddComment={async (section, content) => {
        await curriculumRepository.addComment({
          entityType: 'Course',
          entityId: id,
          section,
          content,
        });
      }}
      onResolveComment={async (commentId, resolved) => {
        await curriculumRepository.setCommentResolved(commentId, resolved);
      }}
      onSubmitForReview={async () => {
        await curriculumRepository.transitionCourse(id, {
          targetStatus: 'Department Review',
          comment: 'Submitted for departmental review.',
        });
      }}
      canSubmitForReview={submission.allowed}
      submitDisabledReason={submission.reason}
    />
  );
}

function canonicalNonNegative(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : '0';
}

export function CourseCompareRouteScreen() {
  const searchParams = useSearchParams();
  const sourceId = searchParams.get('source')?.trim() || null;
  const targetId = searchParams.get('target')?.trim() || null;
  const source = useCourse(sourceId);
  const target = useCourse(targetId);
  const { references, allCourses, personas } = useSharedCourseData();

  if (!sourceId) {
    return (
      <CourseMessage
        title="Choose a source course"
        message="This comparison address is missing the source course ID. Open a Course Outline of Record and choose Compare."
        tone="warning"
      />
    );
  }
  if (
    source.loading ||
    (targetId ? target.loading : false) ||
    references.loading ||
    allCourses.loading ||
    personas.loading
  ) {
    return <CourseLoading label="Preparing the version comparison…" />;
  }
  if (source.error) return routeError('The source course could not be opened', source.error, source.refresh);
  if (!source.data) {
    return (
      <CourseMessage
        title="Source course not found"
        message="The source record does not exist in this local curriculum workspace."
        tone="warning"
      />
    );
  }
  if (targetId === sourceId) {
    return (
      <CourseMessage
        title="Choose a different comparison target"
        message="A course record cannot be compared with itself. Select another version from the same course lineage."
        tone="warning"
        action={
          <Link
            href={`/courses/compare/?source=${encodeURIComponent(sourceId)}`}
            className="luminous-button-primary"
          >
            Choose another target
          </Link>
        }
      />
    );
  }
  if (targetId && target.error)
    return routeError('The comparison target could not be opened', target.error, target.refresh);
  if (targetId && !target.data) {
    return (
      <CourseMessage
        title="Comparison target not found"
        message="The target record does not exist. Choose another version from the source Course Outline of Record."
        tone="warning"
      />
    );
  }
  if (references.error)
    return routeError('Reference data could not be opened', references.error, references.refresh);
  if (allCourses.error)
    return routeError('Related courses could not be opened', allCourses.error, allCourses.refresh);
  if (personas.error)
    return routeError('Course authors could not be opened', personas.error, personas.refresh);

  const sourceView = aggregateToView(source.data, {
    departments: references.data?.departments,
    courses: allCourses.data.items,
    actors: personas.data,
  });
  const targetView = target.data
    ? aggregateToView(target.data, {
        departments: references.data?.departments,
        courses: allCourses.data.items,
        actors: personas.data,
      })
    : null;

  if (target.data && target.data.course.lineageId !== source.data.course.lineageId) {
    return (
      <CourseMessage
        title="These records are not versions of the same course"
        message="Version comparison is limited to records that share a course lineage. Choose another target."
        tone="warning"
        action={
          <Link
            href={`/courses/compare/?source=${encodeURIComponent(sourceId)}`}
            className="luminous-button-primary"
          >
            Choose another target
          </Link>
        }
      />
    );
  }

  const versions = allCourses.data.items
    .filter((course) => course.lineageId === source.data!.course.lineageId)
    .map((course) => courseRecordToView(course, references.data?.departments));

  return (
    <CourseCompareView source={sourceView} target={targetView} versions={versions} />
  );
}
