"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  curriculumRepository,
  type ImportResult,
  type InitializationResult,
  type StorageStatus,
} from "@/lib/data";

type RepositoryState = "initializing" | "ready" | "error";

interface DemoContextValue {
  state: RepositoryState;
  initialization: InitializationResult | null;
  initializationError: Error | null;
  storage: StorageStatus | null;
  storageError: Error | null;
  retryInitialization: () => void;
  refreshStorage: (requestPersistence?: boolean) => Promise<StorageStatus>;
  downloadBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<ImportResult>;
  resetDemo: () => Promise<InitializationResult>;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function backupFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `calricula-demo-backup-${date}.json`;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [initialization, setInitialization] =
    useState<InitializationResult | null>(null);
  const [initializationError, setInitializationError] =
    useState<Error | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [storageError, setStorageError] = useState<Error | null>(null);

  const state: RepositoryState = initializationError
    ? "error"
    : !initialization
      ? "initializing"
      : "ready";

  useEffect(() => {
    let active = true;
    void curriculumRepository.initialize().then(
      (result: InitializationResult) => {
        if (active) {
          setInitialization(result);
          setInitializationError(null);
        }
      },
      (error: unknown) => {
        if (active) {
          setInitializationError(
            error instanceof Error
              ? error
              : new Error("The local curriculum workspace could not be opened."),
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [initializationAttempt]);

  const retryInitialization = useCallback(() => {
    setInitialization(null);
    setInitializationError(null);
    setInitializationAttempt((value) => value + 1);
  }, []);

  const refreshStorage = useCallback(async (requestPersistence = false) => {
    try {
      const next = await curriculumRepository.storageStatus({
        requestPersistence,
      });
      setStorage(next);
      setStorageError(null);
      return next;
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Storage status is unavailable.");
      setStorageError(nextError);
      throw nextError;
    }
  }, []);

  useEffect(() => {
    if (state === "ready") {
      const timeout = window.setTimeout(() => {
        void refreshStorage().catch(() => {
          // The error is exposed through context for an accessible inline state.
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [refreshStorage, state]);

  const downloadBackup = useCallback(async () => {
    const backup = await curriculumRepository.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = backupFileName();
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const importBackup = useCallback(
    async (file: File) => {
      const text = await file.text();
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error(
          "This file is not valid JSON. Choose an unmodified Calricula backup.",
        );
      }
      const result = await curriculumRepository.importBackup(value);
      await refreshStorage();
      return result;
    },
    [refreshStorage],
  );

  const resetDemo = useCallback(async () => {
    const result = await curriculumRepository.reset();
    await refreshStorage();
    return result;
  }, [refreshStorage]);

  const value = useMemo<DemoContextValue>(
    () => ({
      state,
      initialization,
      initializationError,
      storage,
      storageError,
      retryInitialization,
      refreshStorage,
      downloadBackup,
      importBackup,
      resetDemo,
    }),
    [
      downloadBackup,
      importBackup,
      initialization,
      initializationError,
      refreshStorage,
      retryInitialization,
      resetDemo,
      state,
      storage,
      storageError,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within DemoProvider.");
  }
  return context;
}
