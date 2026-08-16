"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useProgram, useReferences } from "../../lib/data";

import { ProgramView } from "./ProgramView";

export function ProgramViewRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  if (!id) {
    return (
      <div className="luminous-card" role="alert">
        <h1>Choose a program</h1>
        <p>No program identifier was supplied for this local record.</p>
        <Link className="luminous-button-primary" href="/programs/">
          View programs
        </Link>
      </div>
    );
  }

  return <ProgramViewScreen programId={id} />;
}

/**
 * The route screen owns the reads. ProgramView renders what it is handed.
 */
function ProgramViewScreen({ programId }: { programId: string }) {
  const aggregate = useProgram(programId);
  const references = useReferences();
  const department =
    references.data?.departments.find(
      (item) => item.id === aggregate.data?.program.departmentId,
    ) ?? null;

  return (
    <ProgramView
      aggregate={aggregate.data ?? null}
      department={department}
      error={aggregate.error ?? references.error ?? null}
      loading={aggregate.loading || references.loading}
    />
  );
}
