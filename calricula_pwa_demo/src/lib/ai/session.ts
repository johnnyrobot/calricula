import { createAISession } from "./client";
import type { AIRequestOptions, AIResult, AISessionData } from "./types";

const INSTALLATION_ID_KEY = "calricula.installation-id.v1";
const SESSION_READY_KEY = "calricula.ai-session-ready.v1";
const DISCLOSURE_ACKNOWLEDGED_KEY = "calricula.ai-disclosure.v1";
const AI_SESSION_STATUS_EVENT = "calricula:ai-session-status";
const AI_DISCLOSURE_STATUS_EVENT = "calricula:ai-disclosure-status";

let fallbackInstallationId: string | null = null;
let fallbackSessionReady = false;
let fallbackDisclosureAcknowledged = false;

function browserStorage(
  kind: "local" | "session",
): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function newInstallationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `installation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateInstallationId(): string {
  const storage = browserStorage("local");
  const existing = storage?.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  fallbackInstallationId ??= newInstallationId();
  try {
    storage?.setItem(INSTALLATION_ID_KEY, fallbackInstallationId);
  } catch {
    // A stable in-memory identifier still supports browsers with disabled storage.
  }
  return fallbackInstallationId;
}

export function isAISessionMarkedReady(): boolean {
  return (
    fallbackSessionReady ||
    browserStorage("session")?.getItem(SESSION_READY_KEY) === "true"
  );
}

export function subscribeAISessionStatus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AI_SESSION_STATUS_EVENT, listener);
  return () => window.removeEventListener(AI_SESSION_STATUS_EVENT, listener);
}

function notifyAISessionStatus(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AI_SESSION_STATUS_EVENT));
  }
}

export function markAISessionReady(): void {
  fallbackSessionReady = true;
  try {
    browserStorage("session")?.setItem(SESSION_READY_KEY, "true");
  } catch {
    // The secure cookie remains authoritative when sessionStorage is unavailable.
  }
  notifyAISessionStatus();
}

export function clearAISessionMarker(): void {
  fallbackSessionReady = false;
  try {
    browserStorage("session")?.removeItem(SESSION_READY_KEY);
  } catch {
    // No local marker to clear.
  }
  notifyAISessionStatus();
}

export function hasAcknowledgedAIDisclosure(): boolean {
  return (
    fallbackDisclosureAcknowledged ||
    browserStorage("local")?.getItem(DISCLOSURE_ACKNOWLEDGED_KEY) === "true"
  );
}

export function subscribeAIDisclosureStatus(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AI_DISCLOSURE_STATUS_EVENT, listener);
  return () =>
    window.removeEventListener(AI_DISCLOSURE_STATUS_EVENT, listener);
}

export function acknowledgeAIDisclosure(): void {
  fallbackDisclosureAcknowledged = true;
  try {
    browserStorage("local")?.setItem(DISCLOSURE_ACKNOWLEDGED_KEY, "true");
  } catch {
    // The in-memory acknowledgement remains valid for this page session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AI_DISCLOSURE_STATUS_EVENT));
  }
}

export async function establishAISession(
  token: string,
  options: AIRequestOptions = {},
): Promise<AIResult<AISessionData>> {
  const result = await createAISession(
    {
      token,
      installationId: getOrCreateInstallationId(),
    },
    options,
  );
  markAISessionReady();
  return result;
}
