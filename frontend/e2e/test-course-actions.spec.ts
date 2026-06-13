import { test, expect } from './fixtures/ccn-fixtures';
import { loginAsUser, TEST_USERS } from './fixtures/ccn-fixtures';

test.describe('Course List Actions', () => {
  test('should navigate through course workflows', async ({ page }) => {
    // Login first
    await loginAsUser(page, TEST_USERS.faculty);

    // Start from dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');

    console.log('Step 1: Navigate to Courses page');
    // Direct navigation instead of clicking (since sidebar might have visibility issues)
    await page.goto('http://localhost:3000/courses');

    console.log('Step 2: Wait for courses page to load');
    await page.waitForURL('**/courses');
    await page.waitForLoadState('networkidle');

    console.log('Step 3: Click the New Course button');
    await page.click('text=New Course');

    console.log('Step 4: Wait for the page to load');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Give it a moment to render

    console.log('Step 5: Take screenshot of new course editor');
    await page.screenshot({
      path: 'frontend/e2e/screenshots/new-course-editor.png',
      fullPage: true
    });

    console.log('Step 6: Get snapshot of form fields and steps');

    // Check for sidebar steps
    const sidebar = await page.locator('[class*="sidebar"], [class*="step"], nav').first();
    const sidebarText = await sidebar.textContent().catch(() => 'No sidebar found');
    console.log('Sidebar content:', sidebarText);

    // Check for form fields
    const formFields = await page.locator('input, textarea, select').all();
    console.log(`Found ${formFields.length} form fields`);

    const fieldInfo = [];
    for (const field of formFields.slice(0, 10)) { // First 10 fields
      const type = await field.getAttribute('type').catch(() => 'unknown');
      const name = await field.getAttribute('name').catch(() => '');
      const placeholder = await field.getAttribute('placeholder').catch(() => '');
      const label = await field.locator('..').locator('label').first().textContent().catch(() => '');

      fieldInfo.push({
        type,
        name,
        placeholder,
        label: label?.trim()
      });
    }
    console.log('Form fields:', JSON.stringify(fieldInfo, null, 2));

    // Get page title/heading
    const heading = await page.locator('h1, h2').first().textContent().catch(() => 'No heading');
    console.log('Page heading:', heading);

    // Get any step indicators
    const steps = await page.locator('[class*="step"]').all();
    const stepTexts = [];
    for (const step of steps.slice(0, 10)) {
      const text = await step.textContent();
      if (text?.trim()) {
        stepTexts.push(text.trim());
      }
    }
    console.log('Step indicators found:', stepTexts);

    console.log('\n=== NEW COURSE EDITOR SUMMARY ===');
    console.log('Heading:', heading);
    console.log('Form fields count:', formFields.length);
    console.log('Steps/sections:', stepTexts.length > 0 ? stepTexts : 'None visible');

    console.log('\nStep 8: Navigate back to courses list');
    // Try clicking breadcrumb or navigation
    const coursesNavLink = await page.locator('a:has-text("Courses")').first();
    await coursesNavLink.click();

    await page.waitForURL('**/courses');
    await page.waitForLoadState('networkidle');

    console.log('Step 9: Click on an existing course card');
    // Find a course card (not the New Course button)
    const courseCards = await page.locator('[class*="course"], [class*="card"]').all();
    console.log(`Found ${courseCards.length} potential course cards`);

    // Look for a specific course card pattern (avoiding "New Course")
    const existingCourse = await page.locator('div:has-text("MATH"), div:has-text("ENGL"), div:has-text("HIST")').first();

    if (await existingCourse.isVisible()) {
      await existingCourse.click();
    } else {
      // Fallback: click second card if first is "New Course"
      const allCards = await page.locator('[role="button"], button, a').filter({ hasText: /[A-Z]{3,4}\s+\d+/ }).first();
      await allCards.click();
    }

    console.log('Step 10: Wait for course detail/editor to load');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('Step 11: Take screenshot of existing course');
    await page.screenshot({
      path: 'frontend/e2e/screenshots/existing-course-editor.png',
      fullPage: true
    });

    console.log('Step 12: Report what we see');

    // Get course title/code
    const courseTitle = await page.locator('h1, h2').first().textContent().catch(() => 'No title');
    console.log('Course title:', courseTitle);

    // Check for tabs or sections
    const tabs = await page.locator('[role="tab"], [class*="tab"]').all();
    const tabTexts = [];
    for (const tab of tabs) {
      const text = await tab.textContent();
      if (text?.trim()) {
        tabTexts.push(text.trim());
      }
    }
    console.log('Tabs found:', tabTexts);

    // Check for edit mode indicators
    const editButtons = await page.locator('button:has-text("Edit"), button:has-text("Save"), button:has-text("Cancel")').all();
    console.log('Action buttons:', editButtons.length);

    console.log('\n=== EXISTING COURSE EDITOR SUMMARY ===');
    console.log('Course title:', courseTitle);
    console.log('Tabs/sections:', tabTexts.length > 0 ? tabTexts : 'None visible');
    console.log('Action buttons found:', editButtons.length);
  });
});
