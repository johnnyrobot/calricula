"use client";

import { LoaderCircle, Sparkles, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  curriculumRepository,
  type CurriculumReads,
} from "../../lib/data";
import type { EntityType } from "../../lib/domain";

import { AIChatPanel } from "./AIChatPanel";

// Narrowed from the role rather than the 34-method union: both verbs are
// reads, and naming the role is what ADR-0002 segmented the interface for.
// Still one import, so this is not the split across two or three role imports
// that ADR-0002's Alternative 6 rejected.
type ContextRepository = Pick<CurriculumReads, "getCourse" | "getProgram">;

export interface ContextualAIContext {
  context: Record<string, unknown>;
  contextLabel: string;
  entityType: EntityType | null;
  entityId: string | null;
}

function recordId(search: string): string | null {
  const value = new URLSearchParams(search).get("id")?.trim();
  return value || null;
}

export async function resolveContextualAIContext(
  pathname: string,
  search: string,
  currentPage: string,
  repository: ContextRepository = curriculumRepository,
): Promise<ContextualAIContext> {
  const id = recordId(search);
  const base = {
    product: "Calricula local-first curriculum demo",
    page: currentPage,
  };

  if (id && pathname.startsWith("/courses/")) {
    const aggregate = await repository.getCourse(id);
    if (aggregate) {
      const { course } = aggregate;
      return {
        entityType: "Course",
        entityId: course.id,
        contextLabel: `${course.subjectCode} ${course.courseNumber} — ${course.title}`,
        context: {
          ...base,
          recordType: "Course",
          course: {
            subjectCode: course.subjectCode,
            courseNumber: course.courseNumber,
            title: course.title,
            status: course.status,
            units: course.units,
            catalogDescription: course.catalogDescription,
            topCode: course.topCode,
            ccnCode: course.ccnCode,
          },
          studentLearningOutcomes: aggregate.slos
            .slice(0, 10)
            .map(({ sequence, outcomeText }) => ({
              sequence,
              outcomeText,
            })),
          contentOutline: aggregate.content
            .slice(0, 20)
            .map(({ sequence, topic, hoursAllocated }) => ({
              sequence,
              topic,
              hoursAllocated,
            })),
        },
      };
    }
  }

  if (id && pathname.startsWith("/programs/")) {
    const aggregate = await repository.getProgram(id);
    if (aggregate) {
      const { program } = aggregate;
      return {
        entityType: "Program",
        entityId: program.id,
        contextLabel: program.title,
        context: {
          ...base,
          recordType: "Program",
          program: {
            title: program.title,
            type: program.type,
            status: program.status,
            totalUnits: program.totalUnits,
            catalogDescription: program.catalogDescription,
            topCode: program.topCode,
            cipCode: program.cipCode,
            programNarrative: program.programNarrative,
          },
          requirements: aggregate.courses
            .slice(0, 30)
            .map(({ requirementType, sequence, unitsApplied, course }) => ({
              requirementType,
              sequence,
              unitsApplied,
              course: `${course.subjectCode} ${course.courseNumber} — ${course.title}`,
            })),
        },
      };
    }
  }

  return {
    entityType: null,
    entityId: null,
    contextLabel: currentPage,
    context: base,
  };
}

export interface ContextualAssistantProps {
  actorId?: string | null;
  currentPage: string;
  pathname: string;
}

export function ContextualAssistant({
  actorId = null,
  currentPage,
  pathname,
}: ContextualAssistantProps) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<ContextualAIContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setResolved(null);
      setContextError(null);
      try {
        const context = await resolveContextualAIContext(
          pathname,
          window.location.search,
          currentPage,
        );
        if (active) setResolved(context);
      } catch {
        if (!active) return;
        setContextError(
          "The current record context could not be loaded. You can still ask a general curriculum question.",
        );
        setResolved({
          entityType: null,
          entityId: null,
          contextLabel: currentPage,
          context: {
            product: "Calricula local-first curriculum demo",
            page: currentPage,
          },
        });
      }
    });
    return () => {
      active = false;
    };
  }, [currentPage, open, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open contextual AI assistant"
        className="topbar-icon-button"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        title="Open contextual AI assistant"
        type="button"
      >
        <Sparkles aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button
            aria-label="Close contextual AI assistant"
            className="absolute inset-0 cursor-default bg-[rgba(18,26,43,0.48)]"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <aside
            aria-describedby="contextual-assistant-description"
            aria-labelledby="contextual-assistant-title"
            aria-modal="true"
            className="relative z-10 flex h-full w-full max-w-[42rem] flex-col overflow-y-auto border-l border-[var(--gold)] bg-[var(--parchment)] shadow-2xl"
            ref={panelRef}
            role="dialog"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--hairline)] bg-[var(--parchment)] px-5 py-4">
              <div>
                <p className="eyebrow mb-1">Contextual drafting desk</p>
                <h2 className="mb-1 text-2xl" id="contextual-assistant-title">
                  Curriculum assistant
                </h2>
                <p
                  className="mb-0 text-sm text-[var(--ink-soft)]"
                  id="contextual-assistant-description"
                >
                  Current-record context is sent only when you ask a question.
                  Chat is stored locally; the latest 10 messages are sent with
                  each follow-up so the provider can answer in context.
                </p>
              </div>
              <button
                aria-label="Close contextual AI assistant"
                className="luminous-button-tertiary shrink-0"
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                <X aria-hidden="true" size={18} />
                Close
              </button>
            </header>

            <div className="flex-1 p-5">
              {contextError ? (
                <p
                  className="border-l-2 border-[var(--gold)] pl-3 text-sm text-[var(--ink-soft)]"
                  role="status"
                >
                  {contextError}
                </p>
              ) : null}
              {!resolved ? (
                <div
                  className="flex min-h-48 items-center justify-center gap-3 text-sm text-[var(--muted)]"
                  role="status"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    size={18}
                  />
                  Preparing current-page context…
                </div>
              ) : actorId ? (
                <AIChatPanel
                  actorId={actorId}
                  context={resolved.context}
                  contextLabel={resolved.contextLabel}
                  conversationTitle={`${resolved.contextLabel} assistant`}
                  entityId={resolved.entityId}
                  entityType={resolved.entityType}
                />
              ) : (
                <p className="text-sm text-[var(--muted)]" role="status">
                  Loading the local demo perspective…
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
