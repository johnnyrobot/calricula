'use client';

// ===========================================
// WorkspaceSelector — P1a placeholder
// ===========================================
// P1a has no workspace listing (that arrives with the P2 workspaces API), so
// the selector simply routes the user to a program page, whose Collaboration
// action resolves the program's mapped workspace.

import Link from 'next/link';

export function WorkspaceSelector() {
  return (
    <section className="luminous-card mt-6" aria-labelledby="workspace-selector-heading">
      <h2 id="workspace-selector-heading" className="font-serif text-lg text-ink">
        Choose a program
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        Open a program page and choose Collaboration to enter its workspace.
      </p>
      <Link href="/programs" className="luminous-button-primary mt-4 inline-flex">
        Go to Programs
      </Link>
    </section>
  );
}

export default WorkspaceSelector;
