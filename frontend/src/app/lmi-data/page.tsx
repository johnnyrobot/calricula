'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  UserGroupIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import { CourseSelectionModal } from '@/components/lmi';
import { useUserCourses } from '@/hooks/useUserCourses';
import { api, CourseListItem } from '@/lib/api';

// Types matching Backend Pydantic Models
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

interface LMIResponse {
  wages: WageData[];
  projections: ProjectionData[];
}

// Helper to format currency
const formatCurrency = (value?: number, type: 'hourly' | 'annual' = 'annual') => {
  if (value === undefined || value === null) return '—';
  if (type === 'hourly') {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toLocaleString()}`;
};

export default function LmiPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LMIResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Single occupation selection state (NEW - CUR-184)
  const [selectedOccupationIndex, setSelectedOccupationIndex] = useState<number | null>(null);

  // Course selection modal state (NEW - CUR-184)
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const { courses, isLoading: isLoadingCourses } = useUserCourses({ cteOnly: true, autoFetch: true });

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setData(null);

    try {
      const res = await fetch(`/api/lmi/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch LMI data');
      }
      const jsonData: LMIResponse = await res.json();
      setData(jsonData);
    } catch (err) {
      toast.error('Error', 'Failed to load Labor Market Information');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get selected occupation (if any)
  const selectedOccupation = useMemo(() => {
    if (selectedOccupationIndex !== null && data?.wages[selectedOccupationIndex]) {
      return data.wages[selectedOccupationIndex];
    }
    return null;
  }, [selectedOccupationIndex, data]);

  // Handle opening course selection modal
  const handleOpenCourseModal = () => {
    if (!selectedOccupation) {
      toast.error('Error', 'Please select an occupation first');
      return;
    }
    setCourseModalOpen(true);
  };

  // Handle course selection and LMI attachment (NEW - CUR-184)
  const handleAttachToCourse = async (courseId: string, courseName: string) => {
    if (!selectedOccupation || !data) {
      toast.error('Error', 'Missing occupation or data');
      return;
    }

    try {
      // Get matching projection data for this occupation
      const matchingProjection = data.projections.find(
        (p) => p.soc_code === selectedOccupation.soc_code
      );

      // Attach only the selected occupation's data
      await api.updateCourse(courseId, {
        lmi_data: {
          query,
          timestamp: new Date().toISOString(),
          soc_code: selectedOccupation.soc_code,
          occupation_title: selectedOccupation.occupation_title,
          area: selectedOccupation.area,
          wages: selectedOccupation,
          projections: matchingProjection || null,
        }
      });

      toast.success('Success', `LMI attached to ${courseName}`);
      // Reset selection
      setSelectedOccupationIndex(null);
      setHasSearched(false);
      setData(null);
    } catch (err) {
      console.error(err);
      toast.error('Error', 'Failed to attach LMI data to course');
    }
  };

  return (
    <PageShell>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 relative">

        {/* Header */}
        <div className="mb-8 max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Labor Market Information (LMI) Explorer
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Search for California occupational wages and employment projections.
            Data provided by the California Employment Development Department (EDD).
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-12">
          <form onSubmit={handleSearch} className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400" />
            <input
              type="text"
              className="w-full pl-12 pr-32 py-4 rounded-xl border border-slate-200 shadow-sm focus:ring-2 focus:ring-luminous-500 focus:border-luminous-500 text-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              placeholder="Search occupations (e.g., Nurse, Developer)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 bg-luminous-600 hover:bg-luminous-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
          </div>
        ) : data ? (
          <div className="max-w-6xl mx-auto space-y-12 pb-20">

            {/* Action Bar */}
            <div className="flex justify-between items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Results for &ldquo;{query}&rdquo;
                </h2>
                <p className="text-sm text-slate-500">
                  {data.wages.length} wage records, {data.projections.length} projections found
                </p>
                {selectedOccupation && (
                  <p className="text-sm font-medium text-luminous-600 dark:text-luminous-400 mt-1">
                    ✓ Selected: {selectedOccupation.occupation_title} ({selectedOccupation.soc_code})
                  </p>
                )}
              </div>
              <button
                onClick={handleOpenCourseModal}
                disabled={!selectedOccupation}
                className="flex items-center gap-2 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <PlusIcon className="h-5 w-5" />
                Attach to Course
              </button>
            </div>

            {/* Wages Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Occupational Wages</h2>
                  <p className="text-sm text-slate-500">Source: EDD OEWS Survey (2025)</p>
                </div>
              </div>

              {data.wages.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <table className="w-full text-left border-collapse bg-white dark:bg-slate-800">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <th className="p-4 font-semibold w-12 text-center">Select</th>
                        <th className="p-4 font-semibold">SOC</th>
                        <th className="p-4 font-semibold">Occupation</th>
                        <th className="p-4 font-semibold">Area</th>
                        <th className="p-4 font-semibold text-right">Employed</th>
                        <th className="p-4 font-semibold text-right">Hourly Mean</th>
                        <th className="p-4 font-semibold text-right">Annual Mean</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {data.wages.map((row, idx) => {
                        const isSelected = selectedOccupationIndex === idx;
                        return (
                          <tr
                            key={idx}
                            onClick={() => setSelectedOccupationIndex(isSelected ? null : idx)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-luminous-50 dark:bg-luminous-900/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <td className="p-4 text-center">
                              <input
                                type="radio"
                                checked={isSelected}
                                onChange={() => setSelectedOccupationIndex(isSelected ? null : idx)}
                                className="w-4 h-4 cursor-pointer accent-luminous-600"
                                aria-label={`Select ${row.occupation_title}`}
                              />
                            </td>
                            <td className="p-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                              {row.soc_code || '—'}
                            </td>
                            <td className="p-4 font-medium text-slate-900 dark:text-white">{row.occupation_title}</td>
                            <td className="p-4 text-slate-600 dark:text-slate-300 text-sm">{row.area}</td>
                            <td className="p-4 text-right text-slate-600 dark:text-slate-300">
                              {row.employment?.toLocaleString() || '—'}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-700 dark:text-slate-200">
                              {formatCurrency(row.hourly_mean, 'hourly')}
                            </td>
                            <td className="p-4 text-right font-mono text-green-700 dark:text-green-400 font-medium">
                              {formatCurrency(row.annual_mean, 'annual')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500">No wage data found for this occupation.</p>
                </div>
              )}
            </section>

            {/* Projections Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <ChartBarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Employment Projections</h2>
                  <p className="text-sm text-slate-500">Long-term (10-Year) Growth Projections with Education Requirements</p>
                </div>
              </div>

              {data.projections.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {data.projections.map((row, idx) => (
                    <div key={idx} className="luminous-card p-5 space-y-4">
                      {/* Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white line-clamp-1" title={row.occupation_title}>
                            {row.occupation_title}
                          </h3>
                          <p className="text-sm text-slate-500">{row.area}</p>
                        </div>
                        {row.soc_code && (
                          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded">
                            {row.soc_code}
                          </span>
                        )}
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Growth</p>
                          <p className={`text-xl font-bold ${
                            (row.percent_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {row.percent_change !== undefined ? `${row.percent_change > 0 ? '+' : ''}${row.percent_change}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Total Openings</p>
                          <p className="text-xl font-bold text-slate-900 dark:text-white">
                            {row.total_openings?.toLocaleString() || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Annual Wage</p>
                          <p className="text-xl font-bold text-green-600 dark:text-green-400">
                            {row.median_annual_wage ? formatCurrency(row.median_annual_wage) : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Education Requirements */}
                      {(row.entry_level_education || row.work_experience || row.job_training) && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <AcademicCapIcon className="h-4 w-4 text-indigo-500" />
                            <span className="text-slate-600 dark:text-slate-400">Education:</span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {row.entry_level_education || 'Not specified'}
                            </span>
                          </div>
                          {row.work_experience && (
                            <div className="flex items-center gap-2 text-sm">
                              <UserGroupIcon className="h-4 w-4 text-amber-500" />
                              <span className="text-slate-600 dark:text-slate-400">Experience:</span>
                              <span className="font-medium text-slate-900 dark:text-white">
                                {row.work_experience}
                              </span>
                            </div>
                          )}
                          {row.job_training && row.job_training !== 'None' && (
                            <div className="flex items-center gap-2 text-sm">
                              <BriefcaseIcon className="h-4 w-4 text-teal-500" />
                              <span className="text-slate-600 dark:text-slate-400">Training:</span>
                              <span className="font-medium text-slate-900 dark:text-white">
                                {row.job_training}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between text-xs text-slate-400">
                        <span>{row.base_year} Base: {row.emp_base?.toLocaleString() || '—'}</span>
                        <span>{row.proj_year} Proj: {row.emp_proj?.toLocaleString() || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500">No projection data found for this occupation.</p>
                </div>
              )}
            </section>

          </div>
        ) : hasSearched ? (
           <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <ExclamationTriangleIcon className="h-12 w-12 mb-2 text-slate-300" />
              <p>No results found. Try a different search term.</p>
           </div>
        ) : (
          <div className="text-center py-20 opacity-50">
             <BriefcaseIcon className="h-24 w-24 mx-auto text-slate-200 dark:text-slate-700 mb-4" />
             <p className="text-slate-400">Enter an occupation to explore California labor market data.</p>
          </div>
        )}

        {/* Course Selection Modal (NEW - CUR-184) */}
        <CourseSelectionModal
          isOpen={courseModalOpen}
          onClose={() => setCourseModalOpen(false)}
          selectedOccupation={selectedOccupation}
          onCourseSelect={handleAttachToCourse}
          courses={courses}
          isLoadingCourses={isLoadingCourses}
        />

      </div>
    </PageShell>
  );
}
