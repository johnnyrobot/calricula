"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CreateProgramInput } from "../../lib/domain";
import { curriculumRepository, useReferences } from "../../lib/data";
import { ProgramForm, type ProgramDraft } from "./ProgramForm";

function toCreateInput(draft: ProgramDraft): CreateProgramInput {
  return {
    title: draft.title,
    type: draft.type,
    departmentId: draft.departmentId,
    catalogDescription: draft.catalogDescription || null,
    topCode: draft.topCode || null,
    cipCode: draft.cipCode || null,
    programNarrative: draft.programNarrative || null,
    isHighUnitMajor: draft.isHighUnitMajor,
  };
}

export function ProgramCreate() {
  const router = useRouter();
  const references = useReferences();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (draft: ProgramDraft) => {
    setSaving(true);
    setError(null);
    try {
      const aggregate = await curriculumRepository.createProgram(
        toCreateInput(draft),
      );
      router.push(
        `/programs/edit/?id=${encodeURIComponent(aggregate.program.id)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The program could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (references.error) {
    return (
      <div className="luminous-card" role="alert">
        <h1>Program reference data is unavailable</h1>
        <p>{references.error.message}</p>
        <button
          className="luminous-button-secondary"
          onClick={references.refresh}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (references.loading || !references.data) {
    return <p role="status">Loading program reference data…</p>;
  }

  return (
    <ProgramForm
      departments={references.data.departments}
      error={error}
      mode="create"
      onSubmit={create}
      saving={saving}
      topCodes={references.data.topCodes}
    />
  );
}
