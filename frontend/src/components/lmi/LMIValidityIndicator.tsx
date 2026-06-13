'use client';

import React, { useMemo } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';
import {
  calculateLMIValidity,
  formatRetrievalDate,
  getValidityColorClass,
} from '@/utils/lmiValidation';

export type ValiditySize = 'sm' | 'md' | 'lg';

export interface LMIValidityIndicatorProps {
  /** Date when LMI data was retrieved (ISO string or Date object) */
  retrievedAt: string | Date;

  /** Whether to show the age in months */
  showAge?: boolean;

  /** Whether to show the validity message */
  showMessage?: boolean;

  /** Size of the indicator */
  size?: ValiditySize;

  /** Additional CSS classes */
  className?: string;

  /** Whether to show the retrieved date */
  showDate?: boolean;
}

const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
};

const TEXT_SIZE = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const PADDING = {
  sm: 'px-2 py-1',
  md: 'px-3 py-2',
  lg: 'px-4 py-3',
};

const ICON_WRAPPER = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

/**
 * LMI Validity Indicator Component
 *
 * Displays the validity status of LMI data based on its age.
 * Per Technical Manual:
 * - Green (Valid): 0-18 months old
 * - Yellow (Warning): 18-24 months old
 * - Red (Invalid): >24 months old
 */
export const LMIValidityIndicator: React.FC<LMIValidityIndicatorProps> = ({
  retrievedAt,
  showAge = false,
  showMessage = false,
  size = 'md',
  className = '',
  showDate = true,
}) => {
  const validity = useMemo(() => calculateLMIValidity(retrievedAt), [retrievedAt]);
  const colors = getValidityColorClass(validity.status);
  const formattedDate = formatRetrievalDate(retrievedAt);

  // Select icon based on status
  const IconComponent = {
    valid: CheckCircleIcon,
    warning: ExclamationTriangleIcon,
    invalid: XCircleIcon,
  }[validity.status];

  // Build label text
  const statusLabel = {
    valid: 'Valid',
    warning: 'Warning',
    invalid: 'Invalid',
  }[validity.status];

  // Build display text
  let displayText = statusLabel;
  if (showAge) {
    displayText += ` (${validity.ageMonths} month${validity.ageMonths !== 1 ? 's' : ''} old)`;
  }
  if (showDate) {
    displayText += ` - ${formattedDate}`;
  }

  return (
    <div
      className={`
        rounded-lg border transition-colors
        ${colors.bg}
        ${className}
      `}
      aria-label={`LMI data validity: ${displayText}. ${validity.message}`}
      role="status"
    >
      <div className={`flex items-start gap-2 ${PADDING[size]}`}>
        {/* Icon */}
        <div className={`flex-shrink-0 ${ICON_WRAPPER[size]} ${colors.icon}`}>
          <IconComponent
            width={ICON_SIZE[size]}
            height={ICON_SIZE[size]}
            aria-hidden="true"
          />
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${TEXT_SIZE[size]} ${colors.text}`}>
            {displayText}
          </p>

          {/* Message (if showing and present) */}
          {showMessage && validity.message && (
            <p className={`${TEXT_SIZE[size]} ${colors.text} opacity-75 mt-1`}>
              {validity.message}
            </p>
          )}

          {/* Additional info for invalid status */}
          {validity.status === 'invalid' && (
            <p className={`${TEXT_SIZE[size]} ${colors.text} opacity-75 mt-1`}>
              Data is {validity.ageMonths} months old. Please refresh before submission.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LMIValidityIndicator;
