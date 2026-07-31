import { readFile } from "node:fs/promises";

import { test, expect } from "./fixtures";
import {
  createDraftCourse,
  expectLocalSaveSettled,
} from "./helpers";

test("@smoke program autosave preserves both editing sections across a reload", async ({
  page,
}) => {
  await page.goto("/programs/new/");
  await expect(
    page.getByRole("heading", { name: "Create a program" }),
  ).toBeVisible();

  await page
    .getByLabel("Program title")
    .fill("Automated Curriculum Certificate");
  await page
    .getByLabel("Award type")
    .selectOption({ label: "Certificate of Achievement" });
  await page.getByLabel("Owning department").selectOption({ index: 1 });
  await page
    .getByLabel("Catalog description")
    .fill("A local-first program used to verify program authoring.");
  await page.getByRole("button", { name: "Create program" }).click();

  await expect(page).toHaveURL(/\/programs\/edit\/\?id=[^&]+$/);
  await expect(
    page.getByRole("heading", { name: "Edit program record" }),
  ).toBeVisible();
  await expect(page.getByLabel("Program title")).toHaveValue(
    "Automated Curriculum Certificate",
  );

  await page
    .getByLabel("Program narrative")
    .fill("This narrative remains in the browser's local program record.");
  await expectLocalSaveSettled(page);

  await page.getByLabel("Add a course").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Course requirements saved.",
    }),
  ).toBeVisible();

  const appliedUnits = page.getByLabel("Applied units").first();
  await appliedUnits.fill("4.25");
  await page
    .getByLabel("Program title")
    .fill("Automated Curriculum Certificate Revised");

  await expectLocalSaveSettled(page);
  await expect(appliedUnits).toHaveValue("4.25");
  await expect(
    page.getByRole("status").filter({
      hasText: "Course requirements saved.",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Program title")).toHaveValue(
    "Automated Curriculum Certificate Revised",
  );
  await expect(page.getByLabel("Program narrative")).toHaveValue(
    "This narrative remains in the browser's local program record.",
  );
  await expect(page.getByLabel("Applied units").first()).toHaveValue("4.25");

  await page.goto("/programs/");
  await page
    .getByLabel("Search programs")
    .fill("Automated Curriculum Certificate Revised");
  await expect(
    page.getByRole("heading", {
      name: "Automated Curriculum Certificate Revised",
    }),
  ).toBeVisible();
});

test("program navigation flushes a pending local edit before leaving", async ({
  page,
}) => {
  await page.goto("/programs/new/");
  await page.getByLabel("Program title").fill("Navigation Flush Initial");
  await page.getByLabel("Owning department").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create program" }).click();
  await expect(page).toHaveURL(/\/programs\/edit\/\?id=[^&]+$/);

  await page
    .getByLabel("Program title")
    .fill("Navigation Flush Persisted");
  await page.getByRole("link", { name: "Back to programs" }).click();

  await expect(page).toHaveURL(/\/programs\/?$/);
  await page
    .getByLabel("Search programs")
    .fill("Navigation Flush Persisted");
  await expect(
    page.getByRole("heading", { name: "Navigation Flush Persisted" }),
  ).toBeVisible();
});

test("@smoke backup captures local edits and reset restores the seed", async ({
  page,
}) => {
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "903",
    title: "Backup Reset Sentinel",
  });

  await page.goto("/settings/");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^calricula-demo-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  expect(path, "The browser must produce a readable backup file.").not.toBeNull();
  if (!path) {
    throw new Error("The browser did not produce a readable backup file.");
  }
  const backup = JSON.parse(await readFile(path, "utf8")) as {
    kind?: unknown;
    schemaVersion?: unknown;
    records?: { courses?: Array<{ title?: unknown }> };
  };
  expect(backup.kind).toBe("calricula-local-backup");
  expect(backup.schemaVersion).toBe(2);
  expect(backup.records?.courses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: "Backup Reset Sentinel" }),
    ]),
  );

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

  await page.goto("/courses/");
  await page.getByLabel("Search courses").fill("Backup Reset Sentinel");
  await expect(
    page.getByRole("heading", { name: "No matching outlines" }),
  ).toBeVisible();
  await page.getByLabel("Search courses").fill("College Algebra");
  await expect(
    page.getByRole("link", { name: "College Algebra" }),
  ).toBeVisible();
});
