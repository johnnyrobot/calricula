import type { ReactNode } from "react";

import { DeferredWorkspace } from "./DeferredWorkspace";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DeferredWorkspace>{children}</DeferredWorkspace>;
}
