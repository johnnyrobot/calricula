"use client";

import {
  Check,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  AIOutputValidationError,
  AIRequestError,
  clearAISessionMarker,
  extractAIText,
  isAISessionMarkedReady,
  runAITask,
  subscribeAISessionStatus,
  validateAITaskOutput,
  type AIOutputIssue,
  type AIResult,
  type AITask,
} from "../../lib/ai";

import { AIConsentGate } from "./AIConsentGate";
import { useOnlineStatus } from "./useOnlineStatus";

export type AISuggestionRequest = (
  task: AITask,
  input: unknown,
  signal: AbortSignal,
) => Promise<AIResult<unknown>>;

export type AISuggestionDecision<TApplied = unknown> =
  | {
      kind: "apply";
      task: AITask;
      output: unknown;
      value: TApplied;
      model: string | null;
      requestId: string | null;
    }
  | {
      kind: "reject";
      task: AITask;
      reason: "invalid-output" | "domain-mismatch" | "user-rejected";
      issues: readonly AIOutputIssue[];
      model: string | null;
      requestId: string | null;
    };

export interface AISuggestionPanelProps<TApplied = unknown> {
  title: string;
  description: string;
  task: AITask;
  input: unknown;
  onApply: (value: TApplied) => void | Promise<void>;
  onAccepted?: (
    value: TApplied,
    result: AIResult<unknown>,
  ) => void | Promise<void>;
  onDecision?: (
    decision: AISuggestionDecision<TApplied>,
  ) => void | Promise<void>;
  normalize?: (data: unknown) => TApplied | null;
  renderSuggestion?: (value: TApplied) => ReactNode;
  isApplyReady?: (value: TApplied) => boolean;
  applyInstruction?: string;
  request?: AISuggestionRequest;
  tokenProvider?: () => Promise<string>;
}

function defaultNormalize(value: unknown): unknown {
  return extractAIText(value) ?? value;
}

