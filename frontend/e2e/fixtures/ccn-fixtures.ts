/**
 * CCN E2E Test Fixtures
 *
 * Provides test data and helper functions for CCN workflow E2E tests.
 */

import { test as base, Page } from '@playwright/test';

// Test user credentials (for dev mode or test environment)
export const TEST_USERS = {
  faculty: {
    email: 'faculty@calricula.com',
    password: 'Test123!',
    role: 'Faculty',
  },
  chair: {
    email: 'chair@calricula.com',
    password: 'Test123!',
    role: 'CurriculumChair',
  },
  admin: {
    email: 'admin@calricula.com',
    password: 'Test123!',
    role: 'Admin',
  },
};

// Sample courses for testing
export const TEST_COURSES = {
  mathCalculus: {
    subjectCode: 'MATH',
    courseNumber: '261',
    title: 'Calculus I',
    units: 4,
    description: 'Introduction to differential calculus',
    expectsCCNMatch: true,
  },
  automotiveTech: {
    subjectCode: 'AUTO',
    courseNumber: '101',
    title: 'Automotive Technology Basics',
    units: 3,
    description: 'Introduction to automotive repair and maintenance',
    expectsCCNMatch: false, // CTE course, no CCN standard
  },
  englishComp: {
    subjectCode: 'ENGL',
    courseNumber: '101',
    title: 'English Composition',
    units: 3,
    description: 'College-level writing and critical thinking',
    expectsCCNMatch: true,
  },
};

// CCN Non-match justification reasons
export const JUSTIFICATION_REASONS = {
  specialized: {
    code: 'specialized',
    label: 'Specialized Content',
    description: 'Course covers specialized content not in CCN templates',
  },
  vocational: {
    code: 'vocational',
    label: 'Vocational/CTE Course',
    description: 'Career technical education course outside CCN scope',
  },
  localNeed: {
    code: 'local_need',
    label: 'Local Need',
    description: 'Course addresses specific local workforce or community needs',
  },
  newCourse: {
    code: 'new_course',
    label: 'New Course',
    description: 'Course is new and CCN template may not yet exist',
  },
  other: {
    code: 'other',
    label: 'Other',
    description: 'Other reason',
  },
};

/**
 * Helper to login via the dev mode
 */
export async function loginAsUser(
  page: Page,
  user: { email: string; password: string }
): Promise<void> {
  await page.goto('/login');

  // Wait for login form
  await page.waitForSelector('input[type="email"]');

  // Fill credentials
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for redirect (should go to dashboard or previous page)
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 10000,
  });
}

/**
 * Helper to navigate to course editor
 */
export async function navigateToCourseEditor(
  page: Page,
  courseId: string
): Promise<void> {
  await page.goto(`/courses/${courseId}/edit`);
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to navigate to CB Codes section in course editor
 */
export async function navigateToCBCodesSection(page: Page): Promise<void> {
  // Click on CB Codes tab/section
  const cbCodesTab = page.locator('text=CB Codes').first();
  await cbCodesTab.click();

  // Wait for CCN detection to start
  await page.waitForSelector('text=Common Course Numbering', { timeout: 10000 });
}

/**
 * Helper to wait for CCN detection to complete
 */
export async function waitForCCNDetection(page: Page): Promise<string> {
  // Wait for either match found or no match
  const result = await Promise.race([
    page.waitForSelector('text=C-ID Standard Match Found', { timeout: 15000 }).then(() => 'match'),
    page.waitForSelector('text=No CCN Standard Found', { timeout: 15000 }).then(() => 'no_match'),
    page.waitForSelector('text=Unable to Check CCN Standards', { timeout: 15000 }).then(() => 'error'),
  ]);

  return result;
}

/**
 * Extended test fixture with CCN helpers
 */
export const test = base.extend<{
  loginAs: (userType: 'faculty' | 'chair' | 'admin') => Promise<void>;
}>({
  loginAs: async ({ page }, use) => {
    const loginAs = async (userType: 'faculty' | 'chair' | 'admin') => {
      const user = TEST_USERS[userType];
      await loginAsUser(page, user);
    };
    await use(loginAs);
  },
});

export { expect } from '@playwright/test';
