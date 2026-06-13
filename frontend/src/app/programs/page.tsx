'use client';

// ===========================================
// Programs List Page - Browse All Programs
// ===========================================
// Displays paginated list of programs (degrees/certificates) with search and filtering

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { ProgramCardSkeleton } from '@/components/loading';
import { EmptyProgramsState } from '@/components/empty-state';
import { useAuth } from '@/contexts/AuthContext';
import { api, ProgramListItem, ProgramListResponse, ProgramStatus, ProgramType } from '@/lib/api';

// ===========================================
// Status Badge Component
// ===========================================

interface StatusBadgeProps {
  status: ProgramStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<ProgramStatus, { label: string; className: string }> = {
    Draft: {
      label: 'Draft',
      className: 'luminous-badge luminous-badge-draft',
    },
    Review: {
      label: 'Review',
      className: 'luminous-badge luminous-badge-warning',
    },
    Approved: {
      label: 'Approved',
      className: 'luminous-badge luminous-badge-approved',
    },
  };

  const config = statusConfig[status] || statusConfig.Draft;

  return <span className={config.className}>{config.label}</span>;
};

// ===========================================
// Program Type Badge Component
// ===========================================

interface TypeBadgeProps {
  type: ProgramType;
}

const TypeBadge: React.FC<TypeBadgeProps> = ({ type }) => {
  const typeConfig: Record<ProgramType, { label: string; className: string }> = {
    AA: {
      label: 'AA',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    AS: {
      label: 'AS',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    AAT: {
      label: 'AA-T',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    },
    AST: {
      label: 'AS-T',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    },
    Certificate: {
      label: 'Certificate',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    ADT: {
      label: 'ADT',
      className: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    },
  };

  const config = typeConfig[type] || typeConfig.AA;

  return <span className={config.className}>{config.label}</span>;
};

// ===========================================
// Program Card Component
// ===========================================

interface ProgramCardProps {
  program: ProgramListItem;
}

const ProgramCard: React.FC<ProgramCardProps> = ({ program }) => {
  return (
    <Link href={`/programs/${program.id}`}>
      <div className="luminous-card group cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Program Type and Title */}
            <div className="flex items-center gap-2 mb-1">
              <TypeBadge type={program.type} />
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white truncate group-hover:text-luminous-600 dark:group-hover:text-luminous-400 transition-colors">
              {program.title}
            </h3>
            {/* Department */}
            {program.department && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {program.department.name}
              </p>
            )}
          </div>
          {/* Status Badge */}
          <StatusBadge status={program.status} />
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium">{program.total_units} units</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Updated {new Date(program.updated_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
};

// ===========================================
// Loading State Component
// ===========================================

const LoadingState: React.FC = () => {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {[...Array(6)].map((_, i) => (
        <ProgramCardSkeleton key={i} />
      ))}
    </div>
  );
};

// ===========================================
// Pagination Component
// ===========================================

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  pages,
  total,
  limit,
  onPageChange,
}) => {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-8 px-4 py-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-900 dark:text-white">{start}</span> to{' '}
        <span className="font-medium text-slate-900 dark:text-white">{end}</span> of{' '}
        <span className="font-medium text-slate-900 dark:text-white">{total}</span> programs
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="luminous-button-secondary px-3 py-2"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="luminous-button-secondary px-3 py-2"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ===========================================
// Main Programs Page Component
// ===========================================

export default function ProgramsPage() {
  const { getToken } = useAuth();

  // State
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProgramStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<ProgramType | ''>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const limit = 12;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch programs
  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Set token for authenticated requests
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const params: Parameters<typeof api.listPrograms>[0] = {
        page,
        limit,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;

      const response = await api.listPrograms(params);
      setPrograms(response.items);
      setPages(response.pages);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch programs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, typeFilter, limit, getToken]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Handle filter changes
  const handleStatusChange = (newStatus: ProgramStatus | '') => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleTypeChange = (newType: ProgramType | '') => {
    setTypeFilter(newType);
    setPage(1);
  };

  // Check if any filters are active
  const hasFilters = Boolean(debouncedSearch || statusFilter || typeFilter);

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Programs</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Browse and manage degree and certificate programs
            </p>
          </div>
          <Link href="/programs/new" className="luminous-button-primary">
            <PlusIcon className="h-5 w-5 mr-2" />
            New Program
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="luminous-input pl-10 w-full"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <AcademicCapIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => handleTypeChange(e.target.value as ProgramType | '')}
              className="luminous-select pl-10 pr-10 min-w-[140px]"
            >
              <option value="">All Types</option>
              <option value="AA">AA</option>
              <option value="AS">AS</option>
              <option value="AAT">AA-T</option>
              <option value="AST">AS-T</option>
              <option value="Certificate">Certificate</option>
              <option value="ADT">ADT</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as ProgramStatus | '')}
              className="luminous-select pl-10 pr-10 min-w-[160px]"
            >
              <option value="">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Review">Review</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={fetchPrograms}
              className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && <LoadingState />}

        {/* Empty State */}
        {!loading && !error && programs.length === 0 && (
          <EmptyProgramsState hasFilters={hasFilters} />
        )}

        {/* Program Grid */}
        {!loading && !error && programs.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {programs.map((program) => (
                <ProgramCard key={program.id} program={program} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              pages={pages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
