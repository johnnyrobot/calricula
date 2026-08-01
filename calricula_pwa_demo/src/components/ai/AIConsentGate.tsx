"use client";

import { ExternalLink, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import {
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
} from "react";

import {
  acknowledgeAIDisclosure,
  AIRequestError,
  establishAISession,
} from "../../lib/ai";
import {
  readSessionReadiness,
  subscribeSessionReadiness,
} from "../../lib/ai/session-readiness";

import { TurnstileWidget } from "./TurnstileWidget";
import { useOnlineStatus } from "./useOnlineStatus";

export interface AIConsentGateProps {
  onVerified: () => void;
  tokenProvider?: () => Promise<string>;
}

export function AIConsentGate({
  onVerified,
  tokenProvider,
}: AIConsentGateProps) {
  const titleId = `ai-boundary-title-${useId().replaceAll(":", "")}`;
  const readiness = useSyncExternalStore(
    subscribeSessionReadiness,
    readSessionReadiness,
    () => "needs-disclosure" as const,
  );
  const stage =
    readiness === "needs-disclosure" ? "disclosure" : "verification";
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();

  const verifyToken = useCallback(
    async (token: string) => {
      setWorking(true);
      setError(null);
      try {
        await establishAISession(token);
        onVerified();
      } catch (caught) {
        setError(
          caught instanceof AIRequestError
            ? caught.message
            : "AI verification could not be completed.",
        );
      } finally {
        setWorking(false);
      }
    },
    [onVerified],
  );
  const acceptTurnstileToken = useCallback(
    (token: string) => {
      void verifyToken(token);
    },
    [verifyToken],
  );

  const continueToVerification = async () => {
    if (!online) return;
    acknowledgeAIDisclosure();
    setError(null);

    if (!tokenProvider) return;

    setWorking(true);
    try {
      const token = await tokenProvider();
      await verifyToken(token);
    } catch {
      setWorking(false);
      setError("Browser verification could not be completed.");
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className="luminous-card border-l-4 border-l-[var(--gold)]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-[var(--gold)] bg-[var(--gold-pale)] text-[var(--gold-ink)]">
          {stage === "disclosure" ? (
            <Sparkles aria-hidden="true" size={18} />
          ) : (
            <ShieldCheck aria-hidden="true" size={18} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1">Optional network feature</p>
          <h3 className="text-xl" id={titleId}>
            {stage === "disclosure"
              ? "Before this record leaves your browser"
              : "Verify this browser"}
          </h3>

          {stage === "disclosure" ? (
            <>
              <p className="max-w-3xl text-sm text-[var(--ink-soft)]">
                Core curriculum records stay on this device. When you request an
                AI suggestion, the fields included in that request and any
                displayed chat history travel through Calricula&apos;s Cloudflare
                Worker, OpenRouter, and the available model provider. Do not
                include student records, confidential material, or secrets.
              </p>
              <ul className="mt-3 grid gap-2 text-sm text-[var(--ink-soft)] md:grid-cols-2">
                <li>Suggestions are drafting aids, not compliance decisions.</li>
                <li>The browser never receives the OpenRouter API key.</li>
                <li>
                  Cloudflare keeps only pseudonymous daily-quota metadata for
                  abuse prevention, never curriculum or conversation content.
                </li>
                <li>Free-model availability and response quality can vary.</li>
                <li>Nothing is changed until you choose Apply.</li>
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="luminous-button-primary"
                  disabled={!online}
                  onClick={() => void continueToVerification()}
                  type="button"
                >
                  Continue to verification
                </button>
                <a
                  className="luminous-button-tertiary"
                  href="/settings/#privacy"
                  target="_self"
                >
                  Data boundaries
                  <ExternalLink aria-hidden="true" size={15} />
                </a>
              </div>
            </>
          ) : (
            <div className="mt-3">
              {tokenProvider ? (
                <button
                  className="luminous-button-secondary"
                  disabled={working}
                  onClick={() => void continueToVerification()}
                  type="button"
                >
                  {working ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <ShieldCheck aria-hidden="true" size={17} />
                  )}
                  Verify and continue
                </button>
              ) : (
                online ? (
                  <TurnstileWidget
                    onError={setError}
                    onToken={acceptTurnstileToken}
                    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
                  />
                ) : null
              )}
            </div>
          )}

          {!online ? (
            <p
              className="mt-3 border-l-2 border-[var(--gold)] pl-3 text-sm text-[var(--ink-soft)]"
              role="status"
            >
              AI requires a connection. You can keep working with local
              curriculum records while offline.
            </p>
          ) : null}

          {error ? (
            <p
              aria-live="polite"
              className="mt-3 border-l-2 border-[var(--returned)] pl-3 text-sm text-[var(--returned)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
