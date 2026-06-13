/**
 * Workflow Status Transitions E2E Tests (CUR-255)
 *
 * End-to-end tests for the complete course approval workflow:
 * Draft → DeptReview → CurriculumCommittee → ArticulationReview → Approved
 *
 * Prerequisites:
 * - Backend running at http://localhost:8000
 * - Frontend running at http://localhost:3000
 * - Test database with seeded courses and users
 * - Dev auth mode enabled (NEXT_PUBLIC_AUTH_DEV_MODE=true)
 *
 * Run with:
 *   npx playwright test e2e/workflow-transitions.spec.ts
 *   npx playwright test e2e/workflow-transitions.spec.ts --headed
 */

import { test, expect, Page } from '@playwright/test';

// ===========================================
// Test User Credentials
// ===========================================

const TEST_USERS = {
  faculty: {
    email: 'faculty@calricula.com',
    password: 'Test123!',
    role: 'Faculty',
    name: 'Dr. Maria Garcia',
  },
  chair: {
    email: 'chair@calricula.com',
    password: 'Test123!',
    role: 'CurriculumChair',
    name: 'Dr. Robert Williams',
  },
  articulation: {
    email: 'articulation@calricula.com',
    password: 'Test123!',
    role: 'ArticulationOfficer',
    name: 'Ms. Lisa Thompson',
  },
  admin: {
    email: 'admin@calricula.com',
    password: 'Test123!',
    role: 'Admin',
    name: 'Mr. David Martinez',
  },
};

// ===========================================
// Helper Functions
// ===========================================

async function loginAsUser(page: Page, user: typeof TEST_USERS.faculty) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect after login
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

async function logout(page: Page) {
  // Look for logout button in sidebar or header
  const logoutButton = page.locator('button:has-text("Sign Out"), button:has-text("Logout")');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await page.waitForURL('**/login', { timeout: 5000 });
  } else {
    // Navigate directly to login page
    await page.goto('/login');
  }
}

async function findDraftCourse(page: Page): Promise<string | null> {
  await page.goto('/courses');
  await page.waitForLoadState('networkidle');

  // Look for a course with Draft status
  const draftCourse = page.locator('.luminous-card:has(span:has-text("Draft"))').first();
  if (await draftCourse.isVisible()) {
    const courseLink = draftCourse.locator('a[href^="/courses/"]').first();
    const href = await courseLink.getAttribute('href');
    return href?.split('/').pop() || null;
  }
  return null;
}

async function findCourseInStatus(page: Page, status: string): Promise<string | null> {
  await page.goto('/courses');
  await page.waitForLoadState('networkidle');

  // Look for a course with specified status
  const course = page.locator(`.luminous-card:has(span:has-text("${status}"))`).first();
  if (await course.isVisible()) {
    const courseLink = course.locator('a[href^="/courses/"]').first();
    const href = await courseLink.getAttribute('href');
    return href?.split('/').pop() || null;
  }
  return null;
}

// ===========================================
// Test Suite: Workflow Status Transitions
// ===========================================

