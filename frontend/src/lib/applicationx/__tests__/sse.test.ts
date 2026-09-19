import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';
import { subscribeSSE } from '../sse';
import type { WorkspaceEvent } from '../types';

// jsdom does not provide these; the sse.ts parser needs all three.
if (typeof global.TextEncoder === 'undefined') (global as unknown as { TextEncoder: unknown }).TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') (global as unknown as { TextDecoder: unknown }).TextDecoder = TextDecoder;
if (typeof global.ReadableStream === 'undefined') (global as unknown as { ReadableStream: unknown }).ReadableStream = ReadableStream;

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(iter: AsyncIterable<WorkspaceEvent>): Promise<WorkspaceEvent[]> {
  const out: WorkspaceEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

test('parses two events split across a chunk boundary', async () => {
  const full =
    'id: 1\nevent: message\ndata: {"context_id":"c1","text":"hello"}\n\n' +
    'id: 2\nevent: done\ndata: {"context_id":"c1"}\n\n';
  // Split mid-frame to prove buffering across reads.
  const splitAt = full.indexOf('event: done') - 3;
  const chunks = [full.slice(0, splitAt), full.slice(splitAt)];
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, body: streamFromChunks(chunks) });
  const signal = new AbortController().signal;

  const events = await collect(subscribeSSE(fetchImpl as unknown as typeof fetch, 'http://x/events', {}, null, signal));

  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ id: '1', type: 'message', context_id: 'c1' });
  expect(events[1]).toMatchObject({ id: '2', type: 'done', context_id: 'c1' });
});

test('stops iteration at the done event', async () => {
  const full = 'id: 1\nevent: done\ndata: {}\n\n' + 'id: 2\nevent: message\ndata: {}\n\n';
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, body: streamFromChunks([full]) });
  const signal = new AbortController().signal;

  const events = await collect(subscribeSSE(fetchImpl as unknown as typeof fetch, 'http://x/events', {}, null, signal));

  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('done');
});

test('aborts quietly when the signal fires', async () => {
  const controller = new AbortController();
  const fetchImpl = jest.fn().mockImplementation(() => {
    controller.abort();
    const err = new Error('aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  });

  const events = await collect(subscribeSSE(fetchImpl as unknown as typeof fetch, 'http://x/events', {}, null, controller.signal));
  expect(events).toHaveLength(0);
});

test('sends Last-Event-ID from the cursor on the initial request', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, body: streamFromChunks(['id: 9\nevent: done\ndata: {}\n\n']) });
  const signal = new AbortController().signal;

  await collect(subscribeSSE(fetchImpl as unknown as typeof fetch, 'http://x/events', {}, 'cursor-5', signal));

  const init = fetchImpl.mock.calls[0][1];
  expect(init.headers['Last-Event-ID']).toBe('cursor-5');
});
