'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Link2,
  ListTree,
  MessageSquareText,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { CourseAggregate } from '@/lib/data';
import type { Department, TopCode } from '@/lib/domain';
import { courseDraftRecoveryKey } from '@/lib/pwa/course-draft-recovery';
import { registerPendingWorkFlusher } from '@/lib/pwa/pending-work';
import {
  CCNSection,
  ComplianceSection,
  ContentSection,
  OverviewSection,
  RequisitesSection,
  SLOSection,
} from './CourseEditorSections';
import {
  CourseBreadcrumb,
  CourseCode,
  CourseStatusBadge,
  SaveIndicator,
} from './CoursePrimitives';
import type {
  CCNMatchView,
  ComplianceAuditView,
  CourseEditorPatch,
  CourseViewModel,
  SaveState,
} from './types';

type TabId =
  | 'overview'
  | 'slos'
  | 'content'
  | 'requisites'
  | 'ccn'
  | 'compliance'
  | 'comments'
  | 'history';

const TABS: Array<{
  id: TabId;
  label: string;
  shortLabel: string;
  icon: typeof FileText;
}> = [
  { id: 'overview', label: 'Basic information', shortLabel: 'Basics', icon: FileText },
  { id: 'slos', label: 'Student learning outcomes', shortLabel: 'SLOs', icon: BookOpen },
  { id: 'content', label: 'Course content', shortLabel: 'Content', icon: ListTree },
  { id: 'requisites', label: 'Requisites', shortLabel: 'Requisites', icon: Link2 },
  { id: 'ccn', label: 'CCN and coding', shortLabel: 'CCN & coding', icon: FileCheck2 },
  { id: 'compliance', label: 'Compliance audit', shortLabel: 'Compliance', icon: ShieldCheck },
  { id: 'comments', label: 'Comments', shortLabel: 'Comments', icon: MessageSquareText },
  { id: 'history', label: 'History', shortLabel: 'History', icon: Clock3 },
];

interface NavigationDestinationLike {
  url: string;
}

interface NavigateEventLike extends Event {
  canIntercept: boolean;
  downloadRequest: string | null;
  hashChange: boolean;
  destination: NavigationDestinationLike;
  intercept(options: { handler: () => Promise<void> }): void;
}

interface NavigationLike {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void,
  ): void;
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void,
  ): void;
}

