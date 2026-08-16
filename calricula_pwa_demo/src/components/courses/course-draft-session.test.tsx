import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { courseDraftRecoveryKey } from '@/lib/pwa/course-draft-recovery';
import { useCourseDraftSession } from './course-draft-session';
import type { CourseViewModel } from './types';

const push = vi.fn();
// Stable across renders, as Next's own router object is. A fresh object each
// render would re-run the exit-path effect and flush on every keystroke.
const router = { push };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function course(): CourseViewModel {
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
    status: 'Draft',
    version: 1,
    effectiveTerm: 'Fall 2027',
    topCode: '1501.00',
    cId: '',
    ccnCode: '',
    ccnCandidateCode: '',
    ccnDisposition: 'unreviewed',
    ccnJustification: '',
    slos: [],
    contentItems: [],
    requisites: [],
    comments: [],
    history: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function renderSession(
  onSave: (value: CourseViewModel) => Promise<void>,
  initialCourse: CourseViewModel = course(),
) {
  return renderHook(
    (props: {
      initialCourse: CourseViewModel;
      onSave: (value: CourseViewModel) => Promise<void>;
    }) => useCourseDraftSession(props),
    { initialProps: { initialCourse, onSave } },
  );
}

describe('useCourseDraftSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  describe('crash recovery', () => {
    it('ignores and deletes a recovery entry written for a different course', () => {
      window.localStorage.setItem(
        courseDraftRecoveryKey('course-1'),
        JSON.stringify({
          kind: 'calricula-course-draft-recovery',
          courseId: 'course-2',
          sourceUpdatedAt: '2026-07-29T00:00:00.000Z',
          capturedAt: '2026-07-29T00:00:00.000Z',
          course: { ...course(), id: 'course-2' },
        }),
      );

      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      expect(result.current.course.id).toBe('course-1');
      expect(
        window.localStorage.getItem(courseDraftRecoveryKey('course-1')),
      ).toBeNull();
    });

    it('survives an unreadable recovery entry rather than failing to open', () => {
      window.localStorage.setItem(
        courseDraftRecoveryKey('course-1'),
        'not json at all',
      );

      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      expect(result.current.course.title).toBe('College Composition');
      expect(result.current.saveState).toBe('idle');
    });

    it('deletes a recovery entry that matches what was already loaded', () => {
      window.localStorage.setItem(
        courseDraftRecoveryKey('course-1'),
        JSON.stringify({
          kind: 'calricula-course-draft-recovery',
          courseId: 'course-1',
          sourceUpdatedAt: '2026-07-29T00:00:00.000Z',
          capturedAt: '2026-07-29T00:00:00.000Z',
          course: course(),
        }),
      );

      renderSession(vi.fn().mockResolvedValue(undefined));

      expect(
        window.localStorage.getItem(courseDraftRecoveryKey('course-1')),
      ).toBeNull();
    });
  });

  describe('save state', () => {
    it('returns the saved confirmation to idle once the window closes', async () => {
      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      act(() => result.current.change({ title: 'A new title' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
      expect(result.current.saveState).toBe('saved');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2200);
      });
      expect(result.current.saveState).toBe('idle');
    });

    it('reports a clean session as already saved without calling onSave', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderSession(onSave);

      await act(async () => {
        await expect(result.current.flush()).resolves.toBe(true);
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('coalesces edits made while a save is still in flight into one more save', async () => {
      let release: (() => void) | undefined;
      const onSave = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => (release = resolve)),
        )
        .mockResolvedValue(undefined);
      const { result } = renderSession(onSave);

      act(() => result.current.change({ title: 'First' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
      act(() => result.current.change({ title: 'Second' }));
      act(() => result.current.change({ title: 'Third' }));

      await act(async () => {
        release?.();
        await vi.advanceTimersByTimeAsync(900);
      });

      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0]).toMatchObject({ title: 'Third' });
    });
  });

  describe('cross-tab conflict', () => {
    it('refuses to save while a conflict is unresolved', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderSession(onSave);

      act(() => result.current.change({ title: 'Mine' }));
      rerender({
        initialCourse: {
          ...course(),
          title: 'Theirs',
          updatedAt: '2026-07-29T01:00:00.000Z',
        },
        onSave,
      });

      await act(async () => {
        await expect(result.current.flush()).resolves.toBe(false);
      });

      expect(onSave).not.toHaveBeenCalled();
      expect(result.current.saveState).toBe('conflict');
    });

    it('holds further edits at conflict instead of scheduling a save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderSession(onSave);

      act(() => result.current.change({ title: 'Mine' }));
      rerender({
        initialCourse: {
          ...course(),
          title: 'Theirs',
          updatedAt: '2026-07-29T01:00:00.000Z',
        },
        onSave,
      });
      act(() => result.current.change({ title: 'Mine, edited again' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });

      expect(onSave).not.toHaveBeenCalled();
      expect(result.current.saveState).toBe('conflict');
    });

    it('does nothing when a conflict resolution is requested without a conflict', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderSession(onSave);

      act(() => result.current.acceptExternalUpdate());
      await act(async () => {
        await result.current.keepLocalDraft();
      });

      expect(onSave).not.toHaveBeenCalled();
      expect(result.current.externalUpdate).toBeNull();
    });
  });

  describe('leaving the editor', () => {
    it('does not route when the draft could not be saved', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Local storage is full.'));
      const { result } = renderSession(onSave);

      act(() => result.current.change({ title: 'Unsavable' }));
      await act(async () => {
        await result.current.navigate('/courses/');
      });

      expect(push).not.toHaveBeenCalled();
      expect(result.current.saveError).toBe('Local storage is full.');
    });

    it('routes once the draft is safely persisted', async () => {
      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      act(() => result.current.change({ title: 'Saved then left' }));
      await act(async () => {
        await result.current.navigate('/courses/');
      });

      expect(push).toHaveBeenCalledWith('/courses/');
    });
  });

  describe('exporting an unsaved draft', () => {
    it('downloads the working copy under a filename derived from the course code', () => {
      const createObjectURL = vi.fn(() => 'blob:draft');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: createObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: revokeObjectURL,
      });
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));
      act(() => result.current.change({ title: 'Never persisted' }));
      act(() => result.current.exportUnsavedDraft());

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click.mock.instances[0]).toHaveProperty(
        'download',
        'calricula-unsaved-engl-101.json',
      );
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft');
      click.mockRestore();
    });
  });

  describe('derived hours', () => {
    it('recomputes total student hours from an hours edit but not from a title edit', () => {
      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      act(() => result.current.change({ title: 'Unrelated' }));
      expect(result.current.course.totalStudentHours).toBe('162');

      act(() => result.current.change({ labHours: '2' }));
      expect(result.current.course.totalStudentHours).toBe('198');
    });

    it('treats an unreadable hours value as zero rather than persisting NaN', () => {
      const { result } = renderSession(vi.fn().mockResolvedValue(undefined));

      act(() => result.current.change({ lectureHours: 'not a number' }));

      // 0 lecture + 0 lab + 0 activity + 0 TBA + 6 outside, across an 18-week
      // semester. A recovered or imported draft can carry a value the number
      // input never would, and "NaN" must not reach saveCourseAggregate.
      expect(result.current.course.totalStudentHours).toBe('108');
    });
  });
});
