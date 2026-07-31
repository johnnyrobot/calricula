import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseAggregate } from '@/lib/domain';
import type { CourseViewModel } from './types';
import {
  CourseCompareRouteScreen,
  CourseEditRouteScreen,
  CourseViewRouteScreen,
} from './CourseRouteScreens';

const state = vi.hoisted(() => ({
  params: '',
  aggregate: null as CourseAggregate | null,
  activeActor: {
    id: 'actor-1',
    role: 'faculty',
  },
  editorProps: null as Record<string, unknown> | null,
  saveCourseAggregate: vi.fn(),
  ccnMatches: [] as Array<Record<string, unknown>>,
  ccnStandards: [] as Array<Record<string, unknown>>,
  ccnPlan: {
    success: true,
    coursePatch: { ccnCode: 'ENGL C1000', cbCodes: {} },
    cbCodesUpdated: {},
    warnings: [],
    errors: [],
    clearNonMatchJustification: true,
  } as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.params),
}));

vi.mock('./CourseEditor', () => ({
  CourseEditor: (props: Record<string, unknown>) => {
    state.editorProps = props;
    return <div>Course editor ready</div>;
  },
}));

vi.mock('@/lib/compliance', () => ({
  auditCourse: () => ({
    overallStatus: 'warn',
    complianceScore: 80,
    totalChecks: 1,
    passed: 0,
    failed: 0,
    warnings: 1,
    calculatedHours: {},
    results: [
      {
        ruleId: 'hours',
        ruleName: 'Hours',
        category: 'Units & Hours',
        status: 'warn',
        message: 'Review hours.',
        section: 'Basic information',
      },
    ],
  }),
  findCCNMatches: () => state.ccnMatches,
  planCCNAdoption: () => state.ccnPlan,
}));

