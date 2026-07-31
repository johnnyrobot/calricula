import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shell = vi.hoisted(() => ({
  downloadBackup: vi.fn(),
  importBackup: vi.fn(),
  refreshStorage: vi.fn(),
  resetDemo: vi.fn(),
  useDemo: vi.fn(),
}));

const pendingWork = vi.hoisted(() => ({
  flushPendingWork: vi.fn(),
}));

const draftRecovery = vi.hoisted(() => ({
  clearAllCourseDraftRecoveries: vi.fn(),
}));

vi.mock("@/components/shell", () => ({
  InstallButton: () => <button type="button">Install test control</button>,
  useDemo: shell.useDemo,
}));

vi.mock("@/lib/pwa/pending-work", () => ({
  flushPendingWork: pendingWork.flushPendingWork,
}));

vi.mock("@/lib/pwa/course-draft-recovery", () => ({
  clearAllCourseDraftRecoveries:
    draftRecovery.clearAllCourseDraftRecoveries,
}));

import { SettingsView } from "./SettingsView";

const storage = {
  supported: true,
  persisted: false,
  persistenceRequested: false,
  usage: 9.5 * 1024 * 1024,
  quota: 10 * 1024 * 1024,
  usageRatio: 0.95,
  warning: "approaching-quota" as const,
};

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shell.refreshStorage.mockResolvedValue({
      ...storage,
      persisted: true,
      persistenceRequested: true,
    });
    shell.downloadBackup.mockResolvedValue(undefined);
    pendingWork.flushPendingWork.mockResolvedValue(true);
    shell.importBackup.mockResolvedValue({
      recordCount: 1234,
      schemaVersion: 1,
      seedVersion: "test",
    });
    shell.resetDemo.mockResolvedValue({
      seeded: true,
      migrated: false,
      schemaVersion: 1,
      seedVersion: "test",
    });
    shell.useDemo.mockReturnValue({
      storage,
      storageError: null,
      refreshStorage: shell.refreshStorage,
      downloadBackup: shell.downloadBackup,
      importBackup: shell.importBackup,
      resetDemo: shell.resetDemo,
    });
  });

  it("reports local storage honestly and requests persistence explicitly", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    expect(screen.getByText("9.5 MB of 10.0 MB")).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Estimated local storage used" }),
    ).toHaveAttribute("aria-valuenow", "95");
    expect(
      screen.getByText(/Storage use is approaching/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Request persistent storage" }),
    );

    expect(shell.refreshStorage).toHaveBeenCalledWith(true);
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Persistent storage is enabled for this browser.");
  });

  it("surfaces storage and backup failures without claiming success", async () => {
    const user = userEvent.setup();
    shell.refreshStorage.mockRejectedValueOnce(
      new Error("Persistence permission was blocked."),
    );
    shell.downloadBackup.mockRejectedValueOnce(
      new Error("Download could not start."),
    );
    render(<SettingsView />);

    await user.click(
      screen.getByRole("button", { name: "Request persistent storage" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Persistence permission was blocked.",
    );

    await user.click(
      screen.getByRole("button", { name: "Download backup" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Download could not start.",
    );
  });

  it("validates import size and confirms before replacing local records", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);
    const input = screen.getByLabelText("Choose backup to import");

    const oversized = new File(["{}"], "oversized.json", {
      type: "application/json",
    });
    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: 25 * 1024 * 1024 + 1,
    });
    await user.upload(input, oversized);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "larger than the 25 MB import limit",
    );
    expect(shell.importBackup).not.toHaveBeenCalled();

    const backup = new File(['{"kind":"calricula-local-backup"}'], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, backup);
    const dialog = screen.getByRole("alertdialog", {
      name: "Replace local records with this backup?",
    });
    expect(dialog).toHaveTextContent("backup.json");
    expect(shell.importBackup).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Replace and import" }),
    );
    await waitFor(() => expect(shell.importBackup).toHaveBeenCalledWith(backup));
    expect(draftRecovery.clearAllCourseDraftRecoveries).toHaveBeenCalledOnce();
    expect(pendingWork.flushPendingWork).toHaveBeenCalledOnce();
    expect(pendingWork.flushPendingWork.mock.invocationCallOrder[0]).toBeLessThan(
      shell.importBackup.mock.invocationCallOrder[0],
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Backup imported. 1,234 local records restored.",
    );
  });

  it("keeps reset reversible and orders backup before reset", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(
      screen.getByRole("button", { name: "Reset sample catalog" }),
    );
    expect(shell.resetDemo).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Back up, then reset" }),
    );
    await waitFor(() => expect(shell.resetDemo).toHaveBeenCalledOnce());
    expect(draftRecovery.clearAllCourseDraftRecoveries).toHaveBeenCalledOnce();
    expect(pendingWork.flushPendingWork).toHaveBeenCalledOnce();
    expect(shell.downloadBackup).toHaveBeenCalledOnce();
    expect(pendingWork.flushPendingWork.mock.invocationCallOrder[0]).toBeLessThan(
      shell.downloadBackup.mock.invocationCallOrder[0],
    );
    expect(shell.downloadBackup.mock.invocationCallOrder[0]).toBeLessThan(
      shell.resetDemo.mock.invocationCallOrder[0],
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Backup downloaded and sample catalog reset.",
    );
  });

  it("keeps an import confirmation open when an editor reports unsaved work", async () => {
    const user = userEvent.setup();
    pendingWork.flushPendingWork.mockResolvedValueOnce(false);
    render(<SettingsView />);

    const backup = new File(['{"kind":"calricula-local-backup"}'], "blocked.json", {
      type: "application/json",
    });
    await user.upload(
      screen.getByLabelText("Choose backup to import"),
      backup,
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Replace local records with this backup?",
    });

    await user.click(
      screen.getByRole("button", { name: "Replace and import" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "An open editor could not save. Retry the save, export the unsaved draft, or cancel this action.",
    );
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace and import" }),
    ).toBeEnabled();
    expect(shell.importBackup).not.toHaveBeenCalled();
    expect(shell.downloadBackup).not.toHaveBeenCalled();
    expect(shell.resetDemo).not.toHaveBeenCalled();
    expect(draftRecovery.clearAllCourseDraftRecoveries).not.toHaveBeenCalled();
  });

  it("keeps reset recoverable when pending-work flushing rejects", async () => {
    const user = userEvent.setup();
    pendingWork.flushPendingWork.mockRejectedValueOnce(
      new Error("Editor storage transaction failed."),
    );
    render(<SettingsView />);

    await user.click(
      screen.getByRole("button", { name: "Reset sample catalog" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Reset the sample catalog?",
    });
    await user.click(
      screen.getByRole("button", { name: "Back up, then reset" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "An open editor could not save. Retry the save, export the unsaved draft, or cancel this action.",
    );
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back up, then reset" }),
    ).toBeEnabled();
    expect(shell.downloadBackup).not.toHaveBeenCalled();
    expect(shell.resetDemo).not.toHaveBeenCalled();
    expect(shell.importBackup).not.toHaveBeenCalled();
    expect(draftRecovery.clearAllCourseDraftRecoveries).not.toHaveBeenCalled();
  });

  it("lets Escape cancel a destructive confirmation", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(
      screen.getByRole("button", { name: "Reset sample catalog" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Reset the sample catalog?" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("alertdialog", { name: "Reset the sample catalog?" }),
    ).not.toBeInTheDocument();
    expect(shell.resetDemo).not.toHaveBeenCalled();
  });
});
