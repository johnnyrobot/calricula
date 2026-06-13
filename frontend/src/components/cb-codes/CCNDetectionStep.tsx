'use client';

// ===========================================
// CCN Detection Step Component - CUR-220
// ===========================================
// Auto-detects CCN matches at the start of the CB Codes wizard.
// Allows users to adopt a standard or provide justification for non-alignment.

import { useState, useEffect, useCallback } from 'react';
import {
  SparklesIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { CCNAdoptPrompt, CCNMatchResult, CCNStandard } from '../ccn/CCNAdoptPrompt';
import { CCNNonMatchForm, CCNNonMatchReasonCode } from '../ccn/CCNNonMatchForm';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Types
// ===========================================

export interface CCNDetectionStepProps {
  /** Course ID for API calls */
  courseId: string;
  /** Course title for matching */
  courseTitle: string;
  /** Subject code (e.g., "MATH", "ENGL") */
  subjectCode: string;
  /** Course units for validation */
  courseUnits: number;
  /** Course description for better matching */
  courseDescription?: string;
  /** Called when user adopts a CCN standard */
  onCCNAdopted: (ccnId: string, cbCodes: Record<string, string>) => void;
  /** Called when user skips or provides justification for non-match */
  onCCNSkipped: (justification?: { reasonCode: string; text: string }) => void;
  /** Called when step is complete and ready to proceed */
  onNext: () => void;
  /** Optional className */
  className?: string;
}

type DetectionState = 'loading' | 'match_found' | 'no_match' | 'justification_form' | 'error';

// Discipline to TOP code mapping for CB03 auto-population
const DISCIPLINE_TOP_CODES: Record<string, string> = {
  'MATH': '1701.00',
  'STAT': '1701.00',
  'ENGL': '1501.00',
  'PSYCH': '2001.00',
  'PSYC': '2001.00',
  'BIOL': '0401.00',
  'BIO': '0401.00',
  'CHEM': '1905.00',
  'HIST': '2205.00',
  'ANTH': '2202.00',
  'SOC': '2208.00',
  'SOCI': '2208.00',
  'ECON': '2204.00',
  'COMM': '0604.00',
  'GEOL': '1914.00',
  'ASTR': '1911.00',
  'ARTH': '1002.00',
  'PHYS': '1902.00',
  'PHIL': '1509.00',
  'POLI': '2207.00',
  'SPAN': '1105.00',
  'FREN': '1102.00',
  'GERM': '1103.00',
  'CHIN': '1106.00',
  'JAPN': '1107.00',
};

// ===========================================
// Helper Components
// ===========================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4" role="status" aria-live="polite">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-luminous-200 dark:border-luminous-800" />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-luminous-500 animate-spin" />
        <MagnifyingGlassIcon className="absolute inset-0 m-auto h-6 w-6 text-luminous-500" aria-hidden="true" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Checking CCN Standards
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Searching for Common Course Numbering matches...
        </p>
      </div>
    </div>
  );
}

interface NoMatchStateProps {
  subjectCode: string;
  onProvideJustification: () => void;
  onSkip: () => void;
}

