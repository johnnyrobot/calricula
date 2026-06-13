'use client';

// ===========================================
// Content Outline Editor Component
// ===========================================
// Editor for course content topics with hierarchical subtopics,
// hours allocation, and SLO linking capabilities.
// Implements CUR-71 requirements.

import { useState, useCallback, useMemo } from 'react';
import {
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClockIcon,
  LinkIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

// ===========================================
// Types - Match API's ContentItem format
// ===========================================

export interface ContentItem {
  id: string;
  sequence: number;
  topic: string;
  subtopics: string[];
  hours_allocated: number;
  linked_slos: string[];
}

export interface SLOOption {
  id: string;
  sequence: number;
  outcome_text: string;
  bloom_level: string;
}

export interface ContentOutlineEditorProps {
  contentItems: ContentItem[];
  onChange: (items: ContentItem[]) => void;
  slos: SLOOption[];
  totalCourseHours?: number;
}

// ===========================================
// Delete Confirmation Dialog
// ===========================================

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  topicName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ isOpen, topicName, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center" aria-hidden="true">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Delete Topic?
            </h3>
            <p id="delete-dialog-description" className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to delete &quot;{topicName || 'this topic'}&quot;?
              This will also remove all subtopics. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-600"
          >
            Delete Topic
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// SLO Multi-Select Component
// ===========================================

interface SLOMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  slos: SLOOption[];
}

