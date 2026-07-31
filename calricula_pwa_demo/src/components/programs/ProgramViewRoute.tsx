"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

  return <ProgramView programId={id} />;
}