vi.mock('@/lib/data', () => {
  class RepositoryError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }

  const queryState = <T,>(data: T) => ({
    data,
    error: null,
    loading: false,
    refresh: vi.fn(),
  });

  return {
    RepositoryError,
    curriculumRepository: {
      saveCourseAggregate: state.saveCourseAggregate,
      deleteCourse: vi.fn(),
      duplicateCourse: vi.fn(),
      createNewCourseVersion: vi.fn(),
      addComment: vi.fn(),
      setCommentResolved: vi.fn(),
      transitionCourse: vi.fn(),
      listCourses: vi.fn(),
    },
    useCourse: () => queryState(state.aggregate),
    useReferences: () =>
      queryState({
        divisions: [],
        departments: [
          {
            id: 'department-1',
            divisionId: 'division-1',
            code: 'ENGL',
            name: 'English',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        topCodes: [
          {
            id: 'top-1',
            code: '1501.00',
            title: 'English',
            vocational: false,
            parentCode: null,
          },
        ],
        ccnStandards: state.ccnStandards,
      }),
    useActivePersona: () => queryState(state.activeActor),
    usePersonas: () => queryState([]),
    useRepositoryQuery: () =>
      queryState({
        items: state.aggregate ? [state.aggregate.course] : [],
        total: state.aggregate ? 1 : 0,
        page: 1,
        pageSize: 100,
        pageCount: state.aggregate ? 1 : 0,
      }),
  };
});

function aggregate(status: 'Draft' | 'Approved' = 'Draft'): CourseAggregate {
  const timestamp = '2026-07-29T00:00:00.000Z';
  return {
    course: {
      id: 'course-1',
      lineageId: 'lineage-1',
      subjectCode: 'ENGL',
      courseNumber: '101',
      title: 'College Composition',
      catalogDescription: 'Academic reading and writing.',
      units: '3',
      minimumUnits: '3',
      maximumUnits: '3',
      lectureHours: '3',
      labHours: '0',
      activityHours: '0',
      tbaHours: '0',
      outsideOfClassHours: '6',
      totalStudentLearningHours: '162',
      topCode: '1501.00',
      status,
      version: 1,
      effectiveTerm: 'Fall 2027',
      ccnCode: null,
      cId: null,
      cbCodes: {},
      transferability: {},
      geApplicability: {},
      lmiData: null,
      departmentId: 'department-1',
      createdBy: 'actor-1',
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedAt: status === 'Approved' ? timestamp : null,
    },
    slos: [
      {
        id: 'slo-1',
        courseId: 'course-1',
        sequence: 1,
        outcomeText: 'Compose a documented argument.',
        bloomLevel: 'Create',
        performanceCriteria: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    content: [
      {
        id: 'content-1',
        courseId: 'course-1',
        sequence: 1,
        topic: 'Evidence and argument',
        subtopics: ['Claims'],
        hoursAllocated: '18',
        linkedSloIds: ['slo-1'],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    requisites: [],
    comments: [],
    history: [],
    ccnJustification: null,
  };
}

describe('course route screens', () => {
  beforeEach(() => {
    state.params = '';
    state.aggregate = aggregate();
    state.activeActor = {
      id: 'actor-1',
      role: 'faculty',
    };
    state.editorProps = null;
    state.ccnMatches = [];
    state.ccnStandards = [];
    state.ccnPlan = {
      success: true,
      coursePatch: { ccnCode: 'ENGL C1000', cbCodes: {} },
      cbCodesUpdated: {},
      warnings: [],
      errors: [],
      clearNonMatchJustification: true,
    };
    state.saveCourseAggregate.mockReset();
    state.saveCourseAggregate.mockResolvedValue(state.aggregate);
  });

  it('commits the complete editor snapshot through one atomic repository call', async () => {
    state.params = 'id=course-1';
    render(<CourseEditRouteScreen />);
    expect(screen.getByText('Course editor ready')).toBeInTheDocument();

    const props = state.editorProps as {
      initialCourse: CourseViewModel;
      onSave: (course: CourseViewModel) => Promise<void>;
    };
    const staleLinkedView: CourseViewModel = {
      ...props.initialCourse,
      slos: [],
      contentItems: props.initialCourse.contentItems.map((item) => ({
        ...item,
        linkedSloIds: ['slo-1'],
      })),
    };

    await act(async () => {
      await props.onSave(staleLinkedView);
    });

    expect(state.saveCourseAggregate).toHaveBeenCalledTimes(1);
    expect(state.saveCourseAggregate).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        course: expect.objectContaining({
          title: 'College Composition',
          totalStudentLearningHours: '162',
        }),
        slos: [],
        content: [
          expect.objectContaining({
            topic: 'Evidence and argument',
            linkedSloIds: [],
          }),
        ],
        requisites: [],
        ccnJustification: null,
      }),
    );
  });

  it('passes temporary SLO client IDs for atomic content-link remapping', async () => {
    state.params = 'id=course-1';
    render(<CourseEditRouteScreen />);
    const props = state.editorProps as {
      initialCourse: CourseViewModel;
      onSave: (course: CourseViewModel) => Promise<void>;
    };
    const temporarySlo = {
      id: 'tmp-slo-new',
      sequence: 1,
      outcomeText: 'Evaluate evidence in an academic argument.',
      bloomLevel: 'Evaluate' as const,
    };

    await act(async () => {
      await props.onSave({
        ...props.initialCourse,
        slos: [temporarySlo],
        contentItems: [
          {
            ...props.initialCourse.contentItems[0],
            linkedSloIds: [temporarySlo.id],
          },
        ],
      });
    });

    expect(state.saveCourseAggregate).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        slos: [
          expect.objectContaining({
            clientId: 'tmp-slo-new',
            outcomeText: temporarySlo.outcomeText,
          }),
        ],
        content: [
          expect.objectContaining({
            linkedSloIds: ['tmp-slo-new'],
          }),
        ],
      }),
    );
    expect(
      state.saveCourseAggregate.mock.calls[0][1].slos[0],
    ).not.toHaveProperty('id');
  });

  it('blocks direct editing of an approved official record', () => {
    state.params = 'id=course-1';
    state.aggregate = aggregate('Approved');
    render(<CourseEditRouteScreen />);

    expect(
      screen.getByRole('heading', { name: 'Approved records are immutable' }),
    ).toBeInTheDocument();
    expect(state.editorProps).toBeNull();
  });

  it('rejects a non-match rationale that is not tied to a real CCN candidate', async () => {
    state.params = 'id=course-1';
    render(<CourseEditRouteScreen />);
    const props = state.editorProps as {
      initialCourse: CourseViewModel;
      onSave: (course: CourseViewModel) => Promise<void>;
    };

    await expect(
      props.onSave({
        ...props.initialCourse,
        ccnDisposition: 'non-match',
        ccnCandidateCode: '',
        ccnJustification:
          'This course has a specialized local scope that differs from the state template.',
      }),
    ).rejects.toThrow(/Select the CCN standard/);
    expect(state.saveCourseAggregate).not.toHaveBeenCalled();
  });

  it('rejects a TOP code that is not in the local reference set', async () => {
    state.params = 'id=course-1';
    render(<CourseEditRouteScreen />);
    const props = state.editorProps as {
      initialCourse: CourseViewModel;
      onSave: (course: CourseViewModel) => Promise<void>;
    };

    await expect(
      props.onSave({
        ...props.initialCourse,
        topCode: '9999.99',
      }),
    ).rejects.toThrow(/Select a TOP code from this demo's 1-code reference list/);
    expect(state.saveCourseAggregate).not.toHaveBeenCalled();
  });

  it('keeps a valid local TOP code when an adopted CCN implies an unavailable code', async () => {
    state.params = 'id=course-1';
    state.ccnStandards = [{ ccnCode: 'ENGL C1000' }];
    state.ccnPlan = {
      success: true,
      coursePatch: {
        ccnCode: 'ENGL C1000',
        cbCodes: { CB05: 'A', CB03: '9999.99' },
      },
      cbCodesUpdated: { CB05: 'A', CB03: '9999.99' },
      warnings: [],
      errors: [],
      clearNonMatchJustification: true,
    };
    render(<CourseEditRouteScreen />);
    const props = state.editorProps as {
      initialCourse: CourseViewModel;
      onSave: (course: CourseViewModel) => Promise<void>;
    };

    await act(async () => {
      await props.onSave({
        ...props.initialCourse,
        ccnDisposition: 'adopted',
        ccnCode: 'ENGL C1000',
        topCode: '1501.00',
      });
    });

    expect(state.saveCourseAggregate).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        course: expect.objectContaining({
          ccnCode: 'ENGL C1000',
          topCode: '1501.00',
          cbCodes: { CB05: 'A' },
        }),
      }),
    );
  });

  it('does not expose an unavailable CCN-implied TOP code as an adoptable UI value', () => {
    state.params = 'id=course-1';
    state.ccnMatches = [
      {
        standardId: 'standard-1',
        ccnCode: 'ENGL C1000',
        title: 'Academic Reading and Writing',
        minimumUnits: 3,
        confidenceScore: 0.9,
        matchReasons: ['Same discipline'],
        impliedCbCodes: { CB03: '9999.99' },
      },
    ];

    render(<CourseEditRouteScreen />);

    expect(state.editorProps?.ccnMatches).toEqual([
      expect.not.objectContaining({ impliedTopCode: expect.anything() }),
    ]);
  });

  it('disables submission for a reviewer who is neither Faculty nor record owner', () => {
    state.params = 'id=course-1';
    state.activeActor = {
      id: 'chair-1',
      role: 'chair',
    };

    render(<CourseEditRouteScreen />);

    expect(state.editorProps).toMatchObject({
      canSubmitForReview: false,
      submitDisabledReason: expect.stringMatching(/Faculty persona or this record's owner/),
    });
  });

  it('rejects a self-comparison and offers a valid target chooser', () => {
    state.params = 'source=course-1&target=course-1';
    render(<CourseCompareRouteScreen />);

    expect(
      screen.getByRole('heading', {
        name: 'Choose a different comparison target',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Choose another target' }),
    ).toHaveAttribute('href', '/courses/compare?source=course-1');
  });

  it('explains a missing view ID instead of rendering an empty record', () => {
    render(<CourseViewRouteScreen />);
    expect(
      screen.getByRole('heading', { name: 'Choose a course to view' }),
    ).toBeInTheDocument();
  });
});
