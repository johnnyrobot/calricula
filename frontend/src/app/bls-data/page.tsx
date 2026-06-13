'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MagnifyingGlassIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  BuildingOffice2Icon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';

// Types matching Backend Pydantic Models
interface UnemploymentData {
  series_id: string;
  area_name: string;
  year: string;
  period: string;
  period_name: string;
  value: number;
  is_latest: boolean;
}

interface CPIData {
  series_id: string;
  area_name: string;
  year: string;
  period: string;
  period_name: string;
  value: number;
  is_latest: boolean;
}

interface BLSDataPoint {
  year: string;
  period: string;
  period_name: string;
  value: string;
  latest?: string;
  footnotes: Array<{ code?: string; text?: string }>;
}

interface BLSSeriesData {
  series_id: string;
  series_title?: string;
  survey_name?: string;
  area?: string;
  data: BLSDataPoint[];
}

interface OESWageData {
  area_code: string;
  area_name: string;
  occupation_code: string;
  occupation_name: string;
  year: string;
  employment?: number;
  hourly_mean?: number;
  hourly_median?: number;
  hourly_10th?: number;
  hourly_25th?: number;
  hourly_75th?: number;
  hourly_90th?: number;
  annual_mean?: number;
  annual_median?: number;
  annual_10th?: number;
  annual_25th?: number;
  annual_75th?: number;
  annual_90th?: number;
}

interface OccupationOption {
  key: string;
  code: string;
  name: string;
}

interface OccupationSearchResult {
  code: string;
  title: string;
  major_group: string;
  major_group_title: string;
}

interface OccupationProjection {
  soc_code: string;
  title: string;
  employment_2023: number;
  employment_2033: number;
  change_percent: number;
  change_numeric: number;
  annual_openings: number;
  median_wage?: number;
  entry_education: string;
  entry_education_label: string;
  work_experience: string;
  work_experience_label: string;
  on_job_training: string;
  on_job_training_label: string;
  outlook: string;
  outlook_label: string;
}

interface QCEWIndustryData {
  area_fips: string;
  area_name: string;
  industry_code: string;
  industry_name: string;
  year: number;
  quarter: number;
  ownership: string;
  ownership_label: string;
  establishments?: number;
  month1_employment?: number;
  month2_employment?: number;
  month3_employment?: number;
  total_quarterly_wages?: number;
  avg_weekly_wage?: number;
}

interface QCEWAreaSummary {
  area_fips: string;
  area_name: string;
  year: number;
  quarter: number;
  total_employment?: number;
  total_establishments?: number;
  avg_weekly_wage?: number;
  industries: QCEWIndustryData[];
}

// Tab types
type TabType = 'oes' | 'unemployment' | 'cpi' | 'local' | 'custom';

// Area options
const AREA_OPTIONS = [
  { value: 'california', label: 'California (State)' },
  { value: 'los_angeles', label: 'Los Angeles Metro' },
  { value: 'san_francisco', label: 'San Francisco Metro' },
  { value: 'san_diego', label: 'San Diego Metro' },
  { value: 'national', label: 'National (U.S.)' },
];

const CPI_AREA_OPTIONS = [
  { value: 'los_angeles', label: 'Los Angeles-Long Beach-Anaheim' },
  { value: 'san_francisco', label: 'San Francisco-Oakland-San Jose' },
  { value: 'national', label: 'National (U.S. City Average)' },
];

const OES_AREA_OPTIONS = [
  { value: 'national', label: 'National (U.S.)' },
  { value: 'california', label: 'California (State)' },
  { value: 'los_angeles', label: 'Los Angeles Metro' },
  { value: 'san_francisco', label: 'San Francisco Metro' },
  { value: 'san_diego', label: 'San Diego Metro' },
];

const QCEW_AREA_OPTIONS = [
  { value: 'los_angeles', label: 'Los Angeles County' },
  { value: 'california', label: 'California (State)' },
  { value: 'orange', label: 'Orange County' },
  { value: 'san_diego', label: 'San Diego County' },
  { value: 'san_bernardino', label: 'San Bernardino County' },
  { value: 'riverside', label: 'Riverside County' },
];

