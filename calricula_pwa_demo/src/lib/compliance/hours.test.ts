import { describe, expect, it } from "vitest";

import {
  calculateHourBreakdown,
  calculateTotalStudentLearningHours,
  checkMinimumHoursPerUnit,
} from "./hours";
import { checkUnitsAndHours } from "./rules";

describe("Title 5 hour calculations", () => {
  it("uses one 18-week multiplier for every hour type", () => {
    expect(
      calculateTotalStudentLearningHours({ labHours: 3 }),
    ).toBe(54);
    expect(
      calculateTotalStudentLearningHours({
        lectureHours: 3,
        labHours: 3,
        outsideOfClassHours: 6,
      }),
    ).toBe(216);
    expect(
      calculateTotalStudentLearningHours({
        lectureHours: 1,
        labHours: 1,
        activityHours: 1,
        tbaHours: 1,
        outsideOfClassHours: 1,
      }),
    ).toBe(90);
  });

  it("separates weekly contact hours from semester student-work hours", () => {
    expect(
      calculateHourBreakdown({
        lectureHours: "3",
        labHours: "2",
        outsideOfClassHours: "6",
      }),
    ).toMatchObject({
      totalContactHours: 5,
      semesterLectureHours: 54,
      semesterLabHours: 36,
      semesterOutsideOfClassHours: 108,
      totalStudentLearningHours: 198,
    });
  });

  it("uses 48 hours per unit as the literal floor", () => {
    expect(checkMinimumHoursPerUnit("3", "144")).toMatchObject({
      isCompliant: true,
      minimumRequiredHours: 144,
      actualHoursPerUnit: 48,
      shortfallHours: 0,
    });
    expect(
      checkMinimumHoursPerUnit(3, 72, { toleranceUnits: 0 }),
    ).toMatchObject({
      isCompliant: false,
      minimumRequiredHours: 144,
      shortfallHours: 72,
    });
  });

  it("exposes the configured rounding tolerance without hiding the literal floor", () => {
    expect(checkMinimumHoursPerUnit(3, 132)).toMatchObject({
      isCompliant: true,
      allowedShortfallHours: 12,
      shortfallHours: 12,
    });

    const toleranceResult = checkUnitsAndHours({
      units: 3,
      lectureHours: 2,
      outsideOfClassHours: 5.333333333333333,
    }).find(({ ruleId }) => ruleId === "UNIT-002");
    expect(toleranceResult?.status).toBe("warn");
    expect(toleranceResult?.message).toContain("literal");
  });

  it("warns when hours exceed the conventional 54-hour reference", () => {
    const result = checkUnitsAndHours({
      units: 1,
      lectureHours: 2,
      labHours: 2,
      outsideOfClassHours: 2,
    }).find(({ ruleId }) => ruleId === "UNIT-005");

    expect(result?.status).toBe("warn");
    expect(result?.message).toContain("conventional");
  });
});
