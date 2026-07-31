'use client';

import { useEffect, useRef, useState } from 'react';
import { Workbox, type WorkboxLifecycleEvent } from 'workbox-window';

import { flushPendingWork } from '@/lib/pwa/pending-work';

type UpdateState = 'idle' | 'available' | 'activating';
type RegistrationState = 'pending' | 'ready' | 'error' | 'retrying';

export function PwaUpdater() {
  const workboxRef = useRef<Workbox | null>(null);
  const retryRegistrationRef = useRef<(() => void) | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateError, setUpdateError] = useState('');
  const [registrationState, setRegistrationState] =
    useState<RegistrationState>('pending');

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    const workbox = new Workbox('/sw.js', { scope: '/' });
    workboxRef.current = workbox;

    const handleWaiting = () => {
      setUpdateState('available');
    };
    const handleControlling = (event: WorkboxLifecycleEvent) => {
      // `clientsClaim` also fires `controlling` on a first install. Reload only
      // when an existing service worker was updated.
      if (event.isUpdate) {
        window.location.reload();
      }
    };

    workbox.addEventListener('waiting', handleWaiting);
    workbox.addEventListener('controlling', handleControlling);

    let active = true;
    const register = () => {
      // Workbox otherwise waits for the window `load` event. App Router client
      // hydration can begin after that one-shot event, leaving registration
      // pending forever. Immediate registration is safe because sw.js is a
      // finite static asset and the update remains user-controlled.
      void workbox.register({ immediate: true }).then(
        () => {
          if (active) setRegistrationState('ready');
        },
        () => {
          if (!active) return;
          console.warn(
            '[calricula:pwa] Offline service-worker registration failed.',
          );
          setRegistrationState('error');
        },
      );
    };
    retryRegistrationRef.current = () => {
      setRegistrationState('retrying');
      register();
    };
    register();

    return () => {
      active = false;
      workbox.removeEventListener('waiting', handleWaiting);
      workbox.removeEventListener('controlling', handleControlling);
      workboxRef.current = null;
      retryRegistrationRef.current = null;
    };
  }, []);

  if (
    registrationState === 'error' ||
    registrationState === 'retrying'
  ) {
    return (
      <aside
        aria-atomic="true"
        aria-live="assertive"
        className="fixed inset-x-4 bottom-4 z-50 ml-auto max-w-md border border-seal-returned bg-surface p-4 text-ink sm:inset-x-auto sm:right-6"
        role="alert"
      >
        <p className="font-serif text-lg font-semibold text-navy">
          Offline setup needs attention
        </p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          Calricula could not prepare this browser for offline reopening.
          Online use and locally saved records remain available.
        </p>
        <button
          className="mt-3 min-h-11 border border-navy bg-navy px-3 py-2 text-sm font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-ink disabled:cursor-wait disabled:opacity-70"
          disabled={registrationState === 'retrying'}
          onClick={() => retryRegistrationRef.current?.()}
          type="button"
        >
          {registrationState === 'retrying'
            ? 'Retrying offline setup…'
            : 'Retry offline setup'}
        </button>
      </aside>
    );
  }

  if (updateState === 'idle') {
    return null;
  }

  const activateUpdate = async () => {
    const workbox = workboxRef.current;
    if (!workbox) {
      setUpdateState('idle');
      return;
    }

    setUpdateState('activating');
    setUpdateError('');
    if (!(await flushPendingWork())) {
      setUpdateState('available');
      setUpdateError(
        'The update is waiting because an open editor could not save. Retry the save or export the unsaved draft first.',
      );
      return;
    }
    workbox.messageSkipWaiting();
  };

  return (
    <aside
      aria-atomic="true"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 ml-auto max-w-md border border-hairline-strong bg-surface p-4 text-ink sm:inset-x-auto sm:right-6"
      role="status"
    >
      <p className="font-serif text-lg font-semibold text-navy">
        Calricula update available
      </p>
      <p className="mt-1 text-sm leading-6 text-ink-soft">
        Update when you are ready. Your locally saved demo records will remain
        on this device.
      </p>
      {updateError ? (
        <p className="mt-2 text-sm leading-6 text-seal-returned" role="alert">
          {updateError}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="min-h-11 border border-navy bg-navy px-3 py-2 text-sm font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-ink disabled:cursor-wait disabled:opacity-70"
          disabled={updateState === 'activating'}
          onClick={() => void activateUpdate()}
          type="button"
        >
          {updateState === 'activating' ? 'Updating…' : 'Update now'}
        </button>
        <button
          className="min-h-11 border border-hairline-strong bg-surface px-3 py-2 text-sm font-semibold text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-ink"
          onClick={() => setUpdateState('idle')}
          type="button"
        >
          Later
        </button>
      </div>
    </aside>
  );
}
