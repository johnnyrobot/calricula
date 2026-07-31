import { describe, expect, it } from "vitest";

import golden from "./fixtures/python-compliance-service.golden.json";
import {
  CONVENTIONAL_HOURS_PER_UNIT,
  MINIMUM_HOURS_PER_UNIT,
  SEMESTER_WEEKS,
  calculateHourBreakdown,
} from "./hours";
import { checkUnitsAndHours } from "./rules";
import type { ComplianceStatus } from "./types";

function summarizeStatus(
  statuses: readonly ComplianceStatus[],
): ComplianceStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

describe("parent Python compliance-service golden parity", () => {
  it("pins the parent service constants used to derive the fixture", () => {
    expect({
      semesterWeeks: SEMESTER_WEEKS,
      minimumHoursPerUnit: MINIMUM_HOURS_PER_UNIT,
      conventionalHoursPerUnit: CONVENTIONAL_HOURS_PER_UNIT,
    }).toEqual(golden.constants);
  });

  it.each(golden.cases)(
    "$id matches the parent hour totals, status, and rule IDs",
    ({ input, expected }) => {
      const hours = calculateHourBreakdown({
        lectureHours: input.lecture_hours,
        labHours: input.lab_hours,
        outsideOfClassHours: input.outside_of_class_hours,
      });
      expect({
        semesterLectureHours: hours.semesterLectureHours,
        semesterLabHours: hours.semesterLabHours,
        semesterOutsideOfClassHours: hours.semesterOutsideOfClassHours,
        totalStudentLearningHours: hours.totalStudentLearningHours,
      }).toEqual({
        semesterLectureHours: expected.semesterLectureHours,
        semesterLabHours: expected.semesterLabHours,
        semesterOutsideOfClassHours:
          expected.semesterOutsideOfClassHours,
        totalStudentLearningHours: expected.totalStudentLearningHours,
      });
      expect(input.units * MINIMUM_HOURS_PER_UNIT).toBe(
        expected.minimumRequiredHours,
      );

      const results = checkUnitsAndHours(input);
      const statusesByRuleId = new Map(
        results.map(({ ruleId, status }) => [ruleId, status]),
      );
      for (const [ruleId, status] of Object.entries(
        expected.ruleStatuses,
      )) {
        expect(
          statusesByRuleId.get(ruleId),
          `missing or divergent parent rule ${ruleId}`,
        ).toBe(status);
      }
      expect(summarizeStatus(results.map(({ status }) => status))).toBe(
        expected.overallStatus,
      );
    },
  );
});
