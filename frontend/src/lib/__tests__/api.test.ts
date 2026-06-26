/**
 * Tests for the backend API client.
 *
 * The private request() helper is the security-sensitive core: it injects the
 * bearer token, builds URLs/query strings, and normalizes the many error shapes
 * the FastAPI backend can return. We exercise it through the public methods by
 * stubbing global.fetch.
 */
import { api } from '../api';

const BASE = 'http://localhost:8001';

// Helper to build a fake Response-like object good enough for the client.
function jsonResponse(
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('API client request building & auth', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
    api.setToken(null);
  });

  it('does NOT send an Authorization header when no token is set', async () => {
    await api.getCourse('c1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('injects a Bearer token once setToken is called', async () => {
    api.setToken('tok-123');
    await api.getCourse('c1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/courses/c1`);
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('clears the Authorization header when the token is reset to null', async () => {
    api.setToken('tok-123');
    api.setToken(null);
    await api.getCourse('c1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('builds query strings from listCourses params, omitting absent ones', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, limit: 12, pages: 0 }));
    await api.listCourses({ department: 'd1', status: 'Draft', mine: true, page: 2 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('department=d1');
    expect(url).toContain('status=Draft');
    expect(url).toContain('mine=true');
    expect(url).toContain('page=2');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('limit=');
  });

  it('omits the query string entirely when no params are given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, limit: 12, pages: 0 }));
    await api.listCourses();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/courses`);
  });

  it('serializes the body and method for createCourse', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'new' }));
    await api.createCourse({ subject_code: 'MATH', course_number: '101', title: 'Calc', department_id: 'd1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/courses`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ subject_code: 'MATH', title: 'Calc' });
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'c1', title: 'Calc' }));
    const course = await api.getCourse('c1');
    expect(course).toMatchObject({ id: 'c1', title: 'Calc' });
  });
});

describe('API client error normalization', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    api.setToken(null);
  });

  it('throws the string detail from a FastAPI HTTPException', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Course not found' }, { ok: false, status: 404 }));
    await expect(api.getCourse('missing')).rejects.toThrow('Course not found');
  });

  it('joins array-shaped FastAPI validation errors into one message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: [{ msg: 'field required', loc: ['body', 'title'] }, { msg: 'value too long' }] },
        { ok: false, status: 422 }
      )
    );
    await expect(api.getCourse('x')).rejects.toThrow('field required, value too long');
  });

  it('stringifies an object-shaped detail', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: { code: 'X', nested: true } }, { ok: false, status: 400 })
    );
    await expect(api.getCourse('x')).rejects.toThrow(/"code":"X"/);
  });

  it('falls back to HTTP <status> when detail is absent', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    await expect(api.getCourse('x')).rejects.toThrow('HTTP 500');
  });

  it('uses "Unknown error" when the error body is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    await expect(api.getCourse('x')).rejects.toThrow('Unknown error');
  });

  it('surfaces a 401 detail unchanged (auth failure path)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Not authenticated' }, { ok: false, status: 401 }));
    await expect(api.listCourses()).rejects.toThrow('Not authenticated');
  });
});

describe('API client endpoint routing', () => {
  // A representative spread across the API surface: each entry asserts the
  // method resolves to the correct path + HTTP verb. This guards against path
  // typos and accidental verb changes that route auth'd requests to the wrong
  // backend handler.
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    api.setToken('tok');
  });

  const cases: Array<[string, () => Promise<unknown>, string, string]> = [
    ['getProgram', () => api.getProgram('p1'), `${BASE}/api/programs/p1`, 'GET'],
    ['deleteProgram', () => api.deleteProgram('p1'), `${BASE}/api/programs/p1`, 'DELETE'],
    ['getApprovalCounts', () => api.getApprovalCounts(), `${BASE}/api/approvals/counts`, 'GET'],
    [
      'transitionCourseStatus',
      () => api.transitionCourseStatus('c1', { new_status: 'Approved' }),
      `${BASE}/api/approvals/c1/transition`,
      'POST',
    ],
    [
      'getWorkflowHistory',
      () => api.getWorkflowHistory('Course', 'c1'),
      `${BASE}/api/workflow/history/Course/c1`,
      'GET',
    ],
    ['listCourseRequisites', () => api.listCourseRequisites('c1'), `${BASE}/api/courses/c1/requisites`, 'GET'],
    [
      'deleteCourseRequisite',
      () => api.deleteCourseRequisite('c1', 'r1'),
      `${BASE}/api/courses/c1/requisites/r1`,
      'DELETE',
    ],
    ['getNotificationCounts', () => api.getNotificationCounts(), `${BASE}/api/notifications/counts`, 'GET'],
    [
      'markNotificationRead',
      () => api.markNotificationRead('n1'),
      `${BASE}/api/notifications/n1/read`,
      'PATCH',
    ],
    [
      'markAllNotificationsRead',
      () => api.markAllNotificationsRead(),
      `${BASE}/api/notifications/mark-all-read`,
      'POST',
    ],
    ['getDashboardStats', () => api.getDashboardStats(), `${BASE}/api/dashboard/stats`, 'GET'],
    ['getDepartmentAnalytics', () => api.getDepartmentAnalytics(), `${BASE}/api/dashboard/analytics`, 'GET'],
    ['listCrossListings', () => api.listCrossListings('c1'), `${BASE}/api/courses/c1/cross-listings`, 'GET'],
    ['duplicateCourse', () => api.duplicateCourse('c1'), `${BASE}/api/courses/c1/duplicate`, 'POST'],
  ];

  it.each(cases)('%s routes to the correct URL and verb', async (_name, call, expectedUrl, expectedMethod) => {
    await call();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(expectedUrl);
    // GET requests pass no explicit method (fetch defaults to GET).
    expect((init.method ?? 'GET').toUpperCase()).toBe(expectedMethod);
    // Auth header is present on every routed request.
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('encodes search params for searchCourses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    await api.searchCourses({ q: 'calc 1', exclude_id: 'c9', limit: 5 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/courses/search?');
    expect(url).toContain('q=calc+1');
    expect(url).toContain('exclude_id=c9');
    expect(url).toContain('limit=5');
  });
});

describe('API client no-content handling', () => {
  it('returns an empty object for 204 responses (deleteCourse)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('should not be called for 204');
      },
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.deleteCourse('c1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/courses/c1`);
    expect(init.method).toBe('DELETE');
  });
});
