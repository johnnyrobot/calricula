"use client";

import {
  Accessibility,
  Bell,
  BookOpenText,
  CheckSquare2,
  CircleOff,
  Database,
  FileDown,
  Files,
  Home,
  Menu,
  RefreshCw,
  RotateCcw,
  Settings,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  curriculumRepository,
  useActivePersona,
  useDashboard,
  usePersonas,
} from "@/lib/data";
import { useConnectivityStatus } from "@/lib/pwa/connectivity";
import { flushPendingWork } from "@/lib/pwa/pending-work";
import { clearAllCourseDraftRecoveries } from "@/lib/pwa/course-draft-recovery";

import { BrandMark } from "./BrandMark";
import { useDemo } from "./DemoProvider";
import { RepositoryBootstrap } from "./RepositoryBootstrap";

const ContextualAssistant = dynamic(
  () =>
    import("@/components/ai/ContextualAssistant").then(
      (module) => module.ContextualAssistant,
    ),
  {
    loading: () => (
      <span
        aria-hidden="true"
        className="topbar-icon-button"
        data-testid="assistant-loading-placeholder"
      />
    ),
    ssr: false,
  },
);

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  section: "Curriculum" | "Workflow" | "System";
}

const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home, section: "Curriculum" },
  { label: "Courses", href: "/courses", icon: BookOpenText, section: "Curriculum" },
  { label: "Programs", href: "/programs", icon: Files, section: "Curriculum" },
  {
    label: "Approvals",
    href: "/approvals",
    icon: CheckSquare2,
    section: "Workflow",
  },
  { label: "Settings", href: "/settings", icon: Settings, section: "System" },
  {
    label: "Accessibility",
    href: "/accessibility",
    icon: Accessibility,
    section: "System",
  },
  { label: "Offline use", href: "/offline", icon: CircleOff, section: "System" },
];

const PAGE_NAMES: Record<string, string> = {
  dashboard: "Dashboard",
  courses: "Course outlines",
  programs: "Programs",
  approvals: "Approvals",
  settings: "Settings",
  accessibility: "Accessibility",
  offline: "Offline use",
};

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname === `${href}/` || pathname.startsWith(`${href}/`);
}

