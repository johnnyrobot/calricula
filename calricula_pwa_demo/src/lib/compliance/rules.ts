import { getCitation } from "./citations";
import {
  CONVENTIONAL_HOURS_PER_UNIT,
  DEFAULT_TOLERANCE_UNITS,
  MINIMUM_HOURS_PER_UNIT,
  SEMESTER_WEEKS,
  calculateConventionalUnits,
  calculateHourBreakdown,
  checkMinimumHoursPerUnit,
  toFiniteNumber,
} from "./hours";
import {
  validateCCNFormat,
  validateCCNNonMatchJustification,
} from "./ccn";
import type {
  CitationId,
  ComplianceAudit,
  ComplianceAuditInput,
  ComplianceCategory,
  ComplianceContentInput,
  ComplianceOptions,
  ComplianceResult,
  ComplianceRequisiteInput,
  ComplianceSLOInput,
  RequisiteGraphEdge,
} from "./types";

export const BLOOM_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
] as const;

export const HIGHER_ORDER_BLOOM_LEVELS = [
  "Analyze",
  "Evaluate",
  "Create",
] as const;

export const WEAK_SLO_VERBS = [
  "understand",
  "know",
  "learn",
  "appreciate",
  "be aware of",
] as const;

export const REQUISITE_VALIDATION_TYPES = [
  "Content Review",
  "Statutory",
  "Sequential",
  "Health/Safety",
  "Recency",
  "Other",
] as const;

type UnknownRecord = Readonly<Record<string, unknown>>;

function recordOf(value: unknown): UnknownRecord {
  return value && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function first<T>(
  value: unknown,
  ...keys: readonly string[]
): T | undefined {
  const record = recordOf(value);
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key] as T;
    }
  }
  return undefined;
}

function stringField(
  value: unknown,
  ...keys: readonly string[]
): string {
  const candidate = first<unknown>(value, ...keys);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function listField(value: unknown, ...keys: readonly string[]): readonly unknown[] {
  const candidate = first<unknown>(value, ...keys);
  return Array.isArray(candidate) ? candidate : [];
}

function numericField(
  value: unknown,
  ...keys: readonly string[]
): number {
  return toFiniteNumber(first(value, ...keys));
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    useGrouping: false,
  }).format(value);
}

function result(
  input: Omit<ComplianceResult, "citation"> & {
    readonly citationId?: CitationId;
  },
): ComplianceResult {
  const citation = input.citationId
    ? getCitation(input.citationId).shortLabel
    : undefined;
  return { ...input, ...(citation ? { citation } : {}) };
}

function resolveOptions(options: ComplianceOptions): Required<ComplianceOptions> {
  return {
    semesterWeeks: options.semesterWeeks ?? SEMESTER_WEEKS,
    minimumHoursPerUnit:
      options.minimumHoursPerUnit ?? MINIMUM_HOURS_PER_UNIT,
    conventionalHoursPerUnit:
      options.conventionalHoursPerUnit ?? CONVENTIONAL_HOURS_PER_UNIT,
    toleranceUnits: options.toleranceUnits ?? DEFAULT_TOLERANCE_UNITS,
  };
}

export function checkBasicInformation(course: unknown): readonly ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const title = stringField(course, "title");
  const description = stringField(
    course,
    "catalogDescription",
    "catalog_description",
  );

  results.push(
    title.length === 0
      ? result({
          ruleId: "BASIC-001",
          ruleName: "Course Title Required",
          category: "General",
          status: "fail",
          message: "Course must have a title.",
          section: "Basic Info",
          authority: "official-guidance",
          citationId: "pcah-9",
        })
      : title.length < 5
        ? result({
            ruleId: "BASIC-001",
            ruleName: "Course Title Required",
            category: "General",
            status: "warn",
            message: "Course title is very short.",
            section: "Basic Info",
            authority: "demo-heuristic",
            citationId: "pcah-9",
            recommendation: "Use a concise but descriptive catalog title.",
          })
        : result({
            ruleId: "BASIC-001",
            ruleName: "Course Title Required",
            category: "General",
            status: "pass",
            message: "Course has a descriptive title.",
            section: "Basic Info",
            authority: "official-guidance",
            citationId: "pcah-9",
          }),
  );

  const wordCount = description ? description.split(/\s+/).length : 0;
  if (!description) {
    results.push(
      result({
        ruleId: "BASIC-002",
        ruleName: "Catalog Description Required",
        category: "General",
        status: "fail",
        message: "Course must have a catalog description.",
        section: "Basic Info",
        authority: "official-guidance",
        citationId: "pcah-9",
      }),
    );
  } else if (wordCount < 25 || wordCount > 100) {
    results.push(
      result({
        ruleId: "BASIC-002",
        ruleName: "Catalog Description Required",
        category: "General",
        status: "warn",
        message: `Catalog description contains ${wordCount} words; the demo review range is 25–100.`,
        section: "Basic Info",
        authority: "demo-heuristic",
        citationId: "pcah-9",
        recommendation:
          wordCount < 25
            ? "Expand the description to summarize scope, topics, and learning."
            : "Condense the description for catalog readability.",
      }),
    );
  } else {
    results.push(
      result({
        ruleId: "BASIC-002",
        ruleName: "Catalog Description Required",
        category: "General",
        status: "pass",
        message: `Catalog description is present (${wordCount} words).`,
        section: "Basic Info",
        authority: "official-guidance",
        citationId: "pcah-9",
      }),
    );
  }

  return results;
}

