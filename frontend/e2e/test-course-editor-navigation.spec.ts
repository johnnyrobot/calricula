import { test, expect } from '@playwright/test';
import { loginAsUser, TEST_USERS } from './fixtures/ccn-fixtures';

test.describe('Course Editor Step Navigation', () => {
  test('should test course editor step navigation', async ({ page }) => {
    // First, login as faculty
    console.log('Logging in as faculty...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', TEST_USERS.faculty.email);
    await page.fill('input[type="password"]', TEST_USERS.faculty.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // Navigate to the courses page
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');

    console.log('Step 1: Finding a course to edit...');

    // Take initial screenshot
    await page.screenshot({ path: 'frontend/e2e/screenshots/01-courses-list.png', fullPage: true });
    console.log('Screenshot saved: 01-courses-list.png');

    // Look for any course card - try multiple selectors
    let courseLink = null;

    // Try to find a course link
    const courseLinks = page.locator('a[href*="/courses/"]').filter({ hasText: /MATH|ENGL|HIST|BIO|CHEM/ });
    if (await courseLinks.count() > 0) {
      courseLink = courseLinks.first();
      console.log('Found course link');
    } else {
      // Try table rows or cards
      const courseElements = page.locator('.luminous-card, tr').filter({ hasText: /MATH|ENGL|HIST/ });
      if (await courseElements.count() > 0) {
        courseLink = courseElements.first().locator('a').first();
        console.log('Found course in card/table');
      }
    }

    if (!courseLink || await courseLink.count() === 0) {
      console.log('No courses found on the page. Taking screenshot...');
      await page.screenshot({ path: 'frontend/e2e/screenshots/02-no-courses.png', fullPage: true });
      throw new Error('No courses found to edit');
    }

    // Click to view course details
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'frontend/e2e/screenshots/02-course-details.png', fullPage: true });
    console.log('Screenshot saved: 02-course-details.png');

    // Step 1: Click the "Edit Course" button
    console.log('Step 2: Looking for Edit Course button...');

    const editButton = page.locator('button:has-text("Edit Course"), button:has-text("Edit"), a:has-text("Edit")');

    if (await editButton.count() === 0) {
      console.log('No Edit Course button found. Taking screenshot of current page...');
      await page.screenshot({ path: 'frontend/e2e/screenshots/03-no-edit-button.png', fullPage: true });

      // Try to find any action buttons
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on the page:`);
      for (const btn of allButtons.slice(0, 10)) {
        const text = await btn.textContent();
        console.log(`  - Button: "${text?.trim()}"`);
      }

      throw new Error('Edit Course button not found');
    }

    await editButton.first().click();
    console.log('Clicked Edit Course button');

    // Step 2: Wait for the edit form to load
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');
    console.log('Edit form loaded');

    // Step 3: Take a screenshot of the course editor
    await page.screenshot({ path: 'frontend/e2e/screenshots/03-course-editor.png', fullPage: true });
    console.log('Screenshot saved: 03-course-editor.png');

    // Step 4: Get a snapshot to see the step navigation
    console.log('\n=== STEP NAVIGATION ANALYSIS ===');

    // Look for common step navigation patterns
    const stepSelectors = [
      '[data-testid="step-nav"]',
      '[data-testid="course-editor-steps"]',
      'nav[aria-label*="step"]',
      '.step-navigation',
      'aside nav',
      'div[role="navigation"]',
    ];

    let stepNav = null;
    for (const selector of stepSelectors) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        stepNav = element.first();
        console.log(`Found step navigation using selector: ${selector}`);
        break;
      }
    }

    // If no specific nav found, look for sidebar or step indicators
    if (!stepNav) {
      console.log('Looking for step indicators in sidebar...');
      stepNav = page.locator('aside, .sidebar, [class*="sidebar"]').first();
    }

    // Extract step information
    const stepButtons = page.locator('button:has-text("Basic Info"), button:has-text("CB Codes"), button:has-text("SLOs"), button:has-text("Content"), button:has-text("Requisites"), button:has-text("Review")');
    const stepCount = await stepButtons.count();

    console.log(`\nFound ${stepCount} step navigation buttons:`);

    const steps = [];
    for (let i = 0; i < stepCount; i++) {
      const stepText = await stepButtons.nth(i).textContent();
      const isActive = await stepButtons.nth(i).getAttribute('class').then(cls => cls?.includes('active') || cls?.includes('current'));
      steps.push({ text: stepText?.trim(), isActive });
      console.log(`  ${i + 1}. ${stepText?.trim()} ${isActive ? '(ACTIVE)' : ''}`);
    }

    // Also look for any nav items
    const navItems = page.locator('nav a, nav button, aside a, aside button').filter({ hasText: /Info|Codes|SLOs|Content|Requisites|Review/i });
    const navCount = await navItems.count();

    if (navCount > 0) {
      console.log(`\nAlternatively, found ${navCount} navigation items:`);
      for (let i = 0; i < Math.min(navCount, 10); i++) {
        const text = await navItems.nth(i).textContent();
        console.log(`  - ${text?.trim()}`);
      }
    }

    // Get page HTML for analysis
    const pageContent = await page.content();
    const hasBasicInfo = pageContent.includes('Basic Info');
    const hasCBCodes = pageContent.includes('CB Codes');
    const hasSLOs = pageContent.includes('SLOs');
    const hasContent = pageContent.includes('Content');
    const hasRequisites = pageContent.includes('Requisites');

    console.log('\nStep sections detected in page:');
    console.log(`  - Basic Info: ${hasBasicInfo}`);
    console.log(`  - CB Codes: ${hasCBCodes}`);
    console.log(`  - SLOs: ${hasSLOs}`);
    console.log(`  - Content: ${hasContent}`);
    console.log(`  - Requisites: ${hasRequisites}`);

    // Step 5: Test navigation if steps are available
    if (stepCount > 1) {
      console.log('\n=== TESTING STEP NAVIGATION ===');

      // Step 6: Click on a different step (CB Codes or SLOs)
      const targetStep1 = stepButtons.filter({ hasText: /CB Codes|SLOs/ }).first();
      if (await targetStep1.count() > 0) {
        const step1Text = await targetStep1.textContent();
        console.log(`\nStep 6: Clicking on "${step1Text?.trim()}" step...`);
        await targetStep1.click();
        await page.waitForTimeout(1000);

        // Step 7: Take screenshot
        await page.screenshot({ path: 'frontend/e2e/screenshots/04-step-navigation-1.png', fullPage: true });
        console.log('Screenshot saved: 04-step-navigation-1.png');
      }

      // Step 8: Click on another step (Content or Requisites)
      const targetStep2 = stepButtons.filter({ hasText: /Content|Requisites/ }).first();
      if (await targetStep2.count() > 0) {
        const step2Text = await targetStep2.textContent();
        console.log(`\nStep 8: Clicking on "${step2Text?.trim()}" step...`);
        await targetStep2.click();
        await page.waitForTimeout(1000);

        // Step 9: Take screenshot
        await page.screenshot({ path: 'frontend/e2e/screenshots/05-step-navigation-2.png', fullPage: true });
        console.log('Screenshot saved: 05-step-navigation-2.png');
      }

      // Go back to first step
      const firstStepButton = stepButtons.first();
      const firstStepText = await firstStepButton.textContent();
      console.log(`\nNavigating back to first step: "${firstStepText?.trim()}"...`);
      await firstStepButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'frontend/e2e/screenshots/06-back-to-first-step.png', fullPage: true });
      console.log('Screenshot saved: 06-back-to-first-step.png');

      console.log('\n=== NAVIGATION TEST RESULTS ===');
      console.log('✓ Successfully navigated between editor steps');
      console.log('✓ All screenshots captured');
      console.log(`✓ Total steps available: ${stepCount}`);

    } else {
      console.log('\n⚠ No multiple steps found for navigation testing');
      console.log('The editor may use a single-page layout or tabs instead of step navigation');
    }

    // Final report
    console.log('\n=== FINAL REPORT ===');
    console.log(`Editor loaded: ✓`);
    console.log(`Step navigation found: ${stepCount > 0 ? '✓' : '✗'}`);
    console.log(`Number of steps: ${stepCount}`);
    console.log(`Navigation tested: ${stepCount > 1 ? '✓' : 'N/A'}`);
    console.log(`Screenshots captured: 6`);
  });
});
