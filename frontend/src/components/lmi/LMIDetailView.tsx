'use client';

/**
 * LMI Detail View Component
 *
 * Read-only display of Labor Market Information on the Course Detail page.
 * Used by curriculum committee members to review LMI data for CTE course approval.
 */

import { useState } from 'react';
import {
  ChartBarIcon,
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  MapPinIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { LMIValidityIndicator } from './LMIValidityIndicator';
import { Spinner } from '@/components/loading';
import { useAuth } from '@/contexts/AuthContext';

// Type definitions for LMI data
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

export interface LMIData {
  soc_code?: string;
  occupation_title?: string;
  area?: string;
  retrieved_at?: string;
  wage_data?: WageData;
  projection_data?: ProjectionData;
  narrative?: string;
}

interface LMIDetailViewProps {
  lmiData: LMIData;
  courseId: string;
  courseCode: string;
}

// Utility functions
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

const formatPercent = (value?: number) => {
  if (value === undefined || value === null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export function LMIDetailView({ lmiData, courseId, courseCode }: LMIDetailViewProps) {
  const { getToken } = useAuth();
  const [exporting, setExporting] = useState(false);

  // Handle PDF export
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
      const response = await fetch(`${apiUrl}/api/courses/${courseId}/lmi/export?format=pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to export LMI report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${courseCode.replace(/\s+/g, '_')}_LMI_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export LMI report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const wageData = lmiData.wage_data;
  const projectionData = lmiData.projection_data;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="luminous-card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            {/* Occupation Title */}
            <div className="flex items-center gap-2 mb-2">
              <BriefcaseIcon className="h-5 w-5 text-luminous-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {lmiData.occupation_title || 'Unknown Occupation'}
              </h3>
            </div>

            {/* SOC Code */}
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-3">
              <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                SOC {lmiData.soc_code || 'N/A'}
              </span>
            </div>

            {/* Geographic Area */}
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <MapPinIcon className="h-4 w-4" />
              <span>{lmiData.area || 'Geographic area not specified'}</span>
            </div>
          </div>

          {/* Validity & Export */}
          <div className="flex flex-col items-end gap-3">
            {lmiData.retrieved_at && (
              <LMIValidityIndicator
                retrievedAt={lmiData.retrieved_at}
                showAge={true}
                size="sm"
              />
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-luminous-600 text-white hover:bg-luminous-700 transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Exporting...
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export LMI Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Data Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wage Data Card */}
        <div className="luminous-card">
          <div className="flex items-center gap-2 mb-4">
            <CurrencyDollarIcon className="h-5 w-5 text-emerald-500" />
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Wage Data {wageData?.year && `(${wageData.year})`}
            </h4>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                Median Annual
              </p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(wageData?.annual_median)}
              </p>
            </div>
            <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                Median Hourly
              </p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(wageData?.hourly_median, 'hourly')}
              </p>
            </div>
          </div>

          {/* Wage Percentiles */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Hourly Wage Distribution
            </h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">10th Percentile</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(wageData?.hourly_10th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">25th Percentile</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(wageData?.hourly_25th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 -mx-2 px-2 rounded">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Median (50th)</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(wageData?.hourly_median, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">75th Percentile</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(wageData?.hourly_75th, 'hourly')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-600 dark:text-slate-400">90th Percentile</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(wageData?.hourly_90th, 'hourly')}
                </span>
              </div>
            </div>
          </div>

          {/* Employment */}
          {wageData?.employment && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserGroupIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Current Employment
                  </span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatNumber(wageData.employment)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Projections Card */}
        <div className="luminous-card">
          <div className="flex items-center gap-2 mb-4">
            <ChartBarIcon className="h-5 w-5 text-blue-500" />
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Employment Projections {projectionData?.period && `(${projectionData.period})`}
            </h4>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                Growth Rate
              </p>
              <p className={`text-xl font-bold ${
                (projectionData?.percent_change || 0) >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {formatPercent(projectionData?.percent_change)}
              </p>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                Annual Openings
              </p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                {formatNumber(projectionData?.total_openings)}
              </p>
            </div>
          </div>

          {/* Projection Details */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Employment Forecast
            </h5>
            <div className="space-y-2 text-sm">
              {projectionData?.emp_base && (
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">
                    Base Year ({projectionData.base_year || 'Start'})
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatNumber(projectionData.emp_base)}
                  </span>
                </div>
              )}
              {projectionData?.emp_proj && (
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">
                    Projected ({projectionData.proj_year || 'End'})
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatNumber(projectionData.emp_proj)}
                  </span>
                </div>
              )}
              {projectionData?.numeric_change && (
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Numeric Change</span>
                  <span className={`font-medium ${
                    projectionData.numeric_change >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {projectionData.numeric_change >= 0 ? '+' : ''}
                    {formatNumber(projectionData.numeric_change)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Education Requirements */}
          {(projectionData?.entry_level_education || projectionData?.work_experience || projectionData?.job_training) && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <AcademicCapIcon className="h-4 w-4 text-slate-500" />
                <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Entry Requirements
                </h5>
              </div>
              <div className="space-y-2 text-sm">
                {projectionData?.entry_level_education && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Education</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {projectionData.entry_level_education}
                    </span>
                  </div>
                )}
                {projectionData?.work_experience && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Work Experience</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {projectionData.work_experience}
                    </span>
                  </div>
                )}
                {projectionData?.job_training && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Job Training</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {projectionData.job_training}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Narrative Section */}
      {lmiData.narrative && (
        <div className="luminous-card">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
            Labor Market Narrative
          </h4>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {lmiData.narrative}
            </p>
          </div>
        </div>
      )}

      {/* Data Source Attribution */}
      <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
        <p>
          Data sourced from California Employment Development Department (EDD) via CKAN API.
          {lmiData.retrieved_at && (
            <span>
              {' '}Retrieved: {new Date(lmiData.retrieved_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export default LMIDetailView;
