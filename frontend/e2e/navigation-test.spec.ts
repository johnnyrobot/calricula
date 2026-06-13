import { test, expect } from '@playwright/test';

// Test user credentials (for dev mode or test environment)
const TEST_USERS = {
  faculty: {
    email: 'faculty@calricula.com',
    password: 'Test123!',
    role: 'Faculty',
  },
};

/**
 * Helper to login via the dev mode
 */
async function loginAsUser(
  page: any,
  user: { email: string; password: string }
): Promise<void> {
  await page.goto('/login');

  // Wait for login form
  await page.waitForSelector('input[type="email"]');

  // Fill credentials
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for redirect (should go to dashboard or previous page)
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), {
    timeout: 10000,
  });
}

test.describe('Navigation Tests', () => {
  test('navigate through all pages: Courses, Programs, Library, LMI Data, and Dashboard', async ({ page }) => {
  // Step 0: Login first
  console.log('Step 0: Logging in as faculty...');
  await loginAsUser(page, TEST_USERS.faculty);

  // Navigate to the dashboard
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Step 1: Get initial snapshot of dashboard
  console.log('Step 1: Taking snapshot of dashboard...');
  await page.screenshot({ path: 'test-results/01-dashboard-initial.png', fullPage: true });

  // Step 2: Click on "Courses" in the sidebar navigation
  console.log('Step 2: Clicking on Courses link...');
  // Use text locator for better reliability with navigation items
  await page.getByRole('link', { name: 'Courses' }).click();

  // Step 3: Wait for the page to load
  console.log('Step 3: Waiting for Courses page to load...');
  await page.waitForURL('**/courses**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Step 4: Take a screenshot of the Courses page
  console.log('Step 4: Taking screenshot of Courses page...');
  await page.screenshot({ path: 'test-results/02-courses-page.png', fullPage: true });

  // Step 5: Report what we see on Courses page
  console.log('Step 5: Analyzing Courses page...');
  const coursePageTitle = await page.locator('h1, h2').first().textContent();
  const hasCourseCards = await page.locator('[data-testid*="course"], .course-card, article').count();
  const hasSearch = await page.locator('input[type="search"], input[placeholder*="search" i]').count();
  const hasFilters = await page.locator('select, button:has-text("Filter")').count();

  console.log('Courses Page Analysis:');
  console.log(`- Title: ${coursePageTitle}`);
  console.log(`- Course cards/items found: ${hasCourseCards}`);
  console.log(`- Search input found: ${hasSearch > 0 ? 'Yes' : 'No'}`);
  console.log(`- Filters found: ${hasFilters > 0 ? 'Yes' : 'No'}`);

  // Step 6: Click on "Programs" in the sidebar navigation
  console.log('Step 6: Clicking on Programs link...');
  await page.getByRole('link', { name: 'Programs' }).click();

  // Step 7: Wait for the page to load
  console.log('Step 7: Waiting for Programs page to load...');
  await page.waitForURL('**/programs**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Step 8: Take a screenshot of the Programs page
  console.log('Step 8: Taking screenshot of Programs page...');
  await page.screenshot({ path: 'test-results/03-programs-page.png', fullPage: true });

  // Step 9: Report what we see on Programs page
  console.log('Step 9: Analyzing Programs page...');
  const programPageTitle = await page.locator('h1, h2').first().textContent();
  const hasProgramCards = await page.locator('[data-testid*="program"], .program-card, article').count();
  const hasProgramSearch = await page.locator('input[type="search"], input[placeholder*="search" i]').count();
  const hasProgramFilters = await page.locator('select, button:has-text("Filter")').count();

  console.log('Programs Page Analysis:');
  console.log(`- Title: ${programPageTitle}`);
  console.log(`- Program cards/items found: ${hasProgramCards}`);
  console.log(`- Search input found: ${hasProgramSearch > 0 ? 'Yes' : 'No'}`);
  console.log(`- Filters found: ${hasProgramFilters > 0 ? 'Yes' : 'No'}`);

  // Step 10: Click on "Library" in the sidebar navigation
  console.log('Step 10: Clicking on Library link...');
  await page.getByRole('link', { name: 'Library' }).click();

  // Step 11: Wait for the page to load (longer timeout for eLumen API)
  console.log('Step 11: Waiting for Library page to load (60 second timeout for eLumen API)...');
  await page.waitForURL('**/library**', { timeout: 10000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });

  // Step 12: Take a screenshot of the Library page
  console.log('Step 12: Taking screenshot of Library page...');
  await page.screenshot({ path: 'test-results/04-library-page.png', fullPage: true });

  // Step 13: Report what we see on Library page
  console.log('Step 13: Analyzing Library page...');
  const libraryPageTitle = await page.locator('h1, h2').first().textContent();
  const hasLibraryCourses = await page.locator('[data-testid*="course"], .course-card, article').count();
  const hasLibrarySearch = await page.locator('input[type="search"], input[placeholder*="search" i]').count();
  const hasCollegeFilter = await page.locator('select, button:has-text("College")').count();
  const hasViewCORButton = await page.locator('button:has-text("View COR")').count();

  console.log('Library Page Analysis:');
  console.log(`- Title: ${libraryPageTitle}`);
  console.log(`- Course cards/items found: ${hasLibraryCourses}`);
  console.log(`- Search input found: ${hasLibrarySearch > 0 ? 'Yes' : 'No'}`);
  console.log(`- College filter found: ${hasCollegeFilter > 0 ? 'Yes' : 'No'}`);
  console.log(`- View COR buttons found: ${hasViewCORButton}`);

  // Step 14: Click on "LMI Data" in the sidebar navigation
  console.log('Step 14: Clicking on LMI Data link...');
  await page.getByRole('link', { name: 'LMI Data' }).click();

  // Step 15: Wait for the page to load
  console.log('Step 15: Waiting for LMI Data page to load...');
  await page.waitForURL('**/lmi**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Step 16: Take a screenshot of the LMI Data page
  console.log('Step 16: Taking screenshot of LMI Data page...');
  await page.screenshot({ path: 'test-results/05-lmi-page.png', fullPage: true });

  // Step 17: Report what we see on LMI Data page
  console.log('Step 17: Analyzing LMI Data page...');
  const lmiPageTitle = await page.locator('h1, h2').first().textContent();
  const hasLMIContent = await page.locator('main').textContent();

  console.log('LMI Data Page Analysis:');
  console.log(`- Title: ${lmiPageTitle}`);
  console.log(`- Page content preview: ${hasLMIContent?.substring(0, 200)}...`);

  // Step 18: Click on "Dashboard" to return
  console.log('Step 18: Clicking on Dashboard link to return...');
  await page.getByRole('link', { name: 'Dashboard' }).click();

  // Step 19: Wait for dashboard to load
  console.log('Step 19: Waiting for Dashboard to load...');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Step 20: Take a screenshot to confirm we're back at dashboard
  console.log('Step 20: Taking screenshot to confirm back at Dashboard...');
  await page.screenshot({ path: 'test-results/06-dashboard-return.png', fullPage: true });

  const dashboardReturnTitle = await page.locator('h1, h2').first().textContent();
  console.log('Dashboard Return Analysis:');
  console.log(`- Title: ${dashboardReturnTitle}`);
  console.log('\n✅ Navigation test completed successfully!');
  });
});
