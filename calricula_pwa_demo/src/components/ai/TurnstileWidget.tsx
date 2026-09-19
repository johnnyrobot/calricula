"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement | string,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      theme: "light";
      size: "normal" | "flexible";
      appearance: "always";
      action: "ai-session";
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "calricula-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded without exposing its browser API."));
    };
    const handleError = () => reject(new Error("Turnstile could not be loaded."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

export interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
}: TurnstileWidgetProps) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!siteKey) {
      onError("AI verification is not configured for this deployment.");
      return;
    }

    void loadTurnstile().then(
      (turnstile) => {
        if (!active || !containerRef.current) return;
        setLoading(false);
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
          "error-callback": () =>
            onError("Browser verification failed. Please try again."),
          "expired-callback": () =>
            onError("Browser verification expired. Please verify again."),
          theme: "light",
          size: "flexible",
          appearance: "always",
          action: "ai-session",
        });
      },
      () => {
        if (!active) return;
        setLoading(false);
        onError(
          "Browser verification could not load. Check your connection or content-blocking settings.",
        );
      },
    );

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onError, onToken, siteKey]);

  return (
    <div className="space-y-3">
      <div
        aria-label="Browser verification"
        id={`turnstile-${reactId.replaceAll(":", "")}`}
        ref={containerRef}
        role="group"
      />
      {siteKey && loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
          Loading browser verification…
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <ShieldCheck aria-hidden="true" size={15} />
          Verification limits automated use of the shared free-model demo.
        </p>
      )}
    </div>
  );
}
