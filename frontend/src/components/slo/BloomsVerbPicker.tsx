'use client';

// ===========================================
// Bloom's Verb Picker Component
// ===========================================
// Interactive component for selecting action verbs from Bloom's
// taxonomy levels when writing Student Learning Outcomes (SLOs).
// CUR-66: Create Bloom's taxonomy verb picker

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

// ===========================================
// Types & Constants
// ===========================================

export interface BloomsLevel {
  level: number;
  name: string;
  description: string;
  color: {
    bg: string;
    text: string;
    border: string;
    darkBg: string;
    darkText: string;
  };
  verbs: string[];
}

// Bloom's Taxonomy levels with color coding
// Remember=red, Understand=orange, Apply=yellow, Analyze=green, Evaluate=blue, Create=violet
export const BLOOMS_LEVELS: BloomsLevel[] = [
  {
    level: 1,
    name: 'Remember',
    description: 'Recall facts and basic concepts',
    color: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      border: 'border-red-300',
      darkBg: 'dark:bg-red-900/30',
      darkText: 'dark:text-red-300',
    },
    verbs: [
      'define', 'describe', 'identify', 'label', 'list', 'match', 'name',
      'outline', 'recall', 'recognize', 'reproduce', 'select', 'state',
      'locate', 'memorize', 'quote', 'repeat', 'tabulate', 'tell'
    ],
  },
  {
    level: 2,
    name: 'Understand',
    description: 'Explain ideas or concepts',
    color: {
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      border: 'border-orange-300',
      darkBg: 'dark:bg-orange-900/30',
      darkText: 'dark:text-orange-300',
    },
    verbs: [
      'classify', 'compare', 'contrast', 'convert', 'demonstrate', 'distinguish',
      'estimate', 'explain', 'extend', 'generalize', 'illustrate', 'infer',
      'interpret', 'paraphrase', 'predict', 'rewrite', 'summarize', 'translate',
      'associate', 'discuss', 'express', 'report', 'review'
    ],
  },
  {
    level: 3,
    name: 'Apply',
    description: 'Use information in new situations',
    color: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      border: 'border-yellow-300',
      darkBg: 'dark:bg-yellow-900/30',
      darkText: 'dark:text-yellow-300',
    },
    verbs: [
      'apply', 'calculate', 'change', 'choose', 'complete', 'compute',
      'construct', 'demonstrate', 'develop', 'discover', 'dramatize',
      'employ', 'examine', 'experiment', 'illustrate', 'implement',
      'interpret', 'manipulate', 'modify', 'operate', 'practice', 'predict',
      'prepare', 'produce', 'relate', 'schedule', 'show', 'sketch', 'solve',
      'use', 'utilize', 'write'
    ],
  },
  {
    level: 4,
    name: 'Analyze',
    description: 'Draw connections among ideas',
    color: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-300',
      darkBg: 'dark:bg-green-900/30',
      darkText: 'dark:text-green-300',
    },
    verbs: [
      'analyze', 'appraise', 'arrange', 'break down', 'calculate', 'categorize',
      'compare', 'contrast', 'criticize', 'debate', 'diagram', 'differentiate',
      'discriminate', 'distinguish', 'examine', 'experiment', 'identify',
      'illustrate', 'infer', 'inspect', 'investigate', 'model', 'order',
      'outline', 'point out', 'question', 'relate', 'separate', 'subdivide',
      'test'
    ],
  },
  {
    level: 5,
    name: 'Evaluate',
    description: 'Justify a stand or decision',
    color: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-300',
      darkBg: 'dark:bg-blue-900/30',
      darkText: 'dark:text-blue-300',
    },
    verbs: [
      'appraise', 'argue', 'assess', 'choose', 'compare', 'conclude',
      'convince', 'criticize', 'critique', 'decide', 'defend', 'determine',
      'discriminate', 'estimate', 'evaluate', 'explain', 'grade', 'interpret',
      'judge', 'justify', 'measure', 'prioritize', 'rank', 'rate',
      'recommend', 'relate', 'revise', 'score', 'select', 'summarize',
      'support', 'validate', 'value', 'verify', 'weigh'
    ],
  },
  {
    level: 6,
    name: 'Create',
    description: 'Produce new or original work',
    color: {
      bg: 'bg-violet-100',
      text: 'text-violet-700',
      border: 'border-violet-300',
      darkBg: 'dark:bg-violet-900/30',
      darkText: 'dark:text-violet-300',
    },
    verbs: [
      'arrange', 'assemble', 'build', 'categorize', 'combine', 'compile',
      'compose', 'construct', 'create', 'design', 'develop', 'devise',
      'elaborate', 'establish', 'formulate', 'generate', 'hypothesize',
      'integrate', 'invent', 'make', 'manage', 'modify', 'organize', 'originate',
      'plan', 'prepare', 'produce', 'propose', 'rearrange', 'reconstruct',
      'revise', 'set up', 'synthesize', 'write'
    ],
  },
];

