'use client';

// ===========================================
// QuickSearchWidget Component - Dashboard Widget
// ===========================================
// Typeahead search for courses and programs
// with keyboard navigation and debounced API calls

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentTextIcon,
  FolderIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { api, CourseListItem, ProgramListItem, CourseStatus, ProgramStatus } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Types
// ===========================================

interface SearchResult {
  id: string;
  type: 'course' | 'program';
  code: string;
  title: string;
  status: string;
}

// ===========================================
// Helper Functions
// ===========================================

function getStatusBadgeClasses(status: string): string {
  const config: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    DeptReview: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    CurriculumCommittee: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    ArticulationReview: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    Approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    Active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    Inactive: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return config[status] || config.Draft;
}

function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    Draft: 'Draft',
    DeptReview: 'Dept Review',
    CurriculumCommittee: 'Committee',
    ArticulationReview: 'Articulation',
    Approved: 'Approved',
    Active: 'Active',
    Inactive: 'Inactive',
  };
  return labels[status] || status;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ===========================================
// Search Result Item Component
// ===========================================

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  isSelected,
  onClick,
  onMouseEnter,
}) => {
  const Icon = result.type === 'course' ? DocumentTextIcon : FolderIcon;

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
        isSelected
          ? 'bg-luminous-50 dark:bg-luminous-900/30'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        result.type === 'course'
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
          : 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-white text-sm">
            {result.code}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getStatusBadgeClasses(result.status)}`}>
            {formatStatusLabel(result.status)}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {result.title}
        </p>
      </div>
    </button>
  );
};

// ===========================================
// QuickSearchWidget Component
// ===========================================

interface QuickSearchWidgetProps {
  placeholder?: string;
}

export const QuickSearchWidget: React.FC<QuickSearchWidgetProps> = ({
  placeholder = 'Search courses and programs...',
}) => {
  const router = useRouter();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Search function
  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      // Search courses and programs in parallel
      const [coursesResponse, programsResponse] = await Promise.all([
        api.listCourses({ search: searchQuery, limit: 5 }),
        api.listPrograms({ search: searchQuery, limit: 5 }),
      ]);

      // Convert to unified search results
      const courseResults: SearchResult[] = coursesResponse.items.map((course: CourseListItem) => ({
        id: course.id,
        type: 'course' as const,
        code: `${course.subject_code} ${course.course_number}`,
        title: course.title,
        status: course.status,
      }));

      const programResults: SearchResult[] = programsResponse.items.map((program: ProgramListItem) => ({
        id: program.id,
        type: 'program' as const,
        code: program.title,
        title: `${program.type} - ${program.department?.name || 'No department'}`,
        status: program.status,
      }));

      const allResults = [...courseResults, ...programResults].slice(0, 8);
      setResults(allResults);
      setIsOpen(allResults.length > 0);
      setSelectedIndex(-1);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((q: string) => search(q), 300),
    [search]
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  // Handle result selection
  const handleSelect = (result: SearchResult) => {
    const path = result.type === 'course'
      ? `/courses/${result.id}`
      : `/programs/${result.id}`;
    router.push(path);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Clear search
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <ArrowPathIcon className="h-5 w-5 text-slate-400 animate-spin" />
          ) : (
            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-luminous-500 focus:border-transparent transition-shadow"
          aria-label="Search courses and programs"
          aria-expanded={isOpen}
          aria-controls="search-results"
          aria-autocomplete="list"
          role="combobox"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Clear search"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div
          id="search-results"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
        >
          {results.length > 0 ? (
            <div className="py-1">
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.type}-${result.id}`}
                  result={result}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              No results found
            </div>
          )}

          {/* Keyboard hint */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">↑↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">↵</kbd>
                to select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">esc</kbd>
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickSearchWidget;