export function checkUnitsAndHours(
  course: unknown,
  options: ComplianceOptions = {},
): readonly ComplianceResult[] {
  const resolved = resolveOptions(options);
  const units = numericField(course, "units");
  const hours = calculateHourBreakdown(
    {
      lectureHours: first(course, "lectureHours", "lecture_hours"),
      labHours: first(course, "labHours", "lab_hours"),
      activityHours: first(course, "activityHours", "activity_hours"),
      tbaHours: first(course, "tbaHours", "tba_hours"),
      outsideOfClassHours: first(
        course,
        "outsideOfClassHours",
        "outside_of_class_hours",
      ),
    },
    resolved,
  );
  const results: ComplianceResult[] = [];

  results.push(
    units < 0.5 || units > 18
      ? result({
          ruleId: "UNIT-001",
          ruleName: "Valid Demo Unit Range",
          category: "Units & Hours",
          status: "fail",
          message: `Units (${formatNumber(units)}) must be between 0.5 and 18 for this demo.`,
          section: "Units & Hours",
          authority: "demo-heuristic",
          citationId: "pcah-9",
        })
      : result({
          ruleId: "UNIT-001",
          ruleName: "Valid Demo Unit Range",
          category: "Units & Hours",
          status: "pass",
          message: `Unit value (${formatNumber(units)}) is within the supported range.`,
          section: "Units & Hours",
          authority: "demo-heuristic",
          citationId: "pcah-9",
        }),
  );

  const weeklyValues = [
    hours.weeklyLectureHours,
    hours.weeklyLabHours,
    hours.weeklyActivityHours,
    hours.weeklyTbaHours,
    hours.weeklyOutsideOfClassHours,
  ];
  const hasNegativeHours = weeklyValues.some((value) => value < 0);
  results.push(
    hasNegativeHours
      ? result({
          ruleId: "UNIT-006",
          ruleName: "Nonnegative Hours",
          category: "Units & Hours",
          status: "fail",
          message: "Weekly hour values cannot be negative.",
          section: "Units & Hours",
          authority: "official-guidance",
          citationId: "pcah-9",
        })
      : result({
          ruleId: "UNIT-006",
          ruleName: "Nonnegative Hours",
          category: "Units & Hours",
          status: "pass",
          message: "All weekly hour values are nonnegative.",
          section: "Units & Hours",
          authority: "official-guidance",
          citationId: "pcah-9",
        }),
  );

  const minimumCheck = checkMinimumHoursPerUnit(
    units,
    hours.totalStudentLearningHours,
    resolved,
  );
  const meetsUnadjustedMinimum =
    units > 0 &&
    hours.totalStudentLearningHours >= minimumCheck.minimumRequiredHours;

  if (!minimumCheck.isCompliant) {
    results.push(
      result({
        ruleId: "UNIT-002",
        ruleName: "Minimum Student Work per Unit",
        category: "Title 5",
        status: "fail",
        message:
          `${formatNumber(hours.totalStudentLearningHours)} semester hours ` +
          `provide ${formatNumber(minimumCheck.actualHoursPerUnit, 1)} hours/unit; ` +
          `at least ${formatNumber(minimumCheck.minimumRequiredHours)} hours are required for ${formatNumber(units)} units.`,
        section: "Units & Hours",
        authority: "regulation",
        citationId: "title5-55002-5",
        recommendation:
          `Add at least ${formatNumber(minimumCheck.shortfallHours)} student-work hours ` +
          "or reduce the declared units.",
      }),
    );
  } else if (!meetsUnadjustedMinimum) {
    results.push(
      result({
        ruleId: "UNIT-002",
        ruleName: "Minimum Student Work per Unit",
        category: "Title 5",
        status: "warn",
        message:
          `${formatNumber(hours.totalStudentLearningHours)} semester hours are below the literal ` +
          `${formatNumber(minimumCheck.minimumRequiredHours)}-hour floor but within the configured ` +
          `${formatNumber(resolved.toleranceUnits)}-unit rounding tolerance.`,
        section: "Units & Hours",
        authority: "demo-heuristic",
        citationId: "title5-55002-5",
        recommendation:
          "Verify the institution's approved credit-hour calculation rather than relying on the demo tolerance.",
      }),
    );
  } else {
    results.push(
      result({
        ruleId: "UNIT-002",
        ruleName: "Minimum Student Work per Unit",
        category: "Title 5",
        status: "pass",
        message:
          `${formatNumber(hours.totalStudentLearningHours)} semester hours provide ` +
          `${formatNumber(minimumCheck.actualHoursPerUnit, 1)} hours/unit, meeting the ` +
          `${formatNumber(resolved.minimumHoursPerUnit)}-hour minimum.`,
        section: "Units & Hours",
        authority: "regulation",
        citationId: "title5-55002-5",
      }),
    );
  }

  if (
    units > 0 &&
    minimumCheck.actualHoursPerUnit >
      resolved.conventionalHoursPerUnit + Number.EPSILON
  ) {
    results.push(
      result({
        ruleId: "UNIT-005",
        ruleName: "Units Commensurate with Student Work",
        category: "Title 5",
        status: "warn",
        message:
          `${formatNumber(minimumCheck.actualHoursPerUnit, 1)} hours/unit exceed the ` +
          `${formatNumber(resolved.conventionalHoursPerUnit)}-hour conventional reference; ` +
          "the course may under-credit the required work.",
        section: "Units & Hours",
        authority: "official-guidance",
        citationId: "title5-55002-5",
        recommendation:
          `Review whether ${formatNumber(calculateConventionalUnits(hours.totalStudentLearningHours, resolved), 1)} ` +
          "units better reflect the total student work.",
      }),
    );
  } else {
    results.push(
      result({
        ruleId: "UNIT-005",
        ruleName: "Units Commensurate with Student Work",
        category: "Title 5",
        status: "pass",
        message:
          `Hours do not exceed the ${formatNumber(resolved.conventionalHoursPerUnit)}-hour-per-unit ` +
          "conventional reference.",
        section: "Units & Hours",
        authority: "official-guidance",
        citationId: "title5-55002-5",
      }),
    );
  }

  if (hours.weeklyLectureHours > 0) {
    const ratio =
      hours.weeklyOutsideOfClassHours / hours.weeklyLectureHours;
    const ratioOutsideDemoRange = ratio < 1 || ratio > 3;
    results.push(
      ratioOutsideDemoRange
        ? result({
            ruleId: "UNIT-003",
            ruleName: "Outside-of-Class Hours Ratio",
            category: "PCAH",
            status: "warn",
            message: `Outside-of-class to lecture ratio is ${formatNumber(ratio, 1)}:1; 2:1 is the conventional planning reference.`,
            section: "Units & Hours",
            authority: "demo-heuristic",
            citationId: "pcah-9",
            recommendation:
              "Confirm that the expected outside work matches the instructional design.",
          })
        : result({
            ruleId: "UNIT-003",
            ruleName: "Outside-of-Class Hours Ratio",
            category: "PCAH",
            status: "pass",
            message: `Outside-of-class to lecture ratio is ${formatNumber(ratio, 1)}:1.`,
            section: "Units & Hours",
            authority: "demo-heuristic",
            citationId: "pcah-9",
          }),
    );
  }

  results.push(
    hours.totalContactHours <= 0
      ? result({
          ruleId: "UNIT-004",
          ruleName: "Contact Hours Required",
          category: "General",
          status: "fail",
          message:
            "Course must have lecture, lab, activity, or TBA contact hours.",
          section: "Units & Hours",
          authority: "official-guidance",
          citationId: "title5-55002",
        })
      : result({
          ruleId: "UNIT-004",
          ruleName: "Contact Hours Required",
          category: "General",
          status: "pass",
          message: `Course has ${formatNumber(hours.totalContactHours)} weekly contact hours.`,
          section: "Units & Hours",
          authority: "official-guidance",
          citationId: "title5-55002",
        }),
  );

  return results;
}

