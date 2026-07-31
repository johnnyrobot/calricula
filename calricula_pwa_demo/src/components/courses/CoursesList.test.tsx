import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursesList } from './CoursesList';
import type { CourseViewModel } from './types';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function course(overrides: Partial<CourseViewModel> = {}): CourseViewModel {
  return {
    id: 'course-1',
    subjectCode: 'ENGL',
    courseNumber: '101',
    title: 'College Composition',
    departmentId: 'department-1',
    departmentName: 'English',
    catalogDescription: 'Academic reading and writing.',
    units: '4',
    lectureHours: '4',
    labHours: '0',
    activityHours: '0',
    tbaHours: '0',
    outsideHours: '8',
    totalStudentHours: '216',
    status: 'Draft',
    version: 1,
    effectiveTerm: 'Fall 2027',
    topCode: '1501.00',
    cId: '',
    ccnCode: 'ENGL C1000',
    ccnCandidateCode: '',
    ccnDisposition: 'adopted',
    ccnJustification: '',
    slos: [],
    contentItems: [],
    requisites: [],
    comments: [],
    history: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('CoursesList', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('searches across course identity and filters by workflow status', () => {
    render(
      <CoursesList
        courses={[
          course(),
          course({
            id: 'course-2',
            subjectCode: 'CS',
            title: 'Introduction to Programming',
            departmentName: 'Computer Science',
            status: 'Approved',
          }),
        ]}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: 'programming' },
    });
    expect(screen.getByText('Introduction to Programming')).toBeInTheDocument();
    expect(screen.queryByText('College Composition')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approved: 1 course' }));
    expect(screen.getByText('Introduction to Programming')).toBeInTheDocument();
    expect(screen.queryByText('College Composition')).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting a draft', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<CoursesList courses={[course()]} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete ENGL 101' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete draft course?' })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('course-1'));
  });

  it('announces a failed deletion inside the still-open confirmation modal', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('The draft is locked.'));
    render(<CoursesList courses={[course()]} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete ENGL 101' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete draft course?',
    });
    expect(dialog).toHaveTextContent('The draft is locked.');
    expect(screen.getByRole('alert')).toHaveTextContent('The draft is locked.');
  });
});
