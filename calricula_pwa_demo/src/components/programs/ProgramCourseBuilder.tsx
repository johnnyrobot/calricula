"use client";

import {
  ArrowDown,
  ArrowUp,
  BookPlus,
  Download,
  LoaderCircle,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Course,
  ProgramCourse,
  RequirementType,
} from "../../lib/domain";
import type { ProgramAggregate } from "../../lib/data";
import { registerPendingWorkFlusher } from "../../lib/pwa/pending-work";

interface CourseRow extends ProgramCourse {
  course: Course | null;
}

export interface ProgramRequirementRow {
  courseId: string;
  requirementType: RequirementType;
  sequence: number;
  unitsApplied: string;
}

export interface ProgramCourseBuilderProps {
  aggregate: ProgramAggregate;
  disabled?: boolean;
  /** Supplied by the screen that owns the reads. */
  availableCourses: readonly Course[];
  availableCoursesLoading?: boolean;
  /** Supplied by the screen that owns the writes. */
  onSaveRequirements: (
    programId: string,
    requirements: ProgramRequirementRow[],
  ) => Promise<unknown>;
}

const REQUIREMENT_TYPES: readonly RequirementType[] = [
  "Required Core",
  "List A",
  "List B",
  "GE",
];

type SaveState = "idle" | "saving" | "saved" | "error";

function requirementSaveFailure(caught: unknown): string {
  const message =
    caught instanceof Error
      ? caught.message
      : "Course requirements could not be saved.";
  const quotaFailure =
    (caught instanceof DOMException && caught.name === "QuotaExceededError") ||
    /quota|storage.+full|disk.+full/i.test(message);

  return quotaFailure
    ? "Local storage is full. These requirements remain in the editor. Retry the save or export the unsaved draft before leaving."
    : message;
}