function NoMatchState({ subjectCode, onProvideJustification, onSkip }: NoMatchStateProps) {
  return (
    <div className="space-y-6">
      {/* No Match Card */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            <XCircleIcon className="h-6 w-6 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              No CCN Standard Found
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              No matching C-ID standard was found for this {subjectCode} course.
              This is common for specialized, vocational, or locally-developed courses.
            </p>
          </div>
        </div>
      </div>

      {/* AB 1111 Info */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            AB 1111 Compliance Note
          </h4>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Per Assembly Bill 1111 (Common Course Numbering), courses that do not align
            with a C-ID standard should provide a documented justification.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onProvideJustification}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-luminous-600 hover:bg-luminous-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
        >
          <InformationCircleIcon className="h-5 w-5" aria-hidden="true" />
          Provide Justification
        </button>
        <button
          onClick={onSkip}
          className="flex items-center justify-center gap-2 px-4 py-3 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        >
          Skip for Now
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onSkip: () => void;
}

function ErrorState({ message, onRetry, onSkip }: ErrorStateProps) {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Unable to Check CCN Standards
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {message}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white font-medium rounded-lg transition-colors"
        >
          Retry
        </button>
        <button
          onClick={onSkip}
          className="flex items-center gap-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium rounded-lg transition-colors"
        >
          Skip CCN Check
        </button>
      </div>
    </div>
  );
}

// ===========================================
// Benefits Panel Component
// ===========================================

function CCNBenefitsPanel() {
  return (
    <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
      <div className="flex items-start gap-3">
        <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">
            Benefits of CCN Alignment
          </h4>
          <ul className="text-sm text-green-700 dark:text-green-300 mt-2 space-y-1">
            <li>- CB05 auto-set to &quot;A&quot; (UC+CSU Transferable)</li>
            <li>- CB03 auto-populated with discipline TOP code</li>
            <li>- Streamlined C-ID articulation process</li>
            <li>- Enhanced student transferability</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function CCNDetectionStep({
  courseId,
  courseTitle,
  subjectCode,
  courseUnits,
  courseDescription,
  onCCNAdopted,
  onCCNSkipped,
  onNext,
  className = '',
}: CCNDetectionStepProps) {
  const { getToken } = useAuth();
  const [state, setState] = useState<DetectionState>('loading');
  const [match, setMatch] = useState<CCNMatchResult | null>(null);
  const [error, setError] = useState<string>('');
  const [isAdopting, setIsAdopting] = useState(false);
  const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);

  // Fetch CCN matches on mount
  const fetchCCNMatches = useCallback(async () => {
    setState('loading');
    setError('');

    try {
      // Get auth token for API call
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const response = await fetch('/api/compliance/ccn-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: courseTitle,
          description: courseDescription,
          subject_code: subjectCode,
          units: courseUnits,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(`Failed to fetch CCN matches: ${response.status}`);
      }

      const data = await response.json();

      // Check if we have a match with confidence >= 0.5
      if (data.best_match && data.best_match.confidence_score >= 0.5) {
        setMatch(data.best_match);
        setState('match_found');
      } else {
        setState('no_match');
      }
    } catch (err) {
      console.error('Error fetching CCN matches:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setState('error');
    }
  }, [courseTitle, courseDescription, subjectCode, courseUnits, getToken]);

  useEffect(() => {
    fetchCCNMatches();
  }, [fetchCCNMatches]);

  // Handle CCN adoption
  const handleAdopt = useCallback(async (standard: CCNStandard) => {
    setIsAdopting(true);

    try {
      // Get TOP code for the discipline
      const topCode = DISCIPLINE_TOP_CODES[subjectCode.toUpperCase()] ||
                      DISCIPLINE_TOP_CODES[standard.discipline] ||
                      '';

      // Build CB codes that will be auto-populated
      const cbCodes: Record<string, string> = {
        cb05: 'A', // UC+CSU Transferable
      };

      if (topCode) {
        cbCodes.cb03 = topCode;
      }

      // Call the parent callback with adopted CCN and CB codes
      onCCNAdopted(standard.c_id, cbCodes);
      onNext();
    } catch (err) {
      console.error('Error adopting CCN standard:', err);
      setError(err instanceof Error ? err.message : 'Failed to adopt CCN standard');
    } finally {
      setIsAdopting(false);
    }
  }, [subjectCode, onCCNAdopted, onNext]);

  // Handle dismiss/skip from match prompt
  const handleDismiss = useCallback(() => {
    setState('justification_form');
  }, []);

  // Handle "Skip for Now" (no justification)
  const handleSkip = useCallback(() => {
    onCCNSkipped();
    onNext();
  }, [onCCNSkipped, onNext]);

  // Handle justification form submission
  const handleJustificationSubmit = useCallback(
    async (reasonCode: CCNNonMatchReasonCode, justificationText: string) => {
      setIsSubmittingJustification(true);

      try {
        // Get auth token for API call
        const token = await getToken();
        if (!token) {
          throw new Error('Authentication required. Please log in.');
        }

        // Submit justification to backend
        const response = await fetch('/api/compliance/ccn-non-match-justification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            course_id: courseId,
            reason_code: reasonCode,
            justification_text: justificationText,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Session expired. Please log in again.');
          }
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Failed to submit justification: ${response.status}`);
        }

        // Call parent callback and proceed
        onCCNSkipped({ reasonCode, text: justificationText });
        onNext();
      } catch (err) {
        console.error('Error submitting justification:', err);
        setError(err instanceof Error ? err.message : 'Failed to submit justification');
      } finally {
        setIsSubmittingJustification(false);
      }
    },
    [courseId, onCCNSkipped, onNext, getToken]
  );

  // Handle back from justification form
  const handleBackFromJustification = useCallback(() => {
    if (match) {
      setState('match_found');
    } else {
      setState('no_match');
    }
  }, [match]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-luminous-100 dark:bg-luminous-900/30 flex items-center justify-center">
          <SparklesIcon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Common Course Numbering (CCN)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Per AB 1111, we&apos;ll check if this course aligns with a C-ID standard.
            Aligned courses get automatic CB code population for transferability.
          </p>
        </div>
      </div>

      {/* Content based on state */}
      {state === 'loading' && <LoadingState />}

      {state === 'error' && (
        <ErrorState
          message={error}
          onRetry={fetchCCNMatches}
          onSkip={handleSkip}
        />
      )}

      {state === 'no_match' && (
        <NoMatchState
          subjectCode={subjectCode}
          onProvideJustification={() => setState('justification_form')}
          onSkip={handleSkip}
        />
      )}

      {state === 'match_found' && match && (
        <>
          <CCNAdoptPrompt
            match={match}
            courseTitle={courseTitle}
            courseUnits={courseUnits}
            onAdopt={handleAdopt}
            onDismiss={handleDismiss}
            isAdopting={isAdopting}
          />
          <CCNBenefitsPanel />
        </>
      )}

      {state === 'justification_form' && (
        <CCNNonMatchForm
          onSubmit={handleJustificationSubmit}
          onBack={handleBackFromJustification}
          isSubmitting={isSubmittingJustification}
        />
      )}
    </div>
  );
}

export default CCNDetectionStep;
