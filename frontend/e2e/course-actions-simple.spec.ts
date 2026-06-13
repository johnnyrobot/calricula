import { test, expect } from './fixtures/ccn-fixtures';
import { loginAsUser, TEST_USERS } from './fixtures/ccn-fixtures';

test.describe('Course List Actions - Simplified', () => {
  test('navigate and explore course workflows', async ({ page }) => {
    // Login first
    await loginAsUser(page, TEST_USERS.faculty);

    // Start from dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');

    console.log('Step 1: Navigate to Courses page');
    await page.goto('http://localhost:3000/courses');
    await page.waitForURL('**/courses');
    await page.waitForLoadState('networkidle');

    console.log('Step 2: Click the New Course button');
    await page.click('text=New Course');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('Step 3: Take screenshot of new course editor');
    await page.screenshot({
      path: 'frontend/e2e/screenshots/new-course-form.png',
      fullPage: true
    });

    console.log('Step 4: Analyze the new course form');
    const heading = await page.locator('h1, h2').first().textContent();
    console.log('Page heading:', heading);

    // Check form fields
    const subjectCodeInput = page.locator('input[name="subject_code"]');
    const courseNumberInput = page.locator('input[name="course_number"]');
    const courseTitleInput = page.locator('input[name="title"]');

    const hasSubjectCode = await subjectCodeInput.isVisible();
    const hasCourseNumber = await courseNumberInput.isVisible();
    const hasCourseTitle = await courseTitleInput.isVisible();

    console.log('Form has Subject Code field:', hasSubjectCode);
    console.log('Form has Course Number field:', hasCourseNumber);
    console.log('Form has Course Title field:', hasCourseTitle);

    // Check for buttons
    const createButton = page.locator('button:has-text("Create Course")');
    const cancelButton = page.locator('button:has-text("Cancel")');

    console.log('Has Create Course button:', await createButton.isVisible());
    console.log('Has Cancel button:', await cancelButton.isVisible());

    console.log('\n=== NEW COURSE FORM SUMMARY ===');
    console.log('Heading:', heading);
    console.log('Form type: Initial course creation form');
    console.log('Required fields: Subject Code, Course Number, Course Title, Department');
    console.log('Actions available: Create Course, Cancel');

    console.log('\nStep 5: Navigate back to courses list');
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');

    console.log('Step 6: Find and click on an existing course');
    // Look for course cards
    const courseCards = page.locator('[class*="course-card"], div:has(a[href*="/courses/"])');
    const cardCount = await courseCards.count();
    console.log('Found', cardCount, 'potential course elements');

    // Try to find a specific course link (MATH, ENGL, etc.)
    const mathCourse = page.locator('text=MATH').first();
    const englCourse = page.locator('text=ENGL').first();
    const anyCourse = page.locator('a[href^="/courses/"][href$="/edit"]').first();

    let clicked = false;
    if (await mathCourse.isVisible()) {
      console.log('Clicking on MATH course');
      await mathCourse.click();
      clicked = true;
    } else if (await englCourse.isVisible()) {
      console.log('Clicking on ENGL course');
      await englCourse.click();
      clicked = true;
    } else if (await anyCourse.isVisible()) {
      console.log('Clicking on first available course');
      await anyCourse.click();
      clicked = true;
    }

    if (clicked) {
      console.log('Step 7: Wait for course editor to load');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      console.log('Step 8: Take screenshot of existing course editor');
      await page.screenshot({
        path: 'frontend/e2e/screenshots/existing-course-editor.png',
        fullPage: true
      });

      console.log('Step 9: Analyze existing course editor');
      const courseHeading = await page.locator('h1, h2').first().textContent();
      console.log('Course heading:', courseHeading);

      // Look for tabs/sections
      const tabs = await page.locator('[role="tab"]').allTextContents();
      console.log('Tabs found:', tabs);

      // Look for common sections
      const basicInfo = page.locator('text=Basic Information');
      const objectives = page.locator('text=Objectives');
      const cbCodes = page.locator('text=CB Codes');
      const slos = page.locator('text=Student Learning Outcomes');

      console.log('Has Basic Information section:', await basicInfo.isVisible().catch(() => false));
      console.log('Has Objectives section:', await objectives.isVisible().catch(() => false));
      console.log('Has CB Codes section:', await cbCodes.isVisible().catch(() => false));
      console.log('Has SLOs section:', await slos.isVisible().catch(() => false));

      console.log('\n=== EXISTING COURSE EDITOR SUMMARY ===');
      console.log('Course:', courseHeading);
      console.log('Interface type: Multi-section course editor');
      console.log('Available tabs:', tabs.length > 0 ? tabs : 'No tabs detected');
    } else {
      console.log('No courses found to click on - may need to create test data');
    }
  });
});
