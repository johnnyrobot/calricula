import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { startStaticExportServer } from "../scripts/serve-static-export.mjs";

const LEGACY_BACKEND_PORTS = new Set(["8000", "8001", "5433"]);
const FORBIDDEN_REMOTE_HOSTS = [
  /(^|\.)openrouter\.ai$/i,
  /(^|\.)firebaseio\.com$/i,
  /(^|\.)firebaseapp\.com$/i,
  /(^|\.)googleapis\.com$/i,
  /(^|\.)identitytoolkit\.googleapis\.com$/i,
  /(^|\.)securetoken\.googleapis\.com$/i,
];

export interface LegacyNetworkGuard {
  readonly violations: readonly string[];
  assertClean(): void;
}

export interface OfflineTestHarness {
  disconnect(): Promise<void>;
  dispose(): Promise<void>;
  url(pathname: string): string;
}

export async function createOfflineTestHarness(
  browserName: "chromium" | "firefox" | "webkit",
  context: BrowserContext,
): Promise<OfflineTestHarness> {
  if (browserName !== "webkit") {
    let offline = false;
    return {
      async disconnect() {
        await context.setOffline(true);
        offline = true;
      },
      async dispose() {
        if (offline) await context.setOffline(false);
      },
      url(pathname) {
        return pathname;
      },
    };
  }

  // Playwright's WebKit offline emulation aborts service-worker navigations
  // internally. A private ephemeral origin exercises the real PWA failure
  // mode: the origin disappears while its service worker and IndexedDB remain.
  const server = await startStaticExportServer(0);
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The WebKit offline origin did not bind a TCP port.");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  let closed = false;

  const closeOrigin = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  };

  return {
    disconnect: closeOrigin,
    dispose: closeOrigin,
    url(pathname) {
      return new URL(pathname, `${origin}/`).href;
    },
  };
}

function forbiddenRequestReason(rawUrl: string): string | null {
  const url = new URL(rawUrl);

  if (
    LEGACY_BACKEND_PORTS.has(url.port) &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    return "legacy backend/database port";
  }

  if (FORBIDDEN_REMOTE_HOSTS.some((pattern) => pattern.test(url.hostname))) {
    return "direct remote provider request";
  }

  if (
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/api/ai/") &&
    url.pathname !== "/api/health"
  ) {
    return "legacy same-origin API request";
  }

  return null;
}

export function attachLegacyNetworkGuard(page: Page): LegacyNetworkGuard {
  const violations: string[] = [];

  page.on("request", (request) => {
    const reason = forbiddenRequestReason(request.url());
    if (reason) {
      const url = new URL(request.url());
      violations.push(
        `${request.method()} ${url.origin}${url.pathname} (${reason})`,
      );
    }
  });

  return {
    violations,
    assertClean() {
      expect(
        violations,
        [
          "The local-first demo contacted a forbidden legacy or direct-provider endpoint.",
          ...violations,
        ].join("\n"),
      ).toEqual([]);
    },
  };
}

export async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
    ])
    .analyze();

  const summary = results.violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target.map(String))
        .join(", ");
      return `${violation.id}: ${violation.help} [${targets}]`;
    })
    .join("\n");

  expect(
    results.violations,
    summary || "Expected no WCAG A/AA violations.",
  ).toEqual([]);
}

export async function expectLocalSaveSettled(page: Page): Promise<void> {
  await expect(
    page.getByRole("status").filter({
      hasText: /^(Saved|No unsaved changes)$/,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Switches demo persona and waits for the switch to actually land.
 *
 * `setActivePersona` is an asynchronous IndexedDB write. Selecting the option
 * only *starts* it, so navigating straight afterwards can load the next route
 * under the previous persona — which shows the wrong approval docket and leaves
 * a test waiting for a card that will never appear. `AppShell` announces
 * completion in a live region; waiting for that announcement, and for the
 * select to actually reflect the choice, is the condition that makes the switch
 * observable rather than assumed.
 */
export async function switchPersona(
  page: Page,
  optionLabel: string,
  actorName: string,
): Promise<void> {
  const perspective = page.getByLabel("Demo perspective");
  await perspective.selectOption({ label: optionLabel });
  await expect(
    page.getByRole("status").filter({
      hasText: `Demo perspective changed to ${actorName}.`,
    }),
  ).toBeVisible();
  await expect(perspective.locator("option:checked")).toHaveText(optionLabel);
}

export async function selectEditorSection(
  page: Page,
  section: string,
): Promise<void> {
  const responsiveSelect = page.getByLabel("Editor section", {
    exact: true,
  });
  if (await responsiveSelect.isVisible()) {
    await responsiveSelect.selectOption({ label: section });
    return;
  }
  await page.getByRole("tab", { name: section }).click();
}

export interface DraftCourseInput {
  subjectCode: string;
  courseNumber: string;
  title: string;
}

export async function createDraftCourse(
  page: Page,
  input: DraftCourseInput,
): Promise<string> {
  await page.goto("/courses/new/");
  await expect(
    page.getByRole("heading", { name: "Begin a new course" }),
  ).toBeVisible();

  await page.getByLabel(/^Subject code/).fill(input.subjectCode);
  await page.getByLabel(/^Course number/).fill(input.courseNumber);
  await page.getByLabel(/^Official course title/).fill(input.title);
  await page.getByLabel(/^Department/).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/courses\/edit\/\?id=[^&]+$/);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(
        `${input.subjectCode}\\s+${input.courseNumber}.*${input.title}`,
        "i",
      ),
    }),
  ).toBeVisible();

  const id = new URL(page.url()).searchParams.get("id");
  expect(id, "A newly created draft must have a route ID.").toBeTruthy();
  if (!id) {
    throw new Error("A newly created draft did not have a route ID.");
  }
  return id;
}
