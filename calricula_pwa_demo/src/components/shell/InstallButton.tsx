"use client";

import { Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallButtonProps {
  compact?: boolean;
}

export function InstallButton({ compact = false }: InstallButtonProps) {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => {
      setIsInstalled(
        displayMode.matches ||
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    };
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setPromptEvent(null);
      setIsInstalled(true);
    };

    updateInstalledState();
    displayMode.addEventListener("change", updateInstalledState);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      displayMode.removeEventListener("change", updateInstalledState);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setPromptEvent(null);
    }
  }, [promptEvent]);

  if (isInstalled) {
    return compact ? null : (
      <span className="status-seal status-seal--approved">
        Installed on this device
      </span>
    );
  }

  if (promptEvent) {
    return (
      <button className="luminous-button-secondary" type="button" onClick={install}>
        <Download aria-hidden="true" size={17} />
        Install Calricula
      </button>
    );
  }

  return (
    <Link className="luminous-button-secondary" href="/settings/#install">
      <ExternalLink aria-hidden="true" size={17} />
      {compact ? "Install" : "Installation guidance"}
    </Link>
  );
}
