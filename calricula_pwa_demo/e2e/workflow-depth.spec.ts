import { test, expect } from "./fixtures";
import {
  attachLegacyNetworkGuard,
  createDraftCourse,
  expectLocalSaveSettled,
  selectEditorSection,
} from "./helpers";

async function switchPerspective(
  page: import("@playwright/test").Page,
  optionLabel: string,
  actorName: string,
) {
  const perspective = page.getByLabel("Demo perspective");
  await perspective.selectOption({ label: optionLabel });
  await expect(
    page.getByRole("status").filter({
      hasText: `Demo perspective changed to ${actorName}.`,
    }),
  ).toBeVisible();
  await expect(perspective.locator("option:checked")).toHaveText(optionLabel);
}

async function chooseApprovalRecord(
  page: import("@playwright/test").Page,
  title: string,
  status: string,
) {
  const card = page.getByTestId("approval-card").filter({ hasText: title });
  await expect(card).toContainText(status);
  await card.click();
  await expect(page.getByTestId("review-course")).toContainText(title);
  return card;
}

async function confirmApproval(
  page: import("@playwright/test").Page,
  actionName: string,
  targetStatus: string,
) {
  await page.getByRole("button", { name: actionName }).click();
  const confirmation = page.getByRole("group", {
    name: "Confirm workflow decision",
  });
  await expect(confirmation).toContainText(
    `Confirm move to ${targetStatus}?`,
  );
  await confirmation.getByRole("button", { name: "Confirm decision" }).click();
}

