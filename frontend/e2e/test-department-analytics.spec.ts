import { test, expect } from '@playwright/test';

test.describe('Department Analytics Widget', () => {
  test('should display and interact with Department Analytics Widget', async ({ page }) => {
    // Navigate to dashboard
    console.log('Navigating to dashboard...');
    await page.goto('http://localhost:3000/dashboard');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we need to login
    const loginForm = await page.locator('form').count();
    if (loginForm > 0) {
      console.log('Login required, logging in...');
      await page.fill('input[type="email"]', 'admin@test.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      console.log('Logged in successfully');
    }

    // Take initial screenshot
    await page.screenshot({
      path: './screenshots/dashboard-full.png',
      fullPage: true
    });
    console.log('Full dashboard screenshot saved');

    // Look for Department Analytics Widget
    // Try multiple selectors to find the widget
    console.log('Looking for Department Analytics Widget...');

    // Check for analytics header/title
    const analyticsHeaders = [
      page.getByText('Analytics', { exact: false }),
      page.getByText('Department Analytics', { exact: false }),
      page.locator('[data-testid="department-analytics"]'),
      page.locator('.luminous-card:has-text("Analytics")'),
    ];

    let widgetFound = false;
    let widgetLocator = null;

    for (const locator of analyticsHeaders) {
      const count = await locator.count();
      if (count > 0) {
        console.log(`Found analytics widget with selector: ${locator}`);
        widgetLocator = locator.first();
        widgetFound = true;
        break;
      }
    }

    if (!widgetFound) {
      console.log('Analytics widget not found with header text, searching for chart icons...');
      const chartIcon = page.locator('svg').filter({ has: page.locator('path[d*="M3"]') });
      const chartCount = await chartIcon.count();
      console.log(`Found ${chartCount} chart-like icons`);

      if (chartCount > 0) {
        widgetLocator = chartIcon.first().locator('..');
        widgetFound = true;
      }
    }

    if (widgetFound && widgetLocator) {
      console.log('Widget found! Analyzing content...');

      // Get the parent card container
      const cardContainer = widgetLocator.locator('..').locator('..');

      // Take screenshot of the widget
      await cardContainer.screenshot({
        path: './screenshots/analytics-widget.png'
      });
      console.log('Analytics widget screenshot saved');

      // Check for status distribution bar (stacked horizontal bar)
      const statusBar = cardContainer.locator('[role="progressbar"], .bg-green-500, .bg-yellow-500, .bg-red-500');
      const statusBarCount = await statusBar.count();
      console.log(`Status bars found: ${statusBarCount}`);

      // Check for status legend
      const legendItems = cardContainer.locator('text=/Approved|In Review|Draft/i');
      const legendCount = await legendItems.count();
      console.log(`Legend items found: ${legendCount}`);

      // Check for stats grid
      const statsTexts = [
        'Total Courses',
        'Approval Rate',
        'Avg. Review Time'
      ];

      for (const statText of statsTexts) {
        const statLocator = cardContainer.getByText(statText, { exact: false });
        const statCount = await statLocator.count();
        console.log(`"${statText}" found: ${statCount > 0 ? 'Yes' : 'No'}`);
      }

      // Test expand/collapse functionality
      console.log('Testing expand/collapse...');
      const header = cardContainer.locator('button, [role="button"]').first();
      const headerCount = await header.count();

      if (headerCount > 0) {
        // Take screenshot before collapse
        await cardContainer.screenshot({
          path: './screenshots/analytics-expanded.png'
        });

        // Click to collapse
        await header.click();
        await page.waitForTimeout(500);

        // Take screenshot after collapse
        await cardContainer.screenshot({
          path: './screenshots/analytics-collapsed.png'
        });
        console.log('Collapsed widget');

        // Click to expand again
        await header.click();
        await page.waitForTimeout(500);
        console.log('Expanded widget again');

        // Final screenshot
        await cardContainer.screenshot({
          path: './screenshots/analytics-final.png'
        });
      } else {
        console.log('No clickable header found for expand/collapse');
      }

      // Get all text content for analysis
      const allText = await cardContainer.textContent();
      console.log('Widget text content:', allText);

    } else {
      console.log('Department Analytics Widget NOT FOUND on dashboard');

      // List all cards on the page for debugging
      const allCards = page.locator('.luminous-card, [class*="card"]');
      const cardCount = await allCards.count();
      console.log(`Total cards found on page: ${cardCount}`);

      for (let i = 0; i < Math.min(cardCount, 10); i++) {
        const cardText = await allCards.nth(i).textContent();
        console.log(`Card ${i + 1}:`, cardText?.substring(0, 100));
      }
    }

    // Get page structure for debugging
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('Page structure length:', bodyHTML.length);
  });
});
