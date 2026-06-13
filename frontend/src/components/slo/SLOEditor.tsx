'use client';

// ===========================================
// SLO Editor Component
// ===========================================
// Comprehensive editor for Student Learning Outcomes (SLOs)
// with Bloom's taxonomy verb picker integration.
// Uses the API's SLOItem type format.

import { useState, useCallback, useMemo } from 'react';
import {
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  AcademicCapIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { BloomsVerbPicker, BloomsLevel, BLOOMS_LEVELS, WEAK_VERBS } from './BloomsVerbPicker';
import { ConfirmDialog } from '@/components/confirm-dialog';

// ===========================================
// Types - Match API's SLOItem format
// ===========================================

// Matches the API's SLOItem interface from lib/api.ts
export interface SLOItem {
  id: string;
  sequence: number;
  outcome_text: string;
  bloom_level: string;
  performance_criteria: string | null;
}

export interface SLOEditorProps {
  slos: SLOItem[];
  onChange: (slos: SLOItem[]) => void;
  maxSLOs?: number;
  minSLOs?: number;
  // Optional AI suggestion support
  onSuggestSLOs?: () => Promise<SLOItem[]>;
  isLoadingSuggestions?: boolean;
  courseTitle?: string;
  courseDescription?: string;
}

// ===========================================
// Helper Functions
// ===========================================

// Get Bloom's level number from level name (e.g., "Analyze" -> 4)
function getBloomsLevelNumber(levelName: string): number | undefined {
  const level = BLOOMS_LEVELS.find(
    (l) => l.name.toLowerCase() === levelName.toLowerCase()
  );
  return level?.level;
}

// Get Bloom's level object from level name
function getBloomsLevel(levelName: string): BloomsLevel | undefined {
  return BLOOMS_LEVELS.find(
    (l) => l.name.toLowerCase() === levelName.toLowerCase()
  );
}

// Extract verb from outcome text (first word)
function extractVerb(text: string): string | undefined {
  const firstWord = text.trim().split(' ')[0]?.toLowerCase();
  if (!firstWord) return undefined;

  // Check if it's a valid Bloom's verb
  for (const level of BLOOMS_LEVELS) {
    if (level.verbs.includes(firstWord)) {
      return firstWord;
    }
  }
  return undefined;
}

// ===========================================
// Weak Verb Detection (CUR-68)
// ===========================================

interface WeakVerbDetection {
  found: boolean;
  weakVerb: string | null;
  position: number;
  suggestions: Array<{ verb: string; level: BloomsLevel }>;
}

// Detect weak verbs in SLO text
function detectWeakVerbs(text: string): WeakVerbDetection {
  const lowerText = text.toLowerCase();

  // Check for weak verbs
  for (const weakVerb of WEAK_VERBS) {
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${weakVerb}\\b`, 'i');
    const match = lowerText.match(regex);

    if (match) {
      // Find suggested alternatives based on context
      const suggestions = getSuggestedAlternatives(weakVerb, text);
      return {
        found: true,
        weakVerb: weakVerb,
        position: match.index || 0,
        suggestions,
      };
    }
  }

  return {
    found: false,
    weakVerb: null,
    position: -1,
    suggestions: [],
  };
}

// Get suggested strong verbs as alternatives
function getSuggestedAlternatives(
  weakVerb: string,
  context: string
): Array<{ verb: string; level: BloomsLevel }> {
  // Map weak verbs to appropriate Bloom's levels
  const verbToLevelMapping: Record<string, number[]> = {
    'understand': [2, 3], // Understand level -> actual Understand verbs
    'know': [1, 2], // Remember/Understand
    'learn': [1, 2, 3], // Could be Remember, Understand, or Apply
    'appreciate': [4, 5], // Higher-order: Analyze, Evaluate
    'become familiar with': [1, 2], // Remember/Understand
    'become aware of': [1, 2], // Remember/Understand
    'comprehend': [2, 3], // Understand/Apply
    'grasp': [2, 3], // Understand/Apply
    'realize': [2, 4], // Understand/Analyze
    'be exposed to': [1, 2], // Remember/Understand
  };

  const targetLevels = verbToLevelMapping[weakVerb.toLowerCase()] || [2, 3];
  const suggestions: Array<{ verb: string; level: BloomsLevel }> = [];

  // Get 3-4 verbs from suggested levels
  for (const levelNum of targetLevels) {
    const level = BLOOMS_LEVELS.find((l) => l.level === levelNum);
    if (level) {
      // Pick 1-2 random verbs from this level
      const shuffled = [...level.verbs].sort(() => Math.random() - 0.5);
      const count = levelNum === targetLevels[0] ? 2 : 1;
      for (let i = 0; i < Math.min(count, shuffled.length); i++) {
        suggestions.push({ verb: shuffled[i], level });
      }
    }
  }

  return suggestions.slice(0, 4);
}

// ===========================================
// Helper Components
// ===========================================

// Weak Verb Warning Component (CUR-68)
interface WeakVerbWarningProps {
  detection: WeakVerbDetection;
  onSuggestionClick: (verb: string, level: BloomsLevel) => void;
}

function WeakVerbWarning({ detection, onSuggestionClick }: WeakVerbWarningProps) {
  if (!detection.found || !detection.weakVerb) return null;

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-start gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Weak verb detected: &quot;{detection.weakVerb}&quot;
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            This verb is not measurable and may be rejected by accreditation reviewers.
            Consider using a stronger action verb from Bloom&apos;s taxonomy.
          </p>

          {detection.suggestions.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <LightBulbIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Try these instead:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detection.suggestions.map(({ verb, level }) => (
                  <button
                    key={`${level.level}-${verb}`}
                    type="button"
                    onClick={() => onSuggestionClick(verb, level)}
                    className={`
                      px-2.5 py-1 text-xs font-medium rounded-md transition-all
                      hover:scale-105 hover:shadow-sm
                      ${level.color.bg} ${level.color.text}
                      ${level.color.darkBg} ${level.color.darkText}
                      border ${level.color.border}
                    `}
                    title={`${level.name} (Level ${level.level}): ${level.description}`}
                  >
                    {verb.charAt(0).toUpperCase() + verb.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 italic">
            You can still save with this warning, but consider revising for accreditation.
          </p>
        </div>
      </div>
    </div>
  );
}

interface SLOItemEditorProps {
  slo: SLOItem;
  index: number;
  total: number;
  onUpdate: (id: string, updates: Partial<SLOItem>) => void;
  onRequestDelete: (id: string, sloText: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  canDelete: boolean;
}

function SLOItemEditor({
  slo,
  index,
  total,
  onUpdate,
  onRequestDelete,
  onMoveUp,
  onMoveDown,
  canDelete,
}: SLOItemEditorProps) {
  const handleVerbSelect = useCallback(
    (verb: string, level: BloomsLevel) => {
      // Get current text, remove existing verb at start if present
      let currentText = slo.outcome_text.trim();

      // Check if the text starts with a verb (first word before space)
      const firstSpace = currentText.indexOf(' ');
      if (firstSpace > 0) {
        const firstWord = currentText.substring(0, firstSpace).toLowerCase();
        // Check if it's an existing Bloom's verb
        const isExistingVerb = BLOOMS_LEVELS.some((l) =>
          l.verbs.includes(firstWord)
        );
        if (isExistingVerb) {
          currentText = currentText.substring(firstSpace + 1);
        }
      }

      // Capitalize the verb
      const capitalizedVerb = verb.charAt(0).toUpperCase() + verb.slice(1);

      // Update with new verb and bloom level
      onUpdate(slo.id, {
        outcome_text: `${capitalizedVerb} ${currentText}`.trim(),
        bloom_level: level.name,
      });
    },
    [slo.id, slo.outcome_text, onUpdate]
  );

  const level = slo.bloom_level ? getBloomsLevel(slo.bloom_level) : null;
  const currentVerb = extractVerb(slo.outcome_text);

  // Detect weak verbs in the SLO text (CUR-68)
  const weakVerbDetection = useMemo(
    () => detectWeakVerbs(slo.outcome_text),
    [slo.outcome_text]
  );

  // Handle clicking a suggested verb from the weak verb warning
  const handleSuggestionClick = useCallback(
    (verb: string, suggestedLevel: BloomsLevel) => {
      // Replace the weak verb with the suggested verb
      if (weakVerbDetection.weakVerb) {
        const regex = new RegExp(`\\b${weakVerbDetection.weakVerb}\\b`, 'gi');
        const capitalizedVerb = verb.charAt(0).toUpperCase() + verb.slice(1);
        const newText = slo.outcome_text.replace(regex, capitalizedVerb);

        onUpdate(slo.id, {
          outcome_text: newText,
          bloom_level: suggestedLevel.name,
        });
      }
    },
    [slo.id, slo.outcome_text, weakVerbDetection.weakVerb, onUpdate]
  );

  return (
    <div
      className={`group p-4 bg-white dark:bg-slate-800 rounded-xl border-2 transition-all ${
        level
          ? `${level.color.border} ${level.color.bg} ${level.color.darkBg}`
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3 mb-3">
        {/* SLO Number */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
            level
              ? `${level.color.bg} ${level.color.text} ${level.color.darkBg} ${level.color.darkText}`
              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          {index + 1}
        </div>

        {/* Title and Level */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 dark:text-white">
              SLO #{index + 1}
            </span>
            {level && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${level.color.bg} ${level.color.text} ${level.color.darkBg} ${level.color.darkText}`}
              >
                {level.name} - Level {level.level}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMoveUp(slo.id)}
            disabled={index === 0}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ChevronUpIcon className="h-4 w-4 text-slate-500" />
          </button>
          <button
            onClick={() => onMoveDown(slo.id)}
            disabled={index === total - 1}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ChevronDownIcon className="h-4 w-4 text-slate-500" />
          </button>
          <button
            onClick={() => onRequestDelete(slo.id, slo.outcome_text)}
            disabled={!canDelete}
            className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete SLO"
          >
            <TrashIcon className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Verb Picker */}
      <div className="mb-3">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
          Action Verb (Bloom&apos;s Taxonomy)
        </label>
        <BloomsVerbPicker
          selectedVerb={currentVerb}
          onSelect={handleVerbSelect}
          placeholder="Select an action verb..."
          className="w-full"
        />
      </div>

      {/* SLO Text */}
      <div>
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
          Complete Statement
        </label>
        <textarea
          value={slo.outcome_text}
          onChange={(e) => onUpdate(slo.id, { outcome_text: e.target.value })}
          placeholder="Upon successful completion of this course, students will be able to..."
          rows={3}
          className={`w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-luminous-500/20 focus:border-luminous-500 resize-none ${
            weakVerbDetection.found
              ? 'border-amber-300 dark:border-amber-600'
              : 'border-slate-200 dark:border-slate-600'
          }`}
        />

        {/* Weak Verb Warning (CUR-68) */}
        <WeakVerbWarning
          detection={weakVerbDetection}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>

      {/* Performance Criteria (optional) */}
      <div className="mt-3">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
          Performance Criteria (optional)
        </label>
        <input
          type="text"
          value={slo.performance_criteria || ''}
          onChange={(e) => onUpdate(slo.id, { performance_criteria: e.target.value || null })}
          placeholder="How will this outcome be assessed?"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-luminous-500/20 focus:border-luminous-500"
        />
      </div>

      {/* Tips */}
      {!currentVerb && !slo.outcome_text && (
        <div className="mt-3 flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <InformationCircleIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Start by selecting an action verb from Bloom&apos;s taxonomy, then complete the
            statement describing what students will be able to do.
          </p>
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function SLOEditor({
  slos,
  onChange,
  maxSLOs = 8,
  minSLOs = 3,
  onSuggestSLOs,
  isLoadingSuggestions = false,
  courseTitle,
  courseDescription,
}: SLOEditorProps) {
  // State for delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sloToDelete, setSloToDelete] = useState<{ id: string; text: string } | null>(null);

  // Generate unique ID
  const generateId = () => `slo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add new SLO
  const handleAddSLO = useCallback(() => {
    if (slos.length >= maxSLOs) return;

    const newSLO: SLOItem = {
      id: generateId(),
      sequence: slos.length + 1,
      outcome_text: '',
      bloom_level: '',
      performance_criteria: null,
    };

    onChange([...slos, newSLO]);
  }, [slos, maxSLOs, onChange]);

  // Update SLO
  const handleUpdateSLO = useCallback(
    (id: string, updates: Partial<SLOItem>) => {
      onChange(
        slos.map((slo) => (slo.id === id ? { ...slo, ...updates } : slo))
      );
    },
    [slos, onChange]
  );

  // Request delete - shows confirmation dialog
  const handleRequestDelete = useCallback(
    (id: string, sloText: string) => {
      if (slos.length <= minSLOs) return;
      setSloToDelete({ id, text: sloText });
      setDeleteConfirmOpen(true);
    },
    [slos.length, minSLOs]
  );

  // Confirm delete SLO
  const handleConfirmDelete = useCallback(() => {
    if (!sloToDelete) return;

    const newSLOs = slos
      .filter((slo) => slo.id !== sloToDelete.id)
      .map((slo, index) => ({ ...slo, sequence: index + 1 }));

    onChange(newSLOs);
    setDeleteConfirmOpen(false);
    setSloToDelete(null);
  }, [slos, sloToDelete, onChange]);

  // Cancel delete
  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setSloToDelete(null);
  }, []);

  // Move SLO up
  const handleMoveUp = useCallback(
    (id: string) => {
      const index = slos.findIndex((slo) => slo.id === id);
      if (index <= 0) return;

      const newSLOs = [...slos];
      [newSLOs[index - 1], newSLOs[index]] = [newSLOs[index], newSLOs[index - 1]];

      // Update sequences
      onChange(newSLOs.map((slo, i) => ({ ...slo, sequence: i + 1 })));
    },
    [slos, onChange]
  );

  // Move SLO down
  const handleMoveDown = useCallback(
    (id: string) => {
      const index = slos.findIndex((slo) => slo.id === id);
      if (index >= slos.length - 1) return;

      const newSLOs = [...slos];
      [newSLOs[index], newSLOs[index + 1]] = [newSLOs[index + 1], newSLOs[index]];

      // Update sequences
      onChange(newSLOs.map((slo, i) => ({ ...slo, sequence: i + 1 })));
    },
    [slos, onChange]
  );

  // Calculate Bloom's distribution
  const bloomsDistribution = BLOOMS_LEVELS.map((level) => ({
    ...level,
    count: slos.filter((slo) =>
      slo.bloom_level?.toLowerCase() === level.name.toLowerCase()
    ).length,
  }));

  // Check if all SLOs with assigned levels are at the same level (for warning)
  const levelsWithSLOs = bloomsDistribution.filter((l) => l.count > 0);
  const slosWithLevels = slos.filter((slo) => slo.bloom_level);
  const allSameLevelWarning = levelsWithSLOs.length === 1 && slosWithLevels.length >= 2;

  const completedSLOs = slos.filter((slo) => slo.outcome_text.trim().length > 10).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Student Learning Outcomes
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Define measurable learning outcomes using Bloom&apos;s taxonomy action verbs.
          Each SLO should describe what students will be able to do upon course completion.
        </p>
      </div>

      {/* Progress Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* SLO Count */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <AcademicCapIcon className="h-5 w-5 text-luminous-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              SLOs
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {slos.length}
            </span>
            <span className="text-sm text-slate-500">/ {maxSLOs}</span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Completed
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {completedSLOs}
            </span>
            <span className="text-sm text-slate-500">/ {slos.length}</span>
          </div>
        </div>

        {/* Min Required */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Minimum Required
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {minSLOs}
            </span>
            <span className="text-sm text-slate-500">SLOs</span>
          </div>
        </div>

        {/* Bloom's Coverage */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Levels Used
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {bloomsDistribution.filter((l) => l.count > 0).length}
            </span>
            <span className="text-sm text-slate-500">/ 6</span>
          </div>
        </div>
      </div>

      {/* Bloom's Distribution */}
      <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          Bloom&apos;s Taxonomy Distribution
        </h3>
        <div className="flex gap-2">
          {bloomsDistribution.map((level) => (
            <div key={level.level} className="flex-1">
              <div
                className={`h-2 rounded-full ${
                  level.count > 0
                    ? `${level.color.bg} ${level.color.darkBg}`
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
              <div className="mt-1 text-center">
                <span
                  className={`text-xs font-medium ${
                    level.count > 0
                      ? `${level.color.text} ${level.color.darkText}`
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {level.count}
                </span>
              </div>
              <div className="text-center">
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                  L{level.level}
                </span>
              </div>
            </div>
          ))}
        </div>
        {allSameLevelWarning ? (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-400 text-center font-medium">
              All SLOs are at the same cognitive level. Consider diversifying across multiple levels for comprehensive assessment.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
            Try to include SLOs from multiple cognitive levels for comprehensive assessment
          </p>
        )}
      </div>

      {/* SLO List */}
      <div className="space-y-4">
        {slos.map((slo, index) => (
          <SLOItemEditor
            key={slo.id}
            slo={slo}
            index={index}
            total={slos.length}
            onUpdate={handleUpdateSLO}
            onRequestDelete={handleRequestDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            canDelete={slos.length > minSLOs}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Add SLO Button */}
        {slos.length < maxSLOs && (
          <button
            onClick={handleAddSLO}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-600 dark:text-slate-400 hover:border-luminous-400 hover:text-luminous-600 dark:hover:border-luminous-600 dark:hover:text-luminous-400 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Add Student Learning Outcome
          </button>
        )}

        {/* AI Suggest SLOs Button */}
        {onSuggestSLOs && (
          <button
            onClick={onSuggestSLOs}
            disabled={isLoadingSuggestions}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-luminous-50 dark:bg-luminous-900/20 border-2 border-luminous-200 dark:border-luminous-800 rounded-xl text-luminous-700 dark:text-luminous-300 hover:bg-luminous-100 dark:hover:bg-luminous-900/40 hover:border-luminous-300 dark:hover:border-luminous-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoadingSuggestions ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <SparklesIcon className="h-5 w-5" />
                Suggest SLOs with AI
              </>
            )}
          </button>
        )}
      </div>

      {/* Guidelines */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
          SLO Writing Guidelines
        </h3>
        <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
          <li>&bull; Start with measurable action verbs (avoid &quot;understand&quot;, &quot;know&quot;, &quot;learn&quot;)</li>
          <li>&bull; Be specific about what students will demonstrate</li>
          <li>&bull; Include a variety of cognitive levels when possible</li>
          <li>&bull; Each SLO should be assessable through course assignments</li>
          <li>&bull; Courses typically have {minSLOs}-{maxSLOs} SLOs</li>
        </ul>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete Student Learning Outcome"
        message={
          sloToDelete?.text
            ? `Are you sure you want to delete this SLO? "${sloToDelete.text.substring(0, 100)}${sloToDelete.text.length > 100 ? '...' : ''}"`
            : 'Are you sure you want to delete this SLO? This action cannot be undone.'
        }
        confirmText="Delete SLO"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default SLOEditor;