// Weak verbs that should be avoided in SLOs
export const WEAK_VERBS = [
  'understand', 'know', 'learn', 'appreciate', 'become familiar with',
  'become aware of', 'comprehend', 'grasp', 'realize', 'be exposed to'
];

// ===========================================
// Helper Functions
// ===========================================

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===========================================
// Main Component
// ===========================================

export interface BloomsVerbPickerProps {
  onSelect?: (verb: string, level: BloomsLevel) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  selectedVerb?: string;
  showLevelBadge?: boolean;
}

export function BloomsVerbPicker({
  onSelect,
  placeholder = 'Select a verb...',
  className = '',
  disabled = false,
  selectedVerb,
  showLevelBadge = true,
}: BloomsVerbPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const [focusedVerbIndex, setFocusedVerbIndex] = useState(-1);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Filter verbs based on search term
  const filteredLevels = useMemo(() => {
    if (!searchTerm) return BLOOMS_LEVELS;

    const term = searchTerm.toLowerCase();
    return BLOOMS_LEVELS.map((level) => ({
      ...level,
      verbs: level.verbs.filter((verb) => verb.toLowerCase().includes(term)),
    })).filter((level) => level.verbs.length > 0);
  }, [searchTerm]);

  // Get selected verb's level
  const selectedLevel = useMemo(() => {
    if (!selectedVerb) return null;
    return BLOOMS_LEVELS.find((level) =>
      level.verbs.includes(selectedVerb.toLowerCase())
    );
  }, [selectedVerb]);

  // Handle verb selection
  const handleVerbClick = useCallback(
    (verb: string, level: BloomsLevel) => {
      onSelect?.(verb, level);
      setIsOpen(false);
      setSearchTerm('');
    },
    [onSelect]
  );

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
      if (isOpen) {
        setSearchTerm('');
      }
    }
  }, [disabled, isOpen]);

  // Get all visible verbs for keyboard navigation
  const allVisibleVerbs = useMemo(() => {
    const verbs: Array<{ verb: string; level: BloomsLevel }> = [];
    filteredLevels.forEach((level) => {
      if (expandedLevel === level.level || searchTerm) {
        level.verbs.forEach((verb) => {
          verbs.push({ verb, level });
        });
      }
    });
    return verbs;
  }, [filteredLevels, expandedLevel, searchTerm]);

  // Reset focused index when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFocusedVerbIndex(-1);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
      triggerButtonRef.current?.focus();
      return;
    }

    if (!isOpen) {
      // Open dropdown on Enter, Space, or arrow down
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    // Arrow key navigation within open dropdown
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (allVisibleVerbs.length > 0) {
        setFocusedVerbIndex((prev) =>
          prev < allVisibleVerbs.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (allVisibleVerbs.length > 0) {
        setFocusedVerbIndex((prev) =>
          prev > 0 ? prev - 1 : allVisibleVerbs.length - 1
        );
      }
    } else if (e.key === 'Enter' && focusedVerbIndex >= 0) {
      e.preventDefault();
      const selected = allVisibleVerbs[focusedVerbIndex];
      if (selected) {
        handleVerbClick(selected.verb, selected.level);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedVerbIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedVerbIndex(allVisibleVerbs.length - 1);
    }
  }, [isOpen, allVisibleVerbs, focusedVerbIndex, handleVerbClick]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-4 py-2.5
          border rounded-lg text-left transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2
          ${disabled
            ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed opacity-60'
            : 'bg-white dark:bg-slate-800 hover:border-luminous-400 dark:hover:border-luminous-600'
          }
          ${isOpen
            ? 'border-luminous-500 ring-2 ring-luminous-500/20'
            : 'border-slate-300 dark:border-slate-600'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid="blooms-verb-picker-trigger"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <AcademicCapIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
          {selectedVerb && selectedLevel ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-slate-900 dark:text-white truncate">
                {capitalizeFirstLetter(selectedVerb)}
              </span>
              {showLevelBadge && (
                <span
                  className={`
                    text-xs px-2 py-0.5 rounded-full flex-shrink-0
                    ${selectedLevel.color.bg} ${selectedLevel.color.text}
                    ${selectedLevel.color.darkBg} ${selectedLevel.color.darkText}
                  `}
                >
                  {selectedLevel.name} - Level {selectedLevel.level}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 text-slate-400 transition-transform flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 mt-2 w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
          role="listbox"
          data-testid="blooms-verb-picker-dropdown"
        >
          {/* Search Input */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search verbs..."
                className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-luminous-500/20 focus:border-luminous-500 focus-visible:ring-2 focus-visible:ring-luminous-500"
                data-testid="blooms-verb-search"
                aria-label="Search verbs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 rounded"
                  aria-label="Clear search"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Weak Verbs Warning */}
          {searchTerm && WEAK_VERBS.some((v) => v.includes(searchTerm.toLowerCase())) && (
            <div className="mx-3 mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Note:</strong> Avoid weak verbs like &quot;understand,&quot; &quot;know,&quot; or &quot;learn&quot; - they&apos;re not measurable.
              </p>
            </div>
          )}

          {/* Verb Categories */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredLevels.length === 0 ? (
              <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                No verbs found matching &quot;{searchTerm}&quot;
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLevels.map((level) => (
                  <div key={level.level} className="rounded-lg overflow-hidden">
                    {/* Level Header - Collapsible */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedLevel(
                          expandedLevel === level.level ? null : level.level
                        )
                      }
                      className={`
                        w-full flex items-center justify-between px-3 py-2 text-left
                        ${level.color.bg} ${level.color.darkBg}
                        hover:opacity-90 transition-opacity
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-inset
                      `}
                      aria-expanded={expandedLevel === level.level}
                      data-testid={`blooms-level-${level.level}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${level.color.text} ${level.color.darkText}`}
                        >
                          {level.name}
                        </span>
                        <span
                          className={`text-xs opacity-70 ${level.color.text} ${level.color.darkText}`}
                        >
                          Level {level.level}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs ${level.color.text} ${level.color.darkText}`}
                        >
                          {level.verbs.length} verbs
                        </span>
                        <ChevronDownIcon
                          className={`h-4 w-4 ${level.color.text} ${level.color.darkText} transition-transform ${
                            expandedLevel === level.level ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Verbs Grid */}
                    {(expandedLevel === level.level || searchTerm) && (
                      <div className="p-2 bg-white dark:bg-slate-800 border-x border-b border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
                          {level.description}
                        </p>
                        <div className="flex flex-wrap gap-1" role="listbox">
                          {level.verbs.map((verb) => {
                            // Calculate if this verb is keyboard-focused
                            const verbIndex = allVisibleVerbs.findIndex(
                              (v) => v.verb === verb && v.level.level === level.level
                            );
                            const isKeyboardFocused = verbIndex === focusedVerbIndex;

                            return (
                              <button
                                key={`${level.level}-${verb}`}
                                type="button"
                                onClick={() => handleVerbClick(verb, level)}
                                role="option"
                                aria-selected={selectedVerb === verb}
                                className={`
                                  px-2.5 py-1 text-sm rounded-md transition-all
                                  hover:scale-105 hover:shadow-sm
                                  focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500
                                  ${isKeyboardFocused ? 'ring-2 ring-luminous-500 scale-105' : ''}
                                  ${selectedVerb === verb
                                    ? `${level.color.bg} ${level.color.text} ${level.color.darkBg} ${level.color.darkText} ring-2 ring-offset-1`
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                  }
                                `}
                                data-testid={`verb-${verb}`}
                              >
                                {capitalizeFirstLetter(verb)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Higher levels (5-6) indicate more complex cognitive skills
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default BloomsVerbPicker;
