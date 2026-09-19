/**
 * Fetches ApplicationX embed status once per session, cached at module scope
 * for 5 minutes so re-renders/remounts (e.g. navigating between COR pages)
 * don't re-hit the broker. Any failure — network error, non-2xx, missing
 * token — degrades to `enabled: false` rather than surfacing an error, since
 * ApplicationX embedding is an enhancement, not a hard dependency.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getStatus, AXStatus } from '@/lib/applicationx/client';

const CACHE_TTL_MS = 5 * 60 * 1000;

const DISABLED_STATUS: AXStatus = {
  enabled: false,
  organization_ref: null,
  campus_ref: null,
  standalone_url: null,
  api_version: null,
};

interface StatusCache {
  value: AXStatus;
  fetchedAt: number;
}

let cache: StatusCache | null = null;
let inFlight: Promise<AXStatus> | null = null;

/** Test-only: clears the module-level cache between test cases. */
export function resetApplicationXStatusCache(): void {
  cache = null;
  inFlight = null;
}

async function fetchStatus(getToken: () => Promise<string | null>): Promise<AXStatus> {
  try {
    const token = await getToken();
    if (!token) return DISABLED_STATUS;
    return await getStatus(token);
  } catch {
    return DISABLED_STATUS;
  }
}

interface UseApplicationXStatusResult {
  status: AXStatus | null;
  loading: boolean;
}

export function useApplicationXStatus(): UseApplicationXStatusResult {
  const { getToken, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<AXStatus | null>(cache?.value ?? null);
  const [loading, setLoading] = useState(!cache);

  // `getToken` is a plain function recreated on every AuthProvider render
  // (not memoized), so it can't be a dependency without refetching on every
  // render. Read it through a ref instead — that keeps the fetch effect below
  // scoped to `isAuthenticated` changes while always calling the latest
  // `getToken`. The ref is written in its own effect (not during render,
  // which React disallows) and read from the fetch effect's async callback.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- manual data-fetch effect; syncs status state to the isAuthenticated external condition (no data-fetch library in use)
      setStatus(DISABLED_STATUS);
      setLoading(false);
      return;
    }

    const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (fresh) {
      setStatus(cache!.value);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (!inFlight) {
      inFlight = fetchStatus(() => getTokenRef.current()).then((value) => {
        cache = { value, fetchedAt: Date.now() };
        inFlight = null;
        return value;
      });
    }

    inFlight.then((value) => {
      if (cancelled) return;
      setStatus(value);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { status, loading };
}

export default useApplicationXStatus;
