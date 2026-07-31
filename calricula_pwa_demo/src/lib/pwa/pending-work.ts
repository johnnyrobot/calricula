export type PendingWorkFlusher = () => Promise<boolean | void>;

const flushers = new Set<PendingWorkFlusher>();

export function registerPendingWorkFlusher(
  flusher: PendingWorkFlusher,
): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function flushPendingWork(): Promise<boolean> {
  const results = await Promise.allSettled(
    [...flushers].map((flusher) => flusher()),
  );
  return results.every(
    (result) => result.status === 'fulfilled' && result.value !== false,
  );
}
