import { getStatus, resolveContext } from '../client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe('getStatus', () => {
  test('sends bearer and parses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, organization_ref: 'lamc', campus_ref: 'LAMC', standalone_url: null, api_version: null }),
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
});
