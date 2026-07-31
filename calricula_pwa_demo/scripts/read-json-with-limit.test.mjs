import { describe, expect, it, vi } from 'vitest';

import {
  ResponseLimitError,
  readJsonWithinLimit,
} from './read-json-with-limit.mjs';

function chunkedResponse(chunks, headers = {}) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[index]));
      index += 1;
    },
    cancel,
  });
  return {
    cancel,
    response: new Response(body, {
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    }),
  };
}

describe('readJsonWithinLimit', () => {
  it('parses a chunked response with no Content-Length at the exact limit', async () => {
    const payload = '{"ok":true}';
    const { response } = chunkedResponse(['{"ok":', 'true}']);
    await expect(
      readJsonWithinLimit(response, 'fixture', Buffer.byteLength(payload)),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects a declared oversized response before reading the stream', async () => {
    const { response, cancel } = chunkedResponse(['{"ok":true}'], {
      'content-length': '2048',
    });
    await expect(
      readJsonWithinLimit(response, 'fixture', 128),
    ).rejects.toBeInstanceOf(ResponseLimitError);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels a chunked response immediately after actual bytes cross the limit', async () => {
    const { response, cancel } = chunkedResponse([
      '{"value":"',
      'x'.repeat(64),
      '"}',
    ]);
    await expect(
      readJsonWithinLimit(response, 'fixture', 24),
    ).rejects.toBeInstanceOf(ResponseLimitError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed UTF-8 and malformed JSON without returning body contents', async () => {
    const invalidUtf8 = new Response(
      new Uint8Array([0xc3, 0x28]),
    );
    await expect(
      readJsonWithinLimit(invalidUtf8, 'fixture', 10),
    ).rejects.toThrow('valid UTF-8');

    const secret = 'private-upstream-body';
    await expect(
      readJsonWithinLimit(
        new Response(`{"message":"${secret}"`),
        'fixture',
        128,
      ),
    ).rejects.toThrow('valid JSON');
    await expect(
      readJsonWithinLimit(
        new Response(`{"message":"${secret}"`),
        'fixture',
        128,
      ),
    ).rejects.not.toThrow(secret);
  });
});
