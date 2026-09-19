import { describe, expect, it, vi } from 'vitest';

import {
  flushPendingWork,
  registerPendingWorkFlusher,
} from './pending-work';

describe('pending work coordination', () => {
  it('flushes every registered editor and unregisters cleanly', async () => {
    const first = vi.fn().mockResolvedValue(true);
    const second = vi.fn().mockResolvedValue(undefined);
    const unregisterFirst = registerPendingWorkFlusher(first);
    const unregisterSecond = registerPendingWorkFlusher(second);

    expect(await flushPendingWork()).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    unregisterFirst();
    unregisterSecond();
    expect(await flushPendingWork()).toBe(true);
    expect(first).toHaveBeenCalledOnce();
  });

  it('fails closed when any editor cannot save or throws', async () => {
    const unregisterFailure = registerPendingWorkFlusher(async () => false);
    const unregisterError = registerPendingWorkFlusher(async () => {
      throw new Error('quota exceeded');
    });

    expect(await flushPendingWork()).toBe(false);

    unregisterFailure();
    unregisterError();
  });
});
