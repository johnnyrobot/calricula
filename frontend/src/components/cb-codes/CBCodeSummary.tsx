'use client';

// ===========================================
// CB Code Summary View Component - CUR-62
// ===========================================
// Comprehensive grid/table view of all CB codes with their values,
// completion status, and edit functionality.

import { useState, useCallback, useMemo } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  PencilSquareIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  AcademicCapIcon,
  BuildingLibraryIcon,
  BriefcaseIcon,
  BookOpenIcon,
  ArrowPathIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleSolidIcon,
} from '@heroicons/react/24/solid';

// ===========================================
// Types & Constants
// ===========================================

export interface CBCodes {
  [key: string]: string | undefined;
}

export interface CBCodeDefinition {
  code: string;
  name: string;
  description: string;
  required: boolean;
  category: 'core' | 'transfer' | 'vocational' | 'classification' | 'other';
  icon: React.ComponentType<{ className?: string }>;
  options: {
    value: string;
    label: string;
    description?: string;
  }[];
  dependencies?: {
    code: string;
    values: string[];
  };
}

// Complete list of all CB codes with metadata
const CB_CODE_DEFINITIONS: CBCodeDefinition[] = [
  // Core Codes
  {
    code: 'CB01',
    name: 'Department Code',
    description: 'Three-digit code identifying the department',
    required: true,
    category: 'core',
    icon: BuildingLibraryIcon,
    options: [], // Free-form input
  },
  {
    code: 'CB02',
    name: 'Course Designator',
    description: 'Subject code and course number (e.g., MATH 101)',
    required: true,
    category: 'core',
    icon: BookOpenIcon,
    options: [], // Free-form input
  },
  {
    code: 'CB03',
    name: 'TOP Code',
    description: 'Taxonomy of Programs classification code',
    required: true,
    category: 'core',
    icon: ClipboardDocumentListIcon,
    options: [], // Large list, loaded separately
  },
  {
    code: 'CB04',
    name: 'Credit Status',
    description: 'Credit type and degree applicability',
    required: true,
    category: 'core',
    icon: AcademicCapIcon,
    options: [
      { value: 'A', label: 'Degree-Applicable Credit', description: 'Counts toward associate degree' },
      { value: 'B', label: 'Credit - Not Degree Applicable', description: 'Credit but not for degrees' },
      { value: 'C', label: 'Noncredit', description: 'No credit awarded' },
      { value: 'D', label: 'Noncredit - Enhanced Funding', description: 'CDCP eligible noncredit' },
    ],
  },
  {
    code: 'CB05',
    name: 'Transfer Status',
    description: 'Transferability to UC and/or CSU',
    required: true,
    category: 'transfer',
    icon: BuildingLibraryIcon,
    options: [
      { value: 'A', label: 'UC and CSU Transferable', description: 'Transfers to both systems' },
      { value: 'B', label: 'CSU Transferable Only', description: 'Transfers to CSU only' },
      { value: 'C', label: 'Not Transferable', description: 'Does not transfer' },
    ],
    dependencies: { code: 'CB04', values: ['A', 'B'] },
  },
  {
    code: 'CB06',
    name: 'Distance Education',
    description: 'Course delivery method',
    required: true,
    category: 'classification',
    icon: ComputerDesktopIcon,
    options: [
      { value: 'Y', label: 'Entirely Online', description: '100% distance education' },
      { value: 'H', label: 'Hybrid', description: 'Combination of online and in-person' },
      { value: 'N', label: 'Not Distance Education', description: 'Traditional on-campus' },
    ],
  },
  {
    code: 'CB07',
    name: 'Funding Agency Category',
    description: 'Source of funding for the course',
    required: false,
    category: 'other',
    icon: CurrencyDollarIcon,
    options: [
      { value: 'Y', label: 'Not Applicable', description: 'Standard state funding' },
    ],
  },
  {
    code: 'CB08',
    name: 'Basic Skills Status',
    description: 'Whether course develops foundational skills',
    required: true,
    category: 'classification',
    icon: BookOpenIcon,
    options: [
      { value: 'B', label: 'Basic Skills Course', description: 'Pre-collegiate level' },
      { value: 'N', label: 'Not Basic Skills', description: 'College-level course' },
    ],
  },
  {
    code: 'CB09',
    name: 'SAM Priority Code',
    description: 'Vocational/occupational classification',
    required: true,
    category: 'vocational',
    icon: BriefcaseIcon,
    options: [
      { value: 'A', label: 'Apprenticeship', description: 'Registered apprenticeship program' },
      { value: 'B', label: 'Advanced Occupational', description: 'Requires prior training' },
      { value: 'C', label: 'Clearly Occupational', description: 'Entry-level job preparation' },
      { value: 'D', label: 'Possibly Occupational', description: 'May support employment' },
      { value: 'E', label: 'Non-Occupational', description: 'General education/transfer' },
    ],
  },
  {
    code: 'CB10',
    name: 'Cooperative Work Experience',
    description: 'Whether course includes supervised work experience',
    required: true,
    category: 'vocational',
    icon: BriefcaseIcon,
    options: [
      { value: 'Y', label: 'Cooperative Work Experience', description: 'Includes work component' },
      { value: 'N', label: 'Not Cooperative Work Experience', description: 'Standard course' },
    ],
  },
  {
    code: 'CB11',
    name: 'Course Classification',
    description: 'New, modified, or existing course status',
    required: true,
    category: 'classification',
    icon: ClipboardDocumentListIcon,
    options: [
      { value: 'A', label: 'New Course', description: 'Never before offered' },
      { value: 'B', label: 'Modified Course', description: 'Substantial changes' },
      { value: 'C', label: 'Existing Course', description: 'No substantial changes' },
    ],
  },
  {
    code: 'CB13',
    name: 'Educational Assistance Class',
    description: 'Special population targeting',
    required: false,
    category: 'other',
    icon: UserGroupIcon,
    options: [
      { value: 'N', label: 'Not an Educational Assistance Class', description: 'Standard course' },
      { value: 'S', label: 'Special Class - Disabled Students', description: 'DSPS designated' },
    ],
  },
  {
    code: 'CB21',
    name: 'Prior to College Level',
    description: 'Course level relative to transfer-level',
    required: true,
    category: 'classification',
    icon: AcademicCapIcon,
    options: [
      { value: 'Y', label: 'Not Prior to College Level', description: 'Transfer/college level' },
      { value: 'A', label: 'One Level Below Transfer', description: 'Immediately preparatory' },
      { value: 'B', label: 'Two Levels Below Transfer', description: 'Two courses away' },
      { value: 'C', label: 'Three Levels Below Transfer', description: 'Three courses away' },
      { value: 'D', label: 'Four Levels Below Transfer', description: 'Four+ courses away' },
    ],
  },
  {
    code: 'CB22',
    name: 'Noncredit Category',
    description: 'Category for noncredit courses',
    required: false,
    category: 'other',
    icon: BookOpenIcon,
    options: [
      { value: 'A', label: 'ESL/Citizenship', description: 'English as Second Language' },
      { value: 'B', label: 'Elementary/Secondary Basic Skills', description: 'Basic education' },
      { value: 'C', label: 'Health and Safety', description: 'Health education' },
      { value: 'D', label: 'Home Economics', description: 'Consumer education' },
      { value: 'E', label: 'Parenting', description: 'Parent education' },
      { value: 'F', label: 'Older Adults', description: 'Courses for older adults' },
      { value: 'G', label: 'Persons with Disabilities', description: 'Disability support' },
      { value: 'H', label: 'Short-Term Vocational', description: 'Workforce preparation' },
      { value: 'I', label: 'Workforce Preparation', description: 'Job skills' },
      { value: 'Y', label: 'Not Applicable', description: 'Credit course' },
    ],
    dependencies: { code: 'CB04', values: ['C', 'D'] },
  },
  {
    code: 'CB23',
    name: 'Funding Agency',
    description: 'External funding source if any',
    required: false,
    category: 'other',
    icon: CurrencyDollarIcon,
    options: [
      { value: 'Y', label: 'Not Applicable', description: 'No external funding' },
    ],
  },
  {
    code: 'CB24',
    name: 'Grading Method',
    description: 'Available grading options',
    required: true,
    category: 'classification',
    icon: ClipboardDocumentListIcon,
    options: [
      { value: 'L', label: 'Letter Grade Only', description: 'A, B, C, D, F' },
      { value: 'P', label: 'Pass/No Pass Only', description: 'P/NP grading' },
      { value: 'S', label: 'Student Choice', description: 'Letter or P/NP' },
      { value: 'N', label: 'Non-Credit', description: 'No letter grade' },
    ],
  },
  {
    code: 'CB25',
    name: 'Repeat Status',
    description: 'Course repeatability rules',
    required: true,
    category: 'classification',
    icon: ArrowPathIcon,
    options: [
      { value: 'N', label: 'Not Repeatable', description: 'One enrollment only' },
      { value: 'Y', label: 'Repeatable', description: 'Can repeat with limit' },
      { value: 'V', label: 'Variable Units', description: 'Repeatable variable units' },
    ],
  },
  {
    code: 'CB26',
    name: 'Support Course Status',
    description: 'Whether course is corequisite support',
    required: false,
    category: 'classification',
    icon: BookOpenIcon,
    options: [
      { value: 'N', label: 'Not a Support Course', description: 'Standalone course' },
      { value: 'S', label: 'Support Course', description: 'Corequisite support course' },
    ],
  },
  {
    code: 'CB27',
    name: 'Course Prior to Transfer Level',
    description: 'For math/English, levels below transfer',
    required: false,
    category: 'classification',
    icon: AcademicCapIcon,
    options: [
      { value: 'Y', label: 'Not Applicable', description: 'Not math/English or at transfer' },
      { value: '1', label: 'One Level Below', description: 'One level below transfer' },
      { value: '2', label: 'Two Levels Below', description: 'Two levels below transfer' },
      { value: '3', label: 'Three Levels Below', description: 'Three levels below transfer' },
      { value: '4', label: 'Four+ Levels Below', description: 'Four or more levels below' },
    ],
  },
];

