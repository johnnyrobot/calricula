'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  SparklesIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '@/components/toast';
import { Spinner } from '@/components/loading';

type NarrativeTone = 'formal' | 'concise' | 'detailed';

interface LMINarrativeEditorProps {
  narrative: string;
  courseTitle: string;
  socCode: string;
  occupationTitle: string;
  area?: string;
  wageData?: Record<string, unknown>;
  projectionData?: Record<string, unknown>;
  onSave: (narrative: string) => void;
  disabled?: boolean;
}

const TONE_OPTIONS: { value: NarrativeTone; label: string; description: string }[] = [
  { value: 'formal', label: 'Formal', description: '150-175 words, professional tone for regulatory documents' },
  { value: 'concise', label: 'Concise', description: '75-100 words, brief summary of key facts' },
  { value: 'detailed', label: 'Detailed', description: '250-300 words, comprehensive analysis' },
];


export function LMINarrativeEditor({
  narrative,
  courseTitle,
  socCode,
  occupationTitle,
  area,
  wageData,
  projectionData,
  onSave,
  disabled = false,
}: LMINarrativeEditorProps) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localNarrative, setLocalNarrative] = useState(narrative || '');
  const [selectedTone, setSelectedTone] = useState<NarrativeTone>('formal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Auto-resize textarea based on content
  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight (with a minimum height)
      const minHeight = 120; // ~4 lines minimum
      const newHeight = Math.max(textarea.scrollHeight, minHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Resize on content change and initial mount
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      autoResize();
    });
  }, [localNarrative, autoResize]);

  const handleNarrativeChange = useCallback((value: string) => {
    setLocalNarrative(value);
    setHasChanges(value !== narrative);
  }, [narrative]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-lmi-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_title: courseTitle,
          soc_code: socCode,
          occupation_title: occupationTitle,
          area: area || 'California',
          wage_data: wageData,
          projection_data: projectionData,
          tone: selectedTone,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate narrative');
      }

      const result = await res.json();
      if (result.success && result.narrative) {
        setLocalNarrative(result.narrative);
        setHasChanges(true);
        toast.success('Success', `Generated ${result.word_count} word narrative`);
      } else {
        throw new Error(result.error || 'No narrative returned');
      }
    } catch (err) {
      console.error('Generate narrative error:', err);
      toast.error('Error', err instanceof Error ? err.message : 'Failed to generate narrative');
    } finally {
      setIsGenerating(false);
    }
  }, [courseTitle, socCode, occupationTitle, area, wageData, projectionData, selectedTone, toast]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      onSave(localNarrative);
      setHasChanges(false);
      toast.success('Saved', 'Narrative saved successfully');
    } catch (err) {
      console.error('Save narrative error:', err);
      toast.error('Error', 'Failed to save narrative');
    } finally {
      setIsSaving(false);
    }
  }, [localNarrative, onSave, toast]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(localNarrative);
      setCopied(true);
      toast.success('Copied', 'Narrative copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy error:', err);
      toast.error('Error', 'Failed to copy to clipboard');
    }
  }, [localNarrative, toast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-slate-900 dark:text-slate-100">
          LMI Narrative
        </h4>
        {hasChanges && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Narrative Textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={localNarrative}
          onChange={(e) => handleNarrativeChange(e.target.value)}
          placeholder="Enter or generate a narrative describing the labor market for this occupation..."
          disabled={disabled || isGenerating}
          className="w-full px-4 py-3 text-sm leading-relaxed rounded-lg border border-slate-300 dark:border-slate-600
                     bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                     placeholder:text-slate-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-luminous-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed
                     resize-none"
          style={{ minHeight: '120px', height: 'auto' }}
        />
      </div>

      {/* Tone Selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Generation Tone
        </label>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedTone(option.value)}
              disabled={disabled || isGenerating}
              title={option.description}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         ${selectedTone === option.value
                           ? 'bg-luminous-600 text-white'
                           : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                         }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {TONE_OPTIONS.find(o => o.value === selectedTone)?.description}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={disabled || isGenerating || !socCode}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                     bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300
                     hover:bg-luminous-200 dark:hover:bg-luminous-900/50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Spinner className="h-4 w-4" />
              Generating...
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              {localNarrative ? 'Regenerate' : 'Generate with AI'}
            </>
          )}
        </button>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          disabled={disabled || !localNarrative}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                     bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300
                     hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {copied ? (
            <>
              <CheckIcon className="h-4 w-4 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy
            </>
          )}
        </button>

        {/* Save Button */}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={disabled || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                       bg-green-600 text-white hover:bg-green-700 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : (
              'Save Narrative'
            )}
          </button>
        )}
      </div>

      {/* Help Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The narrative will be included in course catalogs and program proposals.
        It should describe career outcomes, labor demand, and wage information.
      </p>
    </div>
  );
}
