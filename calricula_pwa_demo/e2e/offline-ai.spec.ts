import { test, expect } from "./fixtures";
import {
  createOfflineTestHarness,
  createDraftCourse,
  expectLocalSaveSettled,
} from "./helpers";

test("the service worker reloads a local course route while offline", async ({
  browserName,
  context,
  page,
}) => {
  test.setTimeout(60_000);
  const offline = await createOfflineTestHarness(browserName, context);
  const failedRequests: string[] = [];
  context.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown failure"})`,
    );
  });
  try {
    await page.goto(offline.url("/courses/"));
    await expect(
      page.getByRole("heading", { name: "Course Outlines of Record" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "College Algebra" }),
    ).toBeVisible();

    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
      undefined,
      { timeout: 10_000 },
    );
    const serviceWorkerState = await page.evaluate(async () => {
      const automatic = await navigator.serviceWorker.getRegistrations();
      return {
        automaticCount: automatic.length,
        automaticStates: automatic.map(
          (registration) =>
            registration.active?.state ??
            registration.installing?.state ??
            registration.waiting?.state ??
            "registered",
        ),
        secureContext: window.isSecureContext,
      };
    });
    expect(
      serviceWorkerState.automaticCount,
      `Calricula did not register its service worker: ${JSON.stringify(serviceWorkerState)}`,
    ).toBeGreaterThan(0);
    try {
      await page.waitForFunction(
        async () => {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          return registrations.some(
            (registration) => registration.active?.state === "activated",
          );
        },
        undefined,
        { timeout: 20_000 },
      );
    } catch {
      const stalledState = await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const cacheNames = await caches.keys();
        return {
          cacheNames,
          registrations: registrations.map((registration) => ({
            active: registration.active?.state ?? null,
            installing: registration.installing?.state ?? null,
            scope: registration.scope,
            waiting: registration.waiting?.state ?? null,
          })),
        };
      });
      throw new Error(
        [
          "Calricula registered its service worker, but installation did not activate within 20 seconds.",
          `State: ${JSON.stringify(stalledState)}`,
          `Failed requests: ${JSON.stringify(failedRequests.slice(-20))}`,
        ].join("\n"),
      );
    }
    try {
      await page.waitForFunction(
        () => Boolean(navigator.serviceWorker.controller),
        undefined,
        { timeout: 10_000 },
      );
    } catch {
      const uncontrolledState = await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return {
          controller: navigator.serviceWorker.controller?.state ?? null,
          href: window.location.href,
          registrations: registrations.map((registration) => ({
            active: registration.active?.state ?? null,
            installing: registration.installing?.state ?? null,
            scope: registration.scope,
            waiting: registration.waiting?.state ?? null,
          })),
        };
      });
      throw new Error(
        `The activated service worker did not claim the open app: ${JSON.stringify(uncontrolledState)}`,
      );
    }

    await offline.disconnect();
    const reloadResponse = await page.reload();
    if (browserName === "webkit") {
      expect(
        reloadResponse?.fromServiceWorker(),
        "WebKit must reload the route from the service worker after the origin disappears.",
      ).toBe(true);
    }
    await expect(
      page.getByRole("heading", { name: "Course Outlines of Record" }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: "Offline" })).toBeVisible();
    await expect(
      page.getByText(
        "You are offline. Local records remain available; AI actions and update checks will wait for a connection.",
      ),
    ).toBeVisible();

    await page.getByLabel("Search courses").fill("College Algebra");
    await expect(
      page.getByRole("link", { name: "College Algebra" }),
    ).toBeVisible();
  } finally {
    await offline.dispose();
  }
});

test("@smoke AI has an explicit disabled-verification state", async ({ page }) => {
  // Keep this UI-state test deterministic on both the AI-disabled local
  // Worker and the AI-enabled deployed release. The credentialed release
  // canary separately proves the live enabled path.
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store, max-age=0" },
      body: JSON.stringify({
        success: true,
        data: { status: "ok", aiEnabled: false },
      }),
    });
  });
  await page.route(
    "https://challenges.cloudflare.com/turnstile/**",
    (route) => route.abort(),
  );
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "904",
    title: "AI Boundary Verification",
  });

  await expect(
    page.getByRole("heading", {
      name: "Before this record leaves your browser",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to verification" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Verify this browser" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        /AI verification is not configured|Browser verification could not load/,
    }),
  ).toBeVisible();
});

test("a mocked Worker suggestion stays reviewable until Apply", async ({
  page,
}) => {
  const suggestion =
    "Examines local-first curriculum authoring through guided, faculty-reviewed practice.";
  const observedBodyKey = "calricula.e2e.ai-observed-body";

  await page.addInitScript(({ bodyKey, mockedSuggestion }) => {
    window.sessionStorage.setItem("calricula.ai-session-ready.v1", "true");

    // An active service worker can satisfy a request before Playwright's
    // network routing sees it, especially in WebKit. Mock the browser fetch
    // boundary for this UI contract; the release canary covers the real Worker.
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url,
        window.location.href,
      );
      if (url.pathname !== "/api/ai/catalog-description") {
        return nativeFetch(input, init);
      }

      const rawBody =
        typeof init?.body === "string"
          ? init.body
          : input instanceof Request
            ? await input.clone().text()
            : "";
      window.sessionStorage.setItem(bodyKey, rawBody);
      return new Response(
        JSON.stringify({
          success: true,
          data: { description: mockedSuggestion },
          model: "test/free-model:free",
          requestId: "request-e2e-ai-0001",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };
  }, { bodyKey: observedBodyKey, mockedSuggestion: suggestion });

  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "905",
    title: "AI Suggestion Verification",
  });

  await expect(
    page.getByRole("heading", { name: "Draft a catalog description" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate suggestion" })
    .click();

  await expect(page.getByText(suggestion)).toBeVisible();
  const catalogDescription = page.getByRole("textbox", {
    name: "Catalog description",
  });
  await expect(catalogDescription).not.toHaveValue(suggestion);
  const observedBody = await page.evaluate((key) => {
    const value = window.sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, observedBodyKey);
  expect(observedBody).toMatchObject({
    input: {
      subjectCode: "TEST",
      courseNumber: "905",
      title: "AI Suggestion Verification",
    },
  });

  await page.getByRole("button", { name: "Apply suggestion" }).click();
  await expect(catalogDescription).toHaveValue(suggestion);
  await expect(
    page.getByRole("button", { name: "Applied to draft" }),
  ).toBeDisabled();
  await expectLocalSaveSettled(page);
});