function calculateTotal(course: CourseViewModel) {
  return String(
    (Number(course.lectureHours || 0) +
      Number(course.labHours || 0) +
      Number(course.activityHours || 0) +
      Number(course.tbaHours || 0) +
      Number(course.outsideHours || 0)) *
      18,
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function normalizedDecimal(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function withoutPersistenceId<T extends { id: string }>(
  value: T,
): Omit<T, 'id'> {
  const copy: Partial<T> = { ...value };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}

/**
 * Compares editable meaning rather than persistence-only IDs and timestamps.
 * A successful local save may replace temporary child IDs, so those are
 * normalized to their sequence before deciding that another tab changed data.
 */
function editableFingerprint(value: CourseViewModel) {
  const sloSequence = new Map(
    value.slos.map((slo) => [slo.id, slo.sequence] as const),
  );
  return JSON.stringify({
    id: value.id,
    subjectCode: value.subjectCode,
    courseNumber: value.courseNumber,
    title: value.title,
    departmentId: value.departmentId,
    catalogDescription: value.catalogDescription,
    units: normalizedDecimal(value.units),
    lectureHours: normalizedDecimal(value.lectureHours),
    labHours: normalizedDecimal(value.labHours),
    activityHours: normalizedDecimal(value.activityHours),
    tbaHours: normalizedDecimal(value.tbaHours),
    outsideHours: normalizedDecimal(value.outsideHours),
    totalStudentHours: normalizedDecimal(value.totalStudentHours),
    status: value.status,
    version: value.version,
    effectiveTerm: value.effectiveTerm,
    topCode: value.topCode,
    cId: value.cId,
    ccnCode: value.ccnCode,
    ccnCandidateCode: value.ccnCandidateCode,
    ccnDisposition: value.ccnDisposition,
    ccnJustification: value.ccnJustification,
    slos: value.slos.map(withoutPersistenceId),
    contentItems: value.contentItems.map((item) => ({
      ...withoutPersistenceId(item),
      hours: normalizedDecimal(item.hours),
      linkedSloIds: item.linkedSloIds.map(
        (sloId) => sloSequence.get(sloId) ?? sloId,
      ),
    })),
    requisites: value.requisites.map(withoutPersistenceId),
  });
}

interface CourseDraftRecovery {
  kind: 'calricula-course-draft-recovery';
  courseId: string;
  sourceUpdatedAt: string;
  capturedAt: string;
  course: CourseViewModel;
}

function readDraftRecovery(courseId: string): CourseDraftRecovery | null {
  try {
    const raw = window.localStorage.getItem(courseDraftRecoveryKey(courseId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CourseDraftRecovery>;
    if (
      value.kind !== 'calricula-course-draft-recovery' ||
      value.courseId !== courseId ||
      typeof value.sourceUpdatedAt !== 'string' ||
      !value.course ||
      value.course.id !== courseId ||
      !Array.isArray(value.course.slos) ||
      !Array.isArray(value.course.contentItems) ||
      !Array.isArray(value.course.requisites)
    ) {
      window.localStorage.removeItem(courseDraftRecoveryKey(courseId));
      return null;
    }
    return value as CourseDraftRecovery;
  } catch {
    return null;
  }
}

function persistDraftRecovery(
  course: CourseViewModel,
  sourceUpdatedAt: string,
): void {
  try {
    const recovery: CourseDraftRecovery = {
      kind: 'calricula-course-draft-recovery',
      courseId: course.id,
      sourceUpdatedAt,
      capturedAt: new Date().toISOString(),
      course,
    };
    window.localStorage.setItem(
      courseDraftRecoveryKey(course.id),
      JSON.stringify(recovery),
    );
  } catch {
    // IndexedDB autosave and manual export remain available if this storage is blocked.
  }
}

function clearDraftRecovery(courseId: string): void {
  try {
    window.localStorage.removeItem(courseDraftRecoveryKey(courseId));
  } catch {
    // A stale recovery entry is harmless and will be compared before reuse.
  }
}

export function CourseEditor({
  initialCourse,
  aggregate,
  departments,
  courseOptions,
  ccnMatches,
  topCodes,
  audit,
  onSave,
  onAddComment,
  onResolveComment,
  onSubmitForReview,
  canSubmitForReview,
  submitDisabledReason,
}: {
  initialCourse: CourseViewModel;
  aggregate: CourseAggregate;
  departments: Department[];
  courseOptions: CourseViewModel[];
  ccnMatches: CCNMatchView[];
  topCodes: TopCode[];
  audit: ComplianceAuditView;
  onSave: (course: CourseViewModel) => Promise<void>;
  onAddComment: (section: string, content: string) => Promise<void>;
  onResolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  onSubmitForReview: () => Promise<void>;
  canSubmitForReview: boolean;
  submitDisabledReason?: string | null;
}) {
  const router = useRouter();
  const [course, setCourse] = useState(initialCourse);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [commentSection, setCommentSection] = useState('General');
  const [commentError, setCommentError] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentActionId, setCommentActionId] = useState<string | null>(null);
  const [commentActionError, setCommentActionError] = useState('');
  const [externalUpdate, setExternalUpdate] =
    useState<CourseViewModel | null>(null);
  const snapshotRef = useRef(initialCourse);
  const sourceFingerprintRef = useRef(editableFingerprint(initialCourse));
  const sourceUpdatedAtRef = useRef(initialCourse.updatedAt);
  const externalUpdateRef = useRef<CourseViewModel | null>(null);
  const recoveryCheckedRef = useRef(false);
  const pendingRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const comments = initialCourse.comments;
  const history = initialCourse.history;

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (externalUpdateRef.current) {
      setSaveState('conflict');
      return false;
    }
    if (savePromiseRef.current) return savePromiseRef.current;
    if (savedRevisionRef.current === pendingRevisionRef.current) return true;

    const promise = (async () => {
      while (savedRevisionRef.current !== pendingRevisionRef.current) {
        const revision = pendingRevisionRef.current;
        const snapshot = snapshotRef.current;
        setSaveState('saving');
        setSaveError('');
        try {
          await onSave(snapshot);
          savedRevisionRef.current = revision;
          if (
            pendingRevisionRef.current === revision &&
            editableFingerprint(snapshotRef.current) ===
              editableFingerprint(snapshot)
          ) {
            clearDraftRecovery(snapshot.id);
          }
        } catch (error) {
          setSaveState('error');
          setSaveError(
            error instanceof Error ? error.message : 'Changes could not be saved.',
          );
          return false;
        }
      }
      setSaveState('saved');
      window.setTimeout(() => {
        if (pendingRevisionRef.current === savedRevisionRef.current) setSaveState('idle');
      }, 2200);
      return true;
    })();
    savePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    }
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave();
    }, 900);
  }, [flushSave]);

  const exportUnsavedDraft = () => {
    const snapshot = snapshotRef.current;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: 'calricula-unsaved-course-draft',
            exportedAt: new Date().toISOString(),
            course: snapshot,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeCode = `${snapshot.subjectCode}-${snapshot.courseNumber}`
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    anchor.href = url;
    anchor.download = `calricula-unsaved-${safeCode || 'course'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const changeCourse = useCallback(
    (patch: CourseEditorPatch) => {
      setCourse((current) => {
        let next = { ...current, ...patch };
        const hoursChanged = [
          'lectureHours',
          'labHours',
          'activityHours',
          'tbaHours',
          'outsideHours',
        ].some((field) => field in patch);
        if (hoursChanged) {
          next = {
            ...next,
            totalStudentHours: calculateTotal(next),
          };
        }
        snapshotRef.current = next;
        persistDraftRecovery(next, sourceUpdatedAtRef.current);
        return next;
      });
      pendingRevisionRef.current += 1;
      setSaveState(externalUpdateRef.current ? 'conflict' : 'saving');
      setSaveError('');
      if (!externalUpdateRef.current) scheduleSave();
    },
    [scheduleSave],
  );

  useEffect(() => {
    const incomingFingerprint = editableFingerprint(initialCourse);
    if (incomingFingerprint === sourceFingerprintRef.current) return;

    const localFingerprint = editableFingerprint(snapshotRef.current);
    const hasPendingLocalChanges =
      pendingRevisionRef.current !== savedRevisionRef.current ||
      savePromiseRef.current !== null;

    if (localFingerprint === incomingFingerprint || !hasPendingLocalChanges) {
      sourceFingerprintRef.current = incomingFingerprint;
      sourceUpdatedAtRef.current = initialCourse.updatedAt;
      snapshotRef.current = initialCourse;
      setCourse(initialCourse);
      externalUpdateRef.current = null;
      setExternalUpdate(null);
      if (!hasPendingLocalChanges) setSaveState('idle');
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    externalUpdateRef.current = initialCourse;
    setExternalUpdate(initialCourse);
    setSaveState('conflict');
  }, [initialCourse]);

  useEffect(() => {
    if (recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    const recovery = readDraftRecovery(initialCourse.id);
    if (!recovery) return;
    if (
      editableFingerprint(recovery.course) ===
      editableFingerprint(initialCourse)
    ) {
      clearDraftRecovery(initialCourse.id);
      return;
    }

    snapshotRef.current = recovery.course;
    // Browser recovery is an external system and can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourse(recovery.course);
    pendingRevisionRef.current += 1;
    setSaveError('');

    if (recovery.sourceUpdatedAt === initialCourse.updatedAt) {
      setSaveState('saving');
      scheduleSave();
      return;
    }

    externalUpdateRef.current = initialCourse;
    setExternalUpdate(initialCourse);
    setSaveState('conflict');
  }, [initialCourse, scheduleSave]);

  const reloadExternalUpdate = () => {
    const incoming = externalUpdateRef.current;
    if (!incoming) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    sourceFingerprintRef.current = editableFingerprint(incoming);
    sourceUpdatedAtRef.current = incoming.updatedAt;
    snapshotRef.current = incoming;
    savedRevisionRef.current = pendingRevisionRef.current;
    externalUpdateRef.current = null;
    setExternalUpdate(null);
    setCourse(incoming);
    clearDraftRecovery(incoming.id);
    setSaveError('');
    setSaveState('idle');
  };

  const keepAndSaveLocalDraft = async () => {
    const incoming = externalUpdateRef.current;
    if (!incoming) return;
    sourceFingerprintRef.current = editableFingerprint(incoming);
    sourceUpdatedAtRef.current = incoming.updatedAt;
    externalUpdateRef.current = null;
    setExternalUpdate(null);
    setSaveState('saving');
    await flushSave();
  };

  useEffect(() => {
    return registerPendingWorkFlusher(flushSave);
  }, [flushSave]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRevisionRef.current !== savedRevisionRef.current) {
        void flushSave();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const pageHide = () => {
      if (pendingRevisionRef.current !== savedRevisionRef.current) void flushSave();
    };
    const navigation = (
      window as Window & { navigation?: NavigationLike }
    ).navigation;
    const waitForSaveBeforeNavigation = (event: NavigateEventLike) => {
      if (
        pendingRevisionRef.current === savedRevisionRef.current ||
        !event.canIntercept ||
        event.downloadRequest ||
        event.hashChange
      ) {
        return;
      }
      event.intercept({
        handler: async () => {
          const saved = await flushSave();
          if (!saved) {
            throw new Error('Navigation stopped because the course could not be saved.');
          }
        },
      });
    };
    const flushOnLegacyHistoryNavigation = () => {
      if (
        !navigation &&
        pendingRevisionRef.current !== savedRevisionRef.current
      ) {
        void flushSave();
      }
    };
    const followInternalLinkAfterSave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        pendingRevisionRef.current === savedRevisionRef.current
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
      const href = anchor?.getAttribute('href');
      if (
        !anchor ||
        !href?.startsWith('/') ||
        anchor.target ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      event.preventDefault();
      void flushSave().then((saved) => {
        if (saved) router.push(href);
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    navigation?.addEventListener('navigate', waitForSaveBeforeNavigation);
    window.addEventListener('popstate', flushOnLegacyHistoryNavigation);
    document.addEventListener('click', followInternalLinkAfterSave, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
      navigation?.removeEventListener('navigate', waitForSaveBeforeNavigation);
      window.removeEventListener('popstate', flushOnLegacyHistoryNavigation);
      document.removeEventListener('click', followInternalLinkAfterSave, true);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRevisionRef.current !== savedRevisionRef.current) void flushSave();
    };
  }, [flushSave, router]);

  const navigate = async (href: string) => {
    if (await flushSave()) router.push(href);
  };

  const selectTab = async (tab: TabId) => {
    await flushSave();
    setActiveTab(tab);
  };

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, current: number) => {
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
    void selectTab(TABS[next].id);
  };

  const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
  const addComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = comment.trim();
    if (!content) {
      setCommentError('Enter a comment before posting.');
      return;
    }
    setCommentBusy(true);
    setCommentError('');
    try {
      await onAddComment(commentSection, content);
      setComment('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be posted.');
    } finally {
      setCommentBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!canSubmitForReview) return;
    const saved = await flushSave();
    if (!saved) return;
    setSubmitting(true);
    setSaveError('');
    try {
      await onSubmitForReview();
      router.push(`/courses/view/?id=${encodeURIComponent(course.id)}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The draft could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCommentResolved = async (commentId: string, resolved: boolean) => {
    setCommentActionId(commentId);
    setCommentActionError('');
    try {
      await onResolveComment(commentId, resolved);
    } catch (error) {
      setCommentActionError(
        error instanceof Error ? error.message : 'The comment could not be updated.',
      );
    } finally {
      setCommentActionId(null);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewSection
            course={course}
            aggregate={aggregate}
            departments={departments}
            onChange={changeCourse}
          />
        );
      case 'slos':
        return <SLOSection course={course} aggregate={aggregate} onChange={changeCourse} />;
      case 'content':
        return <ContentSection course={course} aggregate={aggregate} onChange={changeCourse} />;
      case 'requisites':
        return (
          <RequisitesSection
            course={course}
            courseOptions={courseOptions}
            circularError={/circular/i.test(saveError) ? saveError : undefined}
            onChange={changeCourse}
          />
        );
      case 'ccn':
        return (
          <CCNSection
            course={course}
            aggregate={aggregate}
            matches={ccnMatches}
            topCodes={topCodes}
            onChange={changeCourse}
          />
        );
      case 'compliance':
        return <ComplianceSection audit={audit} aggregate={aggregate} />;
      case 'comments':
        return (
          <div className="space-y-7">
            <header className="border-b border-hairline pb-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">
                Faculty and reviewer thread
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">Comments</h2>
              <p className="mt-2 font-sans text-sm leading-6 text-muted">
                Comments are attached to the current editor section and retained with the local record.
              </p>
            </header>
            <form onSubmit={addComment} className="border border-hairline bg-surface p-5">
              <label htmlFor="course-comment-section" className="luminous-label">
                Outline section
              </label>
              <select
                id="course-comment-section"
                value={commentSection}
                onChange={(event) => setCommentSection(event.target.value)}
                className="luminous-select mb-4"
              >
                <option>General</option>
                {TABS.filter((tab) => tab.id !== 'comments' && tab.id !== 'history').map(
                  (tab) => (
                    <option key={tab.id} value={tab.shortLabel}>
                      {tab.shortLabel}
                    </option>
                  ),
                )}
              </select>
              <label htmlFor="new-course-comment" className="luminous-label">
                Comment
              </label>
              <textarea
                id="new-course-comment"
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setCommentError('');
                }}
                rows={4}
                className="luminous-textarea"
                aria-invalid={Boolean(commentError)}
                aria-describedby={commentError ? 'new-course-comment-error' : undefined}
              />
              {commentError ? (
                <p id="new-course-comment-error" role="alert" className="mt-2 text-sm text-seal-returned">
                  {commentError}
                </p>
              ) : null}
              <button type="submit" disabled={commentBusy} className="luminous-button-primary mt-4">
                <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                {commentBusy ? 'Posting…' : 'Post comment'}
              </button>
            </form>
            {commentActionError ? (
              <p
                className="border border-seal-returned bg-seal-returned/5 px-4 py-3 font-sans text-sm text-seal-returned"
                role="alert"
              >
                {commentActionError}
              </p>
            ) : null}
            {comments.length ? (
              <ol className="space-y-3">
                {comments.map((entry) => (
                  <li key={entry.id} className="border border-hairline bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-sans text-sm font-semibold text-ink">{entry.authorName}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                          {entry.authorRole} · {entry.section} · {formatDate(entry.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleCommentResolved(entry.id, !entry.resolved)
                        }
                        disabled={commentActionId !== null}
                        className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-navy hover:underline"
                      >
                        {entry.resolved ? <RotateCcw aria-hidden="true" className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        {commentActionId === entry.id
                          ? 'Updating…'
                          : entry.resolved
                            ? 'Reopen'
                            : 'Resolve'}
                      </button>
                    </div>
                    <p className={`mt-3 font-sans text-sm leading-6 ${entry.resolved ? 'text-muted line-through' : 'text-ink-soft'}`}>
                      {entry.body}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-hairline-strong p-8 text-center text-sm text-muted">
                No comments have been posted.
              </p>
            )}
          </div>
        );
      case 'history':
        return (
          <div className="space-y-7">
            <header className="border-b border-hairline pb-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">
                Immutable activity log
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">Course history</h2>
              <p className="mt-2 font-sans text-sm leading-6 text-muted">
                Workflow transitions are retained with the outline for review context and provenance.
              </p>
            </header>
            {history.length ? (
              <ol className="relative ml-2 border-l border-hairline-strong pl-7">
                {history.map((entry) => (
                  <li key={entry.id} className="relative pb-7 last:pb-0">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[33px] top-1.5 h-2.5 w-2.5 border border-gold bg-surface"
                    />
                    <p className="font-sans text-sm font-semibold text-ink">{entry.action}</p>
                    <p className="mt-1 font-sans text-sm leading-6 text-ink-soft">{entry.detail}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted">
                      {entry.actorName} · {formatDate(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-hairline-strong p-8 text-center text-sm text-muted">
                No history events are available.
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div>
      <CourseBreadcrumb onBack={() => void navigate('/courses/')}>
        <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} /> / Edit
      </CourseBreadcrumb>

      <header className="mb-5 border-y-2 border-t-navy border-b-hairline-strong bg-surface px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-gold-ink">
                Course Outline Editor
              </p>
              <CourseStatusBadge status={course.status} />
            </div>
            <h1 className="mt-2 truncate font-serif text-2xl font-semibold text-ink sm:text-3xl">
              <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} />
              <span aria-hidden="true"> — </span>
              {course.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SaveIndicator state={saveState} />
            {saveState === 'error' ? (
              <>
                <button type="button" onClick={() => void flushSave()} className="luminous-button-secondary">
                  <Save aria-hidden="true" className="h-4 w-4" />
                  Retry save
                </button>
                <button type="button" onClick={exportUnsavedDraft} className="luminous-button-secondary">
                  <Download aria-hidden="true" className="h-4 w-4" />
                  Export unsaved draft
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void navigate(`/courses/view/?id=${encodeURIComponent(course.id)}`)}
              className="luminous-button-secondary"
            >
              Close editor
            </button>
            {course.status === 'Draft' ? (
              <button
                type="button"
                onClick={submitForReview}
                disabled={submitting || !canSubmitForReview}
                aria-describedby={
                  !canSubmitForReview && submitDisabledReason
                    ? 'course-submit-disabled-reason'
                    : undefined
                }
                className="luminous-button-primary"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            ) : null}
            {course.status === 'Draft' &&
            !canSubmitForReview &&
            submitDisabledReason ? (
              <p
                className="basis-full text-right font-sans text-xs leading-5 text-muted"
                id="course-submit-disabled-reason"
              >
                {submitDisabledReason}
              </p>
            ) : null}
          </div>
        </div>
        {saveError ? (
          <div className="mt-4 flex items-start gap-3 border border-seal-returned bg-seal-returned/5 px-4 py-3" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-seal-returned" />
            <p className="font-sans text-sm leading-6 text-seal-returned">{saveError}</p>
          </div>
        ) : null}
        {externalUpdate ? (
          <div
            className="mt-4 border border-gold bg-gold/10 px-4 py-4"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-gold-ink"
              />
              <div>
                <p className="font-sans text-sm font-semibold text-ink">
                  This course changed in another tab.
                </p>
                <p className="mt-1 font-sans text-sm leading-6 text-ink-soft">
                  Autosave is paused so this tab cannot overwrite the newer
                  local record. Reload the other tab&apos;s version, or
                  explicitly keep and save this draft.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="luminous-button-primary"
                    onClick={reloadExternalUpdate}
                    type="button"
                  >
                    Reload other tab&apos;s changes
                  </button>
                  <button
                    className="luminous-button-secondary"
                    onClick={() => void keepAndSaveLocalDraft()}
                    type="button"
                  >
                    Keep and save my draft
                  </button>
                  <button
                    className="luminous-button-tertiary"
                    onClick={exportUnsavedDraft}
                    type="button"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Export my draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="sticky top-4 hidden border border-hairline bg-surface xl:block">
          <div className="border-b border-hairline bg-surface-2 px-4 py-3">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Outline sections
            </p>
          </div>
          <div ref={tabListRef} role="tablist" aria-label="Course editor sections" aria-orientation="vertical">
            {TABS.map((tab, index) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  id={`course-editor-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`course-editor-panel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => void selectTab(tab.id)}
                  onKeyDown={(event) => moveTab(event, index)}
                  className={`flex min-h-12 w-full items-center gap-3 border-b border-hairline px-4 text-left font-sans text-sm last:border-b-0 ${
                    active
                      ? 'border-l-2 border-l-gold bg-navy/5 font-semibold text-navy'
                      : 'border-l-2 border-l-transparent text-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {tab.shortLabel}
                  {tab.id === 'comments' && comments.length ? (
                    <span className="ml-auto bg-gold px-1.5 py-0.5 font-mono text-[10px] text-navy">
                      {comments.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div>
          <div className="mb-4 xl:hidden">
            <label htmlFor="mobile-editor-section" className="luminous-label">
              Editor section
            </label>
            <select
              id="mobile-editor-section"
              value={activeTab}
              onChange={(event) => void selectTab(event.target.value as TabId)}
              className="luminous-select"
            >
              {TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.shortLabel}
                </option>
              ))}
            </select>
          </div>

          <section
            id={`course-editor-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`course-editor-tab-${activeTab}`}
            tabIndex={0}
            className="luminous-card min-h-[620px] p-5 focus:outline-none sm:p-8"
          >
            {renderTab()}
          </section>

          <nav
            aria-label="Editor section navigation"
            className="mt-4 flex items-center justify-between border border-hairline bg-surface px-4 py-3"
          >
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => void selectTab(TABS[currentIndex - 1].id)}
              className="luminous-button-secondary"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Previous
            </button>
            <span className="hidden font-mono text-xs text-muted sm:inline">
              {currentIndex + 1} / {TABS.length}
            </span>
            <button
              type="button"
              disabled={currentIndex === TABS.length - 1}
              onClick={() => void selectTab(TABS[currentIndex + 1].id)}
              className="luminous-button-primary"
            >
              Next
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
