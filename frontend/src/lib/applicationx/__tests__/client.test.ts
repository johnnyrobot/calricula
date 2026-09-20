import { getStatus, resolveContext, missingTokenResolution, workspaceStandaloneUrl } from '../client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe('getStatus', () => {
  test('sends bearer and parses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, organization_ref: 'demo-college', campus_ref: 'MAIN', standalone_url: null, api_version: null }),
    });
    const s = await getStatus('tok');
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/api\/applicationx\/status$/);
    expect((mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>).toMatchObject({ Authorization: 'Bearer tok' });
    expect(s.enabled).toBe(true);
  });
});

describe('resolveContext', () => {
  test.each([
    [401, 'session_expired', false],
    [503, 'service_unavailable', true],
    [502, 'service_unavailable', true],
    [500, 'service_unavailable', false],
  ])('maps %s -> %s (retryable=%s)', async (code, state, retryable) => {
    mockFetch.mockResolvedValue({ ok: false, status: code, json: async () => ({ detail: { code: 'x' } }) });
    const r = await resolveContext(
      { calricula: 'ctok', applicationx: 'atok' },
      { program_id: 'p', workspace_id: null, context_id: 'c' },
      new AbortController().signal,
    );
    expect(r).toMatchObject({ state, retryable });
  });

  test('sends both Authorization and X-ApplicationX-Token headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ state: 'ready', workspace_id: 'w', workspace_title: 't', program_title: null, campus_label: 'c', revision_label: 'r', api_version: 'v' }),
    });
    await resolveContext(
      { calricula: 'ctok', applicationx: 'atok' },
      { program_id: 'p', workspace_id: null, context_id: 'c' },
      new AbortController().signal,
    );
    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ctok');
    expect(headers['X-ApplicationX-Token']).toBe('atok');
  });

  test('returns typed upstream state verbatim', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ state: 'mapping_required', message: 'm', retryable: false }) });
    const r = await resolveContext(
      { calricula: 'ctok', applicationx: 'atok' },
      { program_id: 'p', workspace_id: null, context_id: 'c' },
      new AbortController().signal,
    );
    expect(r.state).toBe('mapping_required');
  });

  test('returns a ready resolution untouched', async () => {
    const ready = { state: 'ready', workspace_id: 'w', workspace_title: 't', program_title: null, campus_label: 'c', revision_label: 'r', api_version: 'v' };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ready });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toEqual(ready);
  });

  test('4xx with a typed {detail:{state,...}} body from the broker becomes that resolution (I-1)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: { state: 'access_required', message: 'Ask your dean.', retryable: false } }),
    });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toEqual({ state: 'access_required', message: 'Ask your dean.', retryable: false });
  });

  test.each([
    ['unknown state', { detail: { state: 'pwned', message: 'x', retryable: true } }],
    ['string detail', { detail: 'forbidden' }],
    ['no detail', { code: 'x' }],
  ])('4xx with %s keeps the existing service_unavailable mapping', async (_label, body) => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => body });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toEqual({ state: 'service_unavailable', message: 'ApplicationX returned an unexpected response.', retryable: false });
  });

  test('4xx with an unparseable body keeps the existing mapping', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => { throw new SyntaxError('bad json'); } });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toMatchObject({ state: 'service_unavailable', retryable: false });
  });

  test.each([
    ['unknown state', { state: 'brand_new_state', message: 'm', retryable: true }],
    ['missing state', { message: 'm' }],
    ['non-object body', 'nope'],
  ])('200 with %s maps to version_mismatch (M-7)', async (_label, body) => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toEqual({
      state: 'version_mismatch',
      message: 'ApplicationX returned a response this version of Calricula cannot display.',
      retryable: false,
    });
  });

  test('200 known failure with malformed message/retryable is normalised', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ state: 'context_stale', message: { nested: 1 }, retryable: 'yes' }) });
    const r = await resolveContext({ calricula: 'ctok', applicationx: 'atok' }, { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toEqual({ state: 'context_stale', message: '', retryable: false });
  });
});

describe('missingTokenResolution', () => {
  test('both present -> null', () => {
    expect(missingTokenResolution('c', 'a')).toBeNull();
  });
  test('no Calricula token -> session_expired (regardless of the other)', () => {
    expect(missingTokenResolution(null, 'a')).toMatchObject({ state: 'session_expired' });
    expect(missingTokenResolution(null, null)).toMatchObject({ state: 'session_expired' });
  });
  test('Calricula present, ApplicationX missing -> not configured outage (I-2)', () => {
    expect(missingTokenResolution('c', null)).toEqual({
      state: 'service_unavailable',
      message: 'ApplicationX sign-in is not configured for this deployment.',
      retryable: false,
    });
  });
});

describe('workspaceStandaloneUrl', () => {
  test('null without a standalone URL', () => {
    expect(workspaceStandaloneUrl(null, 'w')).toBeNull();
  });
  test('builds /workspaces/<id> with encoding and trailing-slash tolerance', () => {
    expect(workspaceStandaloneUrl('https://ax.example.edu', 'w-1')).toBe('https://ax.example.edu/workspaces/w-1');
    expect(workspaceStandaloneUrl('https://ax.example.edu/', 'a b/c')).toBe('https://ax.example.edu/workspaces/a%20b%2Fc');
  });
});
