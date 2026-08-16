import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseCompareView } from './CourseCompareView';
import type { CourseViewModel } from './types';

const push = vi.fn();
const router = { push };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function course(
  id: string,
  version: number,
  childSuffix: string,
): CourseViewModel {
  const sloId = `slo-${childSuffix}`;
  return {
    id,
    subjectCode: 'ENGL',
    courseNumber: '101',
    title: 'College Composition',
    departmentId: 'department-1',
    departmentName: 'English',
    catalogDescription: 'Academic reading and writing.',
    units: '3',
    lectureHours: '3',
    labHours: '0',
    activityHours: '0',
    tbaHours: '0',
    outsideHours: '6',
    totalStudentHours: '162',
    status: version === 1 ? 'Approved' : 'Draft',
    version,
    effectiveTerm: version === 1 ? 'Fall 2026' : 'Fall 2027',
    topCode: '1501.00',
    cId: '',
    ccnCode: 'ENGL C1000',
    ccnCandidateCode: '',
    ccnDisposition: 'adopted',
    ccnJustification: '',
    slos: [
      {
        id: sloId,
        sequence: 1,
        outcomeText: 'Compose a documented academic argument.',
        bloomLevel: 'Create',
        performanceCriteria: 'Uses credible evidence and coherent reasoning.',
      },
    ],
    contentItems: [
      {
        id: `content-${childSuffix}`,
        sequence: 1,
        topic: 'Evidence and argument',
        subtopics: ['Claims', 'Support'],
        hours: '18',
        linkedSloIds: [sloId],
      },
    ],
    requisites: [
      {
        id: `requisite-${childSuffix}`,
        type: 'Prerequisite',
        validationType: 'Content Review',
        courseId: 'linked-course',
        courseCode: 'ENGL 100',
        courseTitle: 'Academic Literacy',
        contentReview: 'Entry skills align with documented reading tasks.',
      },
    ],
    comments: [],
    history: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

describe('CourseCompareView', () => {
  it('compares semantic COR values instead of version-specific child IDs', () => {
    const source = course('course-v1', 1, 'source');
    const target = course('course-v2', 2, 'target');
    render(
      <CourseCompareView
        source={source}
        target={target}
        versions={[source, target]}
      />,
    );

    const sloSection = screen
      .getByRole('heading', { name: 'Student Learning Outcomes' })
      .closest('section');
    const contentSection = screen
      .getByRole('heading', { name: 'Course Content' })
      .closest('section');
    const requisiteSection = screen
      .getByRole('heading', { name: 'Requisites' })
      .closest('section');

    expect(sloSection).not.toBeNull();
    expect(contentSection).not.toBeNull();
    expect(requisiteSection).not.toBeNull();
    expect(within(sloSection!).getByText('Same')).toBeInTheDocument();
    expect(within(contentSection!).getByText('Same')).toBeInTheDocument();
    expect(within(requisiteSection!).getByText('Same')).toBeInTheDocument();
    expect(
      within(sloSection!).getAllByText(/Performance criteria:/),
    ).toHaveLength(2);
    expect(within(contentSection!).getAllByText('Linked SLOs: 1')).toHaveLength(2);
    expect(
      screen.getAllByRole('columnheader', { name: 'Version 1.0' }).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('surfaces a changed performance criterion even when outcome text is unchanged', () => {
    const source = course('course-v1', 1, 'source');
    const target = course('course-v2', 2, 'target');
    target.slos[0] = {
      ...target.slos[0],
      performanceCriteria: 'Includes at least four peer-reviewed sources.',
    };
    render(
      <CourseCompareView
        source={source}
        target={target}
        versions={[source, target]}
      />,
    );

    const sloSection = screen
      .getByRole('heading', { name: 'Student Learning Outcomes' })
      .closest('section');
    expect(within(sloSection!).getByText('Changed')).toBeInTheDocument();
    expect(
      within(sloSection!).getByText(
        /Includes at least four peer-reviewed sources/,
      ),
    ).toBeInTheDocument();
  });
});