function DefaultPreview({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return (
      <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--ink)]">
        {value}
      </div>
    );
  }

  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap border border-[var(--hairline)] bg-[var(--paper-deep)] p-3 text-xs leading-6">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AISuggestionPanel<TApplied = unknown>({
  title,
  description,
  task,
  input,
  onApply,
  onAccepted,
  onDecision,
  normalize,
  renderSuggestion,
  isApplyReady = () => true,
  applyInstruction,
  request = (requestedTask, requestedInput, signal) =>
    runAITask(requestedTask, { input: requestedInput }, { signal }),
  tokenProvider,
}: AISuggestionPanelProps<TApplied>) {
  const sessionReady = useSyncExternalStore(
    subscribeAISessionStatus,
    isAISessionMarkedReady,
    () => false,
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AIResult<unknown> | null>(null);
  const [error, setError] = useState<AIRequestError | Error | null>(null);
  const [applied, setApplied] = useState(false);
  const [userRejected, setUserRejected] = useState(false);
  const titleId = `ai-title-${useId().replaceAll(":", "")}`;
  const online = useOnlineStatus();
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const normalized = useMemo(() => {
    if (!result) return null;
    const converter = normalize ?? (defaultNormalize as (data: unknown) => TApplied);
    return converter(result.data);
  }, [normalize, result]);
  const projectionError =
    result && normalized === null
      ? new AIOutputValidationError(
          task,
          "domain",
          [
            {
              path: [],
              code: "apply-projection",
              message:
                "The validated response could not be converted into this draft field.",
            },
          ],
          result.model,
          result.requestId,
        )
      : null;
  const displayError = projectionError ?? error;

  const generate = useCallback(async () => {
    if (!online) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setApplied(false);
    setUserRejected(false);
    setError(null);
    try {
      const candidate = await request(task, input, controller.signal);
      const data = validateAITaskOutput(task, candidate.data, {
        input,
        model: candidate.model,
        requestId: candidate.requestId,
      });
      setResult({ ...candidate, data });
    } catch (caught) {
      const requestError =
        caught instanceof Error ? caught : new Error(String(caught));
      setResult(null);
      setError(requestError);
      if (caught instanceof AIOutputValidationError) {
        await onDecision?.({
          kind: "reject",
          task,
          reason:
            caught.reason === "domain"
              ? "domain-mismatch"
              : "invalid-output",
          issues: caught.issues,
          model: caught.model,
          requestId: caught.requestId,
        });
      }
      if (
        caught instanceof AIRequestError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        clearAISessionMarker();
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
      setLoading(false);
    }
  }, [input, onDecision, online, request, task]);

  const apply = async () => {
    if (normalized === null || !result) return;
    setApplying(true);
    setError(null);
    try {
      const validatedData = validateAITaskOutput(task, result.data, {
        input,
        model: result.model,
        requestId: result.requestId,
      });
      const converter =
        normalize ?? (defaultNormalize as (data: unknown) => TApplied);
      const currentValue = converter(validatedData);
      if (currentValue === null) {
        throw new AIOutputValidationError(
          task,
          "domain",
          [
            {
              path: [],
              code: "apply-projection",
              message:
                "The suggestion no longer matches the current draft field.",
            },
          ],
          result.model,
          result.requestId,
        );
      }
      if (!isApplyReady(currentValue)) return;
      const validatedResult = { ...result, data: validatedData };
      await onApply(currentValue);
      await onAccepted?.(currentValue, validatedResult);
      await onDecision?.({
        kind: "apply",
        task,
        output: validatedData,
        value: currentValue,
        model: result.model,
        requestId: result.requestId,
      });
      setApplied(true);
    } catch (caught) {
      const applyError =
        caught instanceof Error ? caught : new Error(String(caught));
      setError(applyError);
      if (caught instanceof AIOutputValidationError) {
        await onDecision?.({
          kind: "reject",
          task,
          reason:
            caught.reason === "domain"
              ? "domain-mismatch"
              : "invalid-output",
          issues: caught.issues,
          model: caught.model,
          requestId: caught.requestId,
        });
      }
    } finally {
      setApplying(false);
    }
  };

  if (!sessionReady) {
    return (
      <AIConsentGate
        onVerified={() => undefined}
        tokenProvider={tokenProvider}
      />
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="luminous-card overflow-hidden"
    >
      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow mb-1">AI drafting desk</p>
          <h3 className="text-xl" id={titleId}>
            {title}
          </h3>
          <p className="mb-0 max-w-2xl text-sm text-[var(--ink-soft)]">
            {description}
          </p>
        </div>
        <button
          className="luminous-button-secondary shrink-0"
          disabled={loading || !online}
          onClick={() => void generate()}
          type="button"
        >
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={17}
            />
          ) : result ? (
            <RefreshCw aria-hidden="true" size={17} />
          ) : (
            <Sparkles aria-hidden="true" size={17} />
          )}
          {loading ? "Drafting…" : result ? "Generate another" : "Generate suggestion"}
        </button>
      </div>

      {!online ? (
        <p
          className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-sm text-[var(--ink-soft)]"
          role="status"
        >
          AI requires a connection. Your local curriculum records remain
          available offline.
        </p>
      ) : null}

      {displayError ? (
        <div
          aria-live="polite"
          className="mt-4 flex items-start gap-3 border border-[var(--returned)] bg-[var(--returned-bg)] p-3 text-sm"
          role="alert"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--returned)]"
            size={18}
          />
          <div>
            <p className="mb-1 font-semibold">
              {displayError instanceof AIOutputValidationError
                ? "AI response rejected before review"
                : "The suggestion was not completed."}
            </p>
            {displayError instanceof AIOutputValidationError ? (
              <>
                <p className="mb-0">
                  The returned content failed browser-side format or domain
                  checks. It was not retained and cannot be applied.
                </p>
                {displayError.issues.length ? (
                  <ul className="mb-0 mt-2 list-disc pl-5 text-xs">
                    {displayError.issues.slice(0, 3).map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="mb-0">{displayError.message}</p>
            )}
            {displayError instanceof AIRequestError &&
            displayError.retryAfterSeconds ? (
              <p className="mb-0 mt-1 text-xs text-[var(--muted)]">
                Try again in about {displayError.retryAfterSeconds} seconds.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {result && normalized !== null && !projectionError ? (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="mb-0 font-semibold">Proposed text or structure</p>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              {result.model ? (
                <span className="luminous-badge">Model: {result.model}</span>
              ) : null}
              {result.requestId ? (
                <span title="Support reference">
                  Request {result.requestId.slice(0, 12)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="record-panel p-4">
            {renderSuggestion ? (
              renderSuggestion(normalized)
            ) : (
              <DefaultPreview value={normalized} />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="luminous-button-primary"
              disabled={applying || applied || !isApplyReady(normalized)}
              onClick={() => void apply()}
              type="button"
            >
              {applying ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                />
              ) : (
                <Check aria-hidden="true" size={17} />
              )}
              {applied ? "Applied to draft" : applying ? "Applying…" : "Apply suggestion"}
            </button>
            {!isApplyReady(normalized) && applyInstruction ? (
              <p className="mb-0 text-sm font-semibold text-[var(--ink-soft)]">
                {applyInstruction}
              </p>
            ) : null}
            <button
              className="luminous-button-tertiary"
              onClick={() => void (async () => {
                await onDecision?.({
                  kind: "reject",
                  task,
                  reason: "user-rejected",
                  issues: [],
                  model: result.model,
                  requestId: result.requestId,
                });
                setResult(null);
                setApplied(false);
                setUserRejected(true);
              })()}
              type="button"
            >
              <X aria-hidden="true" size={17} />
              Reject suggestion
            </button>
            <p className="mb-0 text-xs text-[var(--muted)]">
              Review against current regulation, guidance, and local policy before
              saving the record.
            </p>
          </div>
        </div>
      ) : !displayError ? (
        <p className="mb-0 mt-4 text-sm text-[var(--muted)]">
          {userRejected
            ? "Suggestion rejected. It was not saved to the local curriculum record."
            : "No record changes occur until you review and apply a returned suggestion."}
        </p>
      ) : null}
    </section>
  );
}
