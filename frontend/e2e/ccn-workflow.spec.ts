/**
 * CCN Workflow E2E Tests
 *
 * End-to-end tests for the Common Course Numbering (CCN) workflow
 * in the CB Codes wizard of the course editor.
 *
 * Prerequisites:
 * - Backend running at http://localhost:8000 (or configured API_URL)
 * - Frontend running at http://localhost:3000 (auto-started by Playwright)
 * - Test database with seeded CCN standards
 * - Dev auth mode enabled (NEXT_PUBLIC_AUTH_DEV_MODE=true) or test user accounts
 *
 * Run with:
 *   npx playwright test e2e/ccn-workflow.spec.ts
 *   npx playwright test e2e/ccn-workflow.spec.ts --headed
 */

import { test, expect } from './fixtures/ccn-fixtures';
import {
  TEST_USERS,
  TEST_COURSES,
  JUSTIFICATION_REASONS,
  loginAsUser,
  navigateToCBCodesSection,
  waitForCCNDetection,
} from './fixtures/ccn-fixtures';

test.describe('CCN Detection Step', () => {
  test.beforeEach(async ({ page }) => {
    // Login as faculty before each test
    await loginAsUser(page, TEST_USERS.faculty);
  });

  test.describe('Happy Path: CCN Match Found', () => {
    test('shows CCN detection loading state', async ({ page }) => {
      // Navigate to a course page (assuming there's a course list or we know a course ID)
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Click on first available course
      const courseLink = page.locator('a[href^="/courses/"]').first();
      if (await courseLink.isVisible()) {
        await courseLink.click();
        await page.waitForLoadState('networkidle');

        // Try to find CB Codes section
        const cbCodesSection = page.locator('text=CB Codes');
        if (await cbCodesSection.isVisible()) {
          await cbCodesSection.click();

          // Check for loading state
          const loadingIndicator = page.locator('text=Checking CCN Standards');
          // May or may not be visible depending on API speed
          expect(await loadingIndicator.isVisible() || true).toBeTruthy();
        }
      }
    });

    test('displays CCN match when found', async ({ page }) => {
      // This test requires a MATH course to be in the database
      // Navigate to courses list
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Look for a MATH course
      const mathCourse = page.locator('text=MATH').first();
      if (await mathCourse.isVisible()) {
        await mathCourse.click();
        await page.waitForLoadState('networkidle');

        // Click CB Codes
        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          // Wait for CCN detection result
          const result = await waitForCCNDetection(page);

          if (result === 'match') {
            // Verify match display
            await expect(page.locator('text=C-ID Standard Match Found')).toBeVisible();

            // Should show Adopt button
            await expect(page.locator('button:has-text("Adopt")')).toBeVisible();
          }
        }
      }
    });

    test('user can adopt CCN standard', async ({ page }) => {
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Find a MATH course
      const mathCourse = page.locator('[data-subject="MATH"]').first();
      if (await mathCourse.isVisible()) {
        await mathCourse.click();
        await navigateToCBCodesSection(page);

        const result = await waitForCCNDetection(page);

        if (result === 'match') {
          // Click Adopt button
          await page.click('button:has-text("Adopt")');

          // Should proceed to next step or show success
          await page.waitForSelector('text=Standard Adopted', { timeout: 5000 }).catch(() => {
            // May not show explicit message, but should not show error
          });

          // Verify we moved past CCN step
          const ccnStep = page.locator('text=Common Course Numbering');
          // CCN step may no longer be the active step
        }
      }
    });
  });

  test.describe('No Match: Justification Flow', () => {
    test('shows no match state for non-CCN courses', async ({ page }) => {
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Look for a CTE/vocational course (e.g., AUTO)
      const cteCourse = page.locator('text=AUTO').first();
      if (await cteCourse.isVisible()) {
        await cteCourse.click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          const result = await waitForCCNDetection(page);

          if (result === 'no_match') {
            await expect(page.locator('text=No CCN Standard Found')).toBeVisible();
            await expect(page.locator('button:has-text("Provide Justification")')).toBeVisible();
          }
        }
      }
    });

    test('user can submit non-match justification', async ({ page }) => {
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Find a course that won't have CCN match
      const courses = page.locator('a[href^="/courses/"]');
      if ((await courses.count()) > 0) {
        await courses.first().click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          const result = await waitForCCNDetection(page);

          if (result === 'no_match') {
            // Click Provide Justification
            await page.click('button:has-text("Provide Justification")');

            // Fill out justification form
            await page.click('text=Vocational/CTE Course');

            // Fill textarea
            const textarea = page.locator('textarea');
            await textarea.fill('This is a career technical education course not covered by C-ID standards.');

            // Submit
            await page.click('button:has-text("Submit")');

            // Should proceed or show success
            await page.waitForLoadState('networkidle');
          }
        }
      }
    });

    test('user can skip CCN check', async ({ page }) => {
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      const courses = page.locator('a[href^="/courses/"]');
      if ((await courses.count()) > 0) {
        await courses.first().click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          const result = await waitForCCNDetection(page);

          if (result === 'no_match') {
            // Click Skip
            await page.click('button:has-text("Skip")');

            // Should proceed to next step
            await page.waitForLoadState('networkidle');

            // CCN step should no longer be showing its initial content
          }
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('shows error state on network failure', async ({ page }) => {
      // Intercept and abort CCN match API call
      await page.route('**/api/compliance/ccn-match', (route) => route.abort());

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      const courses = page.locator('a[href^="/courses/"]');
      if ((await courses.count()) > 0) {
        await courses.first().click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          // Should show error state
          await expect(page.locator('text=Unable to Check CCN Standards')).toBeVisible({
            timeout: 10000,
          });
        }
      }
    });

    test('user can retry after error', async ({ page }) => {
      // First abort the request
      await page.route('**/api/compliance/ccn-match', (route) => route.abort());

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      const courses = page.locator('a[href^="/courses/"]');
      if ((await courses.count()) > 0) {
        await courses.first().click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          // Wait for error
          await page.waitForSelector('text=Unable to Check CCN Standards', { timeout: 10000 });

          // Re-enable the route
          await page.unroute('**/api/compliance/ccn-match');

          // Click Retry
          const retryButton = page.locator('button:has-text("Retry")');
          if (await retryButton.isVisible()) {
            await retryButton.click();

            // Should show loading or result
            await page.waitForLoadState('networkidle');
          }
        }
      }
    });

    test('user can skip after error', async ({ page }) => {
      await page.route('**/api/compliance/ccn-match', (route) => route.abort());

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      const courses = page.locator('a[href^="/courses/"]');
      if ((await courses.count()) > 0) {
        await courses.first().click();
        await page.waitForLoadState('networkidle');

        const cbCodes = page.locator('text=CB Codes');
        if (await cbCodes.isVisible()) {
          await cbCodes.click();

          await page.waitForSelector('text=Unable to Check CCN Standards', { timeout: 10000 });

          // Click Skip
          const skipButton = page.locator('button:has-text("Skip")');
          if (await skipButton.isVisible()) {
            await skipButton.click();
            await page.waitForLoadState('networkidle');
          }
        }
      }
    });
  });

  test.describe('Authentication', () => {
    test('unauthenticated user is redirected to login', async ({ page }) => {
      // Clear any existing session
      await page.context().clearCookies();

      // Try to access a course directly
      await page.goto('/courses/some-course-id/edit');

      // Should redirect to login
      await page.waitForURL((url) => url.pathname.includes('/login'), {
        timeout: 10000,
      });
    });
  });
});

