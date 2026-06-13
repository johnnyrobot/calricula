/**
 * Login and Dashboard Exploration Test
 *
 * This test logs in with demo credentials and explores the dashboard.
 */

import { test, expect } from '@playwright/test';

test.describe('Login and Dashboard Exploration', () => {
  test('login with demo credentials and explore dashboard', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/login');

    // Step 1: Get a snapshot of the current page to find email and password fields
    console.log('\n=== STEP 1: Login Page Snapshot ===');
    const loginPageContent = await page.content();
    console.log('Login page loaded, looking for form fields...');

    // Wait for login form to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });

    // Step 2: Fill in email field
    console.log('\n=== STEP 2: Filling Email Field ===');
    await page.fill('input[type="email"]', 'demo@calricula.com');
    console.log('Email field filled: demo@calricula.com');

    // Step 3: Fill in password field
    console.log('\n=== STEP 3: Filling Password Field ===');
    await page.fill('input[type="password"]', 'dont4get');
    console.log('Password field filled');

    // Step 4: Click the Sign in button
    console.log('\n=== STEP 4: Clicking Sign In Button ===');
    const signInButton = page.locator('button[type="submit"]');
    await signInButton.click();
    console.log('Sign in button clicked');

    // Step 5: Wait for navigation to dashboard (look for "Dashboard" text)
    console.log('\n=== STEP 5: Waiting for Dashboard ===');
    try {
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 15000,
      });
      console.log('Navigation complete, current URL:', page.url());

      // Wait for page to load
      await page.waitForLoadState('networkidle');

    } catch (error) {
      console.log('Navigation timeout or error:', error);
    }

    // Step 6: Take a screenshot of the dashboard
    console.log('\n=== STEP 6: Taking Dashboard Screenshot ===');
    await page.screenshot({
      path: 'frontend/playwright-report/dashboard-screenshot.png',
      fullPage: true
    });
    console.log('Screenshot saved to: frontend/playwright-report/dashboard-screenshot.png');

    // Step 7: Get snapshot of page to see navigation elements
    console.log('\n=== STEP 7: Dashboard Page Analysis ===');

    // Get page title
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);

    // Look for main heading
    const mainHeading = await page.locator('h1').first().textContent().catch(() => null);
    console.log('Main heading:', mainHeading);

    // Look for all navigation links
    const navLinks = await page.locator('nav a, header a').allTextContents();
    console.log('\nNavigation links found:');
    navLinks.forEach((link, index) => {
      if (link.trim()) {
        console.log(`  ${index + 1}. ${link.trim()}`);
      }
    });

    // Look for any dashboard-specific content
    const dashboardHeadings = await page.locator('h1, h2, h3').allTextContents();
    console.log('\nAll headings on page:');
    dashboardHeadings.forEach((heading, index) => {
      if (heading.trim()) {
        console.log(`  ${index + 1}. ${heading.trim()}`);
      }
    });

    // Look for cards or main content areas
    const cards = await page.locator('[class*="card"], [class*="panel"]').count();
    console.log(`\nNumber of card/panel elements: ${cards}`);

    // Get all button text
    const buttons = await page.locator('button').allTextContents();
    console.log('\nButtons available:');
    buttons.forEach((button, index) => {
      if (button.trim()) {
        console.log(`  ${index + 1}. ${button.trim()}`);
      }
    });

    // Check for user profile/account info
    const userInfo = await page.locator('[class*="user"], [class*="profile"], [class*="account"]').first().textContent().catch(() => null);
    if (userInfo) {
      console.log('\nUser info:', userInfo);
    }

    // Get page structure
    const mainContent = await page.locator('main').textContent().catch(() => null);
    if (mainContent) {
      console.log('\nMain content area found with', mainContent.length, 'characters');
    }

    // Summary report
    console.log('\n=== SUMMARY ===');
    console.log('Login successful:', !page.url().includes('/login'));
    console.log('Current URL:', page.url());
    console.log('Dashboard elements found:');
    console.log('  - Navigation links:', navLinks.filter(l => l.trim()).length);
    console.log('  - Headings:', dashboardHeadings.filter(h => h.trim()).length);
    console.log('  - Buttons:', buttons.filter(b => b.trim()).length);
    console.log('  - Cards/Panels:', cards);
  });
});
