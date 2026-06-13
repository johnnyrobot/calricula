/**
 * Simple Playwright script to test sidebar panels
 * Run with: node test-sidebar.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  // Ensure test-results directory exists
  const resultsDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('\n=== Testing Course Editor Sidebar Panels ===\n');
    console.log(`Screenshots will be saved to: ${resultsDir}\n`);

    // Step 1: Enable dev auth bypass using localStorage
    console.log('1. Enabling dev auth bypass...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Set localStorage flag for dev auth bypass
    await page.evaluate(() => {
      localStorage.setItem('DEV_AUTH_BYPASS', 'true');
      localStorage.setItem('dev_user_email', 'faculty@calricula.com');
    });
    console.log('   Dev auth bypass enabled in localStorage');

    // Reload to apply the auth bypass
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const homeScreenshot = path.join(resultsDir, 'sidebar-home-page.png');
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    console.log(`   Screenshot saved: ${homeScreenshot}`);

    // Click "Get Started" or navigate to dashboard
    console.log('\n2. Clicking Get Started...');
    const getStartedButton = page.locator('button:has-text("Get Started"), a:has-text("Get Started")').first();
    if (await getStartedButton.isVisible().catch(() => false)) {
      await getStartedButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log('   Clicked Get Started');
    } else {
      // Or navigate directly to dashboard
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log('   Navigated to dashboard');
    }

    const dashboardScreenshot = path.join(resultsDir, 'sidebar-dashboard.png');
    await page.screenshot({ path: dashboardScreenshot, fullPage: true });
    console.log(`   Screenshot saved: ${dashboardScreenshot}`);

    // Navigate to courses list
    console.log('\n3. Navigating to courses list...');
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take initial screenshot
    const screenshotPath = path.join(resultsDir, 'sidebar-courses-list.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   Screenshot saved: ${screenshotPath}`);

    // Check page content
    const pageText = await page.textContent('body').catch(() => '');
    console.log(`   Page contains text (first 300 chars): ${pageText.substring(0, 300)}...`);

    // Click on first course
    console.log('\n4. Looking for first course...');

    // Try multiple selectors for course links
    const courseLinkSelectors = [
      'a[href^="/courses/"][href*="edit"]',
      'a[href^="/courses/"]:not([href="/courses"])',
      'tr a[href^="/courses/"]',
      'div a[href^="/courses/"]',
    ];

    let courseLink = null;
    for (const selector of courseLinkSelectors) {
      const link = page.locator(selector).first();
      if (await link.isVisible().catch(() => false)) {
        courseLink = link;
        console.log(`   Found course link with selector: ${selector}`);
        break;
      }
    }

    if (!courseLink) {
      courseLink = page.locator('a[href^="/courses/"]').first();
    }

    if (await courseLink.isVisible()) {
      const courseText = await courseLink.textContent();
      console.log(`   Found course: ${courseText}`);

      await courseLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Take screenshot of course editor
      const editorScreenshot = path.join(resultsDir, 'sidebar-editor-initial.png');
      await page.screenshot({ path: editorScreenshot, fullPage: true });
      console.log(`   Screenshot saved: ${editorScreenshot}`);

      // Get page title
      const title = await page.title();
      console.log(`   Page title: ${title}`);

      // Look for main heading
      const heading = await page.locator('h1, h2').first().textContent();
      console.log(`   Main heading: ${heading}`);

      // Search for panel buttons
      console.log('\n5. Searching for panel buttons...');

      const buttonSelectors = [
        { name: 'Materials', selectors: ['button:has-text("Materials")', 'button[aria-label*="Materials"]'] },
        { name: 'Comments', selectors: ['button:has-text("Comments")', 'button[aria-label*="Comments"]'] },
        { name: 'Compliance', selectors: ['button:has-text("Compliance")', 'button[aria-label*="Compliance"]'] },
        { name: 'AI Assist', selectors: ['button:has-text("AI")', 'button[aria-label*="AI"]'] },
      ];

      const foundButtons = [];

      for (const buttonConfig of buttonSelectors) {
        for (const selector of buttonConfig.selectors) {
          const button = page.locator(selector).first();
          if (await button.isVisible()) {
            const text = await button.textContent().catch(() => '');
            const ariaLabel = await button.getAttribute('aria-label').catch(() => '');
            console.log(`   ✓ Found ${buttonConfig.name} button`);
            console.log(`     Selector: ${selector}`);
            console.log(`     Text: "${text}"`);
            console.log(`     Aria-label: "${ariaLabel}"`);
            foundButtons.push({ ...buttonConfig, selector, button });
            break;
          }
        }
      }

      if (foundButtons.length === 0) {
        console.log('   ✗ No panel buttons found in expected locations');
        console.log('\n   Looking for all buttons in the page...');

        const allButtons = page.locator('button');
        const buttonCount = await allButtons.count();
        console.log(`   Total buttons on page: ${buttonCount}`);

        for (let i = 0; i < Math.min(buttonCount, 20); i++) {
          const btn = allButtons.nth(i);
          if (await btn.isVisible()) {
            const text = await btn.textContent().catch(() => '');
            const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
            const className = await btn.getAttribute('class').catch(() => '');
            console.log(`   Button ${i + 1}: text="${text.trim()}" aria-label="${ariaLabel}" class="${className.substring(0, 50)}"`);
          }
        }
      }

      // Test the first found panel button
      if (foundButtons.length > 0) {
        console.log(`\n6. Testing ${foundButtons[0].name} panel...`);
        await foundButtons[0].button.click();
        await page.waitForTimeout(1500);

        const panelScreenshot = path.join(resultsDir, `sidebar-${foundButtons[0].name.toLowerCase().replace(' ', '-')}-open.png`);
        await page.screenshot({ path: panelScreenshot, fullPage: true });
        console.log(`   Screenshot saved: ${panelScreenshot}`);

        // Look for panel content
        const panels = page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]');
        const panelCount = await panels.count();
        console.log(`   Panels/sidebars visible: ${panelCount}`);

        if (panelCount > 0) {
          const content = await panels.first().textContent().catch(() => '');
          console.log(`   Panel content (first 200 chars): ${content.substring(0, 200)}...`);
        }

        // Look for close button
        console.log('\n7. Looking for close button...');
        const closeSelectors = [
          'button:has-text("Close")',
          'button[aria-label*="Close"]',
          'button[aria-label*="close"]',
          'button svg[class*="x"]',
        ];

        let closedPanel = false;
        for (const selector of closeSelectors) {
          const closeButton = page.locator(selector).first();
          if (await closeButton.isVisible()) {
            console.log(`   ✓ Found close button: ${selector}`);
            await closeButton.click();
            await page.waitForTimeout(1000);
            const closeScreenshot = path.join(resultsDir, 'sidebar-after-close.png');
            await page.screenshot({ path: closeScreenshot, fullPage: true });
            console.log(`   Screenshot saved: ${closeScreenshot}`);
            closedPanel = true;
            break;
          }
        }

        if (!closedPanel) {
          console.log('   ✗ No close button found');
        }

        // Try clicking another panel if available
        if (foundButtons.length > 1) {
          console.log(`\n8. Testing ${foundButtons[1].name} panel...`);
          await foundButtons[1].button.click();
          await page.waitForTimeout(1500);

          const panel2Screenshot = path.join(resultsDir, `sidebar-${foundButtons[1].name.toLowerCase().replace(' ', '-')}-open.png`);
          await page.screenshot({ path: panel2Screenshot, fullPage: true });
          console.log(`   Screenshot saved: ${panel2Screenshot}`);

          const content = await page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]').first().textContent().catch(() => '');
          console.log(`   Panel content (first 200 chars): ${content.substring(0, 200)}...`);
        }
      }

    } else {
      console.log('   ✗ No courses found in the list');
    }

    console.log('\n=== Test Complete ===\n');
    console.log('Screenshots saved in test-results/ directory');

    // Keep browser open for 5 seconds to review
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error during test:', error);
    const errorScreenshot = path.join(resultsDir, 'sidebar-error.png');
    await page.screenshot({ path: errorScreenshot, fullPage: true });
  } finally {
    await browser.close();
  }
})();
