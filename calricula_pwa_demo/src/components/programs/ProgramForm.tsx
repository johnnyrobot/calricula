"use client";

import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useRef, useState } from "react";

import type {
  Department,
  Program,
  ProgramType,
  TopCode,
} from "../../lib/domain";
import { ProgramAIControls } from "../ai";

export const PROGRAM_TYPE_OPTIONS: ReadonlyArray<{
  value: ProgramType;
  label: string;
}> = [
  { value: "AA", label: "Associate in Arts (AA)" },
  { value: "AS", label: "Associate in Science (AS)" },
  { value: "AAT", label: "Associate in Arts for Transfer (AA-T)" },
  { value: "AST", label: "Associate in Science for Transfer (AS-T)" },
  { value: "Certificate", label: "Certificate of Achievement" },
  { value: "ADT", label: "Associate Degree for Transfer (ADT)" },
];

export interface ProgramDraft {
  title: string;
  type: ProgramType;
  departmentId: string;
  catalogDescription: string;
  topCode: string;
  cipCode: string;
  programNarrative: string;
  isHighUnitMajor: boolean;
}

export type ProgramDraftErrors = Partial<
  Record<keyof ProgramDraft, string>
>;

export function programToDraft(program?: Program | null): ProgramDraft {
  return {
    title: program?.title ?? "",
    type: program?.type ?? "AA",
    departmentId: program?.departmentId ?? "",
    catalogDescription: program?.catalogDescription ?? "",
    topCode: program?.topCode ?? "",
    cipCode: program?.cipCode ?? "",
    programNarrative: program?.programNarrative ?? "",
    isHighUnitMajor: program?.isHighUnitMajor ?? false,
  };
}

export function validateProgramDraft(
  draft: ProgramDraft,
): ProgramDraftErrors {
  const errors: ProgramDraftErrors = {};
  if (draft.title.trim().length < 3) {
    errors.title = "Enter a program title with at least 3 characters.";
  }
  if (!draft.departmentId) errors.departmentId = "Select a department.";
  if (draft.topCode && !/^\d{2,4}\.\d{2}$/.test(draft.topCode)) {
    errors.topCode = "Use the TOP code format 0000.00.";
  }
  if (draft.cipCode && !/^\d{2}\.\d{4}$/.test(draft.cipCode)) {
    errors.cipCode = "Use the CIP code format 00.0000.";
  }
  return errors;
}

export interface ProgramFormProps {
  mode: "create" | "edit";
  departments: readonly Department[];
  topCodes: readonly TopCode[];
  initialProgram?: Program | null;
  disabled?: boolean;
  saving?: boolean;
  error?: string | null;
  aiContext?: unknown;
  onDraftChange?: (draft: ProgramDraft) => void;
  onSubmit: (draft: ProgramDraft) => void | Promise<void>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="mt-1 text-sm text-[var(--returned)]" id={id}>
      {message}
    </p>
  ) : null;
}

