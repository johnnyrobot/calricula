"use client";

import { type ReactNode, useId, useState } from "react";

import type { Course } from "../../lib/domain";
import {
  AI_COMPLIANCE_SOURCE_PACK,
  getAIComplianceSource,
} from "../../lib/ai";

import {
  AISuggestionPanel,
  type AISuggestionRequest,
} from "./AISuggestionPanel";

export type CourseAITask =
  | "catalog-description"
  | "slos"
  | "content-outline"
  | "top-code"
  | "compliance-explanation";

export interface CourseAIControlsProps {
  course: Course;
  task: CourseAITask;
  onApply: (value: unknown) => void | Promise<void>;
  context?: unknown;
  request?: AISuggestionRequest;
  tokenProvider?: () => Promise<string>;
}

function finiteNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function buildCourseAITaskInput(
  course: Course,
  task: CourseAITask,
  context?: unknown,
): Record<string, unknown> {
  const common = {
    subjectCode: course.subjectCode,
    courseNumber: course.courseNumber,
    title: course.title,
    catalogDescription: course.catalogDescription ?? "",
    units: finiteNumber(course.units),
  };

  if (task === "content-outline") {
    const instructionalHours = [
      course.lectureHours,
      course.labHours,
      course.activityHours,
      course.tbaHours,
    ]
      .map((value) => finiteNumber(value) ?? 0)
      .reduce((total, value) => total + value, 0);
    return {
      ...common,
      ...(instructionalHours > 0
        ? { contactHours: instructionalHours }
        : {}),
      ...(context === undefined ? {} : { context }),
    };
  }

  if (task === "compliance-explanation") {
    return {
      ...common,
      totalStudentLearningHours: finiteNumber(
        course.totalStudentLearningHours,
      ),
      lectureHours: finiteNumber(course.lectureHours),
      labHours: finiteNumber(course.labHours),
      activityHours: finiteNumber(course.activityHours),
      tbaHours: finiteNumber(course.tbaHours),
      outsideOfClassHours: finiteNumber(course.outsideOfClassHours),
      ...(context === undefined ? {} : { context }),
    };
  }

  return {
    ...common,
    topCode: course.topCode,
    ...(context === undefined ? {} : { context }),
  };
}

const TASK_COPY: Record<
  CourseAITask,
  { title: string; description: string }
> = {
  "catalog-description": {
    title: "Draft a catalog description",
    description:
      "Prepare concise public-facing language from the course record. Verify scope, prerequisites, transfer claims, and local style before applying.",
  },
  slos: {
    title: "Suggest student learning outcomes",
    description:
      "Propose observable outcomes with Bloom-aligned verbs. Faculty retain responsibility for rigor, assessment fit, and discipline accuracy.",
  },
  "content-outline": {
    title: "Sketch a content outline",
    description:
      "Organize representative topics from the current record. Check hours, sequencing, coverage, and alignment before applying.",
  },
  "top-code": {
    title: "Explore a TOP code",
    description:
      "Return a classification suggestion and rationale. Confirm the code against the current Chancellor’s Office taxonomy.",
  },
  "compliance-explanation": {
    title: "Explain a compliance finding",
    description:
      "Translate the selected finding into plain drafting guidance. This explanation is not a legal or approval determination.",
  },
};

export function unwrapCourseAITaskValue(
  task: CourseAITask,
  data: unknown,
): unknown | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  switch (task) {
    case "catalog-description":
      return typeof record.description === "string"
        ? record.description
        : null;
    case "slos":
      return Array.isArray(record.slos) ? record.slos : null;
    case "content-outline":
      return Array.isArray(record.topics) ? record.topics : null;
    case "top-code":
      return Array.isArray(record.suggestions)
        ? record.suggestions
        : null;
    case "compliance-explanation":
      return typeof record.explanation === "string" &&
        Array.isArray(record.recommendations) &&
        Array.isArray(record.citations) &&
        record.humanReviewRequired === true
        ? data
        : null;
  }
}

