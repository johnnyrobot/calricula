'use client';

import type { ReactNode } from 'react';

import { PwaUpdater } from '@/components/pwa/PwaUpdater';

import { AppShell } from './AppShell';
import { DemoProvider } from './DemoProvider';

export default function WorkspaceRuntime({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
      <PwaUpdater />
    </DemoProvider>
  );
}
