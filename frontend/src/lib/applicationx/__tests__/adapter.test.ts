// adapter.ts calls the global `fetch` directly when subscribing; jsdom
// doesn't define one, so stub it before the module under test is loaded.
const globalFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = globalFetch as unknown as typeof fetch;

import { createBrokeredAdapter } from '../adapter';
import * as client from '../client';

jest.mock('../client', () => ({
  ...jest.requireActual('../client'),
  op: jest.fn(),
  resolveContext: jest.fn(),
}));
jest.mock('../sse', () => ({ subscribeSSE: jest.fn() }));

import { subscribeSSE } from '../sse';

const mockOp = client.op as jest.Mock;
const mockResolveContext = client.resolveContext as jest.Mock;
const mockSubscribeSSE = subscribeSSE as jest.Mock;

const push = jest.fn();
const router = { push };
const getToken = jest.fn(async (resource?: string) => (resource === 'applicationx' ? 'atok' : 'ctok'));

const baseCtx = {
  host: 'calricula' as const,
  organization_ref: 'org',
  campus_ref: 'campus',
  program_ref: null,
  workspace_id: null,
  context_id: 'ctx-1',
};

beforeEach(() => {
  mockOp.mockReset();
  mockResolveContext.mockReset();
  mockSubscribeSSE.mockReset();
  push.mockReset();
  getToken.mockClear();
});

test('resolveContext forwards both tokens to the client', async () => {
  mockResolveContext.mockResolvedValue({ state: 'ready', workspace_id: 'w', workspace_title: 't', program_title: null, campus_label: 'c', revision_label: 'r', api_version: 'v' });
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  await adapter.resolveContext(baseCtx, signal);

  expect(mockResolveContext).toHaveBeenCalledWith(
    { calricula: 'ctok', applicationx: 'atok' },
    { program_id: null, workspace_id: null, context_id: 'ctx-1' },
    signal,
  );
});

test('resolveContext resolves session_expired when either token is missing', async () => {
  const noAppToken = jest.fn(async (resource?: string) => (resource === 'applicationx' ? null : 'ctok'));
  const adapter = createBrokeredAdapter({ getToken: noAppToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  const result = await adapter.resolveContext(baseCtx, signal);

  expect(result).toEqual({ state: 'session_expired', message: 'Your session expired. Sign in again.', retryable: false });
  expect(mockResolveContext).not.toHaveBeenCalled();
});

test('request attaches bearer token for a known operation', async () => {
  mockOp.mockResolvedValue({ ok: true });
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  const result = await adapter.request('chat.messages', { text: 'hi' }, signal);

  expect(result).toEqual({ ok: true });
  expect(mockOp).toHaveBeenCalledWith({ calricula: 'ctok', applicationx: 'atok' }, 'chat.messages', {}, { text: 'hi' }, signal);
});

test('request maps chat.cancel to path_params', async () => {
  mockOp.mockResolvedValue({ ok: true });
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  await adapter.request('chat.cancel', { run_id: 'r1' }, signal);

  expect(mockOp).toHaveBeenCalledWith({ calricula: 'ctok', applicationx: 'atok' }, 'chat.cancel', { run_id: 'r1' }, null, signal);
});

test('request rejects an unknown operation', async () => {
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  await expect(adapter.request('nope.op', {}, signal)).rejects.toMatchObject({ code: 'unknown_operation' });
  expect(mockOp).not.toHaveBeenCalled();
});

test('request throws session_expired when a token is unavailable', async () => {
  const noAppToken = jest.fn(async (resource?: string) => (resource === 'applicationx' ? null : 'ctok'));
  const adapter = createBrokeredAdapter({ getToken: noAppToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  await expect(adapter.request('chat.messages', {}, signal)).rejects.toMatchObject({ code: 'session_expired' });
  expect(mockOp).not.toHaveBeenCalled();
});

test('subscribe passes Last-Event-ID cursor and both auth headers', async () => {
  async function* fakeGen() {
    yield { id: '1', type: 'message', context_id: 'c', payload: {} };
  }
  mockSubscribeSSE.mockReturnValue(fakeGen());
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  const signal = new AbortController().signal;

  const iter = adapter.subscribe('run-1', 'cursor-7', signal);
  const results = [];
  for await (const e of iter) results.push(e);

  expect(results).toHaveLength(1);
  expect(mockSubscribeSSE).toHaveBeenCalledWith(
    globalFetch,
    expect.stringMatching(/\/api\/applicationx\/runs\/run-1\/events$/),
    { Authorization: 'Bearer ctok', 'X-ApplicationX-Token': 'atok' },
    'cursor-7',
    signal,
  );
});

test('navigateToProgram pushes the program route', () => {
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  adapter.navigateToProgram({ source_app: 'calricula', external_id: 'p-1', revision: '1' });
  expect(push).toHaveBeenCalledWith('/programs/p-1');
});

test('openStandalone is a no-op without a standaloneUrl', () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: null });
  adapter.openStandalone('w-1');
  expect(openSpy).not.toHaveBeenCalled();
  openSpy.mockRestore();
});

test('openStandalone opens the workspace URL when standaloneUrl is set', () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  const adapter = createBrokeredAdapter({ getToken, router, standaloneUrl: 'https://standalone.example' });
  adapter.openStandalone('w-1');
  expect(openSpy).toHaveBeenCalledWith('https://standalone.example/workspaces/w-1', '_blank', 'noopener');
  openSpy.mockRestore();
});