function normalizeCbCodes(course: unknown): Readonly<Record<string, string>> {
  const source = first<unknown>(course, "cbCodes", "cb_codes");
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(recordOf(source))) {
    if (typeof value === "string" && value.trim()) {
      normalized[key.toUpperCase()] = value.trim().toUpperCase();
    }
  }
  return normalized;
}

export function checkCBCodes(course: unknown): readonly ComplianceResult[] {
  const codes = normalizeCbCodes(course);
  const results: ComplianceResult[] = [];

  for (const code of ["CB04", "CB05", "CB08", "CB09"] as const) {
    results.push(
      codes[code]
        ? result({
            ruleId: `CB-${code}`,
            ruleName: `${code} Required`,
            category: "CB Codes",
            status: "pass",
            message: `${code} is set to ${codes[code]}.`,
            section: "CB Codes",
            authority: "official-guidance",
            citationId: "cb-data-elements",
          })
        : result({
            ruleId: `CB-${code}`,
            ruleName: `${code} Required`,
            category: "CB Codes",
            status: "fail",
            message: `${code} is required for the demo state-reporting review.`,
            section: "CB Codes",
            authority: "official-guidance",
            citationId: "cb-data-elements",
          }),
    );
  }

  const topCode = stringField(course, "topCode", "top_code");
  const isNonVocational = ["15", "17", "19", "20", "22"].some((prefix) =>
    topCode.startsWith(prefix),
  );
  if (topCode && codes.CB09) {
    results.push(
      isNonVocational && codes.CB09 !== "E"
        ? result({
            ruleId: "CB-DEP-001",
            ruleName: "CB09 SAM Code Dependency",
            category: "CB Codes",
            status: "fail",
            message: `Non-vocational TOP code ${topCode} conflicts with CB09=${codes.CB09}.`,
            section: "CB Codes",
            authority: "official-guidance",
            citationId: "cb-data-elements",
            recommendation: "Review whether CB09 should be E (non-occupational).",
          })
        : result({
            ruleId: "CB-DEP-001",
            ruleName: "CB09 SAM Code Dependency",
            category: "CB Codes",
            status: "pass",
            message: `CB09=${codes.CB09} is consistent with the demo TOP-code dependency check.`,
            section: "CB Codes",
            authority: "official-guidance",
            citationId: "cb-data-elements",
          }),
    );
  }

  if (codes.CB04 === "N" && ["A", "B"].includes(codes.CB05 ?? "")) {
    results.push(
      result({
        ruleId: "CB-DEP-002",
        ruleName: "Noncredit Transfer Status Dependency",
        category: "CB Codes",
        status: "fail",
        message: `Noncredit CB04=N conflicts with transferable CB05=${codes.CB05}.`,
        section: "CB Codes",
        authority: "official-guidance",
        citationId: "cb-data-elements",
      }),
    );
  }

  if (codes.CB08 === "B" && codes.CB21 === "Y") {
    results.push(
      result({
        ruleId: "CB-DEP-003",
        ruleName: "Basic-Skills Level Dependency",
        category: "CB Codes",
        status: "fail",
        message: "Basic-skills CB08=B conflicts with transfer-level CB21=Y.",
        section: "CB Codes",
        authority: "official-guidance",
        citationId: "cb-data-elements",
      }),
    );
  }

  if (topCode && codes.CB03 && topCode !== codes.CB03) {
    results.push(
      result({
        ruleId: "CB-DEP-004",
        ruleName: "TOP Code Consistency",
        category: "CB Codes",
        status: "warn",
        message: `Course TOP code ${topCode} differs from CB03=${codes.CB03}.`,
        section: "CB Codes",
        authority: "official-guidance",
        citationId: "cb-data-elements",
        recommendation: "Use one reviewed classification value.",
      }),
    );
  }

  return results;
}

