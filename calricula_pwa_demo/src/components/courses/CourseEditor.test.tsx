import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseAggregate } from '@/lib/domain';
import { courseDraftRecoveryKey } from '@/lib/pwa/course-draft-recovery';
import { flushPendingWork } from '@/lib/pwa/pending-work';
import { CourseEditor } from './CourseEditor';
import type { ComplianceAuditView, CourseViewModel } from './types';

const push = vi.fn();
const router = { push };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/components/ai/CourseAIControls', () => ({
  CourseAIControls: () => null,
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

const audit: ComplianceAuditView = {
  overallStatus: 'warn',
  complianceScore: 0,
  totalChecks: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  results: [],
};

function renderEditor(
  onSave: (value: CourseViewModel) => Promise<void>,
  options: {
    canSubmitForReview?: boolean;
    submitDisabledReason?: string | null;
    onSubmitForReview?: () => Promise<void>;
    initialCourse?: CourseViewModel;
  } = {},
) {
  const initialCourse = options.initialCourse ?? course();
  const element = (value: CourseViewModel) => (
    <CourseEditor
      initialCourse={value}
      aggregate={{ course: value } as unknown as CourseAggregate}
      departments={[
        {
          id: 'department-1',
          divisionId: 'division-1',
          code: 'ENGL',
          name: 'English',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ]}
      courseOptions={[]}
      ccnMatches={[]}
      topCodes={[
        {
          id: '33333333-3333-4333-8333-333333333333',
          code: '1501.00',
          title: 'English',
          vocational: false,
          parentCode: null,
        },
      ]}
      audit={audit}
      onSave={onSave}
      onAddComment={vi.fn()}
      onResolveComment={vi.fn()}
      onSubmitForReview={options.onSubmitForReview ?? vi.fn()}
      canSubmitForReview={options.canSubmitForReview ?? true}
      submitDisabledReason={options.submitDisabledReason}
    />
  );
  const result = render(element(initialCourse));
  return {
    ...result,
    rerenderCourse(value: CourseViewModel) {
      result.rerender(element(value));
    },
  };
}

describe('CourseEditor autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: undefined,
    });
    window.localStorage.clear();
  });

  it('shows saving feedback and persists the latest snapshot after the debounce', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Critical Reading and Composition' },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Critical Reading and Composition',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('flushes pending changes before breadcrumb navigation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Writing About Literature' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Courses' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Writing About Literature',
    });
    expect(push).toHaveBeenCalledWith('/courses/');
  });

  it('flushes before another internal app link can leave the editor', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);
    const settingsLink = document.createElement('a');
    settingsLink.href = '/settings/';
    settingsLink.textContent = 'Settings';
    document.body.appendChild(settingsLink);

    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Argument and Research' },
    });
    fireEvent.click(settingsLink);

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/settings/');
    settingsLink.remove();
  });

  it('intercepts browser history navigation until pending changes are saved', async () => {
    const interceptedHandlers: Array<() => Promise<void>> = [];
    let navigateListener: ((event: unknown) => void) | undefined;
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: {
        addEventListener: (
          _type: string,
          listener: (event: unknown) => void,
        ) => {
          navigateListener = listener;
        },
        removeEventListener: vi.fn(),
      },
    });
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Research and Argument' },
    });
    navigateListener?.({
      canIntercept: true,
      downloadRequest: null,
      hashChange: false,
      destination: { url: 'https://example.test/dashboard/' },
      intercept: ({ handler }: { handler: () => Promise<void> }) => {
        interceptedHandlers.push(handler);
      },
    });

    expect(interceptedHandlers).toHaveLength(1);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await interceptedHandlers[0]();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Research and Argument',
    });
  });

  it('keeps the draft in place and exposes a retry when persistence fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Local storage is full.'));
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Writing in the Disciplines' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Save error');
    expect(screen.getByRole('alert')).toHaveTextContent('Local storage is full.');
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export unsaved draft' }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('reports a failed submission in the same alert the save errors use', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave, {
      onSubmitForReview: vi
        .fn()
        .mockRejectedValue(new Error('Department review is closed for this term.')),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Department review is closed for this term.',
    );
  });

  it('disables draft submission and explains the active persona policy', () => {
    renderEditor(vi.fn().mockResolvedValue(undefined), {
      canSubmitForReview: false,
      submitDisabledReason:
        "Only a Faculty persona or this record's owner can submit the draft for department review.",
    });

    const submit = screen.getByRole('button', { name: 'Submit for review' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(
      "Only a Faculty persona or this record's owner can submit the draft for department review.",
    );
  });

  it('adopts a clean live-query update from another tab', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editor = renderEditor(onSave);

    editor.rerenderCourse({
      ...course(),
      title: 'Title saved in another tab',
      updatedAt: '2026-07-29T01:00:00.000Z',
    });

    expect(screen.getByLabelText('Official course title')).toHaveValue(
      'Title saved in another tab',
    );
    expect(
      screen.queryByText('This course changed in another tab.'),
    ).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('pauses autosave on a dirty cross-tab conflict and lets the user reload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editor = renderEditor(onSave);
    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'My unsaved title' },
    });

    editor.rerenderCourse({
      ...course(),
      title: 'New title from another tab',
      updatedAt: '2026-07-29T01:00:00.000Z',
    });

    expect(screen.getByLabelText('Official course title')).toHaveValue(
      'My unsaved title',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Autosave is paused',
    );
    expect(
      screen.getByRole('button', { name: "Reload other tab's changes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep and save my draft' }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: "Reload other tab's changes" }),
    );
    expect(screen.getByLabelText('Official course title')).toHaveValue(
      'New title from another tab',
    );
    expect(
      screen.queryByText('This course changed in another tab.'),
    ).not.toBeInTheDocument();
  });

  it('only overwrites a newer cross-tab value after explicit confirmation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editor = renderEditor(onSave);
    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'My chosen local title' },
    });
    editor.rerenderCourse({
      ...course(),
      title: 'Other tab title',
      updatedAt: '2026-07-29T01:00:00.000Z',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Keep and save my draft' }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My chosen local title' }),
    );
    expect(
      screen.queryByText('This course changed in another tab.'),
    ).not.toBeInTheDocument();
  });

  it('restores a crash-recovery draft after an immediate reload and clears it after save', async () => {
    const interruptedSave = vi.fn(
      () => new Promise<void>(() => undefined),
    );
    const first = renderEditor(interruptedSave);
    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: 'Recovered after reload' },
    });
    expect(
      window.localStorage.getItem(courseDraftRecoveryKey('course-1')),
    ).toContain('Recovered after reload');
    first.unmount();

    const resumedSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(resumedSave);
    expect(screen.getByLabelText('Official course title')).toHaveValue(
      'Recovered after reload',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(resumedSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Recovered after reload' }),
    );
    expect(
      window.localStorage.getItem(courseDraftRecoveryKey('course-1')),
    ).toBeNull();
  });
});

