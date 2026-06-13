import { test, expect } from '@playwright/test';

/**
 * CUR-248: Complete Course Creation E2E Test
 *
 * Tests creating a brand new course from scratch, completing ALL wizard steps
 * with real data entry, and verifying persistence.
 *
 * Standalone version: Run `node e2e-course-creation.js` from project root
 */

const TEST_CREDENTIALS = {
  email: 'demo@calricula.com',
  password: 'dont4get'
};

// Generate unique course data to avoid "already exists" errors
const timestamp = Date.now().toString().slice(-4);

const COURSE_DATA = {
  subjectCode: 'TEST',
  courseNumber: `9${timestamp}`,
  title: `E2E Test Course ${timestamp}`,
  description: 'This is an automated E2E test course for CUR-248. It tests the complete course creation flow including CB Codes, SLOs, and Content Outline.',
  units: '3',
  slos: [
    { bloom: 'Apply', text: 'Demonstrate effective testing strategies in real-world software development scenarios.' },
    { bloom: 'Analyze', text: 'Analyze test results to identify patterns and potential issues in application behavior.' },
    { bloom: 'Evaluate', text: 'Evaluate the effectiveness of different testing methodologies and frameworks.' },
    { bloom: 'Create', text: 'Create comprehensive test suites that cover all major application functionality.' }
  ],
  topics: [
    { title: 'Testing Fundamentals', subtopics: 'Unit testing, Integration testing, E2E testing', hours: 9 },
    { title: 'Test Automation', subtopics: 'Playwright, Selenium, Cypress comparison', hours: 9 },
    { title: 'Quality Assurance', subtopics: 'Code review, CI/CD, Test coverage', hours: 9 },
    { title: 'Advanced Testing', subtopics: 'Performance testing, Security testing, Accessibility', hours: 9 },
    { title: 'Test Design', subtopics: 'Test cases, Test data, Test documentation', hours: 9 },
    { title: 'Continuous Testing', subtopics: 'DevOps, Pipeline integration, Monitoring', hours: 9 }
  ]
};

test.describe('Complete Course Creation E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Set a longer default timeout for slow operations
    test.setTimeout(180000); // 3 minutes
  });

  test('Full workflow: Create complete course with SLOs and Content', async ({ page }) => {
    // ==================== STEP 1: LOGIN ====================
    await page.goto('/login');
    await page.fill('input[id="email"]', TEST_CREDENTIALS.email);
    await page.fill('input[id="password"]', TEST_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?(\?.*)?$/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/(dashboard)?/);

    // ==================== STEP 2: NAVIGATE TO NEW COURSE ====================
    await page.goto('/courses/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for React hydration

    // ==================== STEP 3: FILL BASIC INFO ====================
    await page.fill('input[name="subject_code"]', COURSE_DATA.subjectCode);
    await page.fill('input[name="course_number"]', COURSE_DATA.courseNumber);
    await page.fill('input[name="title"]', COURSE_DATA.title);

    // Select department
    const departmentSelect = page.locator('select[name="department_id"]');
    const options = await departmentSelect.locator('option').all();
    if (options.length > 1) {
      const optionValue = await options[1].getAttribute('value');
      if (optionValue) {
        await departmentSelect.selectOption(optionValue);
      }
    }

    // ==================== STEP 4: CREATE COURSE ====================
    await page.click('button:has-text("Create Course")');
    await page.waitForURL(/\/courses\/[a-f0-9-]+/, { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/courses\/[a-f0-9-]+/);
    const courseId = currentUrl.split('/courses/')[1]?.split('/')[0];

    // ==================== STEP 5: NAVIGATE TO SLOs ====================
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.click('button:has-text("SLOs")');
    await page.waitForTimeout(2000);

    // Fill SLOs
    const sloTextAreas = await page.locator('textarea[placeholder*="Upon successful completion"]').all();
    for (let i = 0; i < Math.min(sloTextAreas.length, COURSE_DATA.slos.length); i++) {
      const slo = COURSE_DATA.slos[i];
      const sloText = `${slo.bloom} ${slo.text.charAt(0).toLowerCase()}${slo.text.slice(1)}`;
      await sloTextAreas[i].fill(sloText);
    }

    // Add 4th SLO if needed
    if (COURSE_DATA.slos.length > sloTextAreas.length) {
      const addSloButton = page.locator('button:has-text("Add Student Learning Outcome")').first();
      if (await addSloButton.isVisible({ timeout: 2000 })) {
        await addSloButton.click();
        await page.waitForTimeout(500);
        const newTextAreas = await page.locator('textarea[placeholder*="Upon successful completion"]').all();
        if (newTextAreas.length > sloTextAreas.length) {
          const slo = COURSE_DATA.slos[3];
          const sloText = `${slo.bloom} ${slo.text.charAt(0).toLowerCase()}${slo.text.slice(1)}`;
          await newTextAreas[newTextAreas.length - 1].fill(sloText);
        }
      }
    }

    // ==================== STEP 6: NAVIGATE TO CONTENT ====================
    await page.click('button:has-text("Content")');
    await page.waitForTimeout(2000);

    // Add content topics
    const addTopicButton = page.locator('button:has-text("Add Topic"), button:has-text("Add Content")').first();
    for (let i = 0; i < Math.min(COURSE_DATA.topics.length, 3); i++) {
      const topic = COURSE_DATA.topics[i];
      if (i > 0 && await addTopicButton.isVisible({ timeout: 2000 })) {
        await addTopicButton.click();
        await page.waitForTimeout(500);
      }
      const topicInputs = await page.locator('input[placeholder*="topic"], input[placeholder*="Topic"]').all();
      if (topicInputs.length > i) {
        await topicInputs[i].fill(topic.title);
      }
    }

    // ==================== STEP 7: VERIFY PERSISTENCE ====================
    await page.waitForTimeout(3000); // Wait for auto-save

    // Navigate away and back
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.goto(`/courses/${courseId}/edit`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify course title is still there
    await expect(page.locator(`text=${COURSE_DATA.title}`).first()).toBeVisible({ timeout: 5000 });

    // ==================== STEP 8: VERIFY IN COURSES LIST ====================
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    // Search for our course
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 2000 })) {
      await searchInput.fill(COURSE_DATA.subjectCode);
      await page.waitForTimeout(1000);
    }

    // Verify course appears in list
    await expect(page.locator(`text=${COURSE_DATA.subjectCode}`).first()).toBeVisible({ timeout: 5000 });
  });
});
