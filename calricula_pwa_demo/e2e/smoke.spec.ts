import { test, expect } from "./fixtures";
import {
  createDraftCourse,
  expectAxeClean,
  expectLocalSaveSettled,
} from "./helpers";

test("@smoke landing opens the seeded demo without an account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /From first draft to record\./i }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No account is required. Your first visit creates sample curriculum records in this browser so you can explore immediately.",
    ),
  ).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole("link", { name: "Try it now" }).first().click();

  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(
    page.getByRole("heading", { name: /^Curriculum desk\.$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse outlines" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /log in/i })).toHaveCount(0);
});

test("@smoke a direct course route initializes deterministic sample data", async ({
  page,
}) => {
  await page.goto("/courses/");
  await expect(
    page.getByRole("heading", { name: "Course Outlines of Record" }),
  ).toBeVisible();

  await page.getByLabel("Search courses").fill("College Algebra");
  const seededCourse = page.getByRole("link", { name: "College Algebra" });
  await expect(seededCourse).toBeVisible();
  await seededCourse.click();

  await expect(page).toHaveURL(/\/courses\/view\/\?id=[^&]+$/);
  await expect(
    page.getByRole("heading", { name: /MATH 101.*College Algebra/i }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: /MATH 101.*College Algebra/i }),
  ).toBeVisible();
});

test("@smoke course CRUD persists locally and deletion is explicit", async ({
  page,
}) => {
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "901",
    title: "Automated Persistence",
  });

  await page
    .getByLabel("Official course title")
    .fill("Automated Persistence Updated");
  await page
    .getByLabel("Catalog description")
    .fill("A locally persisted course created by the release browser test.");
  await expectLocalSaveSettled(page);

  await page.reload();
  await expect(page.getByLabel("Official course title")).toHaveValue(
    "Automated Persistence Updated",
  );
  await expect(page.getByLabel("Catalog description")).toHaveValue(
    "A locally persisted course created by the release browser test.",
  );

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(
    page.getByRole("heading", {
      name: /TEST 901.*Automated Persistence Updated/i,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete draft course?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete draft" }).click();

  await expect(page).toHaveURL(/\/courses\/?$/);
  await page.getByLabel("Search courses").fill("Automated Persistence Updated");
  await expect(
    page.getByRole("heading", { name: "No matching outlines" }),
  ).toBeVisible();
});

test("@smoke a draft advances into department review", async ({ page }) => {
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "902",
    title: "Workflow Verification",
  });

  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page).toHaveURL(/\/courses\/view\/\?id=[^&]+$/);
  await expect(
    page.getByRole("heading", {
      name: /TEST 902.*Workflow Verification/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Department Review").first()).toBeVisible();
  await expect(
    page.getByText("Current stage").first(),
  ).toBeVisible();
});
