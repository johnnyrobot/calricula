import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from './CourseDetailView';
import type { ComplianceAuditView, CourseViewModel } from './types';

const push = vi.fn();
const router = { push };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function course(status: CourseViewModel['status']): CourseViewModel {
  return {
    id: 'course-1',
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
    status,
    version: 1,
    effectiveTerm: 'Fall 2027',
    topCode: '1501.00',
    cId: '',
    ccnCode: '',
    ccnCandidateCode: 'ENGL C1000',
    ccnDisposition: 'non-match',
    ccnJustification:
      'The local course includes a distinct support model outside the current template.',
    slos: [
      {
        id: 'slo-1',
        sequence: 1,
        outcomeText: 'Compose a documented argument.',
        bloomLevel: 'Create',
        performanceCriteria: 'Uses credible evidence.',
      },
    ],
    contentItems: [],
    requisites: [
      {
        id: 'req-1',
        type: 'Prerequisite',
        validationType: 'Content Review',
        text: 'Eligibility for college-level composition',
        contentReview: 'Entry skills are documented.',
      },
    ],
    comments: [],
    history: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    approvedAt:
      status === 'Approved' ? '2026-07-29T00:00:00.000Z' : undefined,
  };
}

const audit: ComplianceAuditView = {
  overallStatus: 'warn',
  complianceScore: 80,
  totalChecks: 5,
  passed: 4,
  failed: 0,
  warnings: 1,
  results: [],
};

describe('CourseDetailView', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('keeps approved records immutable while offering duplicate and new-version actions', async () => {
    const onDuplicate = vi.fn().mockResolvedValue({ id: 'duplicate-course' });
    const onCreateVersion = vi.fn().mockResolvedValue({ id: 'version-2' });
    render(
      <CourseDetailView
        course={course('Approved')}
        audit={audit}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
        onCreateVersion={onCreateVersion}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Edit outline' })).not.toBeInTheDocument();
    expect(screen.getByText(/approved record is immutable/i)).toBeInTheDocument();
    expect(screen.getByText(/Performance criteria: Uses credible evidence/)).toBeInTheDocument();
    expect(screen.getByText(/Validation basis: Content Review/)).toBeInTheDocument();
    expect(screen.getByText(/CCN non-match rationale/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/courses/edit/?id=duplicate-course'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create new version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft version' }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/courses/edit/?id=version-2'),
    );
  });

  it('requires confirmation before deleting a draft', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDetailView
        course={course('Draft')}
        audit={audit}
        onDelete={onDelete}
        onDuplicate={vi.fn()}
        onCreateVersion={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Delete draft course?',
    );
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/courses/');
  });

  it('exposes print and JSON export controls', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:course-export');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <CourseDetailView
        course={course('Draft')}
        audit={audit}
        exportValue={{ id: 'course-1' }}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCreateVersion={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Print COR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(print).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:course-export');
  });
});