export function ProgramCourseBuilder({
  aggregate,
  disabled = false,
  availableCourses,
  availableCoursesLoading = false,
  onSaveRequirements,
}: ProgramCourseBuilderProps) {
  const [rows, setRows] = useState<CourseRow[]>(aggregate.courses);
  const [courseId, setCourseId] = useState("");
  const [requirementType, setRequirementType] =
    useState<RequirementType>("Required Core");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const rowsRef = useRef<CourseRow[]>(aggregate.courses);
  const pendingRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const selectedIds = useMemo(
    () => new Set(rows.map((row) => row.courseId)),
    [rows],
  );
  const choices = availableCourses.filter(
    (course) => !selectedIds.has(course.id),
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savePromiseRef.current) return savePromiseRef.current;
    if (savedRevisionRef.current === pendingRevisionRef.current) return true;

    const promise = (async () => {
      while (savedRevisionRef.current !== pendingRevisionRef.current) {
        const revision = pendingRevisionRef.current;
        const snapshot = rowsRef.current;
        setSaveState("saving");
        setSaveError("");
        try {
          await onSaveRequirements(
            aggregate.program.id,
            snapshot.map((row, index) => ({
              courseId: row.courseId,
              requirementType: row.requirementType,
              sequence: index + 1,
              unitsApplied: row.unitsApplied,
            })),
          );
          savedRevisionRef.current = revision;
        } catch (caught) {
          setSaveState("error");
          setSaveError(requirementSaveFailure(caught));
          return false;
        }
      }
      setSaveState("saved");
      return true;
    })();

    savePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    }
  }, [aggregate.program.id, onSaveRequirements]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave();
    }, 900);
  }, [flushSave]);

  const changeRows = useCallback(
    (updater: (current: CourseRow[]) => CourseRow[]) => {
      const next = updater(rowsRef.current);
      rowsRef.current = next;
      setRows(next);
      pendingRevisionRef.current += 1;
      setSaveState("saving");
      setSaveError("");
      scheduleSave();
    },
    [scheduleSave],
  );

  const add = () => {
    const course = availableCourses.find((item) => item.id === courseId);
    if (!course) return;
    changeRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        programId: aggregate.program.id,
        courseId: course.id,
        requirementType,
        sequence: current.length + 1,
        unitsApplied: course.units,
        course,
      },
    ]);
    setCourseId("");
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    changeRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next.map((row, rowIndex) => ({
        ...row,
        sequence: rowIndex + 1,
      }));
    });
  };

  const exportUnsavedRequirements = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: "calricula-unsaved-program-requirements",
            exportedAt: new Date().toISOString(),
            programId: aggregate.program.id,
            requirements: rowsRef.current.map((row, index) => ({
              courseId: row.courseId,
              requirementType: row.requirementType,
              sequence: index + 1,
              unitsApplied: row.unitsApplied,
              course: row.course
                ? {
                    subjectCode: row.course.subjectCode,
                    courseNumber: row.course.courseNumber,
                    title: row.course.title,
                  }
                : null,
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `calricula-unsaved-program-requirements-${aggregate.program.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => registerPendingWorkFlusher(flushSave), [flushSave]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRevisionRef.current === savedRevisionRef.current) return;
      void flushSave();
      event.preventDefault();
      event.returnValue = "";
    };
    const pageHide = () => {
      if (pendingRevisionRef.current !== savedRevisionRef.current) {
        void flushSave();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRevisionRef.current !== savedRevisionRef.current) {
        void flushSave();
      }
    };
  }, [flushSave]);

  return (
    <section
      aria-labelledby="program-courses-title"
      className="luminous-card"
      data-testid="program-course-builder"
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-[var(--hairline)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow mb-1">Ordered requirements</p>
          <h2 className="text-xl" id="program-courses-title">
            Program courses
          </h2>
          <p className="mb-0 text-sm text-[var(--ink-soft)]">
            The applied units in this list determine the program total.
          </p>
        </div>
        <button
          className="luminous-button-primary"
          disabled={disabled || saveState === "saving"}
          onClick={() => void flushSave()}
          type="button"
        >
          {saveState === "saving" ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={17}
            />
          ) : (
            <Save aria-hidden="true" size={17} />
          )}
          {saveState === "saving" ? "Saving…" : "Save requirements"}
        </button>
      </div>

      {!disabled ? (
        <div className="mb-5 grid gap-3 border border-[var(--hairline)] bg-[var(--paper-deep)] p-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
          <div>
            <label className="luminous-label" htmlFor="program-add-course">
              Add a course
            </label>
            <select
              className="luminous-select"
              disabled={availableCoursesLoading}
              id="program-add-course"
              onChange={(event) => setCourseId(event.target.value)}
              value={courseId}
            >
              <option value="">Choose a course</option>
              {choices.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.subjectCode} {course.courseNumber} — {course.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="luminous-label" htmlFor="program-requirement-type">
              Requirement
            </label>
            <select
              className="luminous-select"
              id="program-requirement-type"
              onChange={(event) =>
                setRequirementType(event.target.value as RequirementType)
              }
              value={requirementType}
            >
              {REQUIREMENT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
          <button
            className="luminous-button-secondary"
            disabled={!courseId}
            onClick={add}
            type="button"
          >
            <BookPlus aria-hidden="true" size={17} />
            Add
          </button>
        </div>
      ) : null}

      {rows.length ? (
        <ol className="m-0 grid list-none gap-2 p-0">
          {rows.map((row, index) => (
            <li
              className="grid gap-3 border border-[var(--hairline)] bg-[var(--paper)] p-3 md:grid-cols-[3rem_minmax(0,1fr)_9rem_auto] md:items-center"
              key={`${row.courseId}-${index}`}
            >
              <span className="font-serif text-2xl text-[var(--gold-ink)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="mb-0 font-semibold">
                  {row.course
                    ? `${row.course.subjectCode} ${row.course.courseNumber} — ${row.course.title}`
                    : "Course record unavailable"}
                </p>
                <p className="mb-0 text-sm text-[var(--muted)]">
                  {row.requirementType}
                </p>
              </div>
              <label>
                <span className="luminous-label">Applied units</span>
                <input
                  className="luminous-input"
                  disabled={disabled}
                  inputMode="decimal"
                  onChange={(event) =>
                    changeRows((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, unitsApplied: event.target.value }
                          : item,
                      ),
                    )
                  }
                  value={row.unitsApplied}
                />
              </label>
              {!disabled ? (
                <div className="flex gap-1">
                  <button
                    aria-label={`Move ${row.course?.title ?? "course"} up`}
                    className="luminous-button-tertiary px-2"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={17} />
                  </button>
                  <button
                    aria-label={`Move ${row.course?.title ?? "course"} down`}
                    className="luminous-button-tertiary px-2"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={17} />
                  </button>
                  <button
                    aria-label={`Remove ${row.course?.title ?? "course"}`}
                    className="luminous-button-tertiary px-2 text-[var(--returned)]"
                    onClick={() =>
                      changeRows((current) =>
                        current
                          .filter((_, rowIndex) => rowIndex !== index)
                          .map((item, rowIndex) => ({
                            ...item,
                            sequence: rowIndex + 1,
                          })),
                      )
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No courses are assigned to this program yet.
        </p>
      )}

      {saveState !== "idle" ? (
        <div
          aria-live={saveState === "error" ? "assertive" : "polite"}
          className={`mt-3 text-sm ${saveState === "error" ? "text-[var(--returned)]" : ""}`}
          role={saveState === "error" ? "alert" : "status"}
        >
          <p className="mb-0 font-semibold">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Save failed"}
          </p>
          {saveState === "saved" ? (
            <p className="mb-0 mt-1">Course requirements saved.</p>
          ) : null}
          {saveError ? <p className="mb-0 mt-1">{saveError}</p> : null}
          {saveState === "error" ? (
            <div className="setting-actions mt-3">
              <button
                className="luminous-button-secondary"
                onClick={() => void flushSave()}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={17} />
                Retry save
              </button>
              <button
                className="luminous-button-secondary"
                onClick={exportUnsavedRequirements}
                type="button"
              >
                <Download aria-hidden="true" size={17} />
                Export unsaved draft
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