function normalizedBloom(value: string): string {
  const lower = value.trim().toLowerCase();
  return BLOOM_LEVELS.find((level) => level.toLowerCase() === lower) ?? value;
}

function findWeakVerb(text: string): string | undefined {
  const normalized = ` ${text.toLowerCase().replace(/[^\w\s]/g, " ")} `.replace(
    /\s+/g,
    " ",
  );
  return WEAK_SLO_VERBS.find((verb) => normalized.includes(` ${verb} `));
}

export function checkSLOs(
  slos: readonly ComplianceSLOInput[],
): readonly ComplianceResult[] {
  const results: ComplianceResult[] = [];
  results.push(
    slos.length < 3
      ? result({
          ruleId: "SLO-001",
          ruleName: "Minimum SLOs",
          category: "Student Learning Outcomes",
          status: "fail",
          message: `Course has ${slos.length} SLOs; the demo review expects at least 3.`,
          section: "Student Learning Outcomes",
          authority: "demo-heuristic",
          citationId: "pcah-9",
          recommendation:
            "Add outcomes that collectively cover the course's central learning.",
        })
      : result({
          ruleId: "SLO-001",
          ruleName: "Minimum SLOs",
          category: "Student Learning Outcomes",
          status: "pass",
          message: `Course has ${slos.length} SLOs.`,
          section: "Student Learning Outcomes",
          authority: "demo-heuristic",
          citationId: "pcah-9",
        }),
  );

  if (slos.length > 0) {
    const hasHigherOrder = slos.some((slo) =>
      HIGHER_ORDER_BLOOM_LEVELS.includes(
        normalizedBloom(
          stringField(slo, "bloomLevel", "bloom_level"),
        ) as (typeof HIGHER_ORDER_BLOOM_LEVELS)[number],
      ),
    );
    results.push(
      hasHigherOrder
        ? result({
            ruleId: "SLO-002",
            ruleName: "Higher-Order Thinking",
            category: "Student Learning Outcomes",
            status: "pass",
            message: "At least one SLO uses a higher-order Bloom level.",
            section: "Student Learning Outcomes",
            authority: "demo-heuristic",
            citationId: "pcah-9",
          })
        : result({
            ruleId: "SLO-002",
            ruleName: "Higher-Order Thinking",
            category: "Student Learning Outcomes",
            status: "warn",
            message: "No SLO is classified as Analyze, Evaluate, or Create.",
            section: "Student Learning Outcomes",
            authority: "demo-heuristic",
            citationId: "pcah-9",
            recommendation:
              "Consider whether at least one measurable higher-order outcome fits the course.",
          }),
    );
  }

  slos.forEach((slo, index) => {
    const outcome = stringField(slo, "outcomeText", "outcome_text");
    const bloom = normalizedBloom(
      stringField(slo, "bloomLevel", "bloom_level"),
    );
    if (!outcome) {
      results.push(
        result({
          ruleId: `SLO-004-${index + 1}`,
          ruleName: "Complete SLO",
          category: "Student Learning Outcomes",
          status: "fail",
          message: `SLO ${index + 1} has no outcome text.`,
          section: "Student Learning Outcomes",
          authority: "official-guidance",
          citationId: "title5-55002",
        }),
      );
    }
    if (!BLOOM_LEVELS.includes(bloom as (typeof BLOOM_LEVELS)[number])) {
      results.push(
        result({
          ruleId: `SLO-005-${index + 1}`,
          ruleName: "Recognized Bloom Level",
          category: "Student Learning Outcomes",
          status: "warn",
          message: `SLO ${index + 1} has an unrecognized Bloom level${bloom ? ` (${bloom})` : ""}.`,
          section: "Student Learning Outcomes",
          authority: "demo-heuristic",
          recommendation: `Use one of: ${BLOOM_LEVELS.join(", ")}.`,
        }),
      );
    }

    const weakVerb = findWeakVerb(outcome);
    if (weakVerb) {
      results.push(
        result({
          ruleId: `SLO-003-${index + 1}`,
          ruleName: "Measurable SLO Verb",
          category: "Student Learning Outcomes",
          status: "warn",
          message: `SLO ${index + 1} uses the weak verb or phrase "${weakVerb}".`,
          section: "Student Learning Outcomes",
          authority: "demo-heuristic",
          citationId: "pcah-9",
          recommendation:
            "Use an observable verb such as apply, analyze, evaluate, create, or demonstrate.",
        }),
      );
    }
  });

  return results;
}

