/**
 * Tests for LMI (Labor Market Information) data-age validation.
 *
 * Per the Technical Manual, LMI data backing a CTE program submission must be
 * recent. These boundaries gate whether a program can be submitted, so the
 * 18-month and 24-month cutoffs are compliance-critical and exercised here.
 */
import {
  calculateLMIValidity,
  formatRetrievalDate,
  getValidityIcon,
  getValidityColorClass,
} from '../lmiValidation';

// Build a date `months` in the past (using the same ~30-day month the
// implementation uses so the boundaries line up deterministically).
const monthsAgo = (months: number): Date => {
  const ms = months * 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
};

describe('calculateLMIValidity', () => {
  it('treats freshly retrieved data as valid and not blocking', () => {
    const result = calculateLMIValidity(new Date());
    expect(result.status).toBe('valid');
    expect(result.shouldBlock).toBe(false);
    expect(result.message).toBe('');
    expect(result.ageMonths).toBe(0);
  });

  it('keeps data just inside the 18-month window valid', () => {
    // 17 months + a few days < 18 month boundary
    const result = calculateLMIValidity(monthsAgo(17));
    expect(result.status).toBe('valid');
    expect(result.shouldBlock).toBe(false);
  });

  it('treats exactly the 18-month boundary as still valid (<= 18)', () => {
    const result = calculateLMIValidity(monthsAgo(18));
    expect(result.ageMonths).toBe(18);
    expect(result.status).toBe('valid');
    expect(result.shouldBlock).toBe(false);
  });

  it('warns (but does not block) for data between 18 and 24 months old', () => {
    const result = calculateLMIValidity(monthsAgo(20));
    expect(result.status).toBe('warning');
    expect(result.shouldBlock).toBe(false);
    expect(result.message).toMatch(/Consider refreshing/i);
  });

  it('treats exactly the 24-month boundary as a warning (<= 24)', () => {
    const result = calculateLMIValidity(monthsAgo(24));
    expect(result.ageMonths).toBe(24);
    expect(result.status).toBe('warning');
    expect(result.shouldBlock).toBe(false);
  });

  it('blocks submission for data older than 24 months', () => {
    const result = calculateLMIValidity(monthsAgo(30));
    expect(result.status).toBe('invalid');
    expect(result.shouldBlock).toBe(true);
    expect(result.message).toMatch(/Must refresh/i);
  });

  it('accepts an ISO string as well as a Date', () => {
    const iso = monthsAgo(30).toISOString();
    const result = calculateLMIValidity(iso);
    expect(result.status).toBe('invalid');
    expect(result.shouldBlock).toBe(true);
  });
});

describe('formatRetrievalDate', () => {
  it('formats an ISO date in US long-month style', () => {
    expect(formatRetrievalDate('2025-01-15T00:00:00Z')).toMatch(
      /Jan(uary)?\s+1[45],\s+2025/
    );
  });

  it('accepts a Date object', () => {
    const formatted = formatRetrievalDate(new Date('2024-12-25T12:00:00Z'));
    expect(formatted).toMatch(/Dec/);
    expect(formatted).toMatch(/2024/);
  });
});

describe('getValidityIcon', () => {
  it('maps each status to its icon name', () => {
    expect(getValidityIcon('valid')).toBe('check-circle');
    expect(getValidityIcon('warning')).toBe('exclamation');
    expect(getValidityIcon('invalid')).toBe('x-circle');
  });
});

describe('getValidityColorClass', () => {
  it('returns emerald palette for valid', () => {
    const c = getValidityColorClass('valid');
    expect(c.bg).toContain('emerald');
    expect(c.text).toContain('emerald');
    expect(c.icon).toContain('emerald');
  });

  it('returns amber palette for warning', () => {
    expect(getValidityColorClass('warning').bg).toContain('amber');
  });

  it('returns red palette for invalid', () => {
    expect(getValidityColorClass('invalid').text).toContain('red');
  });

  it('prefixes light classes with dark: when isDark is set', () => {
    const c = getValidityColorClass('valid', true);
    expect(c.bg.startsWith('dark:')).toBe(true);
  });
});
