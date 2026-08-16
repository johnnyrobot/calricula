import type {
  ComplianceOptions,
  HourCalculation,
  MinimumHoursCheck,
  NumericValue,
  WeeklyHoursInput,
} from "./types";

export const SEMESTER_WEEKS = 18;
export const MINIMUM_HOURS_PER_UNIT = 48;
export const CONVENTIONAL_HOURS_PER_UNIT = 54;
export const DEFAULT_TOLERANCE_UNITS = 0.25;

export const DEFAULT_COMPLIANCE_OPTIONS = Object.freeze({
  semesterWeeks: SEMESTER_WEEKS,
  minimumHoursPerUnit: MINIMUM_HOURS_PER_UNIT,
  conventionalHoursPerUnit: CONVENTIONAL_HOURS_PER_UNIT,
  toleranceUnits: DEFAULT_TOLERANCE_UNITS,
}) satisfies Required<ComplianceOptions>;

export function toFiniteNumber(
  value: NumericValue,
  fallback = 0,
): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveOptions(
  options: ComplianceOptions = {},
): Required<ComplianceOptions> {
  return {
    semesterWeeks: toFiniteNumber(
      options.semesterWeeks,
      DEFAULT_COMPLIANCE_OPTIONS.semesterWeeks,
    ),
    minimumHoursPerUnit: toFiniteNumber(
      options.minimumHoursPerUnit,
      DEFAULT_COMPLIANCE_OPTIONS.minimumHoursPerUnit,
    ),
    conventionalHoursPerUnit: toFiniteNumber(
      options.conventionalHoursPerUnit,
      DEFAULT_COMPLIANCE_OPTIONS.conventionalHoursPerUnit,
    ),
    toleranceUnits: Math.max(
      0,
      toFiniteNumber(
        options.toleranceUnits,
        DEFAULT_COMPLIANCE_OPTIONS.toleranceUnits,
      ),
    ),
  };
}

/**
 * Convert weekly scheduled/student-work hours into semester totals.
 *
 * Title 5 treats lecture, lab, activity, TBA, and outside work as hours of
 * student work. Each weekly value therefore receives one semester multiplier.
 * In particular, lab is multiplied by 18, not 54.
 */
export function calculateHourBreakdown(
  input: WeeklyHoursInput,
  options: ComplianceOptions = {},
): HourCalculation {
  const resolved = resolveOptions(options);
  const weeklyLectureHours = toFiniteNumber(input.lectureHours);
  const weeklyLabHours = toFiniteNumber(input.labHours);
  const weeklyActivityHours = toFiniteNumber(input.activityHours);
  const weeklyTbaHours = toFiniteNumber(input.tbaHours);
  const weeklyOutsideOfClassHours = toFiniteNumber(
    input.outsideOfClassHours,
  );

  const semesterLectureHours =
    weeklyLectureHours * resolved.semesterWeeks;
  const semesterLabHours = weeklyLabHours * resolved.semesterWeeks;
  const semesterActivityHours =
    weeklyActivityHours * resolved.semesterWeeks;
  const semesterTbaHours = weeklyTbaHours * resolved.semesterWeeks;
  const semesterOutsideOfClassHours =
    weeklyOutsideOfClassHours * resolved.semesterWeeks;

  return {
    semesterWeeks: resolved.semesterWeeks,
    weeklyLectureHours,
    weeklyLabHours,
    weeklyActivityHours,
    weeklyTbaHours,
    weeklyOutsideOfClassHours,
    semesterLectureHours,
    semesterLabHours,
    semesterActivityHours,
    semesterTbaHours,
    semesterOutsideOfClassHours,
    totalContactHours:
      weeklyLectureHours +
      weeklyLabHours +
      weeklyActivityHours +
      weeklyTbaHours,
    totalStudentLearningHours:
      semesterLectureHours +
      semesterLabHours +
      semesterActivityHours +
      semesterTbaHours +
      semesterOutsideOfClassHours,
  };
}

export function calculateTotalStudentLearningHours(
  input: WeeklyHoursInput,
  options: ComplianceOptions = {},
): number {
  return calculateHourBreakdown(input, options).totalStudentLearningHours;
}

/**
 * Check the regulatory minimum with a small unit-denominated rounding
 * tolerance. The returned minimum never changes; tolerance is only an allowed
 * shortfall for the pass/fail comparison.
 */
export function checkMinimumHoursPerUnit(
  unitsValue: NumericValue,
  totalHoursValue: NumericValue,
  options: ComplianceOptions = {},
): MinimumHoursCheck {
  const resolved = resolveOptions(options);
  const units = toFiniteNumber(unitsValue);
  const totalHours = toFiniteNumber(totalHoursValue);
  const minimumRequiredHours = units * resolved.minimumHoursPerUnit;
  const allowedShortfallHours =
    resolved.toleranceUnits * resolved.minimumHoursPerUnit;
  const shortfallHours = Math.max(0, minimumRequiredHours - totalHours);

  return {
    isCompliant:
      units > 0 &&
      totalHours + allowedShortfallHours >= minimumRequiredHours,
    minimumRequiredHours,
    allowedShortfallHours,
    actualHoursPerUnit: units > 0 ? totalHours / units : 0,
    shortfallHours,
  };
}

export function calculateConventionalUnits(
  totalHoursValue: NumericValue,
  options: ComplianceOptions = {},
): number {
  const resolved = resolveOptions(options);
  const totalHours = toFiniteNumber(totalHoursValue);
  return resolved.conventionalHoursPerUnit > 0
    ? totalHours / resolved.conventionalHoursPerUnit
    : 0;
}
