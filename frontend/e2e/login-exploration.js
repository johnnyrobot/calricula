/**
 * Login and Dashboard Exploration Script
 *
 * This is a standalone script to login and explore the dashboard.
 * Run with: node e2e/login-exploration.js
 */

const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting browser automation...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down by 500ms for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login page
    console.log('=== STEP 1: Navigating to Login Page ===');
    await page.goto('http://localhost:3000/login', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    console.log('✓ Page loaded, waiting for stability...');
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    console.log('✓ Login page fully loaded\n');

    // Take screenshot of login page
    await page.screenshot({ path: 'playwright-report/01-login-page.png', fullPage: true });
    console.log('✓ Screenshot saved: 01-login-page.png\n');

    // Step 2: Fill in email field
    console.log('=== STEP 2: Filling Email Field ===');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'demo@calricula.com');
    console.log('✓ Email field filled: demo@calricula.com\n');

    // Step 3: Fill in password field
    console.log('=== STEP 3: Filling Password Field ===');
    await page.fill('input[type="password"]', 'dont4get');
    console.log('✓ Password field filled\n');

    // Step 4: Click the Sign in button
    console.log('=== STEP 4: Clicking Sign In Button ===');
    const signInButton = page.locator('button[type="submit"]');
    await signInButton.click();
    console.log('✓ Sign in button clicked\n');

    // Step 5: Wait for navigation to complete
    console.log('=== STEP 5: Waiting for Navigation ===');
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
    await page.waitForLoadState('networkidle');
    console.log('✓ Navigation complete');
    console.log('✓ Current URL:', page.url(), '\n');

    // Step 6: Take a screenshot of the dashboard
    console.log('=== STEP 6: Taking Dashboard Screenshot ===');
    await page.screenshot({
      path: 'playwright-report/02-dashboard.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved: 02-dashboard.png\n');

    // Step 7: Get snapshot of page to see navigation elements
    console.log('=== STEP 7: Dashboard Page Analysis ===\n');

    // Get page title
    const pageTitle = await page.title();
    console.log('📄 Page Title:', pageTitle);

    // Look for main heading
    const mainHeading = await page.locator('h1').first().textContent().catch(() => null);
    if (mainHeading) {
      console.log('📌 Main Heading:', mainHeading.trim());
    }

    // Look for all navigation links
    console.log('\n🔗 Navigation Links:');
    const navLinks = await page.locator('nav a, header a').allTextContents();
    navLinks.forEach((link, index) => {
      if (link.trim()) {
        console.log(`   ${index + 1}. ${link.trim()}`);
      }
    });

    // Look for all headings on the page
    console.log('\n📋 All Headings on Dashboard:');
    const allHeadings = await page.locator('h1, h2, h3').allTextContents();
    allHeadings.forEach((heading, index) => {
      if (heading.trim()) {
        console.log(`   ${index + 1}. ${heading.trim()}`);
      }
    });

    // Look for buttons
    console.log('\n🔘 Buttons Available:');
    const buttons = await page.locator('button').allTextContents();
    const uniqueButtons = [...new Set(buttons.filter(b => b.trim()))];
    uniqueButtons.forEach((button, index) => {
      console.log(`   ${index + 1}. ${button.trim()}`);
    });

    // Look for main content sections
    console.log('\n📦 Content Structure:');
    const cards = await page.locator('[class*="card"], [class*="panel"], [class*="section"]').count();
    console.log(`   Cards/Panels/Sections: ${cards}`);

    // Check for user info
    const userElements = await page.locator('[class*="user"], [class*="profile"]').allTextContents();
    if (userElements.length > 0) {
      console.log('\n👤 User Info Elements:');
      userElements.forEach((elem, index) => {
        if (elem.trim()) {
          console.log(`   ${index + 1}. ${elem.trim()}`);
        }
      });
    }

    // Get main content area
    const mainContent = await page.locator('main').textContent().catch(() => null);
    if (mainContent) {
      console.log(`\n📄 Main Content Area: ${mainContent.length} characters`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY REPORT');
    console.log('='.repeat(60));
    console.log('✅ Login Status: Successful');
    console.log('🌐 Current URL:', page.url());
    console.log('📊 Dashboard Elements:');
    console.log(`   - Navigation Links: ${navLinks.filter(l => l.trim()).length}`);
    console.log(`   - Headings: ${allHeadings.filter(h => h.trim()).length}`);
    console.log(`   - Unique Buttons: ${uniqueButtons.length}`);
    console.log(`   - Cards/Panels: ${cards}`);
    console.log('='.repeat(60));

    // Wait a few seconds before closing
    console.log('\nKeeping browser open for 5 seconds...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('\n❌ Error occurred:', error.message);
    await page.screenshot({ path: 'playwright-report/error.png', fullPage: true });
    console.error('Error screenshot saved to: error.png');
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');
  }
})();