export function checkCourseContent(
  contentItems: readonly ComplianceContentInput[],
  course: unknown,
  slos: readonly ComplianceSLOInput[] = [],
  options: ComplianceOptions = {},
): readonly ComplianceResult[] {
  const results: ComplianceResult[] = [];
  results.push(
    contentItems.length === 0
      ? result({
          ruleId: "CONTENT-001",
          ruleName: "Course Content Topics",
          category: "Course Content",
          status: "fail",
          message: "Course has no content topics.",
          section: "Course Content",
          authority: "official-guidance",
          citationId: "title5-55002",
        })
      : contentItems.length < 5
        ? result({
            ruleId: "CONTENT-001",
            ruleName: "Course Content Topics",
            category: "Course Content",
            status: "warn",
            message: `Course has ${contentItems.length} content topics; the demo review recommends at least 5.`,
            section: "Course Content",
            authority: "demo-heuristic",
            citationId: "pcah-9",
          })
        : result({
            ruleId: "CONTENT-001",
            ruleName: "Course Content Topics",
            category: "Course Content",
            status: "pass",
            message: `Course has ${contentItems.length} content topics.`,
            section: "Course Content",
            authority: "official-guidance",
            citationId: "title5-55002",
          }),
  );

  const blankTopics = contentItems.filter(
    (item) => !stringField(item, "topic"),
  ).length;
  results.push(
    blankTopics > 0
      ? result({
          ruleId: "CONTENT-003",
          ruleName: "Complete Content Topics",
          category: "Course Content",
          status: "fail",
          message: `${blankTopics} content ${blankTopics === 1 ? "item has" : "items have"} no topic.`,
          section: "Course Content",
          authority: "official-guidance",
          citationId: "title5-55002",
        })
      : result({
          ruleId: "CONTENT-003",
          ruleName: "Complete Content Topics",
          category: "Course Content",
          status: "pass",
          message: "Every content item has a topic.",
          section: "Course Content",
          authority: "official-guidance",
          citationId: "title5-55002",
        }),
  );

  if (contentItems.length > 0) {
    const allocations = contentItems.map((item) =>
      numericField(item, "hoursAllocated", "hours_allocated"),
    );
    const hasNegativeAllocation = allocations.some((hours) => hours < 0);
    const allocatedHours = allocations.reduce(
      (total, hours) => total + hours,
      0,
    );
    const semesterWeeks = options.semesterWeeks ?? SEMESTER_WEEKS;
    const expectedLectureHours =
      numericField(course, "lectureHours", "lecture_hours") * semesterWeeks;

    if (hasNegativeAllocation) {
      results.push(
        result({
          ruleId: "CONTENT-002",
          ruleName: "Content Hours Allocation",
          category: "Course Content",
          status: "fail",
          message: "Content-hour allocations cannot be negative.",
          section: "Course Content",
          authority: "official-guidance",
          citationId: "pcah-9",
        }),
      );
    } else if (allocatedHours === 0) {
      results.push(
        result({
          ruleId: "CONTENT-002",
          ruleName: "Content Hours Allocation",
          category: "Course Content",
          status: "warn",
          message: "No hours are allocated to content topics.",
          section: "Course Content",
          authority: "demo-heuristic",
          citationId: "pcah-9",
          recommendation:
            "Allocate hours to show the relative instructional emphasis.",
        }),
      );
    } else if (
      expectedLectureHours > 0 &&
      Math.abs(allocatedHours - expectedLectureHours) >
        expectedLectureHours * 0.2
    ) {
      results.push(
        result({
          ruleId: "CONTENT-002",
          ruleName: "Content Hours Allocation",
          category: "Course Content",
          status: "warn",
          message:
            `${formatNumber(allocatedHours)} allocated content hours differ by more than 20% ` +
            `from ${formatNumber(expectedLectureHours)} semester lecture hours.`,
          section: "Course Content",
          authority: "demo-heuristic",
          citationId: "pcah-9",
          recommendation:
            "Reconcile the content allocation with the approved hours configuration.",
        }),
      );
    } else {
      results.push(
        result({
          ruleId: "CONTENT-002",
          ruleName: "Content Hours Allocation",
          category: "Course Content",
          status: "pass",
          message: `${formatNumber(allocatedHours)} content hours are allocated.`,
          section: "Course Content",
          authority: "demo-heuristic",
          citationId: "pcah-9",
        }),
      );
    }
  }

  const sloIds = new Set(
    slos.map((slo) => stringField(slo, "id")).filter(Boolean),
  );
  if (sloIds.size > 0) {
    const unknownLinks = contentItems.flatMap((item) =>
      listField(item, "linkedSloIds", "linkedSlos", "linked_slos")
        .filter((id): id is string => typeof id === "string")
        .filter((id) => !sloIds.has(id)),
    );
    if (unknownLinks.length > 0) {
      results.push(
        result({
          ruleId: "CONTENT-004",
          ruleName: "Content-to-SLO Links",
          category: "Course Content",
          status: "fail",
          message: `${unknownLinks.length} content-to-SLO ${unknownLinks.length === 1 ? "link references" : "links reference"} a missing SLO.`,
          section: "Course Content",
          authority: "demo-heuristic",
          recommendation: "Remove stale SLO links or restore the referenced outcomes.",
        }),
      );
    }
  }

  return results;
}

