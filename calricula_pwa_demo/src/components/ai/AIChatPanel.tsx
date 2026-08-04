"use client";

import { LoaderCircle, Send, Sparkles } from "lucide-react";
import {
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ReactMarkdown from "react-markdown";

import {
  AI_HISTORY_CONTEXT_LIMIT,
  AIOutputValidationError,
  indexedDBAIChatPersistence,
  runAITask,
  type AIChatPersistence,
  type AIChatScope,
  type AIHistoryMessage,
} from "../../lib/ai";
import {
  readSessionReadiness,
  resyncSessionReadiness,
  subscribeSessionReadiness,
} from "../../lib/ai/session-readiness";
import type { EntityType } from "../../lib/domain";

import { AIConsentGate } from "./AIConsentGate";
import { ErrorDiagnostics } from "./ErrorDiagnostics";
import { useOnlineStatus } from "./useOnlineStatus";

export interface AIChatPanelProps {
  actorId?: string | null;
  context?: unknown;
  contextLabel?: string;
  conversationTitle?: string;
  entityId?: string | null;
  entityType?: EntityType | null;
  initialHistory?: readonly AIHistoryMessage[];
  onHistoryChange?: (history: readonly AIHistoryMessage[]) => void;
  persistence?: AIChatPersistence;
  tokenProvider?: () => Promise<string>;
}

const EMPTY_HISTORY: readonly AIHistoryMessage[] = [];

export function AIChatPanel({
  actorId = null,
  context,
  contextLabel,
  conversationTitle = "Curriculum assistant",
  entityId = null,
  entityType = null,
  initialHistory = EMPTY_HISTORY,
  onHistoryChange,
  persistence = indexedDBAIChatPersistence,
  tokenProvider,
}: AIChatPanelProps) {
  const titleId = `assistant-title-${useId().replaceAll(":", "")}`;
  const sessionReady =
    useSyncExternalStore(
      subscribeSessionReadiness,
      readSessionReadiness,
      () => "needs-disclosure" as const,
    ) === "ready";
  const [history, setHistory] = useState<AIHistoryMessage[]>([
    ...initialHistory.slice(-AI_HISTORY_CONTEXT_LIMIT),
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(Boolean(actorId));
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const online = useOnlineStatus();
  const requestController = useRef<AbortController | null>(null);
  const scope = useMemo<AIChatScope | null>(
    () =>
      actorId
        ? {
            actorId,
            entityType,
            entityId,
            title: conversationTitle,
          }
        : null,
    [actorId, conversationTitle, entityId, entityType],
  );

  const updateHistory = (next: AIHistoryMessage[]) => {
    const capped = next.slice(-AI_HISTORY_CONTEXT_LIMIT);
    setHistory(capped);
    onHistoryChange?.(capped);
  };

  useEffect(() => {
    requestController.current?.abort();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setError(null);
      setConversationId(null);
      if (!scope) {
        updateHistory([...initialHistory]);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        const stored = await persistence.load(scope);
        if (!active) return;
        setConversationId(stored.conversationId);
        updateHistory(stored.history);
        setHistoryLoading(false);
      } catch (caught) {
        if (!active) return;
        updateHistory([]);
        setHistoryLoading(false);
        setError(
          caught instanceof Error
            ? caught
            : new Error("Local chat history could not be opened."),
        );
      }
    });
    return () => {
      active = false;
    };
    // The scope deliberately defines when a different local conversation loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence, scope]);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const appendMessage = async (
    nextMessage: AIHistoryMessage,
    currentConversationId = conversationId,
    currentHistory = history,
  ) => {
    if (!scope) {
      const next = [...currentHistory, nextMessage].slice(
        -AI_HISTORY_CONTEXT_LIMIT,
      );
      updateHistory(next);
      return { conversationId: null, history: next };
    }
    const stored = await persistence.append(
      scope,
      currentConversationId,
      nextMessage,
    );
    setConversationId(stored.conversationId);
    updateHistory(stored.history);
    return stored;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || working || historyLoading || !online) return;

    const priorHistory = history.slice(-AI_HISTORY_CONTEXT_LIMIT);
    const userMessage: AIHistoryMessage = {
      role: "user",
      content: trimmed,
    };
    setMessage("");
    setWorking(true);
    setError(null);
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    let userPersisted = false;

    try {
      const afterUser = await appendMessage(userMessage);
      userPersisted = true;
      const result = await runAITask(
        "chat",
        {
          input: {
            message: trimmed,
            ...(context === undefined ? {} : { context }),
          },
          history: priorHistory,
        },
        { signal: controller.signal },
      );
      await appendMessage(
        { role: "assistant", content: result.data.message },
        afterUser.conversationId,
        afterUser.history,
      );
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      resyncSessionReadiness(caught);
      setError(
        caught instanceof Error
          ? caught
          : new Error("The assistant could not respond."),
      );
      if (!userPersisted) {
        setMessage(trimmed);
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
      setWorking(false);
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
    <section aria-labelledby={titleId} className="luminous-card">
      <div className="flex items-start gap-3 border-b border-[var(--hairline)] pb-4">
        <Sparkles
          aria-hidden="true"
          className="mt-1 text-[var(--gold-ink)]"
          size={20}
        />
        <div>
          <p className="eyebrow mb-1">Optional AI</p>
          <h2 className="text-xl" id={titleId}>
            Curriculum assistant
          </h2>
          <p className="mb-0 text-sm text-[var(--ink-soft)]">
            Ask about the record in view. Verify every answer against current
            primary sources and local practice.
          </p>
          <p className="mb-0 mt-2 text-xs text-[var(--muted)]">
            {contextLabel ? `Context: ${contextLabel}. ` : ""}
            The latest {AI_HISTORY_CONTEXT_LIMIT} messages are saved only in
            this browser.
          </p>
        </div>
      </div>

      <div
        aria-live="polite"
        className="my-4 grid max-h-[28rem] gap-3 overflow-y-auto"
      >
        {historyLoading ? (
          <p className="text-sm text-[var(--muted)]" role="status">
            Restoring local conversation…
          </p>
        ) : history.length ? (
          history.map((item, index) => (
            <article
              className={
                item.role === "user"
                  ? "ml-auto max-w-[88%] border border-[var(--navy)] bg-[var(--navy)] p-3 text-[var(--on-navy)]"
                  : "mr-auto max-w-[92%] border border-[var(--hairline)] bg-[var(--paper-deep)] p-3"
              }
              key={`${item.role}-${index}`}
            >
              <p className="mb-1 text-xs font-bold uppercase tracking-wider opacity-75">
                {item.role === "user" ? "You" : "Assistant"}
              </p>
              {item.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="mb-0 whitespace-pre-wrap">{item.content}</p>
              )}
            </article>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Start with a focused drafting or policy question. Student data and
            confidential records do not belong in this demo.
          </p>
        )}
      </div>

      {error ? (
        <div
          className="border-l-2 border-[var(--returned)] pl-3 text-sm text-[var(--returned)]"
          role="alert"
        >
          {error instanceof AIOutputValidationError ? (
            <>
              <p className="mb-1 font-semibold">
                Assistant response rejected
              </p>
              <p className="mb-0">
                The returned message failed browser-side checks and was not
                added to local history.
              </p>
            </>
          ) : (
            <p className="mb-0">{error.message}</p>
          )}
          <ErrorDiagnostics error={error} />
        </div>
      ) : null}

      {!online ? (
        <p
          className="border-l-2 border-[var(--gold)] pl-3 text-sm text-[var(--ink-soft)]"
          role="status"
        >
          AI requires a connection. Local records remain available offline.
        </p>
      ) : null}

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-message">
          Message the curriculum assistant
        </label>
        <textarea
          className="luminous-textarea min-h-24 flex-1"
          id="assistant-message"
          maxLength={4000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask a focused question about this curriculum record…"
          rows={3}
          value={message}
          disabled={historyLoading}
        />
        <button
          className="luminous-button-primary self-end"
          disabled={
            working || historyLoading || !message.trim() || !online
          }
          type="submit"
        >
          {working ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={17}
            />
          ) : (
            <Send aria-hidden="true" size={17} />
          )}
          {working ? "Waiting…" : "Send"}
        </button>
      </form>
    </section>
  );
}
