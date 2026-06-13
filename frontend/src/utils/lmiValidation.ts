/**
 * LMI Data Validation Utilities
 *
 * Per Technical Manual:
 * LMI data must be less than 2 years old for CTE program submission
 */

export type ValidityStatus = 'valid' | 'warning' | 'invalid';

export interface ValidityResult {
  status: ValidityStatus;
  ageMonths: number;
  message: string;
  shouldBlock: boolean; // True if data is too old for submission
}

/**
 * Calculate the validity of LMI data based on retrieval date
 *
 * Rules:
 * - Valid: 0-18 months old
 * - Warning: 18-24 months old
 * - Invalid: >24 months old
 */
export function calculateLMIValidity(retrievedAt: string | Date): ValidityResult {
  const now = new Date();
  const retrievedDate = typeof retrievedAt === 'string' ? new Date(retrievedAt) : retrievedAt;

  // Calculate age in milliseconds
  const ageMs = now.getTime() - retrievedDate.getTime();

  // Convert to months (approximate: 30 days per month)
  const ageMonths = Math.floor(ageMs / (1000 * 60 * 60 * 24 * 30));

  if (ageMonths <= 18) {
    return {
      status: 'valid',
      ageMonths,
      message: '',
      shouldBlock: false,
    };
  } else if (ageMonths <= 24) {
    return {
      status: 'warning',
      ageMonths,
      message: 'Consider refreshing before submission',
      shouldBlock: false,
    };
  } else {
    return {
      status: 'invalid',
      ageMonths,
      message: 'Must refresh before submission',
      shouldBlock: true,
    };
  }
}

/**
 * Format the retrieval date for display
 */
export function formatRetrievalDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get the icon name for the validity status
 */
export function getValidityIcon(status: ValidityStatus): string {
  switch (status) {
    case 'valid':
      return 'check-circle';
    case 'warning':
      return 'exclamation';
    case 'invalid':
      return 'x-circle';
  }
}

/**
 * Get the color class for the validity status
 */
export function getValidityColorClass(status: ValidityStatus, isDark: boolean = false): {
  bg: string;
  text: string;
  icon: string;
} {
  const prefix = isDark ? 'dark:' : '';

  switch (status) {
    case 'valid':
      return {
        bg: `${prefix}bg-emerald-50 dark:bg-emerald-900/20`,
        text: `${prefix}text-emerald-700 dark:text-emerald-300`,
        icon: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'warning':
      return {
        bg: `${prefix}bg-amber-50 dark:bg-amber-900/20`,
        text: `${prefix}text-amber-700 dark:text-amber-300`,
        icon: 'text-amber-600 dark:text-amber-400',
      };
    case 'invalid':
      return {
        bg: `${prefix}bg-red-50 dark:bg-red-900/20`,
        text: `${prefix}text-red-700 dark:text-red-300`,
        icon: 'text-red-600 dark:text-red-400',
      };
  }
}
