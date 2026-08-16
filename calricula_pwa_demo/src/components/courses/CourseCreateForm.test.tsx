import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseCreateForm } from './CourseCreateForm';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const departments = [
  { id: 'department-1', code: 'ENGL', name: 'English' },
];

describe('CourseCreateForm', () => {
  beforeEach(() => push.mockReset());

  it('presents an accessible validation summary before repository creation', () => {
    const onCreate = vi.fn();
    render(<CourseCreateForm departments={departments} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Review the highlighted fields');
    expect(screen.getAllByText('Enter 2–10 letters, such as ENGL or MATH.')).toHaveLength(2);
    expect(screen.getByLabelText(/Subject code/)).toBeRequired();
    expect(screen.getByLabelText(/Course number/)).toBeRequired();
    expect(screen.getByLabelText(/Official course title/)).toBeRequired();
    expect(screen.getByLabelText(/Department/)).toBeRequired();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('removes corrected fields from the validation summary while editing', () => {
    render(<CourseCreateForm departments={departments} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    fireEvent.change(screen.getByLabelText(/Subject code/), {
      target: { value: 'ENGL' },
    });
    fireEvent.change(screen.getByLabelText(/Course number/), {
      target: { value: '101' },
    });
    fireEvent.change(screen.getByLabelText(/Official course title/), {
      target: { value: 'College Composition' },
    });
    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: 'department-1' },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('normalizes catalog identity and opens the finite query-parameter editor route', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'created-course' });
    render(<CourseCreateForm departments={departments} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/Subject code/), { target: { value: 'engl' } });
    fireEvent.change(screen.getByLabelText(/Course number/), { target: { value: 'c1000' } });
    fireEvent.change(screen.getByLabelText(/Official course title/), {
      target: { value: 'Academic Reading and Writing' },
    });
    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: 'department-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        subjectCode: 'ENGL',
        courseNumber: 'C1000',
        title: 'Academic Reading and Writing',
        departmentId: 'department-1',
      }),
    );
    expect(push).toHaveBeenCalledWith('/courses/edit/?id=created-course');
  });
});
