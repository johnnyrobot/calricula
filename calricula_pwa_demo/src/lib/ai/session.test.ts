import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsafeSessionStorageKeysForTests } from "./session";

// Read from the module rather than re-declared here. Three copied literals
// asserted on raw window storage with nothing to grep for; this is the same
// bypass, named — see ADR-0002 on `unsafeDatabaseForTests()`.
const {
  installationId: INSTALLATION_ID_KEY,
  sessionReady: SESSION_READY_KEY,
  disclosureAcknowledged: DISCLOSURE_ACKNOWLEDGED_KEY,
} = unsafeSessionStorageKeysForTests;

type SessionModule = typeof import("./session");
type StorageName = "localStorage" | "sessionStorage";

async function loadSession(): Promise<SessionModule> {
  vi.resetModules();
  return import("./session");
}

function replaceWindowStorage(
  name: StorageName,
  getter: () => Storage,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, {
    configurable: true,
    get: getter,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    }
  };
}

function throwingStorage(): Storage {
  return {
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    get length() {
      return 0;
    },
    removeItem: vi.fn(() => {
      throw new Error("storage remove blocked");
    }),
    setItem: vi.fn(() => {
      throw new Error("storage write blocked");
    }),
  };
}

describe("AI session state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("installation identifier", () => {
    it("returns an existing locally persisted identifier", async () => {
      window.localStorage.setItem(INSTALLATION_ID_KEY, "installation-existing");
      const { getOrCreateInstallationId } = await loadSession();

      expect(getOrCreateInstallationId()).toBe("installation-existing");
      expect(window.localStorage.getItem(INSTALLATION_ID_KEY)).toBe(
        "installation-existing",
      );
    });

    it("creates, persists, and reuses a new identifier", async () => {
      const { getOrCreateInstallationId } = await loadSession();

      const first = getOrCreateInstallationId();
      const second = getOrCreateInstallationId();

      expect(first).toMatch(
        /^(?:[0-9a-f]{8}-[0-9a-f-]{27}|installation-\d+-[a-z0-9]+)$/i,
      );
      expect(second).toBe(first);
      expect(window.localStorage.getItem(INSTALLATION_ID_KEY)).toBe(first);
    });

    it("uses the deterministic non-crypto fallback when randomUUID is absent", async () => {
      vi.stubGlobal("crypto", {});
      vi.spyOn(Date, "now").mockReturnValue(1_722_400_000_000);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { getOrCreateInstallationId } = await loadSession();

      const identifier = getOrCreateInstallationId();

      expect(identifier).toBe("installation-1722400000000-i");
      expect(getOrCreateInstallationId()).toBe(identifier);
      expect(window.localStorage.getItem(INSTALLATION_ID_KEY)).toBe(identifier);
    });

    it("keeps a stable in-memory identifier when localStorage is unavailable", async () => {
      const restoreStorage = replaceWindowStorage("localStorage", () => {
        throw new Error("local storage blocked");
      });

      try {
        const { getOrCreateInstallationId } = await loadSession();
        const first = getOrCreateInstallationId();

        expect(first).toBeTruthy();
        expect(getOrCreateInstallationId()).toBe(first);
      } finally {
        restoreStorage();
      }
    });

    it("keeps a stable in-memory identifier when localStorage rejects writes", async () => {
      const storage = throwingStorage();
      const restoreStorage = replaceWindowStorage("localStorage", () => storage);

      try {
        const { getOrCreateInstallationId } = await loadSession();
        const first = getOrCreateInstallationId();

        expect(first).toBeTruthy();
        expect(getOrCreateInstallationId()).toBe(first);
        expect(storage.setItem).toHaveBeenCalledWith(
          INSTALLATION_ID_KEY,
          first,
        );
      } finally {
        restoreStorage();
      }
    });
  });

  describe("session-ready marker", () => {
    it("reads a marker already present in sessionStorage", async () => {
      window.sessionStorage.setItem(SESSION_READY_KEY, "true");
      const { isAISessionMarkedReady } = await loadSession();

      expect(isAISessionMarkedReady()).toBe(true);
    });

    it("marks, clears, publishes, and unsubscribes from status changes", async () => {
      const {
        clearAISessionMarker,
        isAISessionMarkedReady,
        markAISessionReady,
        subscribeAISessionStatus,
      } = await loadSession();
      const listener = vi.fn();
      const unsubscribe = subscribeAISessionStatus(listener);

      expect(isAISessionMarkedReady()).toBe(false);

      markAISessionReady();
      expect(isAISessionMarkedReady()).toBe(true);
      expect(window.sessionStorage.getItem(SESSION_READY_KEY)).toBe("true");
      expect(listener).toHaveBeenCalledTimes(1);

      clearAISessionMarker();
      expect(isAISessionMarkedReady()).toBe(false);
      expect(window.sessionStorage.getItem(SESSION_READY_KEY)).toBeNull();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      markAISessionReady();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("uses memory when sessionStorage rejects writes and removals", async () => {
      const storage = throwingStorage();
      const restoreStorage = replaceWindowStorage(
        "sessionStorage",
        () => storage,
      );

      try {
        const {
          clearAISessionMarker,
          isAISessionMarkedReady,
          markAISessionReady,
        } = await loadSession();

        markAISessionReady();
        expect(isAISessionMarkedReady()).toBe(true);
        expect(storage.setItem).toHaveBeenCalledWith(SESSION_READY_KEY, "true");

        clearAISessionMarker();
        expect(isAISessionMarkedReady()).toBe(false);
        expect(storage.removeItem).toHaveBeenCalledWith(SESSION_READY_KEY);
      } finally {
        restoreStorage();
      }
    });

    it("treats inaccessible sessionStorage as an absent marker", async () => {
      const restoreStorage = replaceWindowStorage("sessionStorage", () => {
        throw new Error("session storage blocked");
      });

      try {
        const { isAISessionMarkedReady } = await loadSession();
        expect(isAISessionMarkedReady()).toBe(false);
      } finally {
        restoreStorage();
      }
    });
  });

  describe("AI disclosure acknowledgement", () => {
    it("reads an acknowledgement already present in localStorage", async () => {
      window.localStorage.setItem(DISCLOSURE_ACKNOWLEDGED_KEY, "true");
      const { hasAcknowledgedAIDisclosure } = await loadSession();

      expect(hasAcknowledgedAIDisclosure()).toBe(true);
    });

    it("acknowledges, publishes, and unsubscribes from disclosure changes", async () => {
      const {
        acknowledgeAIDisclosure,
        hasAcknowledgedAIDisclosure,
        subscribeAIDisclosureStatus,
      } = await loadSession();
      const listener = vi.fn();
      const unsubscribe = subscribeAIDisclosureStatus(listener);

      expect(hasAcknowledgedAIDisclosure()).toBe(false);
      acknowledgeAIDisclosure();

      expect(hasAcknowledgedAIDisclosure()).toBe(true);
      expect(
        window.localStorage.getItem(DISCLOSURE_ACKNOWLEDGED_KEY),
      ).toBe("true");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      acknowledgeAIDisclosure();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("retains an acknowledgement in memory when storage rejects the write", async () => {
      const storage = throwingStorage();
      const restoreStorage = replaceWindowStorage("localStorage", () => storage);

      try {
        const {
          acknowledgeAIDisclosure,
          hasAcknowledgedAIDisclosure,
        } = await loadSession();

        acknowledgeAIDisclosure();

        expect(hasAcknowledgedAIDisclosure()).toBe(true);
        expect(storage.setItem).toHaveBeenCalledWith(
          DISCLOSURE_ACKNOWLEDGED_KEY,
          "true",
        );
      } finally {
        restoreStorage();
      }
    });
  });

  it("supports all in-memory fallbacks when rendered without window", async () => {
    vi.stubGlobal("window", undefined);

    try {
      const {
        acknowledgeAIDisclosure,
        clearAISessionMarker,
        getOrCreateInstallationId,
        hasAcknowledgedAIDisclosure,
        isAISessionMarkedReady,
        markAISessionReady,
        subscribeAIDisclosureStatus,
        subscribeAISessionStatus,
      } = await loadSession();
      const sessionListener = vi.fn();
      const disclosureListener = vi.fn();

      expect(getOrCreateInstallationId()).toBeTruthy();
      expect(isAISessionMarkedReady()).toBe(false);
      expect(hasAcknowledgedAIDisclosure()).toBe(false);

      subscribeAISessionStatus(sessionListener)();
      subscribeAIDisclosureStatus(disclosureListener)();
      markAISessionReady();
      acknowledgeAIDisclosure();

      expect(isAISessionMarkedReady()).toBe(true);
      expect(hasAcknowledgedAIDisclosure()).toBe(true);
      expect(sessionListener).not.toHaveBeenCalled();
      expect(disclosureListener).not.toHaveBeenCalled();

      clearAISessionMarker();
      expect(isAISessionMarkedReady()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("establishes the worker session with the installation contract and marks readiness", async () => {
    window.localStorage.setItem(INSTALLATION_ID_KEY, "installation-contract");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { expiresAt: "2026-07-30T20:00:00Z" },
          model: "openrouter/free",
          requestId: "session-request-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const {
      establishAISession,
      isAISessionMarkedReady,
      subscribeAISessionStatus,
    } = await loadSession();
    const listener = vi.fn();
    subscribeAISessionStatus(listener);

    const result = await establishAISession("turnstile-token");

    expect(result).toEqual({
      data: { expiresAt: "2026-07-30T20:00:00Z" },
      model: "openrouter/free",
      requestId: "session-request-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/session",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          token: "turnstile-token",
          installationId: "installation-contract",
        }),
      }),
    );
    expect(isAISessionMarkedReady()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
