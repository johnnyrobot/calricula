"use client";

import {
  BookOpenCheck,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  curriculumRepository,
  useActivePersona,
  useCourse,
  useAllCourses,
  useReferences,
} from "../../lib/data";
import { ApprovalActionPanel } from "./ApprovalActionPanel";
import { getReviewStatuses } from "./workflow";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function ApprovalQueue() {
  const activePersona = useActivePersona();
  const courses = useAllCourses({
    sortBy: "updatedAt",
    sortDirection: "asc",
  });
  const references = useReferences();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statuses = useMemo(
    () => getReviewStatuses(activePersona.data?.role),
    [activePersona.data?.role],
  );
  const queue = useMemo(
    () =>
      courses.data.filter((course) => statuses.includes(course.status)),
    [courses.data, statuses],
  );
  const selectedIdForRole =
    selectedId && queue.some((course) => course.id === selectedId)
      ? selectedId
      : null;
  const selected = useCourse(selectedIdForRole);
  const departments = useMemo(
    () =>
      new Map(
        (references.data?.departments ?? []).map((department) => [
          department.id,
          department,
        ]),
      ),
    [references.data?.departments],
  );

  if (activePersona.loading || courses.loading || references.loading) {
    return (
      <p className="flex items-center gap-2" role="status">
        <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
        Preparing the approval docket…
      </p>
    );
  }

  if (activePersona.error || courses.error || references.error) {
    return (
      <div className="luminous-card" role="alert">
        <CircleAlert
          aria-hidden="true"
          className="mb-3 text-[var(--returned)]"
          size={24}
        />
        <h1>The approval queue could not be opened</h1>
        <p>
          {activePersona.error?.message ??
            courses.error?.message ??
            references.error?.message}
        </p>
      </div>
    );
  }

  if (!activePersona.data) {
    return (
      <div className="luminous-card" role="alert">
        <h1>No active demo persona</h1>
        <p>Choose a persona from the application header and try again.</p>
      </div>
    );
  }

  const actor = activePersona.data;

  return (
    <div
      className="mx-auto grid max-w-7xl gap-6"
      data-testid="approvals-queue"
    >
      <header className="border-b border-[var(--gold)] pb-5">
        <p className="eyebrow">Local curriculum workflow</p>
        <h1>Approval docket</h1>
        <p className="mb-0 max-w-3xl text-[var(--ink-soft)]">
          Review is role-aware for the active demo persona. Every decision is
          explicit and recorded only in this browser&apos;s local data.
        </p>
      </header>

      <section
        aria-label="Active reviewer"
        className="record-panel flex flex-wrap items-center justify-between gap-3 p-4"
      >
        <div className="flex items-center gap-3">
          <UserRoundCheck
            aria-hidden="true"
            className="text-[var(--gold-ink)]"
            size={24}
          />
          <div>
            <p className="mb-0 font-semibold">{actor.fullName}</p>
            <p className="mb-0 text-sm capitalize text-[var(--muted)]">
              {actor.role} demo role
            </p>
          </div>
        </div>
        <span className="luminous-badge">
          {queue.length} {queue.length === 1 ? "record" : "records"} assigned
        </span>
      </section>

      {!statuses.length ? (
        <section className="luminous-card py-10 text-center">
          <BookOpenCheck
            aria-hidden="true"
            className="mx-auto mb-3 text-[var(--gold-ink)]"
            size={32}
          />
          <h2 className="text-xl">Faculty authoring has no approval queue</h2>
          <p className="mx-auto mb-0 max-w-2xl text-[var(--ink-soft)]">
            Faculty submit drafts from the course editor. Switch to a chair,
            articulation officer, or administrator persona to demonstrate
            review decisions.
          </p>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.35fr)]">
          <section aria-labelledby="assigned-records-title">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" size={20} />
              <h2 className="mb-0 text-xl" id="assigned-records-title">
                Assigned records
              </h2>
            </div>
            {queue.length ? (
              <ol className="m-0 grid list-none gap-3 p-0">
                {queue.map((course) => {
                  const department = departments.get(course.departmentId);
                  const selectedCourse = course.id === selectedIdForRole;
                  return (
                    <li key={course.id}>
                      <button
                        aria-pressed={selectedCourse}
                        className={`luminous-card-interactive w-full text-left ${
                          selectedCourse
                            ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/15"
                            : ""
                        }`}
                        data-testid="approval-card"
                        onClick={() => setSelectedId(course.id)}
                        type="button"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="luminous-badge">
                            {course.subjectCode} {course.courseNumber}
                          </span>
                          <span
                            className="status-seal status-seal--review"
                            data-status={course.status.toLowerCase()}
                          >
                            {course.status}
                          </span>
                        </div>
                        <h3 className="text-lg">{course.title}</h3>
                        <p className="mb-2 text-sm text-[var(--muted)]">
                          {department?.name ?? "Department unavailable"}
                        </p>
                        <p className="mb-0 flex items-center gap-2 text-xs text-[var(--muted)]">
                          <Clock3 aria-hidden="true" size={14} />
                          Waiting since{" "}
                          {DATE_FORMATTER.format(new Date(course.updatedAt))}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="record-panel p-5">
                <p className="mb-0 text-sm text-[var(--muted)]">
                  No courses are waiting at this role&apos;s review stage.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="review-record-title">
            {!selectedIdForRole ? (
              <div className="luminous-card py-12 text-center">
                <ClipboardCheck
                  aria-hidden="true"
                  className="mx-auto mb-3 text-[var(--gold-ink)]"
                  size={32}
                />
                <h2 className="text-xl" id="review-record-title">
                  Select a record to review
                </h2>
                <p className="mb-0 text-sm text-[var(--ink-soft)]">
                  Course details and decision controls open here.
                </p>
              </div>
            ) : selected.loading ? (
              <p role="status">Opening course review…</p>
            ) : selected.error || !selected.data ? (
              <div className="luminous-card" role="alert">
                <h2 id="review-record-title">Course review unavailable</h2>
                <p>
                  {selected.error?.message ??
                    "The local course record is no longer available."}
                </p>
              </div>
            ) : (
              <div className="grid gap-5" data-testid="review-course">
                <section className="luminous-card">
                  <p className="eyebrow mb-1">Record under review</p>
                  <h2 id="review-record-title">
                    {selected.data.course.subjectCode}{" "}
                    {selected.data.course.courseNumber} —{" "}
                    {selected.data.course.title}
                  </h2>
                  <p className="whitespace-pre-wrap leading-7">
                    {selected.data.course.catalogDescription ||
                      "No catalog description has been entered."}
                  </p>
                  <dl className="grid gap-3 border-t border-[var(--hairline)] pt-4 sm:grid-cols-3">
                    <div>
                      <dt className="eyebrow">Units</dt>
                      <dd>{selected.data.course.units}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Learning outcomes</dt>
                      <dd>{selected.data.slos.length}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Open comments</dt>
                      <dd>
                        {
                          selected.data.comments.filter(
                            (comment) => !comment.resolved,
                          ).length
                        }
                      </dd>
                    </div>
                  </dl>
                </section>

                <ApprovalActionPanel
                  actor={actor}
                  aggregate={selected.data}
                  onComplete={() => setSelectedId(null)}
                  onTransition={(courseId, transition) =>
                    curriculumRepository.transitionCourse(
                      courseId,
                      transition,
                    )
                  }
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