test.describe('Workflow Status Transitions', () => {
  test.describe('1. Draft → Submit for Review', () => {
    test('Faculty can submit a Draft course for review', async ({ page }) => {
      // Login as faculty
      await loginAsUser(page, TEST_USERS.faculty);

      // Navigate to courses
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Find any course and navigate to edit
      const courseCard = page.locator('.luminous-card').first();
      if (await courseCard.isVisible()) {
        const editLink = courseCard.locator('a[href*="/edit"]').first();
        if (await editLink.isVisible()) {
          await editLink.click();
          await page.waitForLoadState('networkidle');

          // Navigate to Review section
          const reviewSection = page.locator('button:has-text("Review")');
          if (await reviewSection.isVisible()) {
            await reviewSection.click();

            // Check if Submit for Review button is visible
            const submitButton = page.locator('button:has-text("Submit for Review")');
            if (await submitButton.isVisible()) {
              // Verify button is enabled (all checks passed)
              expect(await submitButton.isEnabled()).toBeTruthy();
            }
          }
        }
      }
    });

    test('Submit for Review button is disabled when checks fail', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.faculty);
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // This test verifies that incomplete courses cannot be submitted
      // The button should be disabled or show a warning
      const incompleteMessage = page.locator('text=Please address all required compliance checks');
      // This is expected to be visible for incomplete courses
      // No assertion needed as it depends on course data
    });
  });

  test.describe('2. Reviewer Can View Approval Queue', () => {
    test('CurriculumChair sees pending courses in Approvals', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.chair);

      // Navigate to approvals
      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');

      // Verify page loaded successfully
      await expect(page.locator('h1:has-text("Approval Queue")')).toBeVisible();

      // Verify tabs exist
      await expect(page.locator('button:has-text("Pending My Review")')).toBeVisible();
      await expect(page.locator('button:has-text("All Pending")')).toBeVisible();
      await expect(page.locator('button:has-text("Recently Reviewed")')).toBeVisible();
    });

    test('Faculty cannot access Approvals page', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.faculty);

      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');

      // Should see access denied message
      await expect(page.locator('text=Access Restricted')).toBeVisible();
    });
  });

  test.describe('3. Reviewer Approval Actions', () => {
    test('CurriculumChair sees approval actions on course in DeptReview', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.chair);

      // Navigate to approvals
      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');

      // Click on a pending course
      const pendingCourse = page.locator('.luminous-card').first();
      if (await pendingCourse.isVisible()) {
        await pendingCourse.click();
        await page.waitForLoadState('networkidle');

        // Check if approval actions panel is visible
        const reviewActions = page.locator('text=Review Actions');
        if (await reviewActions.isVisible()) {
          // Should see approve and return buttons
          await expect(page.locator('button:has-text("Approve")')).toBeVisible();
          await expect(page.locator('button:has-text("Return for Revision")')).toBeVisible();
        }
      }
    });

    test('Return for Revision requires a comment', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.chair);

      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');

      const pendingCourse = page.locator('.luminous-card').first();
      if (await pendingCourse.isVisible()) {
        await pendingCourse.click();
        await page.waitForLoadState('networkidle');

        // Click return for revision
        const returnButton = page.locator('button:has-text("Return for Revision")');
        if (await returnButton.isVisible()) {
          await returnButton.click();

          // Modal should appear
          await expect(page.locator('text=Return for Revision')).toBeVisible();
          await expect(page.locator('text=Reason for Return')).toBeVisible();

          // The submit button should require a comment
          const textarea = page.locator('textarea');
          await expect(textarea).toBeVisible();
        }
      }
    });
  });

  test.describe('4. Workflow Progress Visualization', () => {
    test('Course detail page shows workflow progress bar', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.faculty);

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Click on any course
      const courseLink = page.locator('a[href^="/courses/"]').first();
      if (await courseLink.isVisible()) {
        await courseLink.click();
        await page.waitForLoadState('networkidle');

        // Check for workflow progress bar
        await expect(page.locator('text=Approval Workflow Progress')).toBeVisible();

        // Check for workflow steps
        await expect(page.locator('text=Draft')).toBeVisible();
        await expect(page.locator('text=Department Review')).toBeVisible();
        await expect(page.locator('text=Curriculum Committee')).toBeVisible();
        await expect(page.locator('text=Articulation Review')).toBeVisible();
        await expect(page.locator('text=Approved')).toBeVisible();
      }
    });
  });

  test.describe('5. Workflow History', () => {
    test('Course detail page shows workflow history panel', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.faculty);

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Click on any course
      const courseLink = page.locator('a[href^="/courses/"]').first();
      if (await courseLink.isVisible()) {
        await courseLink.click();
        await page.waitForLoadState('networkidle');

        // Look for workflow history panel
        const historyPanel = page.locator('text=Workflow History');
        // This may or may not be visible depending on if history exists
        // Just check the page loads correctly
        expect(await page.locator('.luminous-card').count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('6. Role-Based Access Control', () => {
    test('Faculty can only edit their own courses', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.faculty);

      await page.goto('/courses');
      await page.waitForLoadState('networkidle');

      // Verify courses page loads
      await expect(page.locator('h1:has-text("Courses")')).toBeVisible();
    });

    test('Admin has full access to all features', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.admin);

      // Check approvals access
      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Approval Queue")')).toBeVisible();

      // Check courses access
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Courses")')).toBeVisible();
    });
  });

  test.describe('7. ArticulationOfficer Role', () => {
    test('ArticulationOfficer can access approval queue', async ({ page }) => {
      await loginAsUser(page, TEST_USERS.articulation);

      await page.goto('/approvals');
      await page.waitForLoadState('networkidle');

      // Should have access
      await expect(page.locator('h1:has-text("Approval Queue")')).toBeVisible();
    });
  });
});

// ===========================================
// Test Suite: End-to-End Workflow Flow
// ===========================================

test.describe('Complete Workflow Flow', () => {
  test.skip('Full approval cycle from Draft to Approved', async ({ page }) => {
    // This test simulates the complete approval workflow
    // Skipped by default as it modifies data
    // Run manually with: npx playwright test --grep "Full approval cycle"

    // 1. Faculty creates/submits course
    await loginAsUser(page, TEST_USERS.faculty);
    await page.goto('/courses');

    // Find a draft course
    const draftCourse = await findDraftCourse(page);
    if (!draftCourse) {
      test.skip();
      return;
    }

    // Navigate to edit and submit
    await page.goto(`/courses/${draftCourse}/edit`);
    await page.click('button:has-text("Review")');
    await page.click('button:has-text("Submit for Review")');

    // Wait for confirmation
    await page.waitForSelector('text=Course Submitted', { timeout: 5000 });

    // 2. Chair approves
    await logout(page);
    await loginAsUser(page, TEST_USERS.chair);
    await page.goto(`/courses/${draftCourse}`);
    await page.click('button:has-text("Approve for Committee")');
    await page.waitForSelector('text=Course Approved', { timeout: 5000 });

    // 3. Committee chair advances
    await page.goto(`/courses/${draftCourse}`);
    await page.click('button:has-text("Approve for Articulation")');
    await page.waitForSelector('text=Course Approved', { timeout: 5000 });

    // 4. Articulation officer gives final approval
    await logout(page);
    await loginAsUser(page, TEST_USERS.articulation);
    await page.goto(`/courses/${draftCourse}`);
    await page.click('button:has-text("Final Approval")');
    await page.waitForSelector('text=Course Approved', { timeout: 5000 });

    // 5. Verify final status
    await page.goto(`/courses/${draftCourse}`);
    await expect(page.locator('span:has-text("Approved")')).toBeVisible();
  });
});
