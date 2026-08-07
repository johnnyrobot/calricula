"use client";

import {
  BookOpenCheck,
  CircleAlert,
  FilePlus2,
  LoaderCircle,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { ProgramStatus } from "../../lib/domain";
import { useAllPrograms, useReferences } from "../../lib/data";

const STATUS_OPTIONS: readonly (ProgramStatus | "All")[] = [
  "All",
  "Draft",
  "Review",
  "Approved",
];
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function programTypeLabel(value: string) {
  return value === "AAT" ? "AA-T" : value === "AST" ? "AS-T" : value;
}

function programStatusClass(status: ProgramStatus) {
  if (status === "Approved") return "status-seal status-seal--approved";
  if (status === "Draft") return "status-seal status-seal--draft";
  return "status-seal status-seal--review";
}

export function ProgramList() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProgramStatus | "All">("All");
  const programs = useAllPrograms({
    search: query.trim() || undefined,
    status: status === "All" ? undefined : status,
    sortBy: "updatedAt",
    sortDirection: "desc",
  });
  const references = useReferences();
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

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Awards and pathways</p>
          <h1>Programs</h1>
          <p className="mb-0 max-w-3xl text-[var(--ink-soft)]">
            Author degree and certificate records, then assemble the ordered
            courses that determine their unit totals.
          </p>
        </div>
        <Link
          className="luminous-button-primary shrink-0"
          data-testid="create-program"
          href="/programs/new/"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Create program
        </Link>
      </header>

      <section
        aria-label="Program filters"
        className="record-panel grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_14rem]"
      >
        <div>
          <label className="luminous-label" htmlFor="program-search">
            Search programs
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"
              size={18}
            />
            <input
              className="luminous-input pl-10"
              id="program-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Program title"
              type="search"
              value={query}
            />
          </div>
        </div>
        <div>
          <label className="luminous-label" htmlFor="program-status-filter">
            Status
          </label>
          <select
            className="luminous-select"
            id="program-status-filter"
            onChange={(event) =>
              setStatus(event.target.value as ProgramStatus | "All")
            }
            value={status}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </section>

      {programs.loading ? (
        <div
          aria-live="polite"
          className="luminous-card flex items-center gap-3"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin"
            size={20}
          />
          Loading programs…
        </div>
      ) : null}

      {programs.error ? (
        <div className="luminous-card flex items-start gap-3" role="alert">
          <CircleAlert
            aria-hidden="true"
            className="mt-1 text-[var(--returned)]"
            size={20}
          />
          <div>
            <h2 className="text-lg">Programs could not be opened</h2>
            <p>{programs.error.message}</p>
            <button
              className="luminous-button-secondary"
              onClick={programs.refresh}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {!programs.loading && !programs.error ? (
        programs.data.length ? (
          <div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="programs-list"
          >
            {programs.data.map((program) => {
              const department = departments.get(program.departmentId);
              return (
                <Link
                  className="luminous-card-interactive group"
                  data-testid="program-card"
                  href={`/programs/view/?id=${encodeURIComponent(program.id)}`}
                  key={program.id}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="luminous-badge">
                      {programTypeLabel(program.type)}
                    </span>
                    <span
                      className={programStatusClass(program.status)}
                      data-status={program.status.toLowerCase()}
                    >
                      {program.status}
                    </span>
                  </div>
                  <h2 className="text-xl group-hover:text-[var(--navy)]">
                    {program.title}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    {department
                      ? `${department.code} — ${department.name}`
                      : "Department not found"}
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-sm">
                    <span className="font-semibold">
                      {program.totalUnits} units
                    </span>
                    <span>
                      Updated{" "}
                      {DATE_FORMATTER.format(new Date(program.updatedAt))}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="luminous-card py-12 text-center">
            <BookOpenCheck
              aria-hidden="true"
              className="mx-auto mb-3 text-[var(--gold-ink)]"
              size={32}
            />
            <h2 className="text-xl">No programs match this view</h2>
            <p className="mx-auto max-w-xl text-[var(--muted)]">
              Clear the filters or create a new degree or certificate record.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
