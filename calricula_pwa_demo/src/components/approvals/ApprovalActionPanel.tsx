"use client";

import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  Actor,
  CourseAggregate,
  CourseStatus,
} from "../../lib/domain";
import { CourseAIControls } from "../ai";

import {
  canConfirmApprovalAction,
  getApprovalDecision,
} from "./workflow";

export interface ApprovalTransition {
  targetStatus: CourseStatus;
  comment: string | null;
  actorId: string;
}

export interface ApprovalActionPanelProps {
  aggregate: CourseAggregate;
  actor: Actor;
  /** Supplied by the route screen, which owns every repository write. */
  onTransition: (
    courseId: string,
    transition: ApprovalTransition,
  ) => Promise<unknown>;
  onComplete?: (status: CourseStatus) => void;
}

export function ApprovalActionPanel({
  aggregate,
  actor,
  onTransition,
  onComplete,
}: ApprovalActionPanelProps) {
  const decision = getApprovalDecision(aggregate.course.status, actor.role);
  const [intent, setIntent] = useState<"advance" | "return" | null>(null);
  const [comment, setComment] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetStatus = useMemo(
    () =>
      intent === "advance"
        ? decision?.advanceTo
        : intent === "return"
          ? decision?.returnTo
          : null,
    [decision, intent],
  );

  if (!decision) {
    return (
      <section className="luminous-card" data-testid="approval-action">
        <h2 className="text-xl">Review action unavailable</h2>
        <p className="mb-0 text-sm text-[var(--ink-soft)]">
          This course is not assigned to the active demo role at its current
          workflow stage.
        </p>
      </section>
    );
  }

  const confirm = async () => {
    if (
      !intent ||
      !targetStatus ||
      !canConfirmApprovalAction(intent, comment)
    ) {
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await onTransition(aggregate.course.id, {
        targetStatus,
        comment: comment.trim() || null,
        actorId: actor.id,
      });
      onComplete?.(targetStatus);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The workflow action could not be completed.",
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid gap-5">
      <section className="luminous-card" data-testid="approval-action">
        <p className="eyebrow mb-1">Recorded decision</p>
        <h2 className="text-xl">Complete this review stage</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Your choice updates the local workflow history. Returning a record
          requires a clear revision note for the faculty author.
        </p>

        <div className="mb-4">
          <label className="luminous-label" htmlFor="approval-review-note">
            Review note
            {intent === "return" ? " (required for return)" : " (optional)"}
          </label>
          <textarea
            aria-describedby={
              intent === "return" && !comment.trim()
                ? "approval-note-requirement"
                : undefined
            }
            className="luminous-textarea min-h-28"
            id="approval-review-note"
            onChange={(event) => setComment(event.target.value)}
            placeholder="Record the evidence reviewed or the revision needed…"
            value={comment}
          />
          {intent === "return" && !comment.trim() ? (
            <p
              className="mt-1 text-sm text-[var(--returned)]"
              id="approval-note-requirement"
            >
              Explain what must change before confirming the return.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="luminous-button-primary"
            onClick={() => {
              setIntent("advance");
              setError(null);
            }}
            type="button"
          >
            <ArrowRight aria-hidden="true" size={17} />
            {decision.advanceLabel}
          </button>
          <button
            className="luminous-button-secondary"
            onClick={() => {
              setIntent("return");
              setError(null);
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={17} />
            Return to faculty draft
          </button>
        </div>

        {intent && targetStatus ? (
          <div
            className="mt-5 border border-[var(--gold)] bg-[var(--gold-pale)] p-4"
            role="group"
            aria-label="Confirm workflow decision"
          >
            <p className="mb-1 font-semibold">
              Confirm move to {targetStatus}?
            </p>
            <p className="text-sm text-[var(--ink-soft)]">
              This action is recorded under {actor.fullName}. It cannot be
              mistaken for an AI action: you must confirm it here.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="luminous-button-primary"
                data-testid="confirm-transition"
                disabled={
                  working || !canConfirmApprovalAction(intent, comment)
                }
                onClick={() => void confirm()}
                type="button"
              >
                {working ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    size={17}
                  />
                ) : (
                  <CheckCircle2 aria-hidden="true" size={17} />
                )}
                {working ? "Recording…" : "Confirm decision"}
              </button>
              <button
                className="luminous-button-tertiary"
                disabled={working}
                onClick={() => setIntent(null)}
                type="button"
              >
                <X aria-hidden="true" size={17} />
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-4 border-l-2 border-[var(--returned)] pl-3 text-sm text-[var(--returned)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>

      <CourseAIControls
        context={{
          currentReviewStage: aggregate.course.status,
          reviewNote: comment,
        }}
        course={aggregate.course}
        onApply={(value) =>
          setComment(
            typeof value === "string"
              ? value
              : JSON.stringify(value, null, 2),
          )
        }
        task="compliance-explanation"
      />
    </div>
  );
}
