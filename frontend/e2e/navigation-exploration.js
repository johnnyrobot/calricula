/**
 * Navigation Exploration Script
 *
 * Tests navigation through Library, LMI Data, and back to Dashboard
 * Run with: node e2e/navigation-exploration.js
 */

const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting browser automation for navigation testing...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000 // Slow down by 1000ms for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 0: Login first
    console.log('=== STEP 0: Logging in as faculty ===');
    await page.goto('http://localhost:3000/login', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'faculty@calricula.com');
    await page.fill('input[type="password"]', 'Test123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
    await page.waitForLoadState('networkidle');
    console.log('✓ Logged in successfully\n');

    // Navigate to Programs page first (assuming user should be on Programs based on context)
    console.log('=== NAVIGATING TO PROGRAMS PAGE ===');
    await page.getByRole('link', { name: 'Programs' }).click();
    await page.waitForURL('**/programs**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    console.log('✓ On Programs page\n');

    // Step 1: Click on "Library" in sidebar navigation
    console.log('=== STEP 1: Clicking on Library link ===');
    const libraryLink = page.getByRole('link', { name: 'Library' });
    await libraryLink.click();
    console.log('✓ Library link clicked\n');

    // Step 2: Wait for the page to load (60 second timeout for eLumen API)
    console.log('=== STEP 2: Waiting for Library page to load (60 second timeout for eLumen API) ===');
    await page.waitForURL('**/library**', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    console.log('✓ Library page loaded\n');

    // Step 3: Take a screenshot of the Library page
    console.log('=== STEP 3: Taking screenshot of Library page ===');
    await page.screenshot({ path: 'test-results/04-library-page.png', fullPage: true });
    console.log('✓ Screenshot saved: test-results/04-library-page.png\n');

    // Step 4: Report what we see on Library page
    console.log('=== STEP 4: Analyzing Library Page ===');
    const libraryPageTitle = await page.locator('h1, h2').first().textContent().catch(() => null);
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

    // Get all navigation links
    const navLinks = await page.locator('nav a, [role="navigation"] a').allTextContents();
    console.log('\n🔗 Navigation Links Available:');
    navLinks.forEach((link, index) => {
      if (link.trim()) {
        console.log(`   ${index + 1}. ${link.trim()}`);
      }
    });
    console.log('');

    // Step 5: Click on "LMI Data" in sidebar navigation
    console.log('=== STEP 5: Clicking on LMI Data link ===');
    const lmiLink = page.getByRole('link', { name: 'LMI Data' });
    await lmiLink.click();
    console.log('✓ LMI Data link clicked\n');

    // Step 6: Wait for the page to load
    console.log('=== STEP 6: Waiting for LMI Data page to load ===');
    await page.waitForURL('**/lmi**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    console.log('✓ LMI Data page loaded\n');

    // Step 7: Take a screenshot of the LMI Data page
    console.log('=== STEP 7: Taking screenshot of LMI Data page ===');
    await page.screenshot({ path: 'test-results/05-lmi-page.png', fullPage: true });
    console.log('✓ Screenshot saved: test-results/05-lmi-page.png\n');

    // Step 8: Report what we see on LMI Data page
    console.log('=== STEP 8: Analyzing LMI Data Page ===');
    const lmiPageTitle = await page.locator('h1, h2').first().textContent().catch(() => null);
    const hasLMIContent = await page.locator('main').textContent().catch(() => null);

    console.log('LMI Data Page Analysis:');
    console.log(`- Title: ${lmiPageTitle}`);
    if (hasLMIContent) {
      console.log(`- Page content preview: ${hasLMIContent.substring(0, 200)}...`);
    }
    console.log('');

    // Step 9: Click on "Dashboard" to return
    console.log('=== STEP 9: Clicking on Dashboard link to return ===');
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await dashboardLink.click();
    console.log('✓ Dashboard link clicked\n');

    // Step 10: Wait for dashboard to load and take screenshot
    console.log('=== STEP 10: Waiting for Dashboard to load and taking screenshot ===');
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/06-dashboard-return.png', fullPage: true });
    console.log('✓ Screenshot saved: test-results/06-dashboard-return.png\n');

    const dashboardReturnTitle = await page.locator('h1, h2').first().textContent().catch(() => null);
    console.log('Dashboard Return Analysis:');
    console.log(`- Title: ${dashboardReturnTitle}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('NAVIGATION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ All navigation tests completed successfully!');
    console.log('');
    console.log('Pages visited:');
    console.log('  1. Programs page');
    console.log('  2. Library page (with 60s timeout for eLumen API)');
    console.log('  3. LMI Data page');
    console.log('  4. Dashboard page (return)');
    console.log('');
    console.log('Screenshots saved:');
    console.log('  - test-results/04-library-page.png');
    console.log('  - test-results/05-lmi-page.png');
    console.log('  - test-results/06-dashboard-return.png');
    console.log('='.repeat(60));

    // Wait a few seconds before closing
    console.log('\nKeeping browser open for 5 seconds...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('\n❌ Error occurred:', error.message);
    console.error('Stack trace:', error.stack);
    await page.screenshot({ path: 'test-results/navigation-error.png', fullPage: true });
    console.error('Error screenshot saved to: test-results/navigation-error.png');
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');
  }
})();