/**
 * The editor saves on five paths that no click can reach: tab close, page
 * hide, legacy history navigation, unmount, and a flush requested by another
 * part of the shell. Each is pinned here because each has to survive any
 * change to where the draft session lives.
 */
describe('CourseEditor exit paths', () => {
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

  function editTitle(title: string) {
    fireEvent.change(screen.getByLabelText('Official course title'), {
      target: { value: title },
    });
  }

  it('saves and warns the browser when a dirty editor is unloaded', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);
    editTitle('Closed before the debounce');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets a clean editor unload without saving or warning', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(onSave).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('saves when the page is hidden, which is the only signal a mobile tab gives', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);
    editTitle('Backgrounded on a phone');

    window.dispatchEvent(new Event('pagehide'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Backgrounded on a phone',
    });
  });

  it('saves on legacy history navigation when the Navigation API is absent', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);
    editTitle('Back button, old browser');

    window.dispatchEvent(new Event('popstate'));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('saves a pending draft when the editor unmounts', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editor = renderEditor(onSave);
    editTitle('Unmounted mid-edit');

    editor.unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Unmounted mid-edit',
    });
  });

  it('answers a shell-wide flush request and reports whether the draft was saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor(onSave);
    editTitle('Saved before a demo reset');

    await act(async () => {
      await expect(flushPendingWork()).resolves.toBe(true);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('reports a failed flush so the shell can refuse to destroy the draft', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Local storage is full.'));
    const editor = renderEditor(onSave);
    editTitle('Must survive a reset');

    await act(async () => {
      await expect(flushPendingWork()).resolves.toBe(false);
    });

    editor.unmount();
  });

  it('stops saving once unmounted', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editor = renderEditor(onSave);
    editTitle('Only saved once');
    editor.unmount();
    onSave.mockClear();

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('popstate'));

    expect(onSave).not.toHaveBeenCalled();
  });
});
