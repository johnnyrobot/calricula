import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  initialize: vi.fn(),
  storageStatus: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  curriculumRepository: repository,
}));

import { DemoProvider, useDemo } from "./DemoProvider";

const initialization = {
  seeded: true,
  migrated: false,
  schemaVersion: 1,
  seedVersion: "test",
};

const storage = {
  supported: true,
  persisted: false,
  persistenceRequested: false,
  usage: 1024,
  quota: 1024 * 1024,
  usageRatio: 1 / 1024,
  warning: "none" as const,
};

function ContextProbe() {
  const demo = useDemo();
  return (
    <div>
      <output aria-label="Repository state">{demo.state}</output>
      {demo.initializationError && <p role="alert">{demo.initializationError.message}</p>}
      {demo.storageError && <p role="alert">{demo.storageError.message}</p>}
      <output aria-label="Storage usage">{demo.storage?.usage ?? "unknown"}</output>
      <button type="button" onClick={demo.retryInitialization}>
        Retry
      </button>
      <button
        type="button"
        onClick={() => {
          void demo.refreshStorage(true).catch(() => undefined);
        }}
      >
        Request persistence
      </button>
    </div>
  );
}

function ActionProbe({ importFile }: { importFile: File }) {
  const demo = useDemo();
  const [result, setResult] = useState("");

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void demo.downloadBackup().then(() => setResult("downloaded"));
        }}
      >
        Download
      </button>
      <button
        type="button"
        onClick={() => {
          void demo.importBackup(importFile).then(
            (value) => setResult(`imported ${value.recordCount}`),
            (error: unknown) =>
              setResult(error instanceof Error ? error.message : "import failed"),
          );
        }}
      >
        Import
      </button>
      <button
        type="button"
        onClick={() => {
          void demo.resetDemo().then(() => setResult("reset"));
        }}
      >
        Reset
      </button>
      <output aria-label="Action result">{result}</output>
    </div>
  );
}

describe("DemoProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.initialize.mockResolvedValue(initialization);
    repository.storageStatus.mockResolvedValue(storage);
  });

  it("initializes the repository before exposing a ready state", async () => {
    render(
      <DemoProvider>
        <ContextProbe />
      </DemoProvider>,
    );

    expect(screen.getByLabelText("Repository state")).toHaveTextContent(
      "initializing",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Repository state")).toHaveTextContent("ready"),
    );
    expect(repository.initialize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(repository.storageStatus).toHaveBeenCalledWith({
      requestPersistence: false,
    }));
    expect(screen.getByLabelText("Storage usage")).toHaveTextContent("1024");
  });

  it("exposes initialization errors and retries through the same adapter", async () => {
    repository.initialize
      .mockRejectedValueOnce(new Error("Browser storage is blocked."))
      .mockResolvedValueOnce(initialization);
    const user = userEvent.setup();

    render(
      <DemoProvider>
        <ContextProbe />
      </DemoProvider>,
    );

    expect(
      await screen.findByRole("alert", { name: "" }),
    ).toHaveTextContent("Browser storage is blocked.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Repository state")).toHaveTextContent("ready"),
    );
    expect(repository.initialize).toHaveBeenCalledTimes(2);
  });

  it("requests persistence and exposes storage failures without resetting data", async () => {
    const user = userEvent.setup();
    repository.storageStatus
      .mockResolvedValueOnce(storage)
      .mockRejectedValueOnce(new Error("Storage estimate failed."));

    render(
      <DemoProvider>
        <ContextProbe />
      </DemoProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Repository state")).toHaveTextContent("ready"),
    );
    await waitFor(() => expect(repository.storageStatus).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "Request persistence" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage estimate failed.",
    );
    expect(repository.storageStatus).toHaveBeenLastCalledWith({
      requestPersistence: true,
    });
    expect(repository.reset).not.toHaveBeenCalled();
  });

  it("downloads a dated JSON backup without exposing repository internals", async () => {
    const user = userEvent.setup();
    repository.exportBackup.mockResolvedValue({
      kind: "calricula-local-backup",
      schemaVersion: 1,
      seedVersion: "test",
      exportedAt: "2026-07-30T00:00:00.000Z",
      records: {},
    });
    const objectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:calricula-backup");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const file = { text: vi.fn(async () => "{}") } as unknown as File;

    render(
      <DemoProvider>
        <ActionProbe importFile={file} />
      </DemoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(repository.exportBackup).toHaveBeenCalledOnce());
    expect(objectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Action result")).toHaveTextContent(
      "downloaded",
    );

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:calricula-backup");
  });

  it("validates JSON before import and refreshes storage after import and reset", async () => {
    const user = userEvent.setup();
    repository.importBackup.mockResolvedValue({
      recordCount: 7,
      schemaVersion: 1,
      seedVersion: "test",
    });
    repository.reset.mockResolvedValue(initialization);
    const validFile = {
      text: vi.fn(async () => '{"kind":"calricula-local-backup"}'),
    } as unknown as File;

    const view = render(
      <DemoProvider>
        <ActionProbe importFile={validFile} />
      </DemoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Action result")).toHaveTextContent(
        "imported 7",
      ),
    );
    expect(repository.importBackup).toHaveBeenCalledWith({
      kind: "calricula-local-backup",
    });

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Action result")).toHaveTextContent("reset"),
    );
    expect(repository.reset).toHaveBeenCalledOnce();
    expect(repository.storageStatus.mock.calls.length).toBeGreaterThanOrEqual(3);

    view.unmount();
    const invalidFile = {
      text: vi.fn(async () => "{invalid"),
    } as unknown as File;
    render(
      <DemoProvider>
        <ActionProbe importFile={invalidFile} />
      </DemoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByLabelText("Action result")).toHaveTextContent(
      "This file is not valid JSON",
    );
  });

  it("rejects useDemo outside its provider", () => {
    expect(() => render(<ContextProbe />)).toThrow(
      "useDemo must be used within DemoProvider.",
    );
  });
});