function roleLabel(role: string | undefined) {
  const labels: Record<string, string> = {
    Faculty: "Faculty",
    CurriculumChair: "Department chair",
    ArticulationOfficer: "Articulation officer",
    Admin: "Administrator",
    faculty: "Faculty",
    chair: "Department chair",
    articulation: "Articulation officer",
    admin: "Administrator",
  };
  return role ? (labels[role] ?? role) : "Loading role…";
}

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Storage available";
  if (value < 1024) return `${Math.round(value)} B used`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB used`;
  return `${(value / 1024 ** 2).toFixed(1)} MB used`;
}

function useDesktopNavigation() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 64.001rem)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function RepositoryState({ children }: { children: ReactNode }) {
  const { state, initializationError, retryInitialization } = useDemo();

  if (state === "initializing") {
    return <RepositoryBootstrap />;
  }

  if (state === "error") {
    return (
      <main className="repository-state" id="main-content" tabIndex={-1}>
        <div className="repository-state-card" role="alert">
          <Database aria-hidden="true" />
          <h1>The local workspace did not open</h1>
          <p>
            {initializationError?.message ??
              "Your browser may be blocking local storage for this site."}
          </p>
          <div className="setting-actions" style={{ justifyContent: "center" }}>
            <button
              className="luminous-button-primary"
              type="button"
              onClick={retryInitialization}
            >
              <RefreshCw aria-hidden="true" size={17} />
              Try again
            </button>
            <Link className="luminous-button-secondary" href="/">
              Return to introduction
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return children;
}

interface ReadyShellProps {
  children: ReactNode;
  pathname: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

function ReadyShell({
  children,
  pathname,
  sidebarOpen,
  setSidebarOpen,
}: ReadyShellProps) {
  const { storage, downloadBackup, refreshStorage, resetDemo } = useDemo();
  const personas = usePersonas();
  const activePersona = useActivePersona();
  const dashboard = useDashboard(activePersona.data?.id);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState<"backup" | "reset" | null>(null);
  const [resetError, setResetError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const online = useConnectivityStatus();
  const isDesktop = useDesktopNavigation();
  const navigationVisible = isDesktop || sidebarOpen;
  const openNavigationRef = useRef<HTMLButtonElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const persistenceRequestedRef = useRef(false);

  useEffect(() => {
    if (persistenceRequestedRef.current) return;
    persistenceRequestedRef.current = true;
    void refreshStorage(true).catch(() => {
      // Settings exposes the status and lets the user retry explicitly.
    });
  }, [refreshStorage]);

  useEffect(() => {
    if (!sidebarOpen || isDesktop) return undefined;
    const returnFocus = openNavigationRef.current;
    closeNavigationRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus();
    };
  }, [isDesktop, setSidebarOpen, sidebarOpen]);

  useEffect(() => {
    if (!announcement) return undefined;
    const timeout = window.setTimeout(() => setAnnouncement(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [announcement]);

  const switchPersona = useCallback(
    async (actorId: string) => {
      try {
        setAnnouncement("Switching demo perspective…");
        await curriculumRepository.setActivePersona(actorId);
        setAnnouncement(
          `Demo perspective changed to ${
            personas.data.find((persona) => persona.id === actorId)?.fullName ??
            "the selected role"
          }.`,
        );
      } catch (error) {
        setAnnouncement(
          error instanceof Error
            ? `Role change failed: ${error.message}`
            : "Role change failed.",
        );
      }
    },
    [personas.data],
  );

  const reset = useCallback(
    async (withBackup: boolean) => {
      setResetBusy(withBackup ? "backup" : "reset");
      setResetError("");
      try {
        if (!(await flushPendingWork())) {
          throw new Error(
            "An open editor could not save. Retry its save or export the unsaved draft before resetting.",
          );
        }
        if (withBackup) await downloadBackup();
        await resetDemo();
        clearAllCourseDraftRecoveries();
        setResetOpen(false);
        setAnnouncement(
          withBackup
            ? "Backup downloaded. The sample catalog has been reset."
            : "The sample catalog has been reset.",
        );
      } catch (error) {
        setResetError(
          error instanceof Error ? error.message : "The demo could not be reset.",
        );
      } finally {
        setResetBusy(null);
      }
    },
    [downloadBackup, resetDemo],
  );

  const notificationCount = dashboard.data?.unreadNotifications ?? 0;
  const pendingReviewCount = dashboard.data?.pendingReview ?? 0;
  const currentPage =
    PAGE_NAMES[pathname.split("/").filter(Boolean)[0] ?? ""] ?? "Curriculum record";

  return (
    <>
      <aside
        className="app-sidebar"
        data-open={sidebarOpen}
        aria-label="Application navigation"
        aria-hidden={!navigationVisible || resetOpen}
        inert={navigationVisible && !resetOpen ? undefined : true}
      >
        <div className="app-sidebar-brand">
          <BrandMark inverse />
          <button
            ref={closeNavigationRef}
            className="mobile-sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="app-nav" aria-label="Primary">
          {(["Curriculum", "Workflow", "System"] as const).map((section) => (
            <div key={section}>
              <p className="app-sidebar-section-label">{section}</p>
              {NAVIGATION.filter((item) => item.section === section).map((item) => {
                const Icon = item.icon;
                const active = isActiveRoute(pathname, item.href);
                const isApprovals = item.href === "/approvals";
                return (
                  <Link
                    key={item.href}
                    className="app-nav-link"
                    href={`${item.href}/`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {isApprovals && pendingReviewCount > 0 && (
                      <span
                        className="app-nav-count"
                        aria-label={`${pendingReviewCount} pending reviews`}
                      >
                        {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-utility">
          <label htmlFor="demo-role">Demo perspective</label>
          <select
            className="sidebar-role-select"
            id="demo-role"
            value={activePersona.data?.id ?? ""}
            disabled={activePersona.loading || personas.loading}
            onChange={(event) => void switchPersona(event.target.value)}
          >
            {!activePersona.data && <option value="">Loading roles…</option>}
            {personas.data.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {roleLabel(persona.role)}
              </option>
            ))}
          </select>
          <p className="sidebar-demo-note">
            Role switching changes this sample view. It is not authentication or
            authorization.
          </p>
          <button
            className="mt-3 inline-flex min-h-11 w-full items-center justify-start gap-2 border border-white/20 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              setResetOpen(true);
            }}
          >
            <RotateCcw aria-hidden="true" size={16} />
            Reset sample catalog
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className="app-frame"
        aria-hidden={(sidebarOpen && !isDesktop) || resetOpen}
        inert={sidebarOpen && !isDesktop ? true : resetOpen ? true : undefined}
      >
        <header className="app-topbar">
          <button
            ref={openNavigationRef}
            className="mobile-menu-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu aria-hidden="true" />
          </button>
          <div className="topbar-context">
            <p className="topbar-breadcrumb">
              <span>Workspace</span>
              <span aria-hidden="true">/</span>
              <span>{currentPage}</span>
            </p>
          </div>
          <div
            className="topbar-status"
            role="status"
            aria-live="polite"
            aria-label={online ? "Online" : "Offline"}
          >
            <span className="connection-dot" data-online={online} aria-hidden="true" />
            {online ? <Wifi aria-hidden="true" size={16} /> : <WifiOff aria-hidden="true" size={16} />}
            <span>{online ? "Online" : "Offline"}</span>
          </div>
          <ContextualAssistant
            actorId={activePersona.data?.id}
            currentPage={currentPage}
            pathname={pathname}
          />
          <Link
            className="topbar-storage-link"
            href="/settings/#storage"
            title={formatBytes(storage?.usage)}
            aria-label={`Local storage: ${formatBytes(storage?.usage)}`}
          >
            <Database aria-hidden="true" />
            <span>
              {storage?.usage == null
                ? "Local storage"
                : `Local · ${formatBytes(storage.usage)}`}
            </span>
          </Link>
          <Link
            className="topbar-icon-button"
            href="/dashboard/#notifications"
            aria-label={`${notificationCount} unread ${
              notificationCount === 1 ? "notification" : "notifications"
            }`}
          >
            <Bell aria-hidden="true" />
            {notificationCount > 0 && (
              <span className="topbar-notification-count" aria-hidden="true">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </Link>
        </header>

        {!online && (
          <div className="live-banner" role="status" aria-live="polite">
            <WifiOff aria-hidden="true" />
            <p>
              You are offline. Local records remain available; AI actions and
              update checks will wait for a connection.
            </p>
            <div className="banner-actions">
              <Link href="/offline/">Offline details</Link>
            </div>
          </div>
        )}

        <main className="app-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {resetOpen && (
        <ResetDialog
          busy={resetBusy}
          error={resetError}
          onCancel={() => {
            if (!resetBusy) {
              setResetOpen(false);
              setResetError("");
            }
          }}
          onReset={(withBackup) => void reset(withBackup)}
        />
      )}

      {announcement && (
        <div className="toast-region" aria-live="polite" aria-atomic="true">
          <div
            className="toast"
            data-tone={announcement.toLowerCase().includes("failed") ? "error" : "success"}
            role="status"
          >
            {announcement}
          </div>
        </div>
      )}
    </>
  );
}

interface ResetDialogProps {
  busy: "backup" | "reset" | null;
  error: string;
  onCancel: () => void;
  onReset: (withBackup: boolean) => void;
}

function ResetDialog({ busy, error, onCancel, onReset }: ResetDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onCancelRef.current();
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, []);

  return (
    <div className="modal-backdrop">
      <div
        ref={panelRef}
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
      >
        <h2 id="reset-title">Reset the sample catalog?</h2>
        <p id="reset-description">
          This replaces locally edited courses, programs, comments, workflow
          history, and AI conversations with the original sample records. It
          cannot be undone unless you download a backup first.
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
            <FileDown aria-hidden="true" size={17} />
            {busy === "backup" ? "Backing up…" : "Back up, then reset"}
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useDemo();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isPublicLanding = pathname === "/";

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const shellProps = useMemo(
    () => ({ pathname, sidebarOpen, setSidebarOpen }),
    [pathname, sidebarOpen],
  );

  if (isPublicLanding) return children;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {state === "ready" ? (
        <ReadyShell {...shellProps}>{children}</ReadyShell>
      ) : (
        <div className="app-frame" style={{ paddingLeft: 0 }}>
          <RepositoryState>{children}</RepositoryState>
        </div>
      )}
    </div>
  );
}
