import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("network-backed connectivity status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setNavigatorOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not trust navigator.onLine when the network-only probe fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("Network unavailable"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { probeConnectivity } = await import("./connectivity");

    await expect(probeConnectivity()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/connectivity\.txt\?probe=/),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("short-circuits while the browser reports offline and recovers on a valid probe", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("calricula-online", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { probeConnectivity } = await import("./connectivity");

    setNavigatorOnline(false);
    await expect(probeConnectivity()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    await expect(probeConnectivity()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats an unsuccessful network response as offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("missing", { status: 404 }),
      ),
    );
    const { probeConnectivity } = await import("./connectivity");

    await expect(probeConnectivity()).resolves.toBe(false);
  });
});
