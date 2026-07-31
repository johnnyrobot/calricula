"use client";

import {
  ArchiveRestore,
  Database,
  Download,
  FileDown,
  FileUp,
  HardDrive,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import { InstallButton, useDemo } from "@/components/shell";
import { clearAllCourseDraftRecoveries } from "@/lib/pwa/course-draft-recovery";
import { flushPendingWork } from "@/lib/pwa/pending-work";

const PENDING_WORK_ERROR =
  "An open editor could not save. Retry the save, export the unsaved draft, or cancel this action.";

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value < 1024) return `${Math.round(value)} bytes`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

interface PendingImport {
  file: File;
}

export function SettingsView() {
  const {
    storage,
    storageError,
    refreshStorage,
    downloadBackup,
    importBackup,
    resetDemo,
  } = useDemo();
  const [busy, setBusy] = useState<
    "persist" | "backup" | "import" | "reset" | "backup-reset" | null
  >(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meter = Math.max(0, Math.min(100, (storage?.usageRatio ?? 0) * 100));

  const complete = (nextMessage: string) => {
    setMessage(nextMessage);
    setError("");
  };

  const fail = (value: unknown, fallback: string) => {
    setError(value instanceof Error ? value.message : fallback);
    setMessage("");
  };

  const flushBeforeReplacingRecords = async (): Promise<boolean> => {
    try {
      if (await flushPendingWork()) return true;
    } catch {
      // The same actionable, non-destructive state applies whether a flusher
      // explicitly fails or rejects.
    }
    fail(new Error(PENDING_WORK_ERROR), PENDING_WORK_ERROR);
    return false;
  };

  const requestPersistence = async () => {
    setBusy("persist");
    try {
      const next = await refreshStorage(true);
      complete(
        next.persisted
          ? "Persistent storage is enabled for this browser."
          : "The browser did not grant persistent storage. Backups remain available.",
      );
    } catch (value) {
      fail(value, "The storage request could not be completed.");
    } finally {
      setBusy(null);
    }
  };

  const backup = async () => {
    setBusy("backup");
    try {
      await downloadBackup();
      complete("Backup downloaded.");
    } catch (value) {
      fail(value, "The backup could not be downloaded.");
    } finally {
      setBusy(null);
    }
  };

  const chooseImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setError("This backup is larger than the 25 MB import limit.");
        setPendingImport(null);
      } else {
        setPendingImport({ file });
        setError("");
      }
    }
    event.target.value = "";
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setBusy("import");
    try {
      if (!(await flushBeforeReplacingRecords())) return;
      const result = await importBackup(pendingImport.file);
      clearAllCourseDraftRecoveries();
      setPendingImport(null);
      complete(
        `Backup imported. ${result.recordCount.toLocaleString()} local records restored.`,
      );
    } catch (value) {
      setPendingImport(null);
      fail(value, "The backup could not be imported.");
    } finally {
      setBusy(null);
    }
  };

  const reset = async (withBackup: boolean) => {
    setBusy(withBackup ? "backup-reset" : "reset");
    try {
      if (!(await flushBeforeReplacingRecords())) return;
      if (withBackup) await downloadBackup();
      await resetDemo();
      clearAllCourseDraftRecoveries();
      setResetOpen(false);
      complete(
        withBackup
          ? "Backup downloaded and sample catalog reset."
          : "Sample catalog reset.",
      );
    } catch (value) {
      setResetOpen(false);
      fail(value, "The sample catalog could not be reset.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace stewardship</p>
          <h1 className="folio-title">Settings</h1>
          <p className="page-deck">
            Manage this browser&apos;s sample records, installation, and data
            boundaries.
          </p>
        </div>
      </header>

      {(message || error) && !pendingImport && !resetOpen && (
        <div
          className={`callout mb-5 ${error ? "callout--danger" : ""}`}
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          <p>{error || message}</p>
        </div>
      )}

      <div className="settings-layout">
        <nav aria-label="Settings sections">
          <ul className="settings-index">
            <li>
              <a href="#storage">Storage</a>
            </li>
            <li>
              <a href="#backup">Backup &amp; reset</a>
            </li>
            <li>
              <a href="#install">Install</a>
            </li>
            <li>
              <a href="#privacy">Data &amp; AI</a>
            </li>
          </ul>
        </nav>

        <div className="settings-sections">
          <section
            className="settings-section"
            id="storage"
            aria-labelledby="storage-title"
          >
            <p className="eyebrow">This device</p>
            <h2 id="storage-title">Local storage</h2>
            <p>
              Calricula keeps the core demo workspace in this browser using
              IndexedDB. Clearing site data removes it unless you have a backup.
            </p>
            <dl className="definition-list">
              <div className="definition-row">
                <dt>Availability</dt>
                <dd>
                  {!storage
                    ? "Checking browser storage…"
                    : storage.supported
                      ? "Local database storage is available"
                      : "Local database storage is unavailable"}
                </dd>
              </div>
              <div className="definition-row">
                <dt>Persistence</dt>
                <dd>
                  {!storage
                    ? "Checking…"
                    : storage.persisted === true
                    ? "Granted by this browser"
                    : storage.persisted === false
                      ? "Not granted"
                      : "Status unavailable"}
                </dd>
              </div>
              <div className="definition-row">
                <dt>Estimated use</dt>
                <dd>
                  {formatBytes(storage?.usage)} of {formatBytes(storage?.quota)}
                </dd>
              </div>
            </dl>

            <div
              className="storage-meter"
              role="meter"
              aria-label="Estimated local storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                storage?.usageRatio == null ? undefined : Math.round(meter)
              }
              aria-valuetext={`${formatBytes(storage?.usage)} of ${formatBytes(
                storage?.quota,
              )}`}
            >
              <span style={{ width: `${meter}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {storage?.warning === "quota-critical"
                ? "Storage is nearly full. Download a backup before making more changes."
                : storage?.warning === "approaching-quota"
                  ? "Storage use is approaching this browser’s estimated quota."
                  : "The estimate includes browser-managed storage and may change."}
            </p>

            {storageError && (
              <div className="callout callout--warning" role="alert">
                <p>{storageError.message}</p>
              </div>
            )}

            <div className="setting-actions">
              <button
                className="luminous-button-primary"
                type="button"
                disabled={busy !== null || storage?.supported === false}
                onClick={() => void requestPersistence()}
              >
                <ShieldCheck aria-hidden="true" size={17} />
                {busy === "persist"
                  ? "Requesting…"
                  : storage?.persisted
                    ? "Persistent storage enabled"
                    : "Request persistent storage"}
              </button>
            </div>
            <div className="callout mt-4">
              <h3>What persistence means</h3>
              <p>
                A grant asks the browser not to evict this site during routine
                storage cleanup. It does not prevent you, your browser, or a device
                administrator from clearing the data.
              </p>
            </div>
          </section>

          <section
            className="settings-section"
            id="backup"
            aria-labelledby="backup-title"
          >
            <p className="eyebrow">Portable custody</p>
            <h2 id="backup-title">Backup, restore, and reset</h2>
            <p>
              A backup is a JSON copy of the local demo workspace. Store it like
              any other curriculum working file and inspect it before sharing.
            </p>
            <div className="setting-actions">
              <button
                className="luminous-button-primary"
                type="button"
                disabled={busy !== null}
                onClick={() => void backup()}
              >
                <FileDown aria-hidden="true" size={17} />
                {busy === "backup" ? "Preparing backup…" : "Download backup"}
              </button>
              <label className="file-import-label">
                <FileUp aria-hidden="true" size={17} />
                Choose backup to import
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  disabled={busy !== null}
                  onChange={chooseImport}
                />
              </label>
              <button
                className="luminous-button-danger"
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setError("");
                  setMessage("");
                  setResetOpen(true);
                }}
              >
                <RotateCcw aria-hidden="true" size={17} />
                Reset sample catalog
              </button>
            </div>
            <div className="callout callout--warning mt-4">
              <h3>Import and reset replace local records</h3>
              <p>
                Both actions remove current edits, comments, workflow activity,
                and locally stored AI conversations. Calricula asks for
                confirmation first.
              </p>
            </div>
          </section>

          <section
            className="settings-section"
            id="install"
            aria-labelledby="install-title"
          >
            <p className="eyebrow">Progressive web app</p>
            <h2 id="install-title">Install Calricula</h2>
            <p>
              Installation opens this demo in its own window and keeps the app
              shell ready for offline use. It does not create an account or move
              local records to the cloud.
            </p>
            <div className="setting-actions">
              <InstallButton />
            </div>
            <ol className="mt-5 space-y-3 pl-5">
              <li>
                Use the install button when your browser offers it, or open the
                browser&apos;s app-install or add-to-home-screen control.
              </li>
              <li>
                On a phone or tablet, the control may appear in the browser&apos;s
                Share menu.
              </li>
              <li>
                After installation, open one local record while online before
                relying on it away from a connection.
              </li>
            </ol>
            <div className="callout mt-4">
              <h3>Offline boundary</h3>
              <p>
                Cached screens and records already stored on this device can
                remain available. AI actions, Turnstile verification, and update
                checks require a network connection.
              </p>
            </div>
          </section>

          <section
            className="settings-section"
            id="privacy"
            aria-labelledby="privacy-title"
          >
            <p className="eyebrow">Plain-language boundaries</p>
            <h2 id="privacy-title">Local data and optional AI</h2>
            <ul className="check-list">
              <li>
                <HardDrive aria-hidden="true" />
                <span>
                  Courses, programs, comments, workflow history, notifications,
                  and AI conversation history are stored locally in this browser.
                </span>
              </li>
              <li>
                <Sparkles aria-hidden="true" />
                <span>
                  Only content you explicitly submit to an AI action—and any chat
                  history included with that action—leaves the device.
                </span>
              </li>
              <li>
                <LockKeyhole aria-hidden="true" />
                <span>
                  AI traffic passes through Calricula&apos;s Cloudflare Worker and
                  OpenRouter to a server-selected free model provider. The browser
                  never receives the OpenRouter key or model-routing controls.
                </span>
              </li>
              <li>
                <Database aria-hidden="true" />
                <span>
                  The worker does not persist or log prompt and response content.
                  Requests ask providers to deny data collection and use
                  zero-data-retention routing, but provider handling remains
                  subject to OpenRouter and provider policies.
                </span>
              </li>
              <li>
                <TriangleAlert aria-hidden="true" />
                <span>
                  Do not enter student records, personal information, secrets, or
                  other confidential institutional data in this public demo.
                </span>
              </li>
            </ul>
            <div className="callout callout--warning">
              <h3>Demonstration limits</h3>
              <p>
                This build does not provide accounts, cloud sync, true multi-user
                workflow, guaranteed AI availability, or authoritative legal and
                compliance advice. Reset clears local data; it cannot retract
                content already sent for transient AI processing.
              </p>
            </div>
          </section>
        </div>
      </div>

      {pendingImport && (
        <ConfirmActionDialog
          title="Replace local records with this backup?"
          description={`Importing “${pendingImport.file.name}” replaces the current local workspace after the file is validated. Download a backup first if you need the current edits.`}
          confirmLabel={busy === "import" ? "Importing…" : "Replace and import"}
          busy={busy === "import"}
          error={error}
          icon={<ArchiveRestore aria-hidden="true" />}
          onCancel={() => {
            if (!busy) {
              setPendingImport(null);
              setError("");
            }
          }}
          onConfirm={() => void confirmImport()}
        />
      )}

      {resetOpen && (
        <ResetSettingsDialog
          busy={busy}
          error={error}
          onCancel={() => {
            if (!busy) {
              setResetOpen(false);
              setError("");
            }
          }}
          onReset={(withBackup) => void reset(withBackup)}
        />
      )}
    </>
  );
}

interface ConfirmActionDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  icon: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  icon,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop">
      <div
        ref={panelRef}
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        aria-describedby="confirm-action-description"
      >
        <div aria-hidden="true">{icon}</div>
        <h2 id="confirm-action-title">{title}</h2>
        <p id="confirm-action-description">{description}</p>
        {error && (
          <div className="callout callout--danger" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="luminous-button-tertiary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="luminous-button-danger"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            <ArchiveRestore aria-hidden="true" size={17} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetSettingsDialog({
  busy,
  error,
  onCancel,
  onReset,
}: {
  busy: string | null;
  error: string;
  onCancel: () => void;
  onReset: (withBackup: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop">
      <div
        ref={panelRef}
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-settings-title"
        aria-describedby="reset-settings-description"
      >
        <RotateCcw aria-hidden="true" />
        <h2 id="reset-settings-title">Reset the sample catalog?</h2>
        <p id="reset-settings-description">
          Reset replaces all current local edits and history with the original
          sample records. Downloading a backup first is the only undo path.
        </p>
        {error && (
          <div className="callout callout--danger" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="luminous-button-tertiary"
            type="button"
            disabled={Boolean(busy)}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="luminous-button-secondary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => onReset(true)}
          >
            <Download aria-hidden="true" size={17} />
            {busy === "backup-reset" ? "Backing up…" : "Back up, then reset"}
          </button>
          <button
            className="luminous-button-danger"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => onReset(false)}
          >
            <RotateCcw aria-hidden="true" size={17} />
            {busy === "reset" ? "Resetting…" : "Reset without backup"}
          </button>
        </div>
      </div>
    </div>
  );
}