function SLOMultiSelect({ selectedIds, onChange, slos }: SLOMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSLO = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedSLOs = slos.filter((slo) => selectedIds.includes(slo.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Link to SLOs. ${selectedIds.length} SLO${selectedIds.length !== 1 ? 's' : ''} currently linked`}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg hover:border-slate-300 dark:hover:border-slate-500 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
      >
        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <LinkIcon className="h-4 w-4" aria-hidden="true" />
          {selectedIds.length === 0 ? (
            'Link to SLOs...'
          ) : (
            <span className="text-slate-900 dark:text-white">
              {selectedIds.length} SLO{selectedIds.length !== 1 ? 's' : ''} linked
            </span>
          )}
        </span>
        <ChevronRightIcon
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Select Student Learning Outcomes to link"
        >
          {slos.length === 0 ? (
            <div className="p-3 text-sm text-slate-500 dark:text-slate-400 text-center">
              No SLOs defined yet
            </div>
          ) : (
            <div className="p-1">
              {slos.map((slo) => {
                const isSelected = selectedIds.includes(slo.id);
                return (
                  <button
                    key={slo.id}
                    type="button"
                    onClick={() => toggleSLO(slo.id)}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`SLO ${slo.sequence}: ${slo.outcome_text || 'No description'}${slo.bloom_level ? `. Bloom's level: ${slo.bloom_level}` : ''}${isSelected ? '. Currently selected' : ''}`}
                    className={`w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-inset ${
                      isSelected
                        ? 'bg-luminous-50 dark:bg-luminous-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                        isSelected
                          ? 'bg-luminous-500 border-luminous-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected && <CheckCircleSolidIcon className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-luminous-600 dark:text-luminous-400">
                          SLO {slo.sequence}
                        </span>
                        {slo.bloom_level && (
                          <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-400">
                            {slo.bloom_level}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 mt-0.5">
                        {slo.outcome_text || 'No description'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected SLO chips */}
      {selectedSLOs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2" role="list" aria-label="Linked SLOs">
          {selectedSLOs.map((slo) => (
            <span
              key={slo.id}
              role="listitem"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 rounded-full"
            >
              SLO {slo.sequence}
              <button
                type="button"
                onClick={() => toggleSLO(slo.id)}
                aria-label={`Remove SLO ${slo.sequence}`}
                className="hover:text-luminous-900 dark:hover:text-luminous-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 rounded-full"
              >
                <XMarkIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Subtopic Editor Component
// ===========================================

interface SubtopicEditorProps {
  subtopics: string[];
  onChange: (subtopics: string[]) => void;
}

function SubtopicEditor({ subtopics, onChange }: SubtopicEditorProps) {
  const [newSubtopic, setNewSubtopic] = useState('');

  const addSubtopic = () => {
    if (newSubtopic.trim()) {
      onChange([...subtopics, newSubtopic.trim()]);
      setNewSubtopic('');
    }
  };

  const removeSubtopic = (index: number) => {
    onChange(subtopics.filter((_, i) => i !== index));
  };

  const updateSubtopic = (index: number, value: string) => {
    const updated = [...subtopics];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="ml-6 mt-2 space-y-2">
      {subtopics.map((subtopic, index) => (
        <div key={index} className="flex items-center gap-2 group">
          <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
          <input
            type="text"
            value={subtopic}
            onChange={(e) => updateSubtopic(index, e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-luminous-500 dark:focus:border-luminous-400 focus:outline-none"
            placeholder="Subtopic..."
          />
          <button
            type="button"
            onClick={() => removeSubtopic(index)}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
          >
            <TrashIcon className="h-3.5 w-3.5 text-red-500" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
        <input
          type="text"
          value={newSubtopic}
          onChange={(e) => setNewSubtopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSubtopic();
            }
          }}
          className="flex-1 px-2 py-1 text-sm bg-transparent border-b border-dashed border-slate-200 dark:border-slate-700 focus:border-luminous-500 dark:focus:border-luminous-400 focus:outline-none"
          placeholder="Add subtopic (press Enter)..."
        />
        <button
          type="button"
          onClick={addSubtopic}
          disabled={!newSubtopic.trim()}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-30"
        >
          <PlusIcon className="h-3.5 w-3.5 text-slate-500" />
        </button>
      </div>
    </div>
  );
}

// ===========================================
// Content Item Editor Component
// ===========================================

interface ContentItemEditorProps {
  item: ContentItem;
  index: number;
  total: number;
  onUpdate: (id: string, updates: Partial<ContentItem>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  slos: SLOOption[];
  canDelete: boolean;
}

function ContentItemEditor({
  item,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  slos,
  canDelete,
}: ContentItemEditorProps) {
  const [showSubtopics, setShowSubtopics] = useState(item.subtopics.length > 0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const linkedSLOCount = item.linked_slos.length;
  const hasContent = item.topic.trim().length > 0;

  return (
    <>
      <div
        className={`group p-4 bg-white dark:bg-slate-800 rounded-xl border-2 transition-all ${
          hasContent
            ? 'border-slate-200 dark:border-slate-700'
            : 'border-amber-200 dark:border-amber-800'
        }`}
      >
        {/* Header Row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Topic Number */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
              hasContent
                ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-600 dark:text-luminous-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            }`}
          >
            {index + 1}
          </div>

          {/* Topic Input */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={item.topic}
              onChange={(e) => onUpdate(item.id, { topic: e.target.value })}
              placeholder="Enter topic title..."
              className="w-full text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" role="group" aria-label="Topic actions">
            <button
              type="button"
              onClick={() => onMoveUp(item.id)}
              disabled={index === 0}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
              aria-label={`Move topic ${index + 1} up`}
            >
              <ChevronUpIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMoveDown(item.id)}
              disabled={index === total - 1}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
              aria-label={`Move topic ${index + 1} down`}
            >
              <ChevronDownIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!canDelete}
              className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              aria-label={`Delete topic ${index + 1}${item.topic ? `: ${item.topic}` : ''}`}
            >
              <TrashIcon className="h-4 w-4 text-red-500" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Hours and SLO Link Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          {/* Hours Allocated */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
              Hours Allocated
            </label>
            <div className="relative">
              <ClockIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="0"
                step="0.5"
                value={item.hours_allocated || ''}
                onChange={(e) =>
                  onUpdate(item.id, { hours_allocated: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-luminous-500/20 focus:border-luminous-500"
              />
            </div>
          </div>

          {/* SLO Links */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
              Linked SLOs
            </label>
            <SLOMultiSelect
              selectedIds={item.linked_slos}
              onChange={(ids) => onUpdate(item.id, { linked_slos: ids })}
              slos={slos}
            />
          </div>
        </div>

        {/* Subtopics Toggle */}
        <button
          type="button"
          onClick={() => setShowSubtopics(!showSubtopics)}
          className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-luminous-600 dark:hover:text-luminous-400 transition-colors"
        >
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform ${showSubtopics ? 'rotate-90' : ''}`}
          />
          <span>
            {item.subtopics.length > 0
              ? `${item.subtopics.length} subtopic${item.subtopics.length !== 1 ? 's' : ''}`
              : 'Add subtopics'}
          </span>
        </button>

        {/* Subtopics Editor */}
        {showSubtopics && (
          <SubtopicEditor
            subtopics={item.subtopics}
            onChange={(subtopics) => onUpdate(item.id, { subtopics })}
          />
        )}

        {/* Status Indicators */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          {linkedSLOCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              {linkedSLOCount} SLO{linkedSLOCount !== 1 ? 's' : ''} linked
            </span>
          )}
          {item.hours_allocated > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <ClockIcon className="h-3.5 w-3.5" />
              {item.hours_allocated} hr{item.hours_allocated !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        topicName={item.topic}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete(item.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

// ===========================================
// Main Component
// ===========================================

export function ContentOutlineEditor({
  contentItems,
  onChange,
  slos,
  totalCourseHours = 54,
}: ContentOutlineEditorProps) {
  // Generate unique ID
  const generateId = () => `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate totals (ensure hours_allocated is parsed as number since API may return strings from Decimal)
  const totalAllocatedHours = useMemo(
    () => contentItems.reduce((sum, item) => sum + (parseFloat(String(item.hours_allocated)) || 0), 0),
    [contentItems]
  );

  const hoursRemaining = totalCourseHours - totalAllocatedHours;
  const hoursPercentage = Math.min((totalAllocatedHours / totalCourseHours) * 100, 100);

  // Count SLO coverage
  const linkedSLOIds = useMemo(() => {
    const ids = new Set<string>();
    contentItems.forEach((item) => {
      item.linked_slos.forEach((id) => ids.add(id));
    });
    return ids;
  }, [contentItems]);

  const slosCovered = linkedSLOIds.size;
  const totalSLOs = slos.length;

  // Add new topic
  const handleAddTopic = useCallback(() => {
    const newItem: ContentItem = {
      id: generateId(),
      sequence: contentItems.length + 1,
      topic: '',
      subtopics: [],
      hours_allocated: 0,
      linked_slos: [],
    };

    onChange([...contentItems, newItem]);
  }, [contentItems, onChange]);

  // Update topic
  const handleUpdateTopic = useCallback(
    (id: string, updates: Partial<ContentItem>) => {
      onChange(
        contentItems.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    [contentItems, onChange]
  );

  // Delete topic
  const handleDeleteTopic = useCallback(
    (id: string) => {
      const newItems = contentItems
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, sequence: index + 1 }));

      onChange(newItems);
    },
    [contentItems, onChange]
  );

  // Move topic up
  const handleMoveUp = useCallback(
    (id: string) => {
      const index = contentItems.findIndex((item) => item.id === id);
      if (index <= 0) return;

      const newItems = [...contentItems];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];

      // Update sequences
      onChange(newItems.map((item, i) => ({ ...item, sequence: i + 1 })));
    },
    [contentItems, onChange]
  );

  // Move topic down
  const handleMoveDown = useCallback(
    (id: string) => {
      const index = contentItems.findIndex((item) => item.id === id);
      if (index >= contentItems.length - 1) return;

      const newItems = [...contentItems];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];

      // Update sequences
      onChange(newItems.map((item, i) => ({ ...item, sequence: i + 1 })));
    },
    [contentItems, onChange]
  );

  const completedTopics = contentItems.filter(
    (item) => item.topic.trim().length > 0 && parseFloat(String(item.hours_allocated)) > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Course Content Outline
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Structure your course content with topics, subtopics, and time allocation.
          Link each topic to relevant Student Learning Outcomes.
        </p>
      </div>

      {/* Progress Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Topics Count */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <DocumentTextIcon className="h-5 w-5 text-luminous-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Topics
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {contentItems.length}
            </span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleSolidIcon className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Complete
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {completedTopics}
            </span>
            <span className="text-sm text-slate-500">/ {contentItems.length}</span>
          </div>
        </div>

        {/* Total Hours */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <ClockIcon className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Hours
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalAllocatedHours}
            </span>
            <span className="text-sm text-slate-500">/ {totalCourseHours}</span>
          </div>
        </div>

        {/* SLO Coverage */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <LinkIcon className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              SLOs Linked
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {slosCovered}
            </span>
            <span className="text-sm text-slate-500">/ {totalSLOs}</span>
          </div>
        </div>
      </div>

      {/* Hours Progress Bar */}
      <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Hours Allocation
          </h3>
          <span
            className={`text-sm font-medium ${
              hoursRemaining < 0
                ? 'text-red-600 dark:text-red-400'
                : hoursRemaining === 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {hoursRemaining >= 0 ? `${hoursRemaining} hours remaining` : `${Math.abs(hoursRemaining)} hours over`}
          </span>
        </div>
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              hoursRemaining < 0
                ? 'bg-red-500'
                : hoursRemaining === 0
                ? 'bg-green-500'
                : 'bg-luminous-500'
            }`}
            style={{ width: `${hoursPercentage}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Allocate {totalCourseHours} hours across your course topics to meet the Title 5 requirement
        </p>
      </div>

      {/* Content Items List */}
      <div className="space-y-4">
        {contentItems.map((item, index) => (
          <ContentItemEditor
            key={item.id}
            item={item}
            index={index}
            total={contentItems.length}
            onUpdate={handleUpdateTopic}
            onDelete={handleDeleteTopic}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            slos={slos}
            canDelete={contentItems.length > 1}
          />
        ))}
      </div>

      {/* Add Topic Button */}
      <button
        type="button"
        onClick={handleAddTopic}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-600 dark:text-slate-400 hover:border-luminous-400 hover:text-luminous-600 dark:hover:border-luminous-600 dark:hover:text-luminous-400 transition-colors"
      >
        <PlusIcon className="h-5 w-5" />
        Add Topic
      </button>

      {/* Guidelines */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
          Content Outline Guidelines
        </h3>
        <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
          <li>&bull; Cover all major topics that will be taught in the course</li>
          <li>&bull; Allocate hours based on topic complexity and importance</li>
          <li>&bull; Link topics to relevant SLOs to show curriculum alignment</li>
          <li>&bull; Use subtopics to break down complex topics into manageable units</li>
          <li>&bull; Total hours should match the course&apos;s total contact hours</li>
        </ul>
      </div>
    </div>
  );
}

export default ContentOutlineEditor;
