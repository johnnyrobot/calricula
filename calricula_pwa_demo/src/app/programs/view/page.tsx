import { Suspense } from "react";

import { ProgramViewRoute } from "../../../components/programs";

export default function ProgramViewPage() {
  return (
    <Suspense fallback={<p role="status">Opening program record…</p>}>
      <ProgramViewRoute />
    </Suspense>
  );
}
