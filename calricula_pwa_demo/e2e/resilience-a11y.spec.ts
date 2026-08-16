import { readFile, writeFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  createOfflineTestHarness,
  createDraftCourse,
  expectAxeClean,
  expectLocalSaveSettled,
  switchPersona,
} from "./helpers";

async function waitForServiceWorkerControl(
  page: Page,
  options: { reloadIfNeeded?: boolean } = {},
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          return registrations.length;
        }),
      {
        message:
          "The production app must automatically register its service worker.",
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          return registrations.some(
            (registration) => registration.active !== null,
          );
        }),
      {
        message:
          "The registered service worker must finish installing and activate.",
        timeout: 20_000,
      },
    )
    .toBe(true);

  if (
    options.reloadIfNeeded !== false &&
    !(await page.evaluate(() =>
      Boolean(navigator.serviceWorker.controller),
    ))
  ) {
    await page.reload();
  }

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(navigator.serviceWorker.controller),
        ),
      {
        message:
          "The page must be controlled before testing offline navigation.",
        timeout: 15_000,
      },
    )
    .toBe(true);
}

async function expectNoHorizontalDocumentOverflow(
  page: Page,
): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `The document overflowed horizontally: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("offline users can create, edit, reopen, and reset local curriculum", async ({
  browserName,
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const offline = await createOfflineTestHarness(browserName, context);

  try {
    await page.goto(offline.url("/courses/new/"));
    await expect(
      page.getByRole("heading", { name: "Begin a new course" }),
    ).toBeVisible();
    await waitForServiceWorkerControl(page);

    await offline.disconnect();
    await expect(page.getByRole("status", { name: "Offline" })).toBeVisible();

    await page.getByLabel(/^Subject code/).fill("TEST");
    await page.getByLabel(/^Course number/).fill("921");
    await page
      .getByLabel(/^Official course title/)
      .fill("Offline Lifecycle Draft");
    await page.getByLabel(/^Department/).selectOption({ index: 1 });
    const offlineEditorResponse =
      browserName === "webkit"
        ? page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.startsWith("/courses/edit/") &&
              response.fromServiceWorker(),
          )
        : null;
    await page.getByRole("button", { name: "Create draft" }).click();
    if (offlineEditorResponse) {
      expect(
        (await offlineEditorResponse).fromServiceWorker(),
        "WebKit must load the editor route through the service worker after the origin disappears.",
      ).toBe(true);
    }

    await expect(page).toHaveURL(/\/courses\/edit\/\?id=[^&]+$/);
    await expect(
      page.getByRole("heading", {
        name: /TEST 921.*Offline Lifecycle Draft/i,
      }),
    ).toBeVisible();

    await page
      .getByLabel("Official course title")
      .fill("Offline Lifecycle Updated");
    await page
      .getByLabel("Catalog description")
      .fill("Created and edited without a network connection.");
    await expectLocalSaveSettled(page);

    const reloadResponse = await page.reload();
    if (browserName === "webkit") {
      expect(
        reloadResponse?.fromServiceWorker(),
        "WebKit must reopen the edited record through the service worker.",
      ).toBe(true);
    }
    await expect(
      page.getByRole("status", { name: "Offline" }),
    ).toBeVisible();
    await expect(page.getByLabel("Official course title")).toHaveValue(
      "Offline Lifecycle Updated",
    );
    await expect(page.getByLabel("Catalog description")).toHaveValue(
      "Created and edited without a network connection.",
    );

    await page.goto(offline.url("/settings/"));
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Backup, restore, and reset" })
      .getByRole("button", { name: "Reset sample catalog" })
      .click();
    const resetDialog = page.getByRole("alertdialog", {
      name: "Reset the sample catalog?",
    });
    await expect(resetDialog).toBeVisible();
    await resetDialog
      .getByRole("button", { name: "Reset without backup" })
      .click();
    await expect(page.getByText("Sample catalog reset.")).toBeVisible();

    await page.goto(offline.url("/courses/"));
    await page
      .getByLabel("Search courses")
      .fill("Offline Lifecycle Updated");
    await expect(
      page.getByRole("heading", { name: "No matching outlines" }),
    ).toBeVisible();
    await page.getByLabel("Search courses").fill("College Algebra");
    await expect(
      page.getByRole("link", { name: "College Algebra" }),
    ).toBeVisible();
  } finally {
    await offline.dispose();
  }
});

test("the install surface is backed by a complete manifest and invokes the browser prompt", async ({
  page,
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = (await manifestResponse.json()) as {
    id?: unknown;
    name?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    scope?: unknown;
    display?: unknown;
    icons?: Array<{
      src?: unknown;
      sizes?: unknown;
      type?: unknown;
      purpose?: unknown;
    }>;
  };
  expect(manifest).toMatchObject({
    id: "/dashboard/",
    name: "Calricula Curriculum Demo",
    short_name: "Calricula",
    start_url: "/dashboard/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        purpose: "maskable",
      }),
    ]),
  );

  await page.goto("/settings/#install");
  await expect(
    page.getByRole("heading", { name: "Install Calricula" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );

  await page.evaluate(() => {
    const target = window as Window & {
      __calriculaInstallPromptCalls?: number;
    };
    target.__calriculaInstallPromptCalls = 0;
    const event = new Event("beforeinstallprompt", {
      cancelable: true,
    });
    Object.defineProperties(event, {
      prompt: {
        value: () => {
          target.__calriculaInstallPromptCalls =
            (target.__calriculaInstallPromptCalls ?? 0) + 1;
          return Promise.resolve();
        },
      },
      userChoice: {
        value: Promise.resolve({
          outcome: "dismissed",
          platform: "test",
        }),
      },
    });
    window.dispatchEvent(event);
  });

  await page.getByRole("button", { name: "Install Calricula" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __calriculaInstallPromptCalls?: number;
            }
          ).__calriculaInstallPromptCalls ?? 0,
      ),
    )
    .toBe(1);
});

test("course draft recovery restores and then persists an immediate-reload edit", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "922",
    title: "Update Preservation",
  });

  const title = page.getByLabel("Official course title");
  await title.fill("Update Preservation — Unsaved Sentinel");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saving…$/ }),
  ).toBeVisible();

  await page.reload();
  await expect(title).toHaveValue(
    "Update Preservation — Unsaved Sentinel",
  );
  await expect(
    page.getByRole("status").filter({
      hasText: /^(Saved|No unsaved changes)$/,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(title).toHaveValue(
    "Update Preservation — Unsaved Sentinel",
  );
});

test("service-worker update checks preserve a pending editor change", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);

  const mutatesLocalWorker =
    !process.env.PLAYWRIGHT_BASE_URL &&
    testInfo.project.name === "chromium";
  if (!mutatesLocalWorker) {
    await createDraftCourse(page, {
      subjectCode: "TEST",
      courseNumber: "927",
      title: "Deployed Update Preservation",
    });
    await waitForServiceWorkerControl(page, { reloadIfNeeded: false });
    const title = page.getByLabel("Official course title");
    await title.fill("Deployed Update — Pending Edit");
    await expect(
      page.getByRole("status").filter({ hasText: /^Saving…$/ }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const registration =
        await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) {
        throw new Error(
          "No active service worker was available to check for an update.",
        );
      }
      await registration.update();
    });
    await page.reload();
    await expect(title).toHaveValue(
      "Deployed Update — Pending Edit",
    );
    return;
  }

  const serviceWorkerPath = new URL("../out/sw.js", import.meta.url);
  const activeWorkerSource = await readFile(serviceWorkerPath, "utf8");
  const updateMarker = "calricula-e2e-waiting-update";
  const updatedWorkerSource = `${activeWorkerSource}\n/* ${updateMarker} */\n`;

  try {
    await createDraftCourse(page, {
      subjectCode: "TEST",
      courseNumber: "927",
      title: "Waiting Update Preservation",
    });
    await waitForServiceWorkerControl(page, { reloadIfNeeded: false });
    // Start a controlled document before checking for the next worker. Workbox
    // correctly classifies `controlling` as an update only when a controller
    // already exists at registration time.
    await page.goto(page.url());
    await expect(
      page.getByRole("heading", {
        name: /TEST 927.*Waiting Update Preservation/i,
      }),
    ).toBeVisible();
    await waitForServiceWorkerControl(page, { reloadIfNeeded: false });

    await writeFile(serviceWorkerPath, updatedWorkerSource, "utf8");
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `/sw.js?update-probe=${Date.now()}`,
          );
          return response.ok() ? response.text() : "";
        },
        {
          message:
            "Wrangler must serve the changed worker before the browser checks for an update.",
          timeout: 15_000,
        },
      )
      .toContain(updateMarker);

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) {
        throw new Error("No active service worker was available to update.");
      }
      await registration.update();
    });

    const updatePrompt = page.getByRole("status").filter({
      hasText: "Calricula update available",
    });
    await expect(updatePrompt).toBeVisible();

    const title = page.getByLabel("Official course title");
    await title.fill("Waiting Update — Pending Edit");
    await expect(
      page.getByRole("status").filter({ hasText: /^Saving…$/ }),
    ).toBeVisible();

    const reloaded = page.waitForEvent("load", { timeout: 20_000 });
    await updatePrompt.getByRole("button", { name: "Update now" }).click();
    await reloaded;

    await expect(page).toHaveURL(/\/courses\/edit\/\?id=[^&]+$/);
    await expect(page.getByLabel("Official course title")).toHaveValue(
      "Waiting Update — Pending Edit",
    );
    await expect(
      page.getByText("Calricula update available"),
    ).toHaveCount(0);
  } finally {
    await writeFile(serviceWorkerPath, activeWorkerSource, "utf8");
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `/sw.js?restore-probe=${Date.now()}`,
          );
          return response.ok() ? response.text() : updateMarker;
        },
        {
          message:
            "The local worker fixture must be restored after the update test.",
          timeout: 15_000,
        },
      )
      .not.toContain(updateMarker);
  }
});

test("editor, AI disclosure and AI error states remain WCAG A/AA clean", async ({
  page,
}) => {
  await page.route(
    "https://challenges.cloudflare.com/turnstile/**",
    (route) => route.abort(),
  );
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "923",
    title: "Accessible Transient States",
  });

  await expect(
    page.getByRole("heading", {
      name: "Before this record leaves your browser",
    }),
  ).toBeVisible();
  await expectAxeClean(page);

  await page
    .getByRole("button", { name: "Continue to verification" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        /AI verification is not configured|Browser verification could not load/,
    }),
  ).toBeVisible();
  await expectAxeClean(page);

  await page.goto("/settings/");
  await page
    .getByRole("region", { name: "Backup, restore, and reset" })
    .getByRole("button", { name: "Reset sample catalog" })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "Reset the sample catalog?",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await expectAxeClean(page);
});

test("approval review and confirmation states remain keyboard-usable and WCAG clean", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "924",
    title: "Accessible Approval Decision",
  });
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/courses\/view\/\?id=[^&]+$/);

  await switchPersona(page, "Department chair", "Demo Curriculum Chair");
  await page.goto("/approvals/");
  await expect(
    page.getByRole("heading", { name: "Approval docket" }),
  ).toBeVisible();

  const assignedCourse = page
    .getByTestId("approval-card")
    .filter({ hasText: "Accessible Approval Decision" });
  await assignedCourse.focus();
  await expect(assignedCourse).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: /TEST 924.*Accessible Approval Decision/i,
    }),
  ).toBeVisible();
  await expectAxeClean(page);

  await page
    .getByRole("button", { name: "Return to faculty draft" })
    .click();
  const confirm = page.getByRole("group", {
    name: "Confirm workflow decision",
  });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole("button", { name: "Confirm decision" }),
  ).toBeDisabled();
  await page
    .getByLabel("Review note (required for return)")
    .fill("Please clarify the catalog description before resubmission.");
  await expect(
    confirm.getByRole("button", { name: "Confirm decision" }),
  ).toBeEnabled();
  await expectAxeClean(page);
});

test("keyboard navigation, reduced motion, and the local-workspace error state are explicit", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "925",
    title: "Keyboard and Motion",
  });

  await page.goto(page.url());
  await expect(
    page.getByRole("heading", { name: /TEST 925.*Keyboard and Motion/i }),
  ).toBeVisible();
  // WebKit follows Safari's default macOS preference: Option+Tab traverses
  // links, while Tab alone advances to form controls.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const skipLink = page.getByRole("link", {
    name: "Skip to main content",
  });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const basicsTab = page.getByRole("tab", { name: "Basics" });
  await basicsTab.focus();
  await page.keyboard.press("ArrowRight");
  const outcomesTab = page.getByRole("tab", { name: "SLOs" });
  await expect(outcomesTab).toBeFocused();
  await expect(outcomesTab).toHaveAttribute("aria-selected", "true");

  const motion = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>(
      ".luminous-button-primary",
    );
    if (!button) throw new Error("No primary action was available.");
    const style = getComputedStyle(button);
    const toMilliseconds = (value: string) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .map((entry) =>
          entry.endsWith("ms")
            ? Number.parseFloat(entry)
            : Number.parseFloat(entry) * 1000,
        );
    return {
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      maximumTransitionMilliseconds: Math.max(
        ...toMilliseconds(style.transitionDuration),
      ),
    };
  });
  expect(motion.reduced).toBe(true);
  expect(motion.maximumTransitionMilliseconds).toBeLessThanOrEqual(
    0.02,
  );

  const errorPage = await page.context().newPage();
  await errorPage.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  await errorPage.goto("/dashboard/");
  await expect(
    errorPage.getByRole("heading", {
      name: "The local workspace did not open",
    }),
  ).toBeVisible();
  await expectAxeClean(errorPage);
  await errorPage.close();
});

test("400% zoom plus mobile portrait and landscape preserve reflow, navigation, and touch targets", async ({
  page,
}) => {
  // A 320 CSS-pixel layout viewport is the reflow equivalent of a
  // 1280-pixel-wide desktop browser at 400% page zoom.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/settings/");
  await expect(
    page.getByRole("heading", { name: "Settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Backup, restore, and reset" }),
  ).toBeVisible();
  await expectNoHorizontalDocumentOverflow(page);

  // Phone portrait.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/");
  await expect(
    page.getByRole("heading", { name: /^Curriculum desk\.$/ }),
  ).toBeVisible();
  await expectNoHorizontalDocumentOverflow(page);

  const openNavigation = page.getByRole("button", {
    name: "Open navigation",
  });
  const menuBox = await openNavigation.boundingBox();
  expect(menuBox, "The mobile menu control must have a rendered box.").not.toBeNull();
  expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await openNavigation.click();
  const closeNavigation = page
    .getByRole("complementary", { name: "Application navigation" })
    .getByRole("button", {
      name: "Close navigation",
      exact: true,
    });
  await expect(closeNavigation).toBeVisible();
  await expect(closeNavigation).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(openNavigation).toBeFocused();

  // Phone landscape remains below the app's desktop-navigation breakpoint.
  await page.setViewportSize({ width: 844, height: 390 });
  await expectNoHorizontalDocumentOverflow(page);
  const landscapeNavigation = page.getByRole("button", {
    name: "Open navigation",
  });
  await expect(landscapeNavigation).toBeVisible();
  const landscapeMenuBox = await landscapeNavigation.boundingBox();
  expect(
    landscapeMenuBox,
    "The landscape menu control must have a rendered box.",
  ).not.toBeNull();
  expect(landscapeMenuBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(landscapeMenuBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/courses/new/");
  await page.getByLabel(/^Subject code/).fill("TEST");
  await page.getByLabel(/^Course number/).fill("926");
  await page
    .getByLabel(/^Official course title/)
    .fill("Mobile Editor Reflow");
  await page.getByLabel(/^Department/).selectOption({ index: 1 });
  const unrelatedUpdatePrompt = page.getByRole("status").filter({
    hasText: "Calricula update available",
  });
  if (await unrelatedUpdatePrompt.isVisible()) {
    await unrelatedUpdatePrompt.getByRole("button", { name: "Later" }).click();
  }
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByLabel("Editor section", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalDocumentOverflow(page);
});
