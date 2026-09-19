import { renderHook, waitFor } from '@testing-library/react';
import { useApplicationXStatus, resetApplicationXStatusCache } from '../useApplicationXStatus';
import { getStatus } from '../../lib/applicationx/client';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ getToken: async () => 'tok', isAuthenticated: true }),
}));

jest.mock('../../lib/applicationx/client', () => ({
  getStatus: jest.fn(),
}));

const mockGetStatus = getStatus as jest.Mock;

beforeEach(() => {
  mockGetStatus.mockReset();
  resetApplicationXStatusCache();
});

test('exposes enabled from getStatus', async () => {
  mockGetStatus.mockResolvedValue({ enabled: true, organization_ref: 'lamc', campus_ref: 'LAMC', standalone_url: null, api_version: null });
  const { result } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.status?.enabled).toBe(true);
});

test('second render does not refetch within cache window', async () => {
  mockGetStatus.mockResolvedValue({ enabled: true, organization_ref: 'lamc', campus_ref: 'LAMC', standalone_url: null, api_version: null });
  const { result: r1 } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(r1.current.loading).toBe(false));
  const { result: r2 } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(r2.current.loading).toBe(false));
  expect(mockGetStatus).toHaveBeenCalledTimes(1);
});

test('a rejected getStatus yields enabled:false', async () => {
  mockGetStatus.mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.status).toMatchObject({ enabled: false, organization_ref: null, campus_ref: null, standalone_url: null, api_version: null });
});

test('a failed status fetch is not cached: the next mount refetches (M-9)', async () => {
  mockGetStatus.mockRejectedValueOnce(new Error('boom'));
  const { result: r1 } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(r1.current.loading).toBe(false));
  expect(r1.current.status?.enabled).toBe(false);

  mockGetStatus.mockResolvedValueOnce({ enabled: true, organization_ref: 'lamc', campus_ref: 'LAMC', standalone_url: null, api_version: null });
  const { result: r2 } = renderHook(() => useApplicationXStatus());
  await waitFor(() => expect(r2.current.loading).toBe(false));
  expect(mockGetStatus).toHaveBeenCalledTimes(2);
  expect(r2.current.status?.enabled).toBe(true);
});
