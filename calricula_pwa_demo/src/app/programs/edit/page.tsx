import { Suspense } from "react";

import { ProgramEditorRoute } from "../../../components/programs";

export default function ProgramEditPage() {
  return (
    <Suspense fallback={<p role="status">Opening program editor…</p>}>
      <ProgramEditorRoute />
    </Suspense>
  );
}