function normalizeRequisiteType(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "prerequisite") return "Prerequisite";
  if (lower === "corequisite") return "Corequisite";
  if (lower === "advisory") return "Advisory";
  return value;
}

function normalizeRequisiteValidationType(value: string): string {
  if (value === "ContentReview") return "Content Review";
  if (value === "HealthSafety") return "Health/Safety";
  return value;
}

export function checkRequisites(
  requisites: readonly ComplianceRequisiteInput[],
  courseId?: string,
): readonly ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const substantive = requisites.filter((requisite) =>
    ["Prerequisite", "Corequisite"].includes(
      normalizeRequisiteType(stringField(requisite, "type")),
    ),
  );

  if (substantive.length === 0) {
    results.push(
      result({
        ruleId: "REQ-002",
        ruleName: "Prerequisite and Corequisite Review",
        category: "Requisites",
        status: "pass",
        message:
          "No prerequisites or corequisites are defined; no validation documentation is required by this check.",
        section: "Requisites",
        authority: "regulation",
        citationId: "title5-55003",
      }),
    );
  }

  requisites.forEach((requisite, index) => {
    const requisiteCourseId = stringField(
      requisite,
      "requisiteCourseId",
      "requisite_course_id",
    );
    const requisiteText = stringField(
      requisite,
      "requisiteText",
      "requisite_text",
    );
    const type = normalizeRequisiteType(stringField(requisite, "type"));
    const validationType = normalizeRequisiteValidationType(
      stringField(
        requisite,
        "validationType",
        "validation_type",
      ),
    );
    const contentReview = stringField(
      requisite,
      "contentReview",
      "content_review",
    );

    if (!requisiteCourseId && !requisiteText) {
      results.push(
        result({
          ruleId: `REQ-003-${index + 1}`,
          ruleName: "Complete Requisite",
          category: "Requisites",
          status: "fail",
          message: `Requisite ${index + 1} must reference a course or contain requisite text.`,
          section: "Requisites",
          authority: "official-guidance",
          citationId: "title5-55003",
        }),
      );
    }
    if (courseId && requisiteCourseId === courseId) {
      results.push(
        result({
          ruleId: `REQ-004-${index + 1}`,
          ruleName: "No Self-Requisite",
          category: "Requisites",
          status: "fail",
          message: `Requisite ${index + 1} references its own course.`,
          section: "Requisites",
          authority: "demo-heuristic",
          recommendation: "Select a different requisite course.",
        }),
      );
    }

    if (
      validationType &&
      !REQUISITE_VALIDATION_TYPES.includes(
        validationType as (typeof REQUISITE_VALIDATION_TYPES)[number],
      )
    ) {
      results.push(
        result({
          ruleId: `REQ-005-${index + 1}`,
          ruleName: "Recognized Requisite Validation",
          category: "Requisites",
          status: "fail",
          message: `Requisite ${index + 1} has an unsupported validation type (${validationType}).`,
          section: "Requisites",
          authority: "demo-heuristic",
          citationId: "title5-55003",
        }),
      );
    }

    if (["Prerequisite", "Corequisite"].includes(type)) {
      const missingBasis =
        !validationType ||
        (validationType === "Content Review" && !contentReview);
      results.push(
        missingBasis
          ? result({
              ruleId: `REQ-001-${index + 1}`,
              ruleName: "Requisite Validation Basis",
              category: "Requisites",
              status: "warn",
              message:
                `${type} ${index + 1} lacks a complete validation basis` +
                (validationType === "Content Review"
                  ? " and documented content review."
                  : "."),
              section: "Requisites",
              authority: "regulation",
              citationId: "title5-55003",
              recommendation:
                "Document the approved validation method and supporting review.",
            })
          : result({
              ruleId: `REQ-001-${index + 1}`,
              ruleName: "Requisite Validation Basis",
              category: "Requisites",
              status: "pass",
              message: `${type} ${index + 1} identifies a validation basis.`,
              section: "Requisites",
              authority: "regulation",
              citationId: "title5-55003",
            }),
      );
    }
  });

  return results;
}

