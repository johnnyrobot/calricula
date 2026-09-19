/**
 * Ported from applicationx/packages/workspace-ui/src/transport/sse.ts
 * (read-only reference); replaced by the package export in Task 8.
 *
 * Deviation from the brief's stated signature `subscribeSSE(fetchImpl, url,
 * headers, cursor, signal): AsyncIterable<WorkspaceEvent>`: the source file
 * also accepts an `options` argument (`maxRetries`, `retryDelayMs`) with
 * defaults, which is kept here since it doesn't change call sites that only
 * pass the five required arguments.
 */
import type { WorkspaceEvent } from './types';

export interface SubscribeSSEOptions {
  /** Reconnect attempts after the first request (default 3). */
  maxRetries?: number;
  /** Base back-off in milliseconds; attempt n waits n * retryDelayMs (default 500). */
  retryDelayMs?: number;
}

interface Frame {
  id: string | null;
  type: string | null;
  data: string[];
}

/**
 * Parse one SSE block (the text between two blank lines) per the WHATWG
 * EventSource rules: comment lines start with ':', a single leading space
 * after the field colon is stripped, and multiple `data:` lines join with '\n'.
 */
function parseFrame(block: string): Frame {
  const frame: Frame = { id: null, type: null, data: [] };
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') frame.id = value;
    else if (field === 'event') frame.type = value;
    else if (field === 'data') frame.data.push(value);
  }
  return frame;
}

function toEvent(frame: Frame): WorkspaceEvent | null {
  if (!frame.type) return null;
  const raw = frame.data.join('\n');
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }
  const contextId =
    payload && typeof payload === 'object' && typeof (payload as { context_id?: unknown }).context_id === 'string'
      ? (payload as { context_id: string }).context_id
      : '';
  return { id: frame.id ?? '', type: frame.type, context_id: contextId, payload };
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Subscribe to a run's event stream over `fetch` + `ReadableStream`.
 *
 * Yields `{id, type, context_id, payload}` for every frame with an `event:`
 * field. The server puts `context_id` inside each `data` payload; it is lifted
 * onto the event so callers can drop late frames from a previous context. A
 * `done` frame ends the iteration. If the stream ends (or the request fails)
 * before `done`, the subscription reconnects with `Last-Event-ID` set to the
 * last seen `id`, up to `maxRetries` times. Aborting `signal` ends the
 * iteration quietly.
 */
export async function* subscribeSSE(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  lastEventId: string | null,
  signal: AbortSignal,
  options: SubscribeSSEOptions = {},
): AsyncIterable<WorkspaceEvent> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;
  let last = lastEventId;
  let attempts = 0;

  while (!signal.aborted) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { ...headers, Accept: 'text/event-stream', ...(last ? { 'Last-Event-ID': last } : {}) },
        signal,
        cache: 'no-store',
      });
    } catch (err) {
      if (signal.aborted || isAbort(err)) return;
      if (++attempts > maxRetries) throw err;
      await sleep(retryDelayMs * attempts, signal);
      continue;
    }

    if (!res.ok || !res.body) {
      if (++attempts > maxRetries) throw new Error(`sse ${res.status}`);
      await sleep(retryDelayMs * attempts, signal);
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (signal.aborted || isAbort(err)) return;
          throw err;
        }
        if (chunk.done) break;
        // Normalise line endings on the rolling buffer, not the chunk: a
        // `\r\n` split across two reads must still collapse to `\n`, or the
        // `\r` would end up inside field values ("3\r", "done\r").
        buf = (buf + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const frame = parseFrame(block);
          if (frame.id !== null) last = frame.id;
          const event = toEvent(frame);
          if (!event) continue;
          yield event;
          if (event.type === 'done' || signal.aborted) return;
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }

    // Stream closed without `done`: resume from the last seen id.
    if (signal.aborted || ++attempts > maxRetries) return;
    await sleep(retryDelayMs * attempts, signal);
  }
}
