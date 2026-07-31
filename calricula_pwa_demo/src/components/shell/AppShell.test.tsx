import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shellState = vi.hoisted(() => ({
  pathname: "/dashboard",
  setActivePersona: vi.fn(),
  useActivePersona: vi.fn(),
  useDashboard: vi.fn(),
  useDemo: vi.fn(),
  usePersonas: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => shellState.pathname,
}));

vi.mock("@/lib/data", () => ({
  curriculumRepository: {
    setActivePersona: shellState.setActivePersona,
  },
  useActivePersona: shellState.useActivePersona,
  useDashboard: shellState.useDashboard,
  usePersonas: shellState.usePersonas,
}));

vi.mock("./DemoProvider", () => ({
  useDemo: shellState.useDemo,
}));

import { AppShell } from "./AppShell";

const faculty = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Dr. Demo Faculty",
  role: "faculty",
};
const chair = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Demo Chair",
  role: "chair",
};

function queryState<T>(data: T) {
  return {
    data,
    error: null,
    loading: false,
    refresh: vi.fn(),
  };
}

function desktopMediaQuery() {
  return {
    matches: true,
    media: "(min-width: 64.001rem)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

function mobileMediaQuery() {
  return {
    ...desktopMediaQuery(),
    matches: false,
  } as MediaQueryList;
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("AppShell", () => {
  const retryInitialization = vi.fn();
  const downloadBackup = vi.fn();
  const refreshStorage = vi.fn();
  const resetDemo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    shellState.pathname = "/dashboard";
    shellState.setActivePersona.mockResolvedValue(chair);
    shellState.useActivePersona.mockReturnValue(queryState(faculty));
    shellState.usePersonas.mockReturnValue(queryState([faculty, chair]));
    shellState.useDashboard.mockReturnValue(
      queryState({
        myDrafts: 1,
        pendingReview: 4,
        recentlyApproved: 2,
        unreadNotifications: 3,
        coursesByStatus: [],
        recentActivity: [],
      }),
    );
    downloadBackup.mockResolvedValue(undefined);
    refreshStorage.mockResolvedValue({
      supported: true,
      persisted: false,
      persistenceRequested: true,
      usage: 2 * 1024 * 1024,
      quota: 100 * 1024 * 1024,
      usageRatio: 0.02,
      warning: "none",
    });
    resetDemo.mockResolvedValue({
      seeded: true,
      migrated: false,
      schemaVersion: 1,
      seedVersion: "test",
    });
    shellState.useDemo.mockReturnValue({
      state: "ready",
      initializationError: null,
      storage: {
        usage: 2 * 1024 * 1024,
      },
      retryInitialization,
      downloadBackup,
      refreshStorage,
      resetDemo,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => desktopMediaQuery()),
    });
    setOnline(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("calricula-online", { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps the public landing outside the application chrome", () => {
    shellState.pathname = "/";
    render(
      <AppShell>
        <h1>Public introduction</h1>
      </AppShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Public introduction" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });

  it("renders explicit initialization and retry states", async () => {
    shellState.useDemo.mockReturnValue({
      state: "initializing",
      initializationError: null,
      retryInitialization,
    });
    const view = render(
      <AppShell>
        <p>Private content</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("status", {
        name: "Preparing the local curriculum workspace",
      }),
    ).toHaveTextContent("Preparing your local catalog");
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();

    shellState.useDemo.mockReturnValue({
      state: "error",
      initializationError: new Error("IndexedDB is blocked."),
      retryInitialization,
    });
    view.rerender(
      <AppShell>
        <p>Private content</p>
      </AppShell>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "IndexedDB is blocked.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryInitialization).toHaveBeenCalledOnce();
  });

  it("exposes current navigation, local status, and offline continuity", async () => {
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    const dashboard = await screen.findByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByLabelText("4 pending reviews"),
    ).toHaveTextContent("4");
    expect(
      screen.getByRole("link", { name: "3 unread notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Local storage: 2.0 MB used" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: "Open contextual AI assistant",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Online" })).toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status", { name: "Offline" })).toBeInTheDocument();
    expect(
      screen.getByText(/Local records remain available/i),
    ).toBeInTheDocument();
  });

  it("returns mobile navigation focus to its opener after Escape", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mobileMediaQuery()),
    });
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    const openNavigation = await screen.findByRole("button", {
      name: "Open navigation",
    });
    fireEvent.click(openNavigation);
    const navigation = screen.getByRole("complementary", {
      name: "Application navigation",
    });
    await waitFor(() =>
      expect(
        within(navigation).getByRole("button", {
          name: "Close navigation",
        }),
      ).toHaveFocus(),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(openNavigation).toHaveFocus());
  });

  it("switches demo perspective without implying authentication", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    const select = await screen.findByLabelText("Demo perspective");
    expect(
      screen.getByText(/It is not authentication or authorization/i),
    ).toBeInTheDocument();
    await user.selectOptions(select, chair.id);

    expect(shellState.setActivePersona).toHaveBeenCalledWith(chair.id);
    expect(
      await screen.findByText("Demo perspective changed to Demo Chair."),
    ).toHaveTextContent("Demo perspective changed to Demo Chair.");
  });

  it("announces a failed perspective switch without changing authorization", async () => {
    const user = userEvent.setup();
    shellState.setActivePersona.mockRejectedValueOnce(
      new Error("The local role could not be changed."),
    );
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    await user.selectOptions(
      await screen.findByLabelText("Demo perspective"),
      chair.id,
    );
    expect(
      await screen.findByText(
        "Role change failed: The local role could not be changed.",
      ),
    ).toBeInTheDocument();
  });

  it("confirms reset and preserves the backup-before-reset ordering", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "calricula.course-draft-recovery.v1:course-1",
      "stale draft",
    );
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Reset sample catalog" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Reset the sample catalog?" }),
    ).toBeInTheDocument();
    expect(resetDemo).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Back up, then reset" }),
    );
    await waitFor(() => expect(resetDemo).toHaveBeenCalledOnce());
    expect(downloadBackup).toHaveBeenCalledOnce();
    expect(downloadBackup.mock.invocationCallOrder[0]).toBeLessThan(
      resetDemo.mock.invocationCallOrder[0],
    );
    expect(
      await screen.findByText(
        "Backup downloaded. The sample catalog has been reset.",
      ),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem(
        "calricula.course-draft-recovery.v1:course-1",
      ),
    ).toBeNull();
  });

  it("keeps reset errors inside the active confirmation", async () => {
    const user = userEvent.setup();
    resetDemo.mockRejectedValueOnce(new Error("Reset storage is unavailable."));
    render(
      <AppShell>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Reset sample catalog" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Reset without backup" }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Reset the sample catalog?",
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Reset storage is unavailable.",
    );
  });
});
