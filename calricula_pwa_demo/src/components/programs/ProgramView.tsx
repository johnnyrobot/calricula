"use client";

import {
  ArrowLeft,
  BookOpenCheck,
  CircleAlert,
  Edit3,
  FileText,
} from "lucide-react";
import Link from "next/link";

import { useProgram, useReferences } from "../../lib/data";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function programStatusClass(status: "Draft" | "Review" | "Approved") {
  if (status === "Approved") return "status-seal status-seal--approved";
  if (status === "Draft") return "status-seal status-seal--draft";
  return "status-seal status-seal--review";
}

export function ProgramView({ programId }: { programId: string }) {
  const aggregate = useProgram(programId);
  const references = useReferences();
  const department =
    references.data?.departments.find(
      (item) => item.id === aggregate.data?.program.departmentId,
    ) ?? null;

  if (aggregate.loading || references.loading) {
    return <p role="status">Opening program record…</p>;
  }

  if (aggregate.error || references.error) {
    return (
      <div className="luminous-card" role="alert">
        <CircleAlert
          aria-hidden="true"
          className="mb-3 text-[var(--returned)]"
          size={24}
        />
        <h1>The program record could not be opened</h1>
        <p>{aggregate.error?.message ?? references.error?.message}</p>
      </div>
    );
  }

  if (!aggregate.data) {
    return (
      <div className="luminous-card" role="alert">
        <h1>Program not found</h1>
        <p>The local record may have been deleted or reset.</p>
        <Link className="luminous-button-primary" href="/programs/">
          View programs
        </Link>
      </div>
    );
  }

  const { program, courses, comments } = aggregate.data;
  const groupedCourses = new Map<string, typeof courses>();
  for (const row of courses) {
    const group = groupedCourses.get(row.requirementType) ?? [];
    group.push(row);
    groupedCourses.set(row.requirementType, group);
  }

  return (
    <article
      className="mx-auto grid max-w-6xl gap-6"
      data-testid="program-view"
    >
      <header className="border-b border-[var(--gold)] pb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link className="luminous-button-tertiary" href="/programs/">
            <ArrowLeft aria-hidden="true" size={17} />
            Back to programs
          </Link>
          {program.status !== "Approved" ? (
            <Link
              className="luminous-button-primary"
              data-testid="edit-program"
              href={`/programs/edit/?id=${encodeURIComponent(program.id)}`}
            >
              <Edit3 aria-hidden="true" size={17} />
              Edit program
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Program catalog record</p>
            <h1>{program.title}</h1>
            <p className="mb-0 text-[var(--ink-soft)]">
              {department
                ? `${department.code} — ${department.name}`
                : "Department unavailable"}
            </p>
          </div>
          <div className="text-right">
            <span
              className={programStatusClass(program.status)}
              data-status={program.status.toLowerCase()}
            >
              {program.status}
            </span>
            <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
              Updated{" "}
              {DATE_FORMATTER.format(new Date(program.updatedAt))}
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="Program summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          ["Award", program.type],
          ["Total units", program.totalUnits],
          ["TOP code", program.topCode ?? "Not assigned"],
          ["CIP code", program.cipCode ?? "Not assigned"],
        ].map(([label, value]) => (
          <div className="record-panel p-4" key={label}>
            <p className="eyebrow mb-1">{label}</p>
            <p className="mb-0 font-serif text-xl">{value}</p>
          </div>
        ))}
      </section>

      <section
        aria-labelledby="catalog-description-title"
        className="luminous-card"
      >
        <div className="mb-3 flex items-center gap-2">
          <FileText aria-hidden="true" size={19} />
          <h2 className="mb-0 text-xl" id="catalog-description-title">
            Catalog description
          </h2>
        </div>
        <p className="mb-0 whitespace-pre-wrap leading-7">
          {program.catalogDescription || "No catalog description has been entered."}
        </p>
      </section>

      <section aria-labelledby="program-courses-title" className="luminous-card">
        <div className="mb-4 flex items-center gap-2 border-b border-[var(--hairline)] pb-3">
          <BookOpenCheck aria-hidden="true" size={20} />
          <h2 className="mb-0 text-xl" id="program-courses-title">
            Program requirements
          </h2>
        </div>
        {courses.length ? (
          <div className="grid gap-5">
            {[...groupedCourses.entries()].map(([requirement, rows]) => {
              const headingId = `requirement-${requirement
                .toLowerCase()
                .replaceAll(" ", "-")}`;
              return (
                <section aria-labelledby={headingId} key={requirement}>
                  <h3 className="mb-2 text-lg" id={headingId}>
                    {requirement}
                  </h3>
                  <ol className="m-0 grid list-none gap-2 p-0">
                    {[...rows]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((row) => (
                        <li
                          className="grid gap-2 border border-[var(--hairline)] p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                          key={row.id}
                        >
                          <span>
                            <strong>
                              {row.course.subjectCode} {row.course.courseNumber}
                            </strong>
                            {" — "}
                            {row.course.title}
                          </span>
                          <span className="text-sm font-semibold">
                            {row.unitsApplied} units
                          </span>
                        </li>
                      ))}
                  </ol>
                </section>
              );
            })}
          </div>
        ) : (
          <p className="mb-0 text-sm text-[var(--muted)]">
            No course requirements have been assigned.
          </p>
        )}
      </section>

      <section aria-labelledby="program-narrative-title" className="luminous-card">
        <h2 className="text-xl" id="program-narrative-title">
          Program narrative
        </h2>
        <p className="mb-0 whitespace-pre-wrap leading-7">
          {program.programNarrative || "No program narrative has been entered."}
        </p>
      </section>

      {program.isHighUnitMajor ? (
        <p className="border border-[var(--gold)] bg-[var(--gold-pale)] p-4 text-sm">
          This record is marked as a high-unit major and requires the applicable
          exception review.
        </p>
      ) : null}

      {comments.length ? (
        <section aria-labelledby="program-comments-title" className="luminous-card">
          <h2 className="text-xl" id="program-comments-title">
            Record comments
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {comments.map((comment) => (
              <li className="border-l-2 border-[var(--gold)] pl-3" key={comment.id}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--gold-ink)]">
                  {comment.section}
                </p>
                <p className="mb-0">{comment.content}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
