/**
 * Sidebar Panels E2E Tests
 *
 * Tests for the right sidebar panels in the course editor:
 * - Materials panel
 * - Comments panel
 * - Compliance panel
 * - AI Assist panel
 *
 * Prerequisites:
 * - Backend running at http://localhost:8000
 * - Frontend running at http://localhost:3000
 * - Test database with seeded courses
 *
 * Run with:
 *   npx playwright test e2e/sidebar-panels.spec.ts --headed
 */

import { test, expect } from '@playwright/test';

test.describe('Course Editor Sidebar Panels', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to courses list
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');

    // Click on first available course to enter editor
    const courseLink = page.locator('a[href^="/courses/"]').first();
    if (await courseLink.isVisible()) {
      await courseLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should capture initial course editor state', async ({ page }) => {
    // Take initial screenshot
    await page.screenshot({ path: 'test-results/sidebar-initial.png', fullPage: true });

    // Get page title to verify we're in the course editor
    const title = await page.title();
    console.log('Page title:', title);

    // Look for common editor elements
    const heading = await page.locator('h1, h2').first().textContent();
    console.log('Main heading:', heading);
  });

  test('should identify and test sidebar panel buttons', async ({ page }) => {
    console.log('\n=== Looking for sidebar panel buttons ===\n');

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/sidebar-before-panels.png', fullPage: true });

    // Look for common panel button patterns
    const panelButtonSelectors = [
      'button:has-text("Materials")',
      'button:has-text("Comments")',
      'button:has-text("Compliance")',
      'button:has-text("AI Assist")',
      'button[aria-label*="Materials"]',
      'button[aria-label*="Comments"]',
      'button[aria-label*="Compliance"]',
      'button[aria-label*="AI"]',
      '[data-panel="materials"]',
      '[data-panel="comments"]',
      '[data-panel="compliance"]',
      '[data-panel="ai-assist"]',
      // Icon-based buttons
      'button svg[class*="shield"]',
      'button svg[class*="comment"]',
      'button svg[class*="book"]',
      'button svg[class*="sparkle"]',
    ];

    let foundButtons = [];

    for (const selector of panelButtonSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        const text = await button.textContent().catch(() => '');
        const ariaLabel = await button.getAttribute('aria-label').catch(() => '');
        console.log(`Found button: ${selector}`);
        console.log(`  Text: ${text}`);
        console.log(`  Aria-label: ${ariaLabel}`);
        foundButtons.push({ selector, text, ariaLabel });
      }
    }

    console.log(`\nTotal buttons found: ${foundButtons.length}\n`);

    // Also look for any buttons in the header/toolbar area
    const headerButtons = page.locator('header button, [role="toolbar"] button, nav button');
    const headerButtonCount = await headerButtons.count();
    console.log(`Header/toolbar buttons found: ${headerButtonCount}`);

    for (let i = 0; i < Math.min(headerButtonCount, 10); i++) {
      const button = headerButtons.nth(i);
      const text = await button.textContent().catch(() => '');
      const ariaLabel = await button.getAttribute('aria-label').catch(() => '');
      console.log(`  Button ${i + 1}: text="${text}" aria-label="${ariaLabel}"`);
    }
  });

  test('should test Compliance panel if available', async ({ page }) => {
    console.log('\n=== Testing Compliance Panel ===\n');

    // Try multiple selectors for compliance panel button
    const complianceSelectors = [
      'button:has-text("Compliance")',
      'button[aria-label*="Compliance"]',
      '[data-panel="compliance"]',
      'button svg[class*="shield"]',
      'button:has([data-icon="shield"])',
    ];

    let clicked = false;
    for (const selector of complianceSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        console.log(`Clicking Compliance button: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      // Wait for panel to open
      await page.waitForTimeout(1000);

      // Take screenshot with panel open
      await page.screenshot({ path: 'test-results/sidebar-compliance-panel.png', fullPage: true });

      // Look for panel content
      const panelContent = page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]');
      const panelCount = await panelContent.count();
      console.log(`Panels/dialogs found: ${panelCount}`);

      if (panelCount > 0) {
        const content = await panelContent.first().textContent().catch(() => '');
        console.log(`Panel content preview: ${content.substring(0, 200)}...`);
      }
    } else {
      console.log('Compliance panel button not found');
    }
  });

  test('should test AI Assist panel if available', async ({ page }) => {
    console.log('\n=== Testing AI Assist Panel ===\n');

    // Try multiple selectors for AI Assist panel button
    const aiSelectors = [
      'button:has-text("AI Assist")',
      'button:has-text("AI")',
      'button[aria-label*="AI"]',
      '[data-panel="ai-assist"]',
      'button svg[class*="sparkle"]',
      'button:has([data-icon="sparkles"])',
    ];

    let clicked = false;
    for (const selector of aiSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        console.log(`Clicking AI Assist button: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      // Wait for panel to open
      await page.waitForTimeout(1000);

      // Take screenshot with panel open
      await page.screenshot({ path: 'test-results/sidebar-ai-assist-panel.png', fullPage: true });

      // Look for panel content
      const panelContent = page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]');
      const panelCount = await panelContent.count();
      console.log(`Panels/dialogs found: ${panelCount}`);

      if (panelCount > 0) {
        const content = await panelContent.first().textContent().catch(() => '');
        console.log(`Panel content preview: ${content.substring(0, 200)}...`);
      }

      // Look for close button
      const closeSelectors = [
        'button:has-text("Close")',
        'button[aria-label*="Close"]',
        'button svg[class*="x-mark"]',
        '[data-close]',
      ];

      for (const selector of closeSelectors) {
        const closeButton = page.locator(selector).first();
        if (await closeButton.isVisible()) {
          console.log(`Found close button: ${selector}`);
          await closeButton.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: 'test-results/sidebar-after-close.png', fullPage: true });
          break;
        }
      }
    } else {
      console.log('AI Assist panel button not found');
    }
  });

  test('should test Comments panel if available', async ({ page }) => {
    console.log('\n=== Testing Comments Panel ===\n');

    const commentSelectors = [
      'button:has-text("Comments")',
      'button[aria-label*="Comments"]',
      '[data-panel="comments"]',
      'button svg[class*="chat"]',
      'button:has([data-icon="chat"])',
    ];

    let clicked = false;
    for (const selector of commentSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        console.log(`Clicking Comments button: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/sidebar-comments-panel.png', fullPage: true });

      const panelContent = page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]');
      const panelCount = await panelContent.count();
      console.log(`Panels/dialogs found: ${panelCount}`);

      if (panelCount > 0) {
        const content = await panelContent.first().textContent().catch(() => '');
        console.log(`Panel content preview: ${content.substring(0, 200)}...`);
      }
    } else {
      console.log('Comments panel button not found');
    }
  });

  test('should test Materials panel if available', async ({ page }) => {
    console.log('\n=== Testing Materials Panel ===\n');

    const materialSelectors = [
      'button:has-text("Materials")',
      'button[aria-label*="Materials"]',
      '[data-panel="materials"]',
      'button svg[class*="book"]',
      'button:has([data-icon="book"])',
    ];

    let clicked = false;
    for (const selector of materialSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        console.log(`Clicking Materials button: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/sidebar-materials-panel.png', fullPage: true });

      const panelContent = page.locator('[role="dialog"], aside, [class*="panel"], [class*="sidebar"]');
      const panelCount = await panelContent.count();
      console.log(`Panels/dialogs found: ${panelCount}`);

      if (panelCount > 0) {
        const content = await panelContent.first().textContent().catch(() => '');
        console.log(`Panel content preview: ${content.substring(0, 200)}...`);
      }
    } else {
      console.log('Materials panel button not found');
    }
  });
});
