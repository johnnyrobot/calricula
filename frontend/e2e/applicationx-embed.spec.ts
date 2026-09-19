/**
 * ApplicationX embed acceptance (EMBEDDED §7 cases 1, 2, 4, 6, 8, 9).
 *
 * Prerequisites (see docs/APPLICATIONX-EMBED.md):
 *   - Dev auth mode on both sides (AUTH_DEV_MODE / NEXT_PUBLIC_AUTH_DEV_MODE).
 *   - Backend with APPLICATIONX_EMBED_ENABLED=true and
 *     APPLICATIONX_API_ORIGIN pointing at the stub upstream
 *     (backend/tests/stubs/applicationx_stub.py on :8099) started with
 *     STUB_MAPPED=<uuid of the "Computer Science" seed program>. The stub
 *     answers `access_required` for the articulation officer's dev token
 *     (`dev-articulation-001`), which case 2 relies on.
 *   - PLAYWRIGHT_BASE_URL pointing at the running frontend.
 *
 * Case 9 needs the stub restarted with STUB_DOWN=1 and this spec run with
 * STUB_DOWN=1; it is skipped otherwise.
 *
 * The chat steps of cases 1 and 8 are `test.fixme` until the shared
 * workspace package (chat shell) is integrated (plan Task 8); the host
 * states, context banner and navigation are asserted now.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS, loginAsUser } from './fixtures/ccn-fixtures';

const MAPPED_PROGRAM = 'Computer Science';
const UNMAPPED_PROGRAM = 'Business Administration Certificate';
const outage = !!process.env.STUB_DOWN;

// Reach the program through the sidebar (client-side navigation) rather than a
// hard load of /programs, whose first fetch can race the restored dev session.
// A program card is one link whose name includes its department, so the exact
// card heading is the unambiguous target (a department can contain another
// program's title).
async function openProgram(page: Page, title: string): Promise<string> {
  // At narrow widths the sidebar is behind the "Open menu" button.
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Programs' }).first().click();
  await expect(page).toHaveURL(/\/programs$/);
  await page.getByRole('heading', { name: title, exact: true }).first().click();
  await expect(page.getByRole('link', { name: /^Collaboration$/ })).toBeVisible();
  return page.url();
}

test.describe('ApplicationX embed', () => {
  test.skip(outage, 'stub is down (STUB_DOWN=1): only the outage case runs');

  test('staff enters from nav and program page without leaving the layout (case 1)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await page.getByRole('link', { name: /Employer & Career Collaboration/ }).first().click();
    await expect(page).toHaveURL(/\/collaboration$/);
    await expect(page.getByRole('heading', { name: /Employer & Career Collaboration/ })).toBeVisible();

    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page).toHaveURL(/\/programs\/[0-9a-f-]+\/collaboration$/);
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toContainText('LAMC');
    await expect(page.getByRole('region', { name: /Workspace context/ })).toContainText('Computer Science');
  });

  test.fixme('chat arrives with the shared workspace package (plan Task 8) — case 1 chat steps', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await page.getByLabel(/ask/i).fill('open seats in MULTIMD 100');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(/answer ready/i);
    await expect(page.getByRole('list', { name: /sources/i })).toBeVisible();
  });

  test('staff without ApplicationX access sees the access panel, never a workspace (case 2)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.articulation);
    await page.getByRole('link', { name: /Employer & Career Collaboration/ }).first().click();
    await expect(page).toHaveURL(/\/collaboration$/);
    await expect(page.getByText(/You do not have ApplicationX access/)).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toHaveCount(0);

    // The same answer on a mapped program's collaboration page: still no workspace.
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByText(/You do not have ApplicationX access/)).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toHaveCount(0);
    await expect(page.getByLabel(/ask/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Back to program/ })).toBeVisible();
  });

  test('unmapped program requires explicit setup (case 4)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, UNMAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByText(/not mapped to an ApplicationX workspace/)).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toHaveCount(0);
    await expect(page.getByLabel(/ask/i)).toHaveCount(0);
  });

  test('reload and back preserve program context (case 6)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    const programUrl = await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toContainText('Computer Science');
    await page.goBack();
    await expect(page).toHaveURL(programUrl);
  });

  test('keyboard-only reach at narrow width (case 8)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    const region = page.getByRole('region', { name: /Workspace context/ });
    await expect(region).toBeVisible();
    const back = region.getByRole('link', { name: /Back to program/ });

    // Tab from the top of the document until the region's link has focus.
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await back.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/programs\/[0-9a-f-]+$/);
  });

  test.fixme('chat arrives with the shared workspace package (plan Task 8) — case 8 chat steps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await page.keyboard.press('Tab'); // skip link
    for (let i = 0; i < 12; i++) {
      if (await page.getByLabel(/ask/i).evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.type('library hours');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(/answer ready/i);
  });
});

test.describe('ApplicationX embed — upstream outage', () => {
  test.skip(!outage, 'run with STUB_DOWN=1 against a stub started with STUB_DOWN=1');

  test('upstream outage leaves curriculum editing usable (case 9)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    // Next's route announcer is also role=alert; the panel is the named one.
    const alert = page.getByRole('alert', { name: /unavailable/i });
    await expect(alert).toContainText(/unavailable/i);
    await expect(alert).toContainText(/Curriculum editing is unaffected/);
    await page.getByRole('link', { name: /Back to program/ }).click();
    await expect(page).toHaveURL(/\/programs\/[0-9a-f-]+$/);
    await expect(
      page.getByRole('link', { name: /Edit Program/ }).or(page.getByRole('button', { name: /Export PDF/ })).first(),
    ).toBeVisible();
  });
});