// Popular occupations for quick selection
const POPULAR_OCCUPATIONS: OccupationSearchResult[] = [
  { code: '291141', title: 'Registered Nurses', major_group: '29', major_group_title: 'Healthcare Practitioners and Technical Occupations' },
  { code: '151252', title: 'Software Developers', major_group: '15', major_group_title: 'Computer and Mathematical Occupations' },
  { code: '472111', title: 'Electricians', major_group: '47', major_group_title: 'Construction and Extraction Occupations' },
  { code: '319092', title: 'Medical Assistants', major_group: '31', major_group_title: 'Healthcare Support Occupations' },
  { code: '292021', title: 'Dental Hygienists', major_group: '29', major_group_title: 'Healthcare Practitioners and Technical Occupations' },
  { code: '472152', title: 'Plumbers, Pipefitters, and Steamfitters', major_group: '47', major_group_title: 'Construction and Extraction Occupations' },
];

export default function BLSDataPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('oes');
  const [loading, setLoading] = useState(false);

  // OES state
  const [oesData, setOesData] = useState<OESWageData[]>([]);
  const [selectedOccupation, setSelectedOccupation] = useState<OccupationSearchResult | null>(POPULAR_OCCUPATIONS[0]);
  const [selectedOesAreas, setSelectedOesAreas] = useState<string[]>(['national', 'california', 'los_angeles']);

  // Occupation search state
  const [occupationQuery, setOccupationQuery] = useState('');
  const [occupationResults, setOccupationResults] = useState<OccupationSearchResult[]>([]);
  const [searchingOccupations, setSearchingOccupations] = useState(false);
  const [showOccupationDropdown, setShowOccupationDropdown] = useState(false);
  const occupationSearchRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (occupationSearchRef.current && !occupationSearchRef.current.contains(event.target as Node)) {
        setShowOccupationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Unemployment state
  const [unemploymentData, setUnemploymentData] = useState<UnemploymentData[]>([]);
  const [selectedUnemploymentAreas, setSelectedUnemploymentAreas] = useState<string[]>(['california', 'los_angeles', 'national']);

  // CPI state
  const [cpiData, setCpiData] = useState<CPIData[]>([]);
  const [selectedCpiAreas, setSelectedCpiAreas] = useState<string[]>(['los_angeles', 'national']);

  // Custom series state
  const [customSeriesIds, setCustomSeriesIds] = useState('');
  const [customSeriesData, setCustomSeriesData] = useState<BLSSeriesData[]>([]);

  // Projection state
  const [projectionData, setProjectionData] = useState<OccupationProjection | null>(null);
  const [loadingProjection, setLoadingProjection] = useState(false);

  // QCEW state
  const [qcewData, setQcewData] = useState<QCEWAreaSummary | null>(null);
  const [selectedQcewArea, setSelectedQcewArea] = useState('los_angeles');
  const [loadingQcew, setLoadingQcew] = useState(false);

  // Search occupations with debounce
  const searchOccupationsApi = async (query: string) => {
    if (query.length < 2) {
      setOccupationResults([]);
      return;
    }
    setSearchingOccupations(true);
    try {
      const res = await fetch(`/api/bls/occupations/search?q=${encodeURIComponent(query)}&limit=15`);
      if (!res.ok) throw new Error('Failed to search occupations');
      const json = await res.json();
      setOccupationResults(json.results || []);
    } catch (err) {
      console.error('Occupation search error:', err);
      setOccupationResults([]);
    } finally {
      setSearchingOccupations(false);
    }
  };

  // Debounced occupation search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (occupationQuery.length >= 2) {
        searchOccupationsApi(occupationQuery);
      } else {
        setOccupationResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [occupationQuery]);

  // Fetch projection data when OES data is loaded
  useEffect(() => {
    if (oesData.length > 0 && selectedOccupation) {
      fetchProjectionData(selectedOccupation.code);
    }
  }, [oesData, selectedOccupation?.code]);

  // Fetch OES data
  const fetchOesData = async () => {
    if (!selectedOccupation) {
      toast.error('Error', 'Please select an occupation first');
      return;
    }
    setLoading(true);
    try {
      const areas = selectedOesAreas.join(',');
      const res = await fetch(`/api/bls/oes?occupation=${encodeURIComponent(selectedOccupation.code)}&areas=${encodeURIComponent(areas)}`);
      if (!res.ok) throw new Error('Failed to fetch OES data');
      const json = await res.json();
      setOesData(json.data || []);
    } catch (err) {
      toast.error('Error', 'Failed to load OES wage data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch unemployment data
  const fetchUnemploymentData = async () => {
    setLoading(true);
    try {
      const areas = selectedUnemploymentAreas.join(',');
      const res = await fetch(`/api/bls/unemployment?areas=${encodeURIComponent(areas)}`);
      if (!res.ok) throw new Error('Failed to fetch unemployment data');
      const json = await res.json();
      setUnemploymentData(json.data || []);
    } catch (err) {
      toast.error('Error', 'Failed to load unemployment data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch CPI data
  const fetchCpiData = async () => {
    setLoading(true);
    try {
      const areas = selectedCpiAreas.join(',');
      const res = await fetch(`/api/bls/cpi?areas=${encodeURIComponent(areas)}`);
      if (!res.ok) throw new Error('Failed to fetch CPI data');
      const json = await res.json();
      setCpiData(json.data || []);
    } catch (err) {
      toast.error('Error', 'Failed to load CPI data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch custom series
  const fetchCustomSeries = async () => {
    if (!customSeriesIds.trim()) {
      toast.error('Error', 'Please enter at least one series ID');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bls/series?ids=${encodeURIComponent(customSeriesIds)}`);
      if (!res.ok) throw new Error('Failed to fetch series data');
      const json = await res.json();
      setCustomSeriesData(json.series || []);
    } catch (err) {
      toast.error('Error', 'Failed to load series data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch projection data for selected occupation
  const fetchProjectionData = async (socCode: string) => {
    setLoadingProjection(true);
    try {
      const res = await fetch(`/api/bls/projections/${socCode}`);
      if (res.ok) {
        const json = await res.json();
        setProjectionData(json.projection || null);
      } else {
        setProjectionData(null);
      }
    } catch (err) {
      console.error('Projection fetch error:', err);
      setProjectionData(null);
    } finally {
      setLoadingProjection(false);
    }
  };

  // Fetch QCEW data
  const fetchQcewData = async () => {
    setLoadingQcew(true);
    try {
      const res = await fetch(`/api/qcew/summary/${selectedQcewArea}`);
      if (!res.ok) throw new Error('Failed to fetch QCEW data');
      const json = await res.json();
      setQcewData(json.summary || null);
    } catch (err) {
      toast.error('Error', 'Failed to load county employment data');
      console.error(err);
    } finally {
      setLoadingQcew(false);
    }
  };

  // Load initial data
  useEffect(() => {
    if (activeTab === 'oes' && oesData.length === 0) {
      fetchOesData();
    } else if (activeTab === 'unemployment' && unemploymentData.length === 0) {
      fetchUnemploymentData();
    } else if (activeTab === 'cpi' && cpiData.length === 0) {
      fetchCpiData();
    } else if (activeTab === 'local' && !qcewData) {
      fetchQcewData();
    }
  }, [activeTab]);

  // Toggle area selection
  const toggleArea = (area: string, type: 'unemployment' | 'cpi' | 'oes') => {
    if (type === 'unemployment') {
      setSelectedUnemploymentAreas((prev) =>
        prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
      );
    } else if (type === 'cpi') {
      setSelectedCpiAreas((prev) =>
        prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
      );
    } else {
      setSelectedOesAreas((prev) =>
        prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
      );
    }
  };

  // Format currency
  const formatCurrency = (value?: number, type: 'hourly' | 'annual' = 'annual') => {
    if (value === undefined || value === null) return '—';
    if (type === 'hourly') {
      return `$${value.toFixed(2)}`;
    }
    return `$${value.toLocaleString()}`;
  };

  // Group data by area
  const groupByArea = <T extends { area_name: string }>(data: T[]): Record<string, T[]> => {
    return data.reduce((acc, item) => {
      if (!acc[item.area_name]) acc[item.area_name] = [];
      acc[item.area_name].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  // Get latest value for an area
  const getLatestValue = <T extends { is_latest: boolean; value: number }>(data: T[]): T | undefined => {
    return data.find((d) => d.is_latest) || data[0];
  };

  // Format period name
  const formatPeriod = (year: string, periodName: string): string => {
    return `${periodName} ${year}`;
  };

  return (
    <PageShell>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
        {/* Header */}
        <div className="mb-8 max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
            U.S. Bureau of Labor Statistics Data
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Explore economic indicators from the BLS including unemployment rates and Consumer Price Index (CPI).
            Data focuses on California and national statistics.
          </p>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto mb-8">
          <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <button
              onClick={() => setActiveTab('oes')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'oes'
                  ? 'border-luminous-600 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <BriefcaseIcon className="h-5 w-5" />
              Occupational Wages
            </button>
            <button
              onClick={() => setActiveTab('unemployment')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'unemployment'
                  ? 'border-luminous-600 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <UserGroupIcon className="h-5 w-5" />
              Unemployment
            </button>
            <button
              onClick={() => setActiveTab('cpi')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'cpi'
                  ? 'border-luminous-600 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <CurrencyDollarIcon className="h-5 w-5" />
              Consumer Price Index
            </button>
            <button
              onClick={() => setActiveTab('local')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === 'local'
                  ? 'border-luminous-600 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <MapPinIcon className="h-5 w-5" />
              Local Employment
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'custom'
                  ? 'border-luminous-600 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <DocumentTextIcon className="h-5 w-5" />
              Custom Series
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-6xl mx-auto">
          {/* OES Tab */}
          {activeTab === 'oes' && (
            <div className="space-y-6">
              {/* Occupation & Area Selection */}
              <div className="luminous-card p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Occupation Search */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Search Occupation</h3>
                    <div className="relative" ref={occupationSearchRef}>
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                          type="text"
                          value={occupationQuery}
                          onChange={(e) => {
                            setOccupationQuery(e.target.value);
                            setShowOccupationDropdown(true);
                          }}
                          onFocus={() => setShowOccupationDropdown(true)}
                          placeholder="Type to search occupations (e.g., nurse, software, electrician)..."
                          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-luminous-500 focus:border-luminous-500"
                        />
                        {searchingOccupations && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="animate-spin h-4 w-4 border-2 border-luminous-600 border-t-transparent rounded-full" />
                          </div>
                        )}
                      </div>

                      {/* Search Results Dropdown */}
                      {showOccupationDropdown && (occupationResults.length > 0 || occupationQuery.length >= 2) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-h-80 overflow-y-auto">
                          {occupationResults.length > 0 ? (
                            occupationResults.map((occ) => (
                              <button
                                key={occ.code}
                                onClick={() => {
                                  setSelectedOccupation(occ);
                                  setOccupationQuery('');
                                  setShowOccupationDropdown(false);
                                  setOccupationResults([]);
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                              >
                                <div className="font-medium text-slate-900 dark:text-white">{occ.title}</div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  SOC {occ.code.slice(0, 2)}-{occ.code.slice(2)} &middot; {occ.major_group_title}
                                </div>
                              </button>
                            ))
                          ) : occupationQuery.length >= 2 && !searchingOccupations ? (
                            <div className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">
                              No occupations found for &ldquo;{occupationQuery}&rdquo;
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Selected Occupation Display */}
                    {selectedOccupation && (
                      <div className="mt-3 p-3 bg-luminous-50 dark:bg-luminous-900/20 rounded-lg border border-luminous-200 dark:border-luminous-800">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-luminous-900 dark:text-luminous-100">{selectedOccupation.title}</p>
                            <p className="text-sm text-luminous-600 dark:text-luminous-400">
                              SOC {selectedOccupation.code.slice(0, 2)}-{selectedOccupation.code.slice(2)}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedOccupation(null)}
                            className="text-luminous-500 hover:text-luminous-700 dark:hover:text-luminous-300"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Popular Occupations */}
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Popular occupations:</p>
                      <div className="flex flex-wrap gap-2">
                        {POPULAR_OCCUPATIONS.map((occ) => (
                          <button
                            key={occ.code}
                            onClick={() => {
                              setSelectedOccupation(occ);
                              setOccupationQuery('');
                              setShowOccupationDropdown(false);
                            }}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              selectedOccupation?.code === occ.code
                                ? 'bg-luminous-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {occ.title.length > 20 ? occ.title.slice(0, 20) + '...' : occ.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Area Selection */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Select Areas</h3>
                    <div className="flex flex-wrap gap-2">
                      {OES_AREA_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => toggleArea(option.value, 'oes')}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            selectedOesAreas.includes(option.value)
                              ? 'bg-luminous-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={fetchOesData}
                  disabled={loading || selectedOesAreas.length === 0 || !selectedOccupation}
                  className="mt-4 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Loading...' : 'Search Wages'}
                </button>
              </div>

              {/* OES Results */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
                </div>
              ) : oesData.length > 0 ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {oesData.map((data) => (
                      <div key={data.area_code} className="luminous-card p-5">
                        <div className="mb-4">
                          <h3 className="font-semibold text-slate-900 dark:text-white">{data.area_name}</h3>
                          <p className="text-sm text-slate-500">{data.occupation_name}</p>
                          <p className="text-xs text-slate-400">{data.year} Annual Data</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-slate-500 uppercase">Median Salary</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {formatCurrency(data.annual_median)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase">Employment</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                              {data.employment?.toLocaleString() || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">Hourly Mean</p>
                            <p className="font-medium text-slate-700 dark:text-slate-300">
                              {formatCurrency(data.hourly_mean, 'hourly')}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Annual Mean</p>
                            <p className="font-medium text-slate-700 dark:text-slate-300">
                              {formatCurrency(data.annual_mean)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Detailed Wage Table */}
                  <div className="luminous-card overflow-hidden">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white">Wage Percentiles Comparison</h3>
                      <p className="text-sm text-slate-500">Annual wages by percentile across areas</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500">
                            <th className="p-3 font-semibold">Area</th>
                            <th className="p-3 font-semibold text-right">10th %</th>
                            <th className="p-3 font-semibold text-right">25th %</th>
                            <th className="p-3 font-semibold text-right">Median</th>
                            <th className="p-3 font-semibold text-right">75th %</th>
                            <th className="p-3 font-semibold text-right">90th %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {oesData.map((data) => (
                            <tr key={data.area_code}>
                              <td className="p-3 font-medium text-slate-900 dark:text-white">{data.area_name}</td>
                              <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {formatCurrency(data.annual_10th)}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {formatCurrency(data.annual_25th)}
                              </td>
                              <td className="p-3 text-right font-mono font-medium text-green-600 dark:text-green-400">
                                {formatCurrency(data.annual_median)}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {formatCurrency(data.annual_75th)}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {formatCurrency(data.annual_90th)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Career Outlook Panel */}
                  {(projectionData || loadingProjection) && (
                    <div className="luminous-card overflow-hidden">
                      <div className="p-4 bg-gradient-to-r from-luminous-50 to-indigo-50 dark:from-luminous-900/30 dark:to-indigo-900/30 border-b border-luminous-200 dark:border-luminous-800">
                        <div className="flex items-center gap-2">
                          <AcademicCapIcon className="h-5 w-5 text-luminous-600" />
                          <h3 className="font-semibold text-luminous-900 dark:text-luminous-100">Career Outlook</h3>
                        </div>
                        <p className="text-sm text-luminous-600 dark:text-luminous-400">10-year employment projections and education requirements</p>
                      </div>
                      {loadingProjection ? (
                        <div className="p-8 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-luminous-600 mx-auto" />
                        </div>
                      ) : projectionData ? (
                        <div className="p-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            {/* Growth */}
                            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                              <p className="text-xs text-slate-500 uppercase mb-1">10-Year Growth</p>
                              <p className={`text-2xl font-bold ${
                                projectionData.change_percent >= 8 ? 'text-green-600' :
                                projectionData.change_percent >= 4 ? 'text-emerald-600' :
                                projectionData.change_percent >= 0 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {projectionData.change_percent > 0 ? '+' : ''}{projectionData.change_percent.toFixed(1)}%
                              </p>
                              <p className="text-xs text-slate-500">
                                {projectionData.change_numeric > 0 ? '+' : ''}{projectionData.change_numeric.toLocaleString()} jobs
                              </p>
                            </div>
                            {/* Annual Openings */}
                            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                              <p className="text-xs text-slate-500 uppercase mb-1">Annual Openings</p>
                              <p className="text-2xl font-bold text-luminous-600">
                                {projectionData.annual_openings.toLocaleString()}
                              </p>
                              <p className="text-xs text-slate-500">projected per year</p>
                            </div>
                            {/* Employment Base */}
                            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                              <p className="text-xs text-slate-500 uppercase mb-1">Current Employment</p>
                              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {(projectionData.employment_2023 / 1000000).toFixed(2)}M
                              </p>
                              <p className="text-xs text-slate-500">2023 base year</p>
                            </div>
                            {/* Outlook Badge */}
                            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                              <p className="text-xs text-slate-500 uppercase mb-1">Outlook</p>
                              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                projectionData.outlook === 'much_faster' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                projectionData.outlook === 'faster' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' :
                                projectionData.outlook === 'average' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                projectionData.outlook === 'slower' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                {projectionData.outlook_label}
                              </span>
                            </div>
                          </div>

                          {/* Education & Training Requirements */}
                          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Requirements to Enter</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-luminous-100 dark:bg-luminous-900/30 rounded-lg">
                                  <AcademicCapIcon className="h-5 w-5 text-luminous-600" />
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 uppercase">Education</p>
                                  <p className="font-medium text-slate-900 dark:text-white text-sm">
                                    {projectionData.entry_education_label}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                  <BriefcaseIcon className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 uppercase">Work Experience</p>
                                  <p className="font-medium text-slate-900 dark:text-white text-sm">
                                    {projectionData.work_experience_label}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                                  <ChartBarIcon className="h-5 w-5 text-violet-600" />
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 uppercase">On-Job Training</p>
                                  <p className="font-medium text-slate-900 dark:text-white text-sm">
                                    {projectionData.on_job_training_label}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <BriefcaseIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Select an occupation and areas, then click Search to view wage data.</p>
                </div>
              )}
            </div>
          )}

          {/* Unemployment Tab */}
          {activeTab === 'unemployment' && (
            <div className="space-y-6">
              {/* Area Selection */}
              <div className="luminous-card p-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Select Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {AREA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleArea(option.value, 'unemployment')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedUnemploymentAreas.includes(option.value)
                          ? 'bg-luminous-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchUnemploymentData}
                  disabled={loading || selectedUnemploymentAreas.length === 0}
                  className="mt-4 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Loading...' : 'Refresh Data'}
                </button>
              </div>

              {/* Unemployment Results */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
                </div>
              ) : unemploymentData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(groupByArea(unemploymentData)).map(([area, data]) => {
                    const latest = getLatestValue(data);
                    const prevValue = data[1]?.value;
                    const trend = latest && prevValue ? latest.value - prevValue : 0;
                    return (
                      <div key={area} className="luminous-card p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">{area}</h3>
                            {latest && (
                              <p className="text-sm text-slate-500">
                                {formatPeriod(latest.year, latest.period_name)}
                              </p>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 text-sm font-medium ${
                            trend > 0 ? 'text-red-600' : trend < 0 ? 'text-green-600' : 'text-slate-500'
                          }`}>
                            {trend > 0 ? (
                              <ArrowTrendingUpIcon className="h-4 w-4" />
                            ) : trend < 0 ? (
                              <ArrowTrendingDownIcon className="h-4 w-4" />
                            ) : null}
                            {trend !== 0 && `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`}
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
                          {latest?.value.toFixed(1)}%
                        </div>
                        {/* Historical data */}
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 uppercase font-medium">Recent History</p>
                          {data.slice(0, 6).map((d, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-500">{formatPeriod(d.year, d.period_name)}</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{d.value.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <UserGroupIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Select areas and click Refresh to load unemployment data.</p>
                </div>
              )}
            </div>
          )}

          {/* CPI Tab */}
          {activeTab === 'cpi' && (
            <div className="space-y-6">
              {/* Area Selection */}
              <div className="luminous-card p-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Select Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {CPI_AREA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleArea(option.value, 'cpi')}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedCpiAreas.includes(option.value)
                          ? 'bg-luminous-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchCpiData}
                  disabled={loading || selectedCpiAreas.length === 0}
                  className="mt-4 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Loading...' : 'Refresh Data'}
                </button>
              </div>

              {/* CPI Results */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
                </div>
              ) : cpiData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(groupByArea(cpiData)).map(([area, data]) => {
                    const latest = getLatestValue(data);
                    const yearAgo = data.find((d) =>
                      d.year === String(Number(latest?.year || 0) - 1) && d.period === latest?.period
                    );
                    const yoyChange = latest && yearAgo
                      ? ((latest.value - yearAgo.value) / yearAgo.value) * 100
                      : null;
                    return (
                      <div key={area} className="luminous-card p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">{area}</h3>
                            {latest && (
                              <p className="text-sm text-slate-500">
                                {formatPeriod(latest.year, latest.period_name)}
                              </p>
                            )}
                          </div>
                          {yoyChange !== null && (
                            <div className={`flex items-center gap-1 text-sm font-medium ${
                              yoyChange > 3 ? 'text-red-600' : yoyChange > 0 ? 'text-amber-600' : 'text-green-600'
                            }`}>
                              {yoyChange > 0 ? (
                                <ArrowTrendingUpIcon className="h-4 w-4" />
                              ) : (
                                <ArrowTrendingDownIcon className="h-4 w-4" />
                              )}
                              {yoyChange.toFixed(1)}% YoY
                            </div>
                          )}
                        </div>
                        <div className="text-4xl font-bold text-slate-900 dark:text-white mb-1">
                          {latest?.value.toFixed(1)}
                        </div>
                        <p className="text-sm text-slate-500 mb-4">CPI Index (1982-84 = 100)</p>
                        {/* Historical data */}
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 uppercase font-medium">Recent History</p>
                          {data.slice(0, 6).map((d, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-500">{formatPeriod(d.year, d.period_name)}</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{d.value.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Select areas and click Refresh to load CPI data.</p>
                </div>
              )}
            </div>
          )}

          {/* Local Employment (QCEW) Tab */}
          {activeTab === 'local' && (
            <div className="space-y-6">
              {/* Area Selection */}
              <div className="luminous-card p-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Select County</h3>
                <div className="flex flex-wrap gap-2">
                  {QCEW_AREA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedQcewArea(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedQcewArea === option.value
                          ? 'bg-luminous-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchQcewData}
                  disabled={loadingQcew}
                  className="mt-4 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {loadingQcew ? 'Loading...' : 'Refresh Data'}
                </button>
              </div>

              {/* QCEW Results */}
              {loadingQcew ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
                </div>
              ) : qcewData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="luminous-card p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-luminous-100 dark:bg-luminous-900/30 rounded-lg">
                          <UserGroupIcon className="h-5 w-5 text-luminous-600" />
                        </div>
                        <p className="text-sm text-slate-500">Total Employment</p>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">
                        {qcewData.total_employment ? qcewData.total_employment.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Private sector jobs</p>
                    </div>
                    <div className="luminous-card p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                          <BuildingOffice2Icon className="h-5 w-5 text-indigo-600" />
                        </div>
                        <p className="text-sm text-slate-500">Establishments</p>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">
                        {qcewData.total_establishments ? qcewData.total_establishments.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Business locations</p>
                    </div>
                    <div className="luminous-card p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                          <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                        </div>
                        <p className="text-sm text-slate-500">Avg Weekly Wage</p>
                      </div>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        ${qcewData.avg_weekly_wage ? qcewData.avg_weekly_wage.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">All industries</p>
                    </div>
                  </div>

                  {/* Area Info */}
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPinIcon className="h-4 w-4" />
                    <span>{qcewData.area_name} | Q{qcewData.quarter} {qcewData.year} | Private Sector</span>
                  </div>

                  {/* Industry Table */}
                  <div className="luminous-card overflow-hidden">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white">Employment by Industry</h3>
                      <p className="text-sm text-slate-500">Top industries ranked by employment</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500">
                            <th className="p-3 font-semibold">Industry</th>
                            <th className="p-3 font-semibold text-right">Employment</th>
                            <th className="p-3 font-semibold text-right">Establishments</th>
                            <th className="p-3 font-semibold text-right">Avg Weekly Wage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {qcewData.industries.slice(0, 15).map((ind) => (
                            <tr key={ind.industry_code}>
                              <td className="p-3">
                                <div className="font-medium text-slate-900 dark:text-white">{ind.industry_name}</div>
                                <div className="text-xs text-slate-500">NAICS {ind.industry_code}</div>
                              </td>
                              <td className="p-3 text-right font-mono text-slate-900 dark:text-white">
                                {ind.month3_employment?.toLocaleString() || '—'}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {ind.establishments?.toLocaleString() || '—'}
                              </td>
                              <td className="p-3 text-right font-mono text-green-600 dark:text-green-400">
                                ${ind.avg_weekly_wage?.toLocaleString() || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <MapPinIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Select a county and click Refresh to load employment data.</p>
                </div>
              )}
            </div>
          )}

          {/* Custom Series Tab */}
          {activeTab === 'custom' && (
            <div className="space-y-6">
              {/* Series Input */}
              <div className="luminous-card p-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Enter Series IDs</h3>
                <p className="text-sm text-slate-500 mb-3">
                  Enter BLS series IDs separated by commas. Find series IDs at{' '}
                  <a
                    href="https://www.bls.gov/help/hlpforma.htm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-luminous-600 hover:underline"
                  >
                    BLS Series ID Formats
                  </a>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSeriesIds}
                    onChange={(e) => setCustomSeriesIds(e.target.value)}
                    placeholder="e.g., LNS14000000, CUUR0000SA0"
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-luminous-500"
                  />
                  <button
                    onClick={fetchCustomSeries}
                    disabled={loading || !customSeriesIds.trim()}
                    className="px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Loading...' : 'Fetch'}
                  </button>
                </div>
                {/* Example series */}
                <div className="mt-3 text-sm text-slate-500">
                  <span className="font-medium">Popular series:</span>{' '}
                  <button
                    onClick={() => setCustomSeriesIds('LNS14000000')}
                    className="text-luminous-600 hover:underline"
                  >
                    National Unemployment
                  </button>
                  {', '}
                  <button
                    onClick={() => setCustomSeriesIds('CUUR0000SA0')}
                    className="text-luminous-600 hover:underline"
                  >
                    National CPI
                  </button>
                  {', '}
                  <button
                    onClick={() => setCustomSeriesIds('CES0000000001')}
                    className="text-luminous-600 hover:underline"
                  >
                    Total Nonfarm Employment
                  </button>
                </div>
              </div>

              {/* Custom Series Results */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
                </div>
              ) : customSeriesData.length > 0 ? (
                <div className="space-y-6">
                  {customSeriesData.map((series) => (
                    <div key={series.series_id} className="luminous-card overflow-hidden">
                      {/* Series Header */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              {series.series_title || series.series_id}
                            </h3>
                            <p className="text-sm text-slate-500">
                              {series.survey_name && `${series.survey_name} | `}
                              {series.area && `${series.area} | `}
                              ID: {series.series_id}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Data Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500">
                              <th className="p-3 font-semibold">Period</th>
                              <th className="p-3 font-semibold text-right">Value</th>
                              <th className="p-3 font-semibold">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {series.data.slice(0, 24).map((point, idx) => (
                              <tr key={idx} className={point.latest === 'true' ? 'bg-luminous-50 dark:bg-luminous-900/20' : ''}>
                                <td className="p-3 text-sm text-slate-700 dark:text-slate-300">
                                  {point.period_name} {point.year}
                                  {point.latest === 'true' && (
                                    <span className="ml-2 text-xs bg-luminous-600 text-white px-1.5 py-0.5 rounded">Latest</span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono font-medium text-slate-900 dark:text-white">
                                  {point.value}
                                </td>
                                <td className="p-3 text-sm text-slate-500">
                                  {point.footnotes.map((f) => f.text).filter(Boolean).join(', ') || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <DocumentTextIcon className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                  <p>Enter series IDs above to fetch custom BLS data.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
