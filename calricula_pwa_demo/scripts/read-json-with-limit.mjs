export class ResponseLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResponseLimitError';
  }
}

export class ResponseDecodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResponseDecodeError';
  }
}

export async function readJsonWithinLimit(
  response,
  label,
  maximumBytes,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new TypeError('maximumBytes must be a positive safe integer.');
  }

  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const parsed = Number(declared);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > maximumBytes
    ) {
      throw new ResponseLimitError(
        `${label} exceeded the response-size limit.`,
      );
    }
  }

  if (!response.body) {
    throw new ResponseDecodeError(`${label} response could not be read.`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel('response-size limit exceeded');
        throw new ResponseLimitError(
          `${label} exceeded the response-size limit.`,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (
      error instanceof ResponseLimitError ||
      error instanceof ResponseDecodeError
    ) {
      throw error;
    }
    throw new ResponseDecodeError(`${label} response could not be read.`);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ResponseDecodeError(
      `${label} did not return valid UTF-8.`,
    );
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ResponseDecodeError(`${label} did not return valid JSON.`);
  }
}
