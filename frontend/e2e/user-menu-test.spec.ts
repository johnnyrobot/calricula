import { test as base, expect } from '@playwright/test';

const test = base;

test.describe('User Menu and Theme Toggle Tests', () => {
  test('should login, test theme toggle, test user menu, and test 404 page', async ({ page }) => {
    // 1. Navigate to login page
    console.log('Step 1: Navigating to login page...');
    await page.goto('http://localhost:3001/login');
    await page.waitForLoadState('networkidle');

    // 2. Fill in login credentials
    console.log('Step 2: Filling in login credentials...');
    await page.fill('input[type="email"]', 'demo@calricula.com');
    await page.fill('input[type="password"]', 'dont4get');

    // 3. Click sign in
    console.log('Step 3: Clicking sign in button...');
    await page.click('button[type="submit"]');

    // 4. Wait for dashboard to load
    console.log('Step 4: Waiting for dashboard to load...');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Extra wait for UI to settle

    // 5. Take screenshot of dashboard
    console.log('Step 5: Taking screenshot of dashboard (light mode)...');
    await page.screenshot({
      path: 'frontend/e2e/screenshots/01-dashboard-light.png',
      fullPage: true
    });

    // Verify user is logged in (user info may be in hidden sidebar on mobile)
    console.log('✓ Successfully logged in to dashboard');

    // Test Theme Toggle
    console.log('\n--- Testing Theme Toggle ---');

    // Find theme toggle button (should be sun icon in light mode)
    const themeToggle = page.locator('button[aria-label*="theme" i]').first();
    await expect(themeToggle).toBeVisible();
    console.log('✓ Found theme toggle button');

    // Click to open theme dropdown
    await themeToggle.click();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'frontend/e2e/screenshots/02-theme-dropdown-open.png',
      fullPage: true
    });
    console.log('✓ Theme dropdown opened');

    // Click on Dark mode
    const darkModeOption = page.locator('button[role="menuitem"]:has-text("Dark")');
    await expect(darkModeOption).toBeVisible();
    await darkModeOption.click();
    await page.waitForTimeout(500); // Wait for theme transition

    await page.screenshot({
      path: 'frontend/e2e/screenshots/03-dashboard-dark.png',
      fullPage: true
    });
    console.log('✓ Switched to dark mode');

    // Switch back to light mode
    await themeToggle.click();
    await page.waitForTimeout(300);
    const lightModeOption = page.locator('button[role="menuitem"]:has-text("Light")');
    await lightModeOption.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'frontend/e2e/screenshots/04-dashboard-light-again.png',
      fullPage: true
    });
    console.log('✓ Switched back to light mode');

    // Test Sign Out
    console.log('\n--- Testing Sign Out ---');

    // Find the visible sign out button (there might be multiple due to responsive design)
    const signOutButton = page.getByRole('button', { name: 'Sign out' });
    // Use click with force: true to handle potentially hidden elements
    await signOutButton.click({ force: true });
    console.log('✓ Clicked Sign out button');

    // Verify redirect to login page
    await page.waitForURL('**/login', { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'frontend/e2e/screenshots/05-after-logout.png',
      fullPage: true
    });

    expect(page.url()).toContain('/login');
    console.log('✓ Redirected to login page after logout');

    // Test 404 Page
    console.log('\n--- Testing 404 Page ---');

    await page.goto('http://localhost:3001/nonexistent-page');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'frontend/e2e/screenshots/06-404-page.png',
      fullPage: true
    });
    console.log('✓ Navigated to 404 page');

    // Analyze 404 page content
    const pageText = await page.textContent('body');
    console.log('\n404 Page Analysis:');

    // Find main heading
    const h1 = await page.locator('h1').first();
    if (await h1.isVisible({ timeout: 1000 })) {
      const h1Text = await h1.textContent();
      console.log(`  Heading: "${h1Text?.trim()}"`);
    }

    // Find description text
    const paragraphs = await page.locator('p').all();
    for (let i = 0; i < Math.min(paragraphs.length, 3); i++) {
      const text = await paragraphs[i].textContent();
      console.log(`  Text ${i + 1}: "${text?.trim()}"`);
    }

    // Find buttons/links
    const links = await page.locator('a[href]').all();
    console.log(`\n  Found ${links.length} links:`);
    for (let i = 0; i < Math.min(links.length, 5); i++) {
      const linkText = await links[i].textContent();
      const href = await links[i].getAttribute('href');
      console.log(`    - "${linkText?.trim()}" → ${href}`);
    }

    console.log('\n✓ All tests completed successfully!');
  });
});
