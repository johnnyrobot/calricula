import { test, expect } from "./fixtures";

test("dashboard notifications expose record actions and durable read controls", async ({
  page,
}) => {
  await page.goto("/dashboard/#notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "1 unread notification" }),
  ).toBeVisible();

  const notification = page
    .getByRole("listitem")
    .filter({ hasText: "Review assigned" });
  await expect(notification).toContainText("Demo notification 5.");
  await expect(
    notification.getByRole("link", { name: "Open record" }),
  ).toBeVisible();

  await notification.getByRole("button", { name: "Mark read" }).click();
  await expect(
    notification.getByRole("button", { name: "Mark unread" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "0 unread notifications" }),
  ).toBeVisible();

  await notification.getByRole("link", { name: "Open record" }).click();
  await expect(page).toHaveURL(/\/courses\/view\/\?id=[^&]+$/);
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toBeVisible();
});
