'use client';

import dynamic from 'next/dynamic';

const RegistrarDashboard = dynamic(
  () =>
    import('./RegistrarDashboard').then(
      (module) => module.RegistrarDashboard,
    ),
  {
    loading: () => (
      <div className="luminous-card min-h-64 px-6 py-12" role="status">
        Opening the curriculum desk…
      </div>
    ),
    ssr: false,
  },
);

export function DeferredRegistrarDashboard() {
  return <RegistrarDashboard />;
}