function renderCourseSuggestion(
  task: CourseAITask,
  value: unknown,
  topCodeSelection?: {
    name: string;
    selected: string | null;
    select: (code: string) => void;
  },
): ReactNode {
  if (typeof value === "string") {
    return <p className="mb-0 whitespace-pre-wrap leading-7">{value}</p>;
  }

  if (Array.isArray(value)) {
    if (
      task === "top-code" &&
      value.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).code === "string",
      )
    ) {
      return (
        <ol className="m-0 grid list-none gap-3 p-0">
          {value.map((item, index) => {
            const suggestion = item as Record<string, unknown>;
            const confidence =
              typeof suggestion.confidence === "number"
                ? `${Math.round(suggestion.confidence * 100)}% confidence`
                : null;
            return (
              <li
                className="border-l-2 border-[var(--gold)] pl-3"
                key={String(suggestion.code ?? index)}
              >
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    checked={
                      topCodeSelection?.selected ===
                      String(suggestion.code)
                    }
                    className="mt-1 accent-[var(--navy)]"
                    name={topCodeSelection?.name}
                    onChange={() =>
                      topCodeSelection?.select(String(suggestion.code))
                    }
                    type="radio"
                  />
                  <span>
                    <span className="mb-1 block font-semibold">
                      {String(suggestion.code)} —{" "}
                      {String(suggestion.title ?? "")}
                    </span>
                    <span className="mb-1 block text-sm">
                      {String(suggestion.rationale ?? "")}
                    </span>
                    {confidence ? (
                      <span className="block text-xs text-[var(--muted)]">
                        {confidence}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      );
    }

    if (
      task === "content-outline" &&
      value.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).topic === "string",
      )
    ) {
      return (
        <ol className="m-0 grid list-none gap-3 p-0">
          {value.map((item, index) => {
            const topic = item as Record<string, unknown>;
            return (
              <li
                className="grid gap-2 border border-[var(--hairline)] p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
                key={String(topic.sequence ?? index)}
              >
                <span className="font-serif text-xl text-[var(--gold-ink)]">
                  {String(topic.sequence ?? index + 1).padStart(2, "0")}
                </span>
                <span>{String(topic.topic)}</span>
                <span className="text-sm font-semibold">
                  {String(topic.contactHours ?? "—")} contact hours
                </span>
              </li>
            );
          })}
        </ol>
      );
    }

    return (
      <ol className="m-0 grid list-decimal gap-3 pl-6">
        {value.map((item, index) => (
          <li key={index}>
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
      </ol>
    );
  }

  if (
    task === "compliance-explanation" &&
    value &&
    typeof value === "object"
  ) {
    const finding = value as Record<string, unknown>;
    const recommendations = Array.isArray(finding.recommendations)
      ? finding.recommendations
      : [];
    const citations = Array.isArray(finding.citations)
      ? finding.citations
      : [];
    return (
      <div className="grid gap-4">
        <p className="mb-0 whitespace-pre-wrap leading-7">
          {String(finding.explanation ?? "")}
        </p>
        {recommendations.length ? (
          <section aria-labelledby="ai-compliance-recommendations">
            <h4
              className="mb-2 text-base"
              id="ai-compliance-recommendations"
            >
              Recommended review steps
            </h4>
            <ul className="mb-0 list-disc space-y-1 pl-5 text-sm">
              {recommendations.map((item, index) => (
                <li key={index}>{String(item)}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {citations.length ? (
          <section aria-labelledby="ai-compliance-sources">
            <h4 className="mb-2 text-base" id="ai-compliance-sources">
              Server-verified source pack
            </h4>
            <ul className="mb-0 grid list-none gap-2 p-0 text-sm">
              {citations.map((item, index) => {
                const citation =
                  item && typeof item === "object"
                    ? (item as Record<string, unknown>)
                    : {};
                const sourceId = String(citation.sourceId ?? "");
                const source =
                  sourceId in AI_COMPLIANCE_SOURCE_PACK
                    ? getAIComplianceSource(
                        sourceId as keyof typeof AI_COMPLIANCE_SOURCE_PACK,
                      )
                    : null;
                return (
                  <li
                    className="border-l-2 border-[var(--gold)] pl-3"
                    key={String(citation.sourceId ?? index)}
                  >
                    {source ? (
                      <a
                        className="font-semibold underline"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.sourceTitle}
                      </a>
                    ) : (
                      <strong>Verified source unavailable</strong>
                    )}
                    {source ? (
                      <span className="ml-2 text-[var(--muted)]">
                        {source.sourceSection}
                      </span>
                    ) : null}
                    {citation.supports ? (
                      <p className="mb-0 mt-1">{String(citation.supports)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        <p className="mb-0 text-xs text-[var(--muted)]">
          Human review is required; this explanation does not change the local
          deterministic audit.
        </p>
      </div>
    );
  }

  return (
    <pre className="m-0 overflow-auto whitespace-pre-wrap text-xs leading-6">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function CourseAIControls({
  course,
  task,
  onApply,
  context,
  request,
  tokenProvider,
}: CourseAIControlsProps) {
  const copy = TASK_COPY[task];
  const [selectedTopCode, setSelectedTopCode] = useState<string | null>(null);
  const topCodeChoiceName = `top-code-choice-${useId().replaceAll(":", "")}`;

  const selectedTopCodeValue = (value: unknown) =>
    Array.isArray(value)
      ? value.find(
          (item) =>
            item &&
            typeof item === "object" &&
            (item as Record<string, unknown>).code === selectedTopCode,
        ) ?? null
      : null;

  return (
    <AISuggestionPanel
      applyInstruction={
        task === "top-code"
          ? "Select one TOP code candidate before applying."
          : undefined
      }
      description={copy.description}
      input={buildCourseAITaskInput(course, task, context)}
      isApplyReady={(value) =>
        task !== "top-code" || selectedTopCodeValue(value) !== null
      }
      normalize={(data) => unwrapCourseAITaskValue(task, data)}
      onApply={(value) => {
        if (task === "top-code") {
          const selected = selectedTopCodeValue(value);
          if (!selected) {
            throw new Error("Select one TOP code candidate before applying.");
          }
          return onApply(selected);
        }
        return onApply(value);
      }}
      renderSuggestion={(value) =>
        renderCourseSuggestion(
          task,
          value,
          task === "top-code"
            ? {
                name: topCodeChoiceName,
                selected: selectedTopCode,
                select: setSelectedTopCode,
              }
            : undefined,
        )
      }
      request={request}
      task={task}
      title={copy.title}
      tokenProvider={tokenProvider}
    />
  );
}
