'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { RepositoryBootstrap } from './RepositoryBootstrap';

const WorkspaceRuntime = dynamic(() => import('./WorkspaceRuntime'), {
  loading: () => <RepositoryBootstrap />,
  ssr: false,
});

export function DeferredWorkspace({ children }: { children: ReactNode }) {
  const [afterFirstPaint, setAfterFirstPaint] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAfterFirstPaint(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!afterFirstPaint) return <RepositoryBootstrap />;
  return <WorkspaceRuntime>{children}</WorkspaceRuntime>;
}