export function ProgramForm({
  mode,
  departments,
  topCodes,
  initialProgram,
  disabled = false,
  saving = false,
  error = null,
  aiContext: providedAIContext,
  onDraftChange,
  onSubmit,
}: ProgramFormProps) {
  const initialDraft = useMemo(
    () => programToDraft(initialProgram),
    [initialProgram],
  );
  const [draft, setDraft] = useState<ProgramDraft>(initialDraft);
  const draftRef = useRef(initialDraft);
  const [errors, setErrors] = useState<ProgramDraftErrors>({});
  const title = mode === "create" ? "Create a program" : "Edit program record";
  const immutable = initialProgram?.status === "Approved" || disabled;

  const aiContext = useMemo(
    () => ({
      programCoursesAreManagedSeparately: true,
      totalUnits:
        initialProgram?.totalUnits ??
        "Calculated from the selected course requirements",
      ...(providedAIContext &&
      typeof providedAIContext === "object" &&
      !Array.isArray(providedAIContext)
        ? providedAIContext
        : providedAIContext === undefined
          ? {}
          : { additionalContext: providedAIContext }),
    }),
    [initialProgram?.totalUnits, providedAIContext],
  );

  const update = <K extends keyof ProgramDraft>(
    key: K,
    value: ProgramDraft[K],
  ) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    onDraftChange?.(next);
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedDraft = {
      ...draft,
      title: draft.title.trim(),
      catalogDescription: draft.catalogDescription.trim(),
      topCode: draft.topCode.trim(),
      cipCode: draft.cipCode.trim(),
      programNarrative: draft.programNarrative.trim(),
    };
    const nextErrors = validateProgramDraft(normalizedDraft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById("program-validation-summary")?.focus();
      return;
    }
    await onSubmit(normalizedDraft);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header>
        <Link
          className="luminous-button-tertiary mb-3"
          href="/programs/"
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Back to programs
        </Link>
        <p className="eyebrow">
          {mode === "create" ? "New catalog record" : "Program authoring"}
        </p>
        <h1>{title}</h1>
        <p className="max-w-3xl text-[var(--ink-soft)]">
          Define the public program record here. Course requirements and total
          units are maintained as a separate ordered curriculum list.
        </p>
      </header>

      {immutable ? (
        <div className="border border-[var(--approved)] bg-[var(--approved-bg)] p-4 text-sm">
          This approved record is read-only. Create a future revision before
          changing catalog content.
        </div>
      ) : null}

      {Object.keys(errors).length ? (
        <div
          className="border border-[var(--returned)] bg-[var(--returned-bg)] p-4"
          id="program-validation-summary"
          role="alert"
          tabIndex={-1}
        >
          <p className="mb-1 font-semibold">Review the highlighted fields.</p>
          <ul className="mb-0 list-disc pl-5 text-sm">
            {Object.values(errors).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p
          className="border-l-2 border-[var(--returned)] pl-3 text-[var(--returned)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form
        className="record-panel grid gap-5 p-5 md:grid-cols-2"
        data-testid="program-form"
        onSubmit={submit}
      >
        <div className="md:col-span-2">
          <label className="luminous-label" htmlFor="program-title">
            Program title
          </label>
          <input
            aria-describedby={errors.title ? "program-title-error" : undefined}
            aria-invalid={Boolean(errors.title)}
            className="luminous-input"
            disabled={immutable}
            id="program-title"
            maxLength={200}
            onChange={(event) => update("title", event.target.value)}
            required
            value={draft.title}
          />
          <FieldError id="program-title-error" message={errors.title} />
        </div>

        <div>
          <label className="luminous-label" htmlFor="program-type">
            Award type
          </label>
          <select
            className="luminous-select"
            disabled={immutable}
            id="program-type"
            onChange={(event) =>
              update("type", event.target.value as ProgramType)
            }
            value={draft.type}
          >
            {PROGRAM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="luminous-label" htmlFor="program-department">
            Owning department
          </label>
          <select
            aria-describedby={
              errors.departmentId ? "program-department-error" : undefined
            }
            aria-invalid={Boolean(errors.departmentId)}
            className="luminous-select"
            disabled={immutable}
            id="program-department"
            onChange={(event) => update("departmentId", event.target.value)}
            required
            value={draft.departmentId}
          >
            <option value="">Select a department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} — {department.name}
              </option>
            ))}
          </select>
          <FieldError
            id="program-department-error"
            message={errors.departmentId}
          />
        </div>

        <div className="md:col-span-2">
          <label className="luminous-label" htmlFor="program-description">
            Catalog description
          </label>
          <textarea
            className="luminous-textarea min-h-36"
            disabled={immutable}
            id="program-description"
            onChange={(event) =>
              update("catalogDescription", event.target.value)
            }
            value={draft.catalogDescription}
          />
        </div>

        <div>
          <label className="luminous-label" htmlFor="program-top-code">
            TOP code
          </label>
          <input
            aria-describedby={
              errors.topCode ? "program-top-code-error" : undefined
            }
            aria-invalid={Boolean(errors.topCode)}
            className="luminous-input"
            disabled={immutable}
            id="program-top-code"
            list="program-top-codes"
            onChange={(event) => update("topCode", event.target.value)}
            placeholder="0707.00"
            value={draft.topCode}
          />
          <datalist id="program-top-codes">
            {topCodes.map((code) => (
              <option key={code.id} value={code.code}>
                {code.title}
              </option>
            ))}
          </datalist>
          <FieldError id="program-top-code-error" message={errors.topCode} />
        </div>

        <div>
          <label className="luminous-label" htmlFor="program-cip-code">
            CIP code
          </label>
          <input
            aria-describedby={
              errors.cipCode ? "program-cip-code-error" : undefined
            }
            aria-invalid={Boolean(errors.cipCode)}
            className="luminous-input"
            disabled={immutable}
            id="program-cip-code"
            onChange={(event) => update("cipCode", event.target.value)}
            placeholder="11.0701"
            value={draft.cipCode}
          />
          <FieldError id="program-cip-code-error" message={errors.cipCode} />
        </div>

        <label className="flex min-h-11 items-center gap-3 md:col-span-2">
          <input
            checked={draft.isHighUnitMajor}
            disabled={immutable}
            onChange={(event) =>
              update("isHighUnitMajor", event.target.checked)
            }
            type="checkbox"
          />
          <span>
            <strong>High-unit major</strong>
            <span className="ml-2 text-sm text-[var(--muted)]">
              Use only when the applicable exception has been reviewed.
            </span>
          </span>
        </label>

        <div className="md:col-span-2">
          <label className="luminous-label" htmlFor="program-narrative">
            Program narrative
          </label>
          <textarea
            className="luminous-textarea min-h-52"
            disabled={immutable}
            id="program-narrative"
            onChange={(event) =>
              update("programNarrative", event.target.value)
            }
            value={draft.programNarrative}
          />
        </div>

        <div className="flex justify-end md:col-span-2">
          <button
            className="luminous-button-primary"
            data-testid="save-program"
            disabled={immutable || saving}
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                size={17}
              />
            ) : (
              <Save aria-hidden="true" size={17} />
            )}
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create program"
                : "Save program"}
          </button>
        </div>
      </form>

      {!immutable && mode === "edit" && initialProgram ? (
        <ProgramAIControls
          context={aiContext}
          onApply={(value) => update("programNarrative", value)}
          program={{ ...initialProgram, ...draft }}
        />
      ) : null}
    </div>
  );
}
