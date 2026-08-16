"use client";

import {
  CircleAlert,
  Download,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { UpdateProgramInput } from "../../lib/domain";
import {
  curriculumRepository,
  useAllCourses,
  useProgram,
  useReferences,
} from "../../lib/data";
import {
  flushPendingWork,
  registerPendingWorkFlusher,
} from "../../lib/pwa/pending-work";
import { ProgramCourseBuilder } from "./ProgramCourseBuilder";
import {
  ProgramForm,
  type ProgramDraft,
  programToDraft,
} from "./ProgramForm";

type SaveState = "idle" | "saving" | "saved" | "error";

function toUpdateInput(draft: ProgramDraft): UpdateProgramInput {
  return {
    title: draft.title.trim(),
    type: draft.type,
    departmentId: draft.departmentId,
    catalogDescription: draft.catalogDescription.trim() || null,
    topCode: draft.topCode.trim() || null,
    cipCode: draft.cipCode.trim() || null,
    programNarrative: draft.programNarrative.trim() || null,
    isHighUnitMajor: draft.isHighUnitMajor,
  };
}

function saveFailureMessage(caught: unknown): string {
  const message =
    caught instanceof Error ? caught.message : "The program could not be saved.";
  const quotaFailure =
    (caught instanceof DOMException && caught.name === "QuotaExceededError") ||
    /quota|storage.+full|disk.+full/i.test(message);

  return quotaFailure
    ? "Local storage is full. This program remains in the editor. Retry the save or export the unsaved draft before leaving."
    : message;
}

export function ProgramEditor({ programId }: { programId: string }) {
  const aggregate = useProgram(programId);
  // The screen owns every read reaching the requirements builder below it.
  const saveRequirements = useCallback(
    (
      programId: string,
      requirements: Parameters<
        typeof curriculumRepository.reorderProgramCourses
      >[1],
    ) => curriculumRepository.reorderProgramCourses(programId, requirements),
    [],
  );
  const availableCourses = useAllCourses({
    sortBy: "courseCode",
    sortDirection: "asc",
  });
  const references = useReferences();
  const router = useRouter();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const draftRef = useRef<ProgramDraft | null>(null);
  const pendingRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

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
        const snapshot = draftRef.current;
        if (!snapshot) return true;

        setSaveState("saving");
        setSaveError("");
        try {
          await curriculumRepository.updateProgram(
            programId,
            toUpdateInput(snapshot),
          );
          savedRevisionRef.current = revision;
        } catch (caught) {
          setSaveState("error");
          setSaveError(saveFailureMessage(caught));
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
  }, [programId]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave();
    }, 900);
  }, [flushSave]);

  const changeDraft = useCallback(
    (draft: ProgramDraft) => {
      draftRef.current = draft;
      pendingRevisionRef.current += 1;
      setSaveState("saving");
      setSaveError("");
      scheduleSave();
    },
    [scheduleSave],
  );

  const saveNow = useCallback(
    async (draft: ProgramDraft) => {
      draftRef.current = draft;
      pendingRevisionRef.current += 1;
      setSaveState("saving");
      setSaveError("");
      await flushSave();
    },
    [flushSave],
  );

  const exportUnsavedDraft = () => {
    const draft =
      draftRef.current ??
      (aggregate.data ? programToDraft(aggregate.data.program) : null);
    if (!draft) return;

    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: "calricula-unsaved-program-draft",
            exportedAt: new Date().toISOString(),
            programId,
            draft,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeTitle = draft.title
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    anchor.href = url;
    anchor.download = `calricula-unsaved-${safeTitle || "program"}.json`;
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
    const followInternalLinkAfterSave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>("a[href]")
          : null;
      const href = anchor?.getAttribute("href");
      if (
        !anchor ||
        !href?.startsWith("/") ||
        anchor.target ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      event.preventDefault();
      void flushPendingWork().then((saved) => {
        if (saved) router.push(href);
      });
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("click", followInternalLinkAfterSave, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("click", followInternalLinkAfterSave, true);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRevisionRef.current !== savedRevisionRef.current) {
        void flushSave();
      }
    };
  }, [flushSave, router]);

  if (aggregate.loading || references.loading) {
    return <p role="status">Opening program record…</p>;
  }

  if (aggregate.error || references.error) {
    return (
      <div className="luminous-card" role="alert">
        <CircleAlert
          aria-hidden="true"
          className="text-[var(--returned)]"
        />
        <h1>The program record could not be opened</h1>
        <p>{aggregate.error?.message ?? references.error?.message}</p>
      </div>
    );
  }

  if (!aggregate.data || !references.data) {
    return (
      <div className="luminous-card" role="alert">
        <h1>Program not found</h1>
        <p>The local record may have been deleted or reset.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {saveState !== "idle" ? (
        <div
          aria-live={saveState === "error" ? "assertive" : "polite"}
          className={`callout ${saveState === "error" ? "callout--danger" : ""}`}
          role={saveState === "error" ? "alert" : "status"}
        >
          <p className="mb-0 font-semibold">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Save failed"}
          </p>
          {saveError ? <p className="mb-0 mt-1">{saveError}</p> : null}
          {saveState === "saving" ? (
            <LoaderCircle
              aria-hidden="true"
              className="mt-2 animate-spin"
              size={17}
            />
          ) : null}
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
                onClick={exportUnsavedDraft}
                type="button"
              >
                <Download aria-hidden="true" size={17} />
                Export unsaved draft
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ProgramForm
        aiContext={{
          courses: aggregate.data.courses.map((row) => ({
            requirementType: row.requirementType,
            sequence: row.sequence,
            unitsApplied: row.unitsApplied,
            subjectCode: row.course.subjectCode,
            courseNumber: row.course.courseNumber,
            title: row.course.title,
          })),
        }}
        departments={references.data.departments}
        initialProgram={aggregate.data.program}
        key={`program-form-${aggregate.data.program.id}`}
        mode="edit"
        onDraftChange={changeDraft}
        onSubmit={saveNow}
        saving={saveState === "saving"}
        topCodes={references.data.topCodes}
      />
      <ProgramCourseBuilder
        aggregate={aggregate.data}
        availableCourses={availableCourses.data}
        availableCoursesLoading={availableCourses.loading}
        disabled={aggregate.data.program.status === "Approved"}
        key={`program-courses-${aggregate.data.program.id}`}
        onSaveRequirements={saveRequirements}
      />
    </div>
  );
}