test("a faculty-authored course completes every approval stage and starts a new version", async ({
  page,
}) => {
  const title = "End-to-End Approval Record";
  const approvedId = await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "910",
    title,
  });

  await page
    .getByLabel("Catalog description")
    .fill("A local course used to exercise the complete human approval route.");
  await expectLocalSaveSettled(page);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/view/\\?id=${approvedId}$`),
  );
  await expect(page.getByText("Department Review").first()).toBeVisible();

  await switchPerspective(
    page,
    "Department chair",
    "Demo Curriculum Chair",
  );
  await page.goto("/approvals/");
  await expect(
    page.getByRole("heading", { name: "Approval docket" }),
  ).toBeVisible();

  const chairCard = await chooseApprovalRecord(
    page,
    title,
    "Department Review",
  );
  await page
    .getByLabel("Review note")
    .fill("Department evidence reviewed in the local demo.");
  await confirmApproval(
    page,
    "Advance to curriculum committee",
    "Curriculum Committee",
  );

  await expect(chairCard).toContainText("Curriculum Committee");
  await chairCard.click();
  await page
    .getByLabel("Review note")
    .fill("Committee review completed with a recorded decision.");
  await confirmApproval(
    page,
    "Advance to articulation review",
    "Articulation Review",
  );
  await expect(
    page.getByTestId("approval-card").filter({ hasText: title }),
  ).toHaveCount(0);

  await switchPerspective(
    page,
    "Articulation officer",
    "Demo Articulation Officer",
  );
  await chooseApprovalRecord(page, title, "Articulation Review");
  await page
    .getByLabel("Review note")
    .fill("Articulation review completed against the demonstration record.");
  await confirmApproval(page, "Approve course", "Approved");
  await expect(
    page.getByTestId("approval-card").filter({ hasText: title }),
  ).toHaveCount(0);

  await page.goto("/courses/");
  await page.getByLabel("Search courses").fill(title);
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/view/\\?id=${approvedId}$`),
  );
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(
      "This approved record is immutable. Create a new version to propose changes while preserving the official outline.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create new version" }).click();
  const versionDialog = page.getByRole("alertdialog", {
    name: "Create a new version?",
  });
  await expect(versionDialog).toContainText(
    "The approved Version 1.0 record remains unchanged.",
  );
  await versionDialog
    .getByRole("button", { name: "Create draft version" })
    .click();

  await expect(page).toHaveURL(/\/courses\/edit\/\?id=[^&]+$/);
  const draftVersionId = new URL(page.url()).searchParams.get("id");
  expect(draftVersionId).toBeTruthy();
  expect(draftVersionId).not.toBe(approvedId);
  await expect(
    page.getByRole("heading", {
      name: /TEST 910.*End-to-End Approval Record/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(page.getByText("2.0", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit outline" })).toBeVisible();
});

test("a draft retains comments, exposes deterministic compliance, and compares against its approved source", async ({
  page,
}) => {
  await page.goto("/courses/");
  await page
    .getByLabel("Search courses")
    .fill("Introduction to Programming");
  await page
    .getByRole("link", { name: "Introduction to Programming" })
    .click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Create new version" }).click();
  await page
    .getByRole("alertdialog", { name: "Create a new version?" })
    .getByRole("button", { name: "Create draft version" })
    .click();
  await expect(page).toHaveURL(/\/courses\/edit\/\?id=[^&]+$/);
  const draftId = new URL(page.url()).searchParams.get("id");
  expect(draftId).toBeTruthy();
  if (!draftId) {
    throw new Error("The new draft version did not receive a route ID.");
  }

  await page
    .getByLabel("Official course title")
    .fill("Introduction to Programming Revised");
  await expectLocalSaveSettled(page);

  await selectEditorSection(page, "Comments");
  await page.getByLabel("Outline section").selectOption("Compliance");
  await page
    .getByRole("textbox", { name: "Comment" })
    .fill("Verify the hours finding before the revised outline is submitted.");
  await page.getByRole("button", { name: "Post comment" }).click();
  const comment = page
    .getByRole("listitem")
    .filter({ hasText: "Verify the hours finding" });
  await expect(comment).toContainText("Demo Faculty", {
    timeout: 10_000,
  });
  await comment.getByRole("button", { name: "Resolve" }).click();
  await expect(comment.getByRole("button", { name: "Reopen" })).toBeVisible();

  await selectEditorSection(page, "Compliance");
  await expect(
    page.getByRole("heading", { name: "Compliance audit" }),
  ).toBeVisible();
  await expect(page.getByText("Score", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "A passing local audit is evidence of technical readiness, not approval. Faculty, articulation, and curriculum reviewers retain decision authority.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/view/\\?id=${draftId}$`),
  );
  await expect(
    page.getByRole("heading", {
      name: /Introduction to Programming Revised/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("1", { exact: true }).last()).toBeVisible();

  await page.getByRole("link", { name: "Compare" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/compare/\\?source=${draftId}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Choose a record to compare" }),
  ).toBeVisible();
  const target = page.getByLabel("Comparison target");
  const originalOption = target
    .locator("option")
    .filter({ hasText: "Version 1.0" });
  const originalId = await originalOption.getAttribute("value");
  expect(originalId).toBeTruthy();
  await target.selectOption(originalId ?? "");

  await expect(page).toHaveURL(/\/courses\/compare\/\?source=[^&]+&target=[^&]+$/);
  await expect(
    page.getByRole("heading", { name: "Catalog record" }),
  ).toBeVisible();
  const titleRow = page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: /Title/ }),
  });
  await expect(titleRow).toContainText("Changed");
  await expect(titleRow).toContainText("Introduction to Programming Revised");
  await expect(titleRow).toContainText("Introduction to Programming");
});

test("backup import rejects invalid JSON without data loss and restores a validated workspace", async ({
  page,
}) => {
  const title = "Validated Backup Sentinel";
  await createDraftCourse(page, {
    subjectCode: "TEST",
    courseNumber: "911",
    title,
  });
  await page.goto("/settings/");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath, "The validated backup must be readable.").not.toBeNull();
  if (!backupPath) {
    throw new Error("The downloaded backup was not readable.");
  }

  const importInput = page.getByLabel("Choose backup to import");
  await importInput.setInputFiles({
    name: "invalid-calricula-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"kind":"not-calricula","schemaVersion":1}'),
  });
  const invalidDialog = page.getByRole("alertdialog", {
    name: "Replace local records with this backup?",
  });
  await invalidDialog
    .getByRole("button", { name: "Replace and import" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "This file is not a valid Calricula demo backup.",
    }),
  ).toBeVisible();

  await page.goto("/courses/");
  await page.getByLabel("Search courses").fill(title);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto("/settings/");
  await page
    .getByRole("region", { name: "Backup, restore, and reset" })
    .getByRole("button", { name: "Reset sample catalog" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Reset the sample catalog?" })
    .getByRole("button", { name: "Reset without backup" })
    .click();
  await expect(page.getByText("Sample catalog reset.")).toBeVisible();

  await page.goto("/courses/");
  await page.getByLabel("Search courses").fill(title);
  await expect(
    page.getByRole("heading", { name: "No matching outlines" }),
  ).toBeVisible();

  await page.goto("/settings/");
  await page.getByLabel("Choose backup to import").setInputFiles(backupPath);
  const validDialog = page.getByRole("alertdialog", {
    name: "Replace local records with this backup?",
  });
  await validDialog
    .getByRole("button", { name: "Replace and import" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Backup imported." }),
  ).toContainText(/Backup imported\. \d+ local records restored\./);

  await page.goto("/courses/");
  await page.getByLabel("Search courses").fill(title);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("same-profile tabs synchronize while a separate browser profile stays isolated", async ({
  browser,
  page,
}) => {
  const title = "Profile Isolation Sentinel";
  await page.goto("/courses/");
  await expect(
    page.getByRole("heading", { name: "Course Outlines of Record" }),
  ).toBeVisible();

  const sibling = await page.context().newPage();
  const siblingGuard = attachLegacyNetworkGuard(sibling);
  const isolatedContext = await browser.newContext();
  const isolated = await isolatedContext.newPage();
  const isolatedGuard = attachLegacyNetworkGuard(isolated);

  try {
    await sibling.goto("/courses/");
    await sibling.getByLabel("Search courses").fill(title);
    await expect(
      sibling.getByRole("heading", { name: "No matching outlines" }),
    ).toBeVisible();

    await isolated.goto("/courses/");
    await isolated.getByLabel("Search courses").fill(title);
    await expect(
      isolated.getByRole("heading", { name: "No matching outlines" }),
    ).toBeVisible();

    await createDraftCourse(page, {
      subjectCode: "TEST",
      courseNumber: "912",
      title,
    });

    await expect(sibling.getByRole("link", { name: title })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      isolated.getByRole("heading", { name: "No matching outlines" }),
    ).toBeVisible();

    siblingGuard.assertClean();
    isolatedGuard.assertClean();
  } finally {
    await isolatedContext.close();
    await sibling.close();
  }
});
