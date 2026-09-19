import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { HostStatePanel } from '../HostStatePanel';
import type { HostFailure } from '@/lib/applicationx/types';

expect.extend(toHaveNoViolations);

describe('HostStatePanel accessibility', () => {
  test('service_unavailable has no axe violations', async () => {
    const resolution: HostFailure = { state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true };
    const { container } = render(<HostStatePanel resolution={resolution} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  test('access_required has no axe violations', async () => {
    const resolution: HostFailure = { state: 'access_required', message: 'Ask your campus lead for access.', retryable: false };
    const { container } = render(<HostStatePanel resolution={resolution} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  test('session_expired alert has no axe violations', async () => {
    const resolution: HostFailure = { state: 'session_expired', message: 'Your session expired.', retryable: false };
    const { container } = render(<HostStatePanel resolution={resolution} onRetry={jest.fn()} standaloneUrl={null} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
