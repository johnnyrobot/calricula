"use client";

import { useSyncExternalStore } from "react";

const CONNECTIVITY_PROBE_PATH = "/connectivity.txt";
const PROBE_INTERVAL_MS = 2_000;

const listeners = new Set<() => void>();
let onlineSnapshot = true;
let intervalId: number | null = null;
let probeInFlight: Promise<boolean> | null = null;

function publish(online: boolean): void {
  if (onlineSnapshot === online) return;
  onlineSnapshot = online;
  for (const listener of listeners) listener();
}

export async function probeConnectivity(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (!navigator.onLine) {
    publish(false);
    return false;
  }
  probeInFlight ??= fetch(
    `${CONNECTIVITY_PROBE_PATH}?probe=${Date.now().toString(36)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "text/plain" },
    },
  )
    .then((response) => {
      const online = response.ok;
      publish(online);
      return online;
    })
    .catch(() => {
      publish(false);
      return false;
    })
    .finally(() => {
      probeInFlight = null;
    });
  return probeInFlight;
}

function handleOffline(): void {
  publish(false);
}

function handleOnline(): void {
  void probeConnectivity();
}

function handleVisibility(): void {
  if (document.visibilityState === "visible") void probeConnectivity();
}

function startMonitoring(): void {
  if (typeof window === "undefined" || intervalId !== null) return;
  onlineSnapshot = navigator.onLine;
  window.addEventListener("offline", handleOffline);
  window.addEventListener("online", handleOnline);
  window.addEventListener("focus", handleOnline);
  document.addEventListener("visibilitychange", handleVisibility);
  intervalId = window.setInterval(() => {
    if (document.visibilityState === "visible") void probeConnectivity();
  }, PROBE_INTERVAL_MS);
  void probeConnectivity();
}

function stopMonitoring(): void {
  if (typeof window === "undefined" || intervalId === null) return;
  window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener("offline", handleOffline);
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("focus", handleOnline);
  document.removeEventListener("visibilitychange", handleVisibility);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startMonitoring();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopMonitoring();
  };
}

function getSnapshot(): boolean {
  return onlineSnapshot;
}

export function useConnectivityStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