/**
 * Return true when adding course -> requisite would make the requisite graph
 * cyclic. Existing edges point from a course to the course it requires.
 */
export function wouldCreateRequisiteCycle(
  courseId: string,
  requisiteCourseId: string,
  existingEdges: readonly RequisiteGraphEdge[],
): boolean {
  if (courseId === requisiteCourseId) {
    return true;
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const targets = adjacency.get(edge.courseId) ?? [];
    targets.push(edge.requisiteCourseId);
    adjacency.set(edge.courseId, targets);
  }
  const pending = [requisiteCourseId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    if (current === courseId) {
      return true;
    }
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function checkCCNAlignment(
  course: unknown,
  standard?: unknown | null,
  justification?: unknown | null,
): readonly ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const ccnCode = stringField(course, "ccnCode", "ccn_code");
  const codes = normalizeCbCodes(course);

  if (ccnCode) {
    results.push(
      validateCCNFormat(ccnCode)
        ? result({
            ruleId: "CCN-000",
            ruleName: "CCN Code Format",
            category: "CCN/AB 1111",
            status: "pass",
            message: `${ccnCode} uses the supported CCN format.`,
            section: "CCN Alignment",
            authority: "official-guidance",
            citationId: "ccn-templates",
          })
        : result({
            ruleId: "CCN-000",
            ruleName: "CCN Code Format",
            category: "CCN/AB 1111",
            status: "fail",
            message: `${ccnCode} is not in the supported SUBJ C#### format.`,
            section: "CCN Alignment",
            authority: "official-guidance",
            citationId: "ccn-templates",
          }),
    );

    const standardCode = stringField(standard, "ccnCode", "ccn_code");
    if (standardCode && standardCode !== ccnCode) {
      results.push(
        result({
          ruleId: "CCN-004",
          ruleName: "Selected CCN Template",
          category: "CCN/AB 1111",
          status: "fail",
          message: `Course code ${ccnCode} does not match selected template ${standardCode}.`,
          section: "CCN Alignment",
          authority: "official-guidance",
          citationId: "ccn-templates",
        }),
      );
    }

    const expectedCb05 =
      stringField(standard, "impliedCb05", "implied_cb05") || "A";
    results.push(
      !codes.CB05
        ? result({
            ruleId: "CCN-001",
            ruleName: "CCN Template Transfer Status",
            category: "CCN/AB 1111",
            status: "warn",
            message: `CCN course ${ccnCode} has no CB05 value.`,
            section: "CB Codes",
            authority: "demo-heuristic",
            citationId: "ccn-templates",
            recommendation:
              "Confirm transfer/articulation status with the articulation office and selected template.",
          })
        : codes.CB05 !== expectedCb05
          ? result({
              ruleId: "CCN-001",
              ruleName: "CCN Template Transfer Status",
              category: "CCN/AB 1111",
              status: "fail",
              message: `CB05=${codes.CB05} differs from the selected template value ${expectedCb05}.`,
              section: "CB Codes",
              authority: "demo-heuristic",
              citationId: "ccn-templates",
              recommendation:
                "Review the current template and articulation decision before changing CB05.",
            })
          : result({
              ruleId: "CCN-001",
              ruleName: "CCN Template Transfer Status",
              category: "CCN/AB 1111",
              status: "pass",
              message: `CB05=${codes.CB05} matches the selected template data.`,
              section: "CB Codes",
              authority: "demo-heuristic",
              citationId: "ccn-templates",
            }),
    );

    const courseUnits = numericField(course, "units");
    const minimumUnits = toFiniteNumber(
      first(standard, "minimumUnits", "minimum_units"),
      Number.NaN,
    );
    if (Number.isFinite(minimumUnits)) {
      results.push(
        courseUnits < minimumUnits
          ? result({
              ruleId: "CCN-002",
              ruleName: "CCN Template Minimum Units",
              category: "CCN/AB 1111",
              status: "warn",
              message: `${formatNumber(courseUnits)} units are below the template minimum of ${formatNumber(minimumUnits)}.`,
              section: "Units & Hours",
              authority: "official-guidance",
              citationId: "ccn-templates",
            })
          : result({
              ruleId: "CCN-002",
              ruleName: "CCN Template Minimum Units",
              category: "CCN/AB 1111",
              status: "pass",
              message: `${formatNumber(courseUnits)} units meet the template minimum of ${formatNumber(minimumUnits)}.`,
              section: "Units & Hours",
              authority: "official-guidance",
              citationId: "ccn-templates",
            }),
      );
    }

    if (justification) {
      results.push(
        result({
          ruleId: "CCN-003",
          ruleName: "CCN Non-Match Justification",
          category: "CCN/AB 1111",
          status: "warn",
          message:
            "An aligned course still has a non-match justification; the records conflict.",
          section: "CCN Alignment",
          authority: "demo-heuristic",
          recommendation: "Remove the obsolete non-match justification.",
        }),
      );
    }
  } else if (!justification) {
    results.push(
      result({
        ruleId: "CCN-003",
        ruleName: "CCN Non-Match Justification",
        category: "CCN/AB 1111",
        status: "warn",
        message:
          "Course has no CCN alignment or documented non-match justification.",
        section: "CCN Alignment",
        authority: "demo-heuristic",
        citationId: "education-code-66725-5",
        recommendation:
          "Check for an applicable current CCN template; if one does not fit, document the local decision.",
      }),
    );
  } else {
    const validation = validateCCNNonMatchJustification(
      justification as never,
    );
    results.push(
      validation.valid
        ? result({
            ruleId: "CCN-003",
            ruleName: "CCN Non-Match Justification",
            category: "CCN/AB 1111",
            status: "pass",
            message: "The non-match justification is complete.",
            section: "CCN Alignment",
            authority: "demo-heuristic",
            citationId: "education-code-66725-5",
          })
        : result({
            ruleId: "CCN-003",
            ruleName: "CCN Non-Match Justification",
            category: "CCN/AB 1111",
            status: "fail",
            message: validation.errors.join(" "),
            section: "CCN Alignment",
            authority: "demo-heuristic",
            citationId: "education-code-66725-5",
          }),
    );
  }

  return results;
}

function summarize(
  results: readonly ComplianceResult[],
  calculatedHours: ComplianceAudit["calculatedHours"],
): ComplianceAudit {
  const passed = results.filter(({ status }) => status === "pass").length;
  const failed = results.filter(({ status }) => status === "fail").length;
  const warnings = results.filter(({ status }) => status === "warn").length;
  const score =
    results.length === 0
      ? 100
      : Math.round(
          ((passed + warnings * 0.5) / results.length) * 1000,
        ) / 10;
  const resultsByCategory: Partial<
    Record<ComplianceCategory, ComplianceResult[]>
  > = {};
  for (const item of results) {
    (resultsByCategory[item.category] ??= []).push(item);
  }

  return {
    overallStatus: failed > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    complianceScore: score,
    totalChecks: results.length,
    passed,
    failed,
    warnings,
    results,
    resultsByCategory,
    calculatedHours,
  };
}

export function auditCourse(
  input: ComplianceAuditInput,
  options: ComplianceOptions = {},
): ComplianceAudit {
  const course = input.course;
  const slos = (
    input.slos ?? listField(course, "slos")
  ) as readonly ComplianceSLOInput[];
  const contentItems = (
    input.contentItems ?? listField(course, "contentItems", "content_items")
  ) as readonly ComplianceContentInput[];
  const requisites = (
    input.requisites ?? listField(course, "requisites")
  ) as readonly ComplianceRequisiteInput[];
  const calculatedHours = calculateHourBreakdown(
    {
      lectureHours: first(course, "lectureHours", "lecture_hours"),
      labHours: first(course, "labHours", "lab_hours"),
      activityHours: first(course, "activityHours", "activity_hours"),
      tbaHours: first(course, "tbaHours", "tba_hours"),
      outsideOfClassHours: first(
        course,
        "outsideOfClassHours",
        "outside_of_class_hours",
      ),
    },
    options,
  );

  const results = [
    ...checkBasicInformation(course),
    ...checkUnitsAndHours(course, options),
    ...checkCBCodes(course),
    ...checkSLOs(slos),
    ...checkCourseContent(contentItems, course, slos, options),
    ...checkRequisites(requisites, stringField(course, "id") || undefined),
    ...checkCCNAlignment(
      course,
      input.ccnStandard,
      input.ccnJustification,
    ),
  ];

  return summarize(results, calculatedHours);
}
