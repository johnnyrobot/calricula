'use client';

import React from 'react';
import { RadioGroup } from '@headlessui/react';
import {
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

export interface WageData {
  year?: string;
  area?: string;
  area_type?: string;
  occupation_title: string;
  soc_code?: string;
  employment?: number;
  hourly_mean?: number;
  hourly_median?: number;
  hourly_10th?: number;
  hourly_25th?: number;
  hourly_75th?: number;
  hourly_90th?: number;
  annual_mean?: number;
  annual_median?: number;
}

export interface OccupationSelectionProps {
  /** List of wage data records (occupations) */
  occupations: WageData[];

  /** Currently selected SOC code (or null if none selected) */
  selectedSocCode: string | null;

  /** Callback when an occupation is selected */
  onSelect: (socCode: string | null, occupation: WageData | null) => void;

  /** Additional CSS classes */
  className?: string;

  /** Whether the component is loading */
  isLoading?: boolean;

  /** Optional message to display when no occupations available */
  emptyMessage?: string;
}

/**
 * OccupationSelection Component
 *
 * Displays a list of occupations with radio button selection.
 * Shows key statistics for each occupation (SOC code, area, wage, employment).
 */
export const OccupationSelection: React.FC<OccupationSelectionProps> = ({
  occupations,
  selectedSocCode,
  onSelect,
  className = '',
  isLoading = false,
  emptyMessage = 'No occupations found',
}) => {
  const selectedOccupation = occupations.find(
    (occ) => occ.soc_code === selectedSocCode
  );

  const formatCurrency = (value?: number): string => {
    if (value === undefined || value === null) return '—';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  };

  if (isLoading) {
    return (
      <div className={`flex justify-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-luminous-600" />
      </div>
    );
  }

  if (!occupations || occupations.length === 0) {
    return (
      <div
        className={`text-center py-8 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 ${className}`}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <RadioGroup
      value={selectedSocCode || ''}
      onChange={(socCode) => {
        const occ =
          socCode && occupations.find((o) => o.soc_code === socCode);
        onSelect(socCode || null, occ || null);
      }}
      className={className}
    >
      <RadioGroup.Label className="sr-only">
        Select a target occupation
      </RadioGroup.Label>

      <div className="space-y-2">
        {occupations.map((occupation) => {
          const isSelected = selectedSocCode === occupation.soc_code;

          return (
            <RadioGroup.Option
              key={occupation.soc_code || occupation.occupation_title}
              value={occupation.soc_code || ''}
              className="relative cursor-pointer"
            >
              {({ checked }) => (
                <div
                  className={`
                    p-4 rounded-lg border-2 transition-all
                    focus-within:outline-none focus-within:ring-2 focus-within:ring-luminous-500 focus-within:ring-offset-2
                    dark:focus-within:ring-offset-slate-900
                    ${
                      checked
                        ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-luminous-300 dark:hover:border-luminous-700'
                    }
                  `}
                >
                  <div className="flex items-start gap-4">
                    {/* Radio Button */}
                    <div className="flex-shrink-0 mt-1">
                      <div
                        className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center
                          ${
                            checked
                              ? 'border-luminous-600 bg-luminous-600'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }
                        `}
                      >
                        {checked && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title and SOC Code */}
                      <div className="mb-2">
                        <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                          {occupation.occupation_title}
                        </p>
                        {occupation.soc_code && (
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                            SOC {occupation.soc_code}
                          </p>
                        )}
                      </div>

                      {/* Stats Row */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        {/* Area */}
                        {occupation.area && (
                          <div className="text-slate-600 dark:text-slate-400">
                            <span className="text-xs text-slate-500 dark:text-slate-500">
                              Area
                            </span>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {occupation.area}
                            </p>
                          </div>
                        )}

                        {/* Hourly Wage */}
                        {occupation.hourly_mean !== undefined && (
                          <div className="flex items-start gap-1.5">
                            <CurrencyDollarIcon className="h-4 w-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-500">
                                Hourly
                              </p>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {occupation.hourly_mean.toFixed(2)}/hr
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Annual Wage */}
                        {occupation.annual_mean !== undefined && (
                          <div className="flex items-start gap-1.5">
                            <CurrencyDollarIcon className="h-4 w-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-500">
                                Annual
                              </p>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {formatCurrency(occupation.annual_mean)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Employment */}
                        {occupation.employment !== undefined && (
                          <div className="flex items-start gap-1.5">
                            <UserGroupIcon className="h-4 w-4 text-slate-600 dark:text-slate-400 mt-1 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-500">
                                Employed
                              </p>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {occupation.employment.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </RadioGroup.Option>
          );
        })}
      </div>

      {/* Selection Summary (if something is selected) */}
      {selectedOccupation && (
        <div className="mt-6 p-4 bg-luminous-50 dark:bg-luminous-900/20 rounded-lg border border-luminous-200 dark:border-luminous-800">
          <p className="text-sm text-luminous-900 dark:text-luminous-200">
            <span className="font-semibold">Selected:</span> {selectedOccupation.occupation_title}
            {selectedOccupation.soc_code && (
              <>
                {' '}
                <span className="text-luminous-700 dark:text-luminous-300">
                  (SOC {selectedOccupation.soc_code})
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </RadioGroup>
  );
};

export default OccupationSelection;
