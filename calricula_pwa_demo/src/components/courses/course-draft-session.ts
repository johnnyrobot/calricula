'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { courseDraftRecoveryKey } from '@/lib/pwa/course-draft-recovery';
import { registerPendingWorkFlusher } from '@/lib/pwa/pending-work';
import type {
  CourseEditorPatch,
  CourseViewModel,
  SaveState,
} from './types';

const AUTOSAVE_DEBOUNCE_MS = 900;
const SAVED_INDICATOR_MS = 2200;

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

/**
 * The editing session for one course draft: the working copy, when it is
 * written, and every way the user can leave before it has been.
 *
 * The editor gets a value it can render and four things it can ask for. It
 * does not schedule the autosave, decide when the draft is dirty, mirror the
 * draft to crash recovery, notice that another tab moved the record, or wire
 * the exit paths — those are the reason this session exists.
 *
 * Saving happens without a click on five paths: closing the tab
 * (`beforeunload`), hiding the page (`pagehide`), a Navigation API traversal,
 * a legacy `popstate`, and unmount. A sixth entry point is the shell's
 * `flushPendingWork`, which Settings and the PWA updater call before they
 * destroy local data. `CourseEditor.test.tsx` pins all six.
 */
export interface CourseDraftSession {
  /** The working copy to render. Not necessarily what is persisted. */
  course: CourseViewModel;
  /** Apply an edit, recompute derived hours, and schedule the save. */
  change: (patch: CourseEditorPatch) => void;
  saveState: SaveState;
  saveError: string;
  /**
   * Save now and resolve with whether the draft is safely persisted. Callers
   * that destroy or leave state must honour `false`.
   */
  flush: () => Promise<boolean>;
  /** Save, then route — the flush-aware replacement for `router.push`. */
  navigate: (href: string) => Promise<void>;
  /** The value another tab wrote, when it conflicts with unsaved local work. */
  externalUpdate: CourseViewModel | null;
  /** Resolve the conflict by discarding local work. */
  acceptExternalUpdate: () => void;
  /** Resolve the conflict by overwriting the other tab's value. */
  keepLocalDraft: () => Promise<void>;
  /** Download the unsaved working copy, the last resort when saving fails. */
  exportUnsavedDraft: () => void;
}

export function useCourseDraftSession({
  initialCourse,
  onSave,
}: {
  initialCourse: CourseViewModel;
  onSave: (course: CourseViewModel) => Promise<void>;
}): CourseDraftSession {
  const router = useRouter();
  const [course, setCourse] = useState(initialCourse);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
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

  /** Edits exist that no completed save has covered. */
  const hasUnsavedChanges = useCallback(
    () => pendingRevisionRef.current !== savedRevisionRef.current,
    [],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (externalUpdateRef.current) {
      setSaveState('conflict');
      return false;
    }
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!hasUnsavedChanges()) return true;

    const promise = (async () => {
      while (hasUnsavedChanges()) {
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
        if (!hasUnsavedChanges()) setSaveState('idle');
      }, SAVED_INDICATOR_MS);
      return true;
    })();
    savePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    }
  }, [hasUnsavedChanges, onSave]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  const change = useCallback(
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
    // Broader than `hasUnsavedChanges`, and deliberately so: a save that has
    // not returned may still be about to write, so adopting the other tab's
    // value here would race it. The exit paths ask the narrower question,
    // because an in-flight save is already doing the work they would start.
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

  const acceptExternalUpdate = useCallback(() => {
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
  }, []);

  const keepLocalDraft = useCallback(async () => {
    const incoming = externalUpdateRef.current;
    if (!incoming) return;
    sourceFingerprintRef.current = editableFingerprint(incoming);
    sourceUpdatedAtRef.current = incoming.updatedAt;
    externalUpdateRef.current = null;
    setExternalUpdate(null);
    setSaveState('saving');
    await flush();
  }, [flush]);

  useEffect(() => {
    return registerPendingWorkFlusher(flush);
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        void flush();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const pageHide = () => {
      if (hasUnsavedChanges()) void flush();
    };
    const navigation = (
      window as Window & { navigation?: NavigationLike }
    ).navigation;
    const waitForSaveBeforeNavigation = (event: NavigateEventLike) => {
      if (
        !hasUnsavedChanges() ||
        !event.canIntercept ||
        event.downloadRequest ||
        event.hashChange
      ) {
        return;
      }
      event.intercept({
        handler: async () => {
          const saved = await flush();
          if (!saved) {
            throw new Error('Navigation stopped because the course could not be saved.');
          }
        },
      });
    };
    const flushOnLegacyHistoryNavigation = () => {
      if (!navigation && hasUnsavedChanges()) {
        void flush();
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
        !hasUnsavedChanges()
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
      void flush().then((saved) => {
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
      if (hasUnsavedChanges()) void flush();
    };
  }, [flush, hasUnsavedChanges, router]);

  const navigate = useCallback(
    async (href: string) => {
      if (await flush()) router.push(href);
    },
    [flush, router],
  );

  const exportUnsavedDraft = useCallback(() => {
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
  }, []);

  return {
    course,
    change,
    saveState,
    saveError,
    flush,
    navigate,
    externalUpdate,
    acceptExternalUpdate,
    keepLocalDraft,
    exportUnsavedDraft,
  };
}
