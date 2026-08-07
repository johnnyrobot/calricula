'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { auditCourse, findCCNMatches } from '@/lib/compliance';
import {
  curriculumRepository,
  useActivePersona,
  useCourse,
  usePersonas,
  useReferences,
  useRepositoryQuery,
  type CourseAggregate,
  type CourseQuery,
  type PageResult,
} from '@/lib/data';
import type { CCNStandard, Course } from '@/lib/domain';
import { getCourseSubmissionAvailability } from '@/components/approvals/workflow';
import { CourseCompareView } from './CourseCompareView';
import { CourseCatalogHeader } from './CourseCatalogHeader';
import { CourseCreateForm } from './CourseCreateForm';
import { CourseDetailView } from './CourseDetailView';
import { CourseEditor } from './CourseEditor';
import { CourseLoading, CourseMessage } from './CoursePrimitives';
import { CoursesList } from './CoursesList';
import { planCourseSave } from './course-save';
import {
  aggregateToView,
  auditToView,
  courseRecordToView,
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
    const plan = planCourseSave(view, {
      course: aggregateData.course,
      topCodes: referenceData.topCodes,
      ccnStandards: referenceData.ccnStandards,
    });
    if (!plan.ok) {
      // The draft session renders error.message and never inspects the class,
      // so a plain Error is the whole contract. Raising the repository's
      // RepositoryError here would name a layer that enforced none of these.
      throw new Error(plan.issues.join(' '));
    }
    await curriculumRepository.saveCourseAggregate(id, plan.command);
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
