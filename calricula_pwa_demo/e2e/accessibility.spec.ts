import { test, expect } from "./fixtures";
import { expectAxeClean } from "./helpers";

const ROUTES = [
  ["/", /From first draft to record\./i],
  ["/dashboard/", /^Curriculum desk\.$/],
  ["/courses/", /^Course Outlines of Record$/],
  ["/programs/", /^Programs$/],
  ["/settings/", /^Settings$/],
  ["/offline/", /^Offline use$/],
] as const;

for (const [route, heading] of ROUTES) {
  test(`WCAG 2.2 A/AA scan passes for ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    await expectAxeClean(page);
  });
}