// Category labels and colors
const CATEGORY_INFO: Record<string, { label: string; color: string }> = {
  core: { label: 'Core Codes', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  transfer: { label: 'Transfer Status', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  vocational: { label: 'Vocational', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  classification: { label: 'Classification', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  other: { label: 'Other', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
};

// ===========================================
// Helper Functions
// ===========================================

function getStatusIcon(code: CBCodeDefinition, value: string | undefined, cbCodes: CBCodes) {
  // Check dependencies
  if (code.dependencies) {
    const depValue = cbCodes[code.dependencies.code];
    if (!code.dependencies.values.includes(depValue || '')) {
      // Dependency not met, code is not applicable
      return {
        icon: InformationCircleIcon,
        color: 'text-slate-400 dark:text-slate-500',
        status: 'not_applicable',
        message: 'Not applicable based on other selections',
      };
    }
  }

  if (!value) {
    if (code.required) {
      return {
        icon: XCircleIcon,
        color: 'text-red-500 dark:text-red-400',
        status: 'missing',
        message: 'Required - Please set a value',
      };
    }
    return {
      icon: ExclamationTriangleIcon,
      color: 'text-amber-500 dark:text-amber-400',
      status: 'optional',
      message: 'Optional - Not set',
    };
  }

  // Check if value is valid
  if (code.options.length > 0) {
    const validOption = code.options.find((opt) => opt.value === value);
    if (!validOption) {
      return {
        icon: ExclamationTriangleIcon,
        color: 'text-amber-500 dark:text-amber-400',
        status: 'invalid',
        message: 'Invalid value selected',
      };
    }
  }

  return {
    icon: CheckCircleIcon,
    color: 'text-green-500 dark:text-green-400',
    status: 'complete',
    message: 'Complete',
  };
}

function getValueLabel(code: CBCodeDefinition, value: string | undefined): string {
  if (!value) return 'Not set';

  if (code.options.length > 0) {
    const option = code.options.find((opt) => opt.value === value);
    return option ? option.label : value;
  }

  return value;
}

// ===========================================
// Sub-Components
// ===========================================

interface CompletionProgressProps {
  completed: number;
  required: number;
  total: number;
}

function CompletionProgress({ completed, required, total }: CompletionProgressProps) {
  const requiredPercentage = Math.round((completed / required) * 100);
  const totalPercentage = Math.round((completed / total) * 100);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Completion Status
        </h3>
        <div className="flex items-center gap-2">
          {requiredPercentage >= 100 ? (
            <CheckCircleSolidIcon className="h-6 w-6 text-green-500" />
          ) : (
            <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
          )}
          <span className="text-2xl font-bold text-slate-900 dark:text-white">
            {requiredPercentage}%
          </span>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-600 dark:text-slate-400">Required Codes</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {completed} / {required}
            </span>
          </div>
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                requiredPercentage >= 100 ? 'bg-green-500' : 'bg-luminous-500'
              }`}
              style={{ width: `${Math.min(requiredPercentage, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-600 dark:text-slate-400">All Codes</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {completed} / {total}
            </span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-400 dark:bg-slate-500 transition-all duration-300"
              style={{ width: `${totalPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="mt-4 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <CheckCircleIcon className="h-4 w-4 text-green-500" />
          <span className="text-slate-600 dark:text-slate-400">Complete</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircleIcon className="h-4 w-4 text-red-500" />
          <span className="text-slate-600 dark:text-slate-400">Missing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
          <span className="text-slate-600 dark:text-slate-400">Optional</span>
        </div>
      </div>
    </div>
  );
}

interface CBCodeRowProps {
  code: CBCodeDefinition;
  value: string | undefined;
  cbCodes: CBCodes;
  onEdit: (code: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function CBCodeRow({ code, value, cbCodes, onEdit, isExpanded, onToggle }: CBCodeRowProps) {
  const status = getStatusIcon(code, value, cbCodes);
  const StatusIcon = status.icon;
  const Icon = code.icon;
  const categoryInfo = CATEGORY_INFO[code.category];
  const valueLabel = getValueLabel(code, value);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Main Row */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
          status.status === 'not_applicable' ? 'opacity-50' : ''
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Status Icon */}
          <div className="flex-shrink-0">
            <StatusIcon className={`h-5 w-5 ${status.color}`} />
          </div>

          {/* Code Icon & Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900 dark:text-white">
                  {code.code}
                </span>
                <span className="text-slate-600 dark:text-slate-400">-</span>
                <span className="text-slate-700 dark:text-slate-300 truncate">
                  {code.name}
                </span>
                {code.required && (
                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    Required
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {code.description}
              </p>
            </div>
          </div>
        </div>

        {/* Value & Actions */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Category Badge */}
          <span className={`hidden sm:inline-flex text-xs px-2 py-1 rounded-full ${categoryInfo.color}`}>
            {categoryInfo.label}
          </span>

          {/* Current Value */}
          <div className="text-right min-w-[120px]">
            <span className={`font-mono text-sm px-2 py-1 rounded ${
              value
                ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {value || '-'}
            </span>
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUpIcon className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Current Value Details */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Current Value
              </h4>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-medium text-luminous-600 dark:text-luminous-400">
                    {value || 'Not set'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {valueLabel}
                </p>
              </div>
            </div>

            {/* Available Options */}
            {code.options.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Available Options
                </h4>
                <div className="space-y-1">
                  {code.options.slice(0, 4).map((option) => (
                    <div
                      key={option.value}
                      className={`flex items-center gap-2 text-sm p-2 rounded ${
                        option.value === value
                          ? 'bg-luminous-100 dark:bg-luminous-900/20'
                          : 'bg-white dark:bg-slate-800'
                      }`}
                    >
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
                        {option.value}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {option.label}
                      </span>
                    </div>
                  ))}
                  {code.options.length > 4 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pl-2">
                      +{code.options.length - 4} more options
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Message & Edit Button */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${status.color}`} />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {status.message}
              </span>
            </div>
            {status.status !== 'not_applicable' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(code.code);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 rounded-lg transition-colors"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export interface CBCodeSummaryProps {
  cbCodes: CBCodes;
  onEdit?: (code: string) => void;
  onExport?: () => void;
  onPrint?: () => void;
}

export function CBCodeSummary({
  cbCodes,
  onEdit,
  onExport,
  onPrint,
}: CBCodeSummaryProps) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);

  // Calculate completion stats
  const stats = useMemo(() => {
    let completed = 0;
    let requiredTotal = 0;
    let requiredComplete = 0;

    CB_CODE_DEFINITIONS.forEach((code) => {
      const value = cbCodes[code.code.toLowerCase()];

      // Check dependencies
      if (code.dependencies) {
        const depValue = cbCodes[code.dependencies.code.toLowerCase()];
        if (!code.dependencies.values.includes(depValue || '')) {
          return; // Skip if dependency not met
        }
      }

      if (value) completed++;
      if (code.required) {
        requiredTotal++;
        if (value) requiredComplete++;
      }
    });

    return {
      completed,
      requiredTotal,
      requiredComplete,
      total: CB_CODE_DEFINITIONS.length,
    };
  }, [cbCodes]);

  // Filter codes based on category and completion
  const filteredCodes = useMemo(() => {
    return CB_CODE_DEFINITIONS.filter((code) => {
      // Category filter
      if (filterCategory !== 'all' && code.category !== filterCategory) {
        return false;
      }

      // Incomplete filter
      if (showOnlyIncomplete) {
        const value = cbCodes[code.code.toLowerCase()];
        if (value) return false;
      }

      return true;
    });
  }, [cbCodes, filterCategory, showOnlyIncomplete]);

  const handleToggle = useCallback((code: string) => {
    setExpandedCode((prev) => (prev === code ? null : code));
  }, []);

  const handleEdit = useCallback((code: string) => {
    onEdit?.(code);
  }, [onEdit]);

  const handleExportCSV = useCallback(() => {
    const rows = [
      ['Code', 'Name', 'Value', 'Description', 'Status'],
      ...CB_CODE_DEFINITIONS.map((code) => {
        const value = cbCodes[code.code.toLowerCase()];
        const status = getStatusIcon(code, value, cbCodes);
        return [
          code.code,
          code.name,
          value || '',
          getValueLabel(code, value),
          status.status,
        ];
      }),
    ];

    const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'cb-codes-export.csv');
    link.click();
    URL.revokeObjectURL(url);

    onExport?.();
  }, [cbCodes, onExport]);

  const handlePrint = useCallback(() => {
    window.print();
    onPrint?.();
  }, [onPrint]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            CB Codes Summary
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Community college compliance codes for state MIS reporting
          </p>
        </div>

        {/* Export/Print Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <PrinterIcon className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Completion Progress */}
      <CompletionProgress
        completed={stats.requiredComplete}
        required={stats.requiredTotal}
        total={stats.total}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Category:</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-luminous-500 focus:border-luminous-500"
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_INFO).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </select>
        </div>

        {/* Incomplete Filter */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyIncomplete}
            onChange={(e) => setShowOnlyIncomplete(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-luminous-600 focus:ring-luminous-500"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Show only incomplete
          </span>
        </label>

        {/* Results Count */}
        <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
          Showing {filteredCodes.length} of {CB_CODE_DEFINITIONS.length} codes
        </span>
      </div>

      {/* CB Codes List */}
      <div className="space-y-2">
        {filteredCodes.map((code) => (
          <CBCodeRow
            key={code.code}
            code={code}
            value={cbCodes[code.code.toLowerCase()]}
            cbCodes={cbCodes}
            onEdit={handleEdit}
            isExpanded={expandedCode === code.code}
            onToggle={() => handleToggle(code.code)}
          />
        ))}

        {filteredCodes.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <ClipboardDocumentListIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No CB codes match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CBCodeSummary;
