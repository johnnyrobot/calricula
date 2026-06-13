'use client';

import { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CurrencyDollarIcon, UserGroupIcon } from '@heroicons/react/24/solid';
import { useToast } from '@/components/toast';
import { FieldLabel, HelpText } from '@/components/ui';
import { Spinner } from '@/components/loading';
import { LMINarrativeEditor } from './LMINarrativeEditor';

interface WageData {
  year: string;
  area: string;
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

interface ProjectionData {
  area: string;
  area_type?: string;
  occupation_title: string;
  soc_code?: string;
  period?: string;
  base_year?: string;
  proj_year?: string;
  emp_base?: number;
  emp_proj?: number;
  numeric_change?: number;
  percent_change?: number;
  exits?: number;
  transfers?: number;
  total_openings?: number;
  median_hourly_wage?: number;
  median_annual_wage?: number;
  entry_level_education?: string;
  work_experience?: string;
  job_training?: string;
}

interface LMIData {
  soc_code?: string;
  occupation_title?: string;
  area?: string;
  retrieved_at?: string;
  wage_data?: WageData;
  projection_data?: ProjectionData;
  narrative?: string;
}

interface OccupationSuggestion {
  soc_code: string;
  title: string;
  confidence: number;
  rationale: string;
}

interface LMIPanelProps {
  lmiData: LMIData | null;
  isCTECourse: boolean;
  onUpdate: (data: LMIData | null) => void;
  onSearch: () => void;
  courseTitle?: string;
  courseDescription?: string;
  objectives?: string[];
  slos?: string[];
  topCode?: string;
  department?: string;
}

const formatCurrency = (value?: number, type: 'hourly' | 'annual' = 'annual') => {
  if (value === undefined || value === null) return '—';
  if (type === 'hourly') {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toLocaleString()}`;
};

const formatNumber = (value?: number) => {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString();
};

const getDataRecencyStatus = (retrievedAt?: string): 'valid' | 'warning' | 'invalid' => {
  if (!retrievedAt) return 'invalid';

  const retrieved = new Date(retrievedAt);
  const now = new Date();

  // Calculate months using year/month difference for accuracy
  const yearsDiff = now.getFullYear() - retrieved.getFullYear();
  const monthsDiff = now.getMonth() - retrieved.getMonth();
  const monthsAgo = yearsDiff * 12 + monthsDiff;

  if (monthsAgo < 18) return 'valid';
  if (monthsAgo <= 24) return 'warning';
  return 'invalid';
};

const getRecencyMessage = (retrievedAt?: string): string => {
  if (!retrievedAt) return 'No data attached';

  const retrieved = new Date(retrievedAt);
  const now = new Date();

  // Use same calculation as getDataRecencyStatus for consistency
  const yearsDiff = now.getFullYear() - retrieved.getFullYear();
  const monthsDiff = now.getMonth() - retrieved.getMonth();
  const monthsAgo = yearsDiff * 12 + monthsDiff;

  if (monthsAgo < 1) return 'Updated today';
  if (monthsAgo === 1) return 'Updated 1 month ago';
  return `Updated ${monthsAgo} months ago`;
};

export function LMIPanel({
  lmiData,
  isCTECourse,
  onUpdate,
  onSearch,
  courseTitle,
  courseDescription,
  objectives,
  slos,
  topCode,
  department,
}: LMIPanelProps) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<OccupationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [attachingOccupation, setAttachingOccupation] = useState<string | null>(null);

  if (!isCTECourse) {
    return (
      <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <ChartBarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">
              Labor Market Information (LMI)
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
              LMI is only required for Career Technical Education (CTE) courses. This course is not marked as CTE,
              so LMI data is not needed.
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
              To add LMI data, first select <strong>CB04 = C</strong> (Career Technical) in the CB Codes section.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleRemove = () => {
    onUpdate(null);
    toast.success('Success', 'LMI data removed');
  };

  const handleRefresh = async () => {
    if (!lmiData?.soc_code) return;

    setRefreshing(true);
    try {
      const res = await fetch(`/api/lmi/search?q=${encodeURIComponent(lmiData.soc_code)}`);
      if (!res.ok) throw new Error('Failed to refresh LMI data');

      const data = await res.json();
      if (data?.wages && Array.isArray(data.wages) && data.wages.length > 0) {
        onUpdate({
          ...lmiData,
          retrieved_at: new Date().toISOString(),
          wage_data: data.wages[0],
          projection_data: data.projections?.[0],
        });
        toast.success('Success', 'LMI data refreshed');
      } else {
        toast.error('Error', 'No data found for this occupation');
      }
    } catch (err) {
      toast.error('Error', 'Failed to refresh LMI data');
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleGetAISuggestions = async () => {
    if (!courseTitle) {
      toast.error('Error', 'Course title is required for AI suggestions');
      return;
    }

    setLoadingSuggestions(true);
    setSuggestions([]);
    setShowSuggestions(true);

    try {
      const res = await fetch('/api/ai/suggest-occupations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_title: courseTitle,
          course_description: courseDescription,
          objectives: objectives,
          slos: slos,
          top_code: topCode,
          department: department,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get AI suggestions');
      }

      const result = await res.json();
      if (result.success && result.suggestions?.length > 0) {
        // Sort by confidence (highest first)
        const sortedSuggestions = result.suggestions.sort(
          (a: OccupationSuggestion, b: OccupationSuggestion) => b.confidence - a.confidence
        );
        setSuggestions(sortedSuggestions);
        toast.success('Success', `Found ${sortedSuggestions.length} occupation suggestions`);
      } else {
        setSuggestions([]);
        toast.error('No Results', result.error || 'No occupation suggestions found');
      }
    } catch (err) {
      console.error('AI suggestions error:', err);
      toast.error('Error', err instanceof Error ? err.message : 'Failed to get AI suggestions');
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAttachFromSuggestion = async (suggestion: OccupationSuggestion) => {
    setAttachingOccupation(suggestion.soc_code);

    try {
      // Fetch LMI data for the suggested occupation
      const res = await fetch(`/api/lmi/search?q=${encodeURIComponent(suggestion.soc_code)}`);
      if (!res.ok) throw new Error('Failed to fetch LMI data');

      const data = await res.json();

      if (data?.wages && Array.isArray(data.wages) && data.wages.length > 0) {
        // Find the best match (exact SOC code match or first result)
        const wageData = data.wages.find((w: WageData) => w.soc_code === suggestion.soc_code) || data.wages[0];
        const projectionData = data.projections?.find((p: ProjectionData) => p.soc_code === suggestion.soc_code) || data.projections?.[0];

        onUpdate({
          soc_code: suggestion.soc_code,
          occupation_title: suggestion.title,
          area: wageData?.area || 'Los Angeles County',
          retrieved_at: new Date().toISOString(),
          wage_data: wageData,
          projection_data: projectionData,
        });

        setShowSuggestions(false);
        setSuggestions([]);
        toast.success('Success', `Attached LMI data for ${suggestion.title}`);
      } else {
        // Even if no CKAN data, still attach the occupation info
        onUpdate({
          soc_code: suggestion.soc_code,
          occupation_title: suggestion.title,
          area: 'Los Angeles County',
          retrieved_at: new Date().toISOString(),
        });

        setShowSuggestions(false);
        setSuggestions([]);
        toast.success('Attached', `Occupation attached. Note: Detailed LMI data not found in CKAN database.`);
      }
    } catch (err) {
      console.error('Attach error:', err);
      toast.error('Error', 'Failed to fetch LMI data for this occupation');
    } finally {
      setAttachingOccupation(null);
    }
  };

  const handleDismissSuggestions = () => {
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // Empty state
  if (!lmiData) {
    return (
      <div className="space-y-4">
        {/* AI Suggestions Panel */}
        {showSuggestions && (
          <div className="p-4 bg-luminous-50 dark:bg-luminous-950/30 border border-luminous-200 dark:border-luminous-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" />
                <h3 className="font-medium text-luminous-900 dark:text-luminous-100">
                  AI-Suggested Occupations
                </h3>
              </div>
              <button
                onClick={handleDismissSuggestions}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm"
              >
                ✕ Close
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6 text-luminous-600" />
                <span className="ml-2 text-slate-600 dark:text-slate-400">Analyzing course content...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Based on your course content, these occupations are a good match:
                </p>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.soc_code}
                    className={`p-3 bg-white dark:bg-slate-800 border rounded-lg ${
                      index === 0
                        ? 'border-luminous-300 dark:border-luminous-700 ring-1 ring-luminous-200 dark:ring-luminous-800'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {index === 0 && (
                            <span className="text-xs bg-luminous-100 dark:bg-luminous-900/50 text-luminous-700 dark:text-luminous-300 px-2 py-0.5 rounded-full">
                              ⭐ Best Match
                            </span>
                          )}
                          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                            {suggestion.soc_code}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {Math.round(suggestion.confidence * 100)}% match
                          </span>
                        </div>
                        <h4 className="font-medium text-slate-900 dark:text-slate-100">
                          {suggestion.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {suggestion.rationale}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAttachFromSuggestion(suggestion)}
                        disabled={attachingOccupation !== null}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-luminous-600 text-white hover:bg-luminous-700 transition-colors disabled:opacity-50"
                      >
                        {attachingOccupation === suggestion.soc_code ? (
                          <>
                            <Spinner className="h-3.5 w-3.5" />
                            Attaching...
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            Attach
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleGetAISuggestions}
                    disabled={loadingSuggestions}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Regenerate
                  </button>
                  <button
                    onClick={() => {
                      setShowSuggestions(false);
                      onSearch();
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    <MagnifyingGlassIcon className="h-4 w-4" />
                    Search Instead
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-slate-600 dark:text-slate-400">
                  No suggestions found. Try searching manually instead.
                </p>
                <button
                  onClick={() => {
                    setShowSuggestions(false);
                    onSearch();
                  }}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  Search Occupations
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state card */}
        {!showSuggestions && (
          <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center">
            <ChartBarIcon className="h-12 w-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <p className="font-medium text-slate-700 dark:text-slate-300">No Labor Market Information Attached</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Add labor market data to provide context for career outcomes
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={handleGetAISuggestions}
                disabled={loadingSuggestions || !courseTitle}
                className="inline-flex items-center gap-2 px-4 py-2 bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 rounded-lg hover:bg-luminous-200 dark:hover:bg-luminous-900/50 transition-colors disabled:opacity-50"
              >
                {loadingSuggestions ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Getting Suggestions...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    Get AI Suggestions
                  </>
                )}
              </button>
              <button
                onClick={onSearch}
                className="inline-flex items-center gap-2 px-4 py-2 bg-luminous-600 text-white rounded-lg hover:bg-luminous-700 transition-colors"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                Search Occupations
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Attached state
  const status = getDataRecencyStatus(lmiData.retrieved_at);
  const statusColor = status === 'valid' ? 'green' : status === 'warning' ? 'yellow' : 'red';

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="luminous-card">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            {lmiData.occupation_title}
          </h3>
          <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded font-mono">
            {lmiData.soc_code}
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {lmiData.area}
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs">
          <span className={`px-2 py-1 rounded-full font-medium ${
            status === 'valid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
            status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
            'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
          }`}>
            {status === 'valid' ? 'Valid' : status === 'warning' ? 'Warning' : 'Invalid'}
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {getRecencyMessage(lmiData.retrieved_at)}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Wage Summary */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CurrencyDollarIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Median Wage</span>
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(lmiData.wage_data?.annual_median)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {formatCurrency(lmiData.wage_data?.hourly_median, 'hourly')}/hour
          </div>
        </div>

        {/* Employment Summary */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <UserGroupIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Growth</span>
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {lmiData.projection_data?.percent_change !== undefined ? (
              <span className={lmiData.projection_data.percent_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                {lmiData.projection_data.percent_change >= 0 ? '+' : ''}{lmiData.projection_data.percent_change}%
              </span>
            ) : '—'}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {formatNumber(lmiData.projection_data?.total_openings)} annual openings
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          {/* Wage Data Table */}
          <div>
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Wage Data</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">10th Percentile:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(lmiData.wage_data?.hourly_10th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">25th Percentile:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(lmiData.wage_data?.hourly_25th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Median:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(lmiData.wage_data?.hourly_median, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">75th Percentile:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(lmiData.wage_data?.hourly_75th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">90th Percentile:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(lmiData.wage_data?.hourly_90th, 'hourly')}
                </span>
              </div>
            </div>
          </div>

          {/* Projection Data */}
          <div>
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Employment Projections</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Period:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {lmiData.projection_data?.period || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Base Year Employment:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatNumber(lmiData.projection_data?.emp_base)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Projected Year Employment:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatNumber(lmiData.projection_data?.emp_proj)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Growth Percent:</span>
                <span className={`font-medium ${
                  (lmiData.projection_data?.percent_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {lmiData.projection_data?.percent_change !== undefined ? (
                    `${lmiData.projection_data.percent_change >= 0 ? '+' : ''}${lmiData.projection_data.percent_change}%`
                  ) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Total Annual Openings:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatNumber(lmiData.projection_data?.total_openings)}
                </span>
              </div>
            </div>
          </div>

          {/* Education Requirements */}
          <div>
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Education Requirements</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Entry Level Education:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {lmiData.projection_data?.entry_level_education || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Work Experience:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {lmiData.projection_data?.work_experience || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Job Training:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {lmiData.projection_data?.job_training || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* LMI Narrative Editor */}
          <div className="pt-4 border-t border-slate-300 dark:border-slate-600">
            <LMINarrativeEditor
              narrative={lmiData.narrative || ''}
              courseTitle={courseTitle || ''}
              socCode={lmiData.soc_code || ''}
              occupationTitle={lmiData.occupation_title || ''}
              area={lmiData.area}
              wageData={lmiData.wage_data as Record<string, unknown> | undefined}
              projectionData={lmiData.projection_data as Record<string, unknown> | undefined}
              onSave={(newNarrative) => {
                onUpdate({
                  ...lmiData,
                  narrative: newNarrative,
                });
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-300 dark:border-slate-600">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              {refreshing ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Refreshing...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh Data
                </>
              )}
            </button>

            <button
              onClick={handleRemove}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              <TrashIcon className="h-4 w-4" />
              Remove
            </button>
          </div>
      </div>
    </div>
  );
}