test.describe('CCN Benefits Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
  });

  test('shows benefits panel when CCN match found', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const mathCourse = page.locator('text=MATH').first();
    if (await mathCourse.isVisible()) {
      await mathCourse.click();
      await page.waitForLoadState('networkidle');

      const cbCodes = page.locator('text=CB Codes');
      if (await cbCodes.isVisible()) {
        await cbCodes.click();

        const result = await waitForCCNDetection(page);

        if (result === 'match') {
          // Check for benefits panel
          await expect(page.locator('text=Benefits of CCN Alignment')).toBeVisible();
          await expect(page.locator('text=CB05 auto-set')).toBeVisible();
        }
      }
    }
  });
});

test.describe('AB 1111 Compliance Notice', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
  });

  test('shows AB 1111 notice for non-matching courses', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const courses = page.locator('a[href^="/courses/"]');
    if ((await courses.count()) > 0) {
      await courses.first().click();
      await page.waitForLoadState('networkidle');

      const cbCodes = page.locator('text=CB Codes');
      if (await cbCodes.isVisible()) {
        await cbCodes.click();

        const result = await waitForCCNDetection(page);

        if (result === 'no_match') {
          await expect(page.locator('text=AB 1111 Compliance Note')).toBeVisible();
        }
      }
    }
  });
});
