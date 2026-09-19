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
 * The chat steps of cases 1 and 8 run against the shared workspace shell
 * (@johnnyrobot/workspace-ui, host plan Task 8): the stub answers every
 * question with status → answer (one citation) → done.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS, loginAsUser } from './fixtures/ccn-fixtures';

const MAPPED_PROGRAM = 'Computer Science';
const UNMAPPED_PROGRAM = 'Business Administration Certificate';
// The shared shell's ask-box label (ChatPanel in @johnnyrobot/workspace-ui).
const ASK_LABEL = 'Ask about classes, programs and campus services';
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

  test('chat answers with sources inside the shared workspace shell (case 1 chat steps)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    // The shell is a labelled <section> inside the page; the page keeps the only <main> and <h1>.
    await expect(page.getByRole('region', { name: /workspace/i }).last()).toBeVisible();
    expect(await page.locator('main').count()).toBe(1);
    expect(await page.locator('h1').count()).toBe(1);

    const ask = page.getByRole('textbox', { name: ASK_LABEL });
    await ask.fill('open seats in MULTIMD 100');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /answer ready/i })).toBeVisible();
    const log = page.getByRole('log', { name: 'Conversation' });
    await expect(log).toContainText('open seats in MULTIMD 100');
    await expect(log).toContainText('MULTIMD 100 has 6 open seats this term.');
    await expect(page.getByRole('list', { name: /sources/i })).toBeVisible();
    await expect(page.getByRole('list', { name: /sources/i })).toContainText('Schedule of classes');
    await expect(page.getByRole('link', { name: /Schedule of classes/ })).toHaveAttribute('href', 'https://example.edu/schedule/MULTIMD-100');
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

  test('keyboard-only chat at narrow width (case 8 chat steps)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAsUser(page, TEST_USERS.faculty);
    await openProgram(page, MAPPED_PROGRAM);
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    const ask = page.getByRole('textbox', { name: ASK_LABEL });
    await expect(ask).toBeVisible();

    // Tab from the top of the document until the ask box has focus.
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await ask.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
    await page.keyboard.type('library hours');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /answer ready/i })).toBeVisible();
    await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('library hours');
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
