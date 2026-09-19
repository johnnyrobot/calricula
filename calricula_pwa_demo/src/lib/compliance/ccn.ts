import type {
  CCNJustification,
  CCNStandard,
  Course,
} from "@/lib/domain";

import { toFiniteNumber } from "./hours";
import {
  CCN_NON_MATCH_REASON_CODES,
  type CCNAdoptionOptions,
  type CCNAdoptionPlan,
  type CCNAlignmentStatus,
  type CCNJustificationValidation,
  type CCNJustificationValidationContext,
  type CCNMatchInput,
  type CCNMatchOptions,
  type CCNMatchResult,
  type CCNNonMatchReasonCode,
  type ComplianceCCNJustificationInput,
  type ComplianceCCNStandardInput,
  type ComplianceCourseInput,
  type ParsedCCNCode,
} from "./types";

export const DISCIPLINE_TOP_CODES = Object.freeze({
  MATH: "1701.00",
  STAT: "1701.00",
  ENGL: "1501.00",
  COMM: "0604.00",
  PSYCH: "2001.00",
  PSYC: "2001.00",
  SOC: "2208.00",
  SOCI: "2208.00",
  ANTH: "2202.00",
  HIST: "2205.00",
  ECON: "2204.00",
  POLI: "2207.00",
  POLS: "2207.00",
  GEOG: "2206.00",
  BIOL: "0401.00",
  CHEM: "1905.00",
  PHYS: "1902.00",
  GEOL: "1914.00",
  ASTR: "1911.00",
  ARTH: "1002.00",
  ARTS: "1001.00",
  MUSI: "1004.00",
  THEA: "1006.00",
  PHIL: "1509.00",
  SPAN: "1105.00",
  FREN: "1102.00",
  GERM: "1103.00",
  CHIN: "1106.00",
  JAPN: "1107.00",
  ASL: "1199.00",
  BUS: "0501.00",
  ACCT: "0502.00",
  CS: "0707.00",
  CIS: "0702.00",
  NURS: "1230.00",
  HLTH: "1200.00",
  EDUC: "0800.00",
  ECE: "1305.00",
  CDEV: "1305.00",
  PE: "0835.00",
  KIN: "0835.00",
  ENGR: "0901.00",
} as const);

const CCN_PATTERN = /^([A-Z]{2,6})\s+C(\d{4})([HLSE]{0,2})$/i;
const LEGACY_CID_PATTERN = /^([A-Z]{2,6})\s+(\d{2,3})([A-Z]?)$/i;
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "for",
  "and",
  "or",
  "with",
  "introduction",
  "intro",
  "i",
  "ii",
  "iii",
  "basic",
  "advanced",
  "course",
  "class",
  "survey",
  "principles",
  "fundamentals",
  "will",
  "be",
  "able",
  "student",
  "students",
  "demonstrate",
  "understand",
]);

const DISCIPLINE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  PSYC: ["PSYC", "PSYCH", "PSY"],
  PSYCH: ["PSYC", "PSYCH", "PSY"],
  SOC: ["SOC", "SOCI"],
  SOCI: ["SOC", "SOCI"],
  ENGL: ["ENGL", "ENG"],
  ENG: ["ENGL", "ENG"],
  MATH: ["MATH", "MTH"],
  MTH: ["MATH", "MTH"],
  BIOL: ["BIOL", "BIO"],
  BIO: ["BIOL", "BIO"],
  CHEM: ["CHEM", "CHE"],
  CHE: ["CHEM", "CHE"],
  HIST: ["HIST", "HIS"],
  HIS: ["HIST", "HIS"],
  PHYS: ["PHYS", "PHY"],
  PHY: ["PHYS", "PHY"],
  POLI: ["POLI", "POLS"],
  POLS: ["POLI", "POLS"],
};

type StandardLike = ComplianceCCNStandardInput | CCNStandard;
type CourseLike = ComplianceCourseInput | Course;
type JustificationLike =
  | ComplianceCCNJustificationInput
  | CCNJustification;

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object"
    ? (value as Readonly<Record<string, unknown>>)
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

function stringList(
  value: unknown,
  ...keys: readonly string[]
): readonly string[] {
  const candidate = first<unknown>(value, ...keys);
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function parseCCNCode(value: string | null | undefined): ParsedCCNCode | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  const match = CCN_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }

  const subject = match[1].toUpperCase();
  const courseNumber = match[2];
  const specialty = (match[3] ?? "").toUpperCase();

  return {
    subject,
    courseNumber,
    specialty,
    isHonors: specialty.includes("H"),
    isLabOnly: specialty.includes("L"),
    isSupport: specialty.includes("S"),
    isEmbedded: specialty.includes("E"),
    fullCode: `${subject} C${courseNumber}${specialty}`,
  };
}

export function validateCCNFormat(value: string | null | undefined): boolean {
  return parseCCNCode(value) !== null;
}

export function validateLegacyCIDFormat(
  value: string | null | undefined,
): boolean {
  return value
    ? LEGACY_CID_PATTERN.test(normalizeWhitespace(value))
    : false;
}

export function formatCCNCode(
  subject: string,
  courseNumber: string,
  specialty = "",
): string {
  const normalizedSubject = subject.trim().toUpperCase();
  const normalizedNumber = courseNumber.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const normalizedSpecialty = specialty.trim().toUpperCase();
  return `${normalizedSubject} C${normalizedNumber}${normalizedSpecialty}`;
}

export function getTopCodeForDiscipline(
  discipline: string | null | undefined,
): string | undefined {
  if (!discipline) {
    return undefined;
  }
  return DISCIPLINE_TOP_CODES[
    discipline.trim().toUpperCase() as keyof typeof DISCIPLINE_TOP_CODES
  ];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function keywordOverlap(left: string, right: string): number {
  const leftWords = keywords(left);
  const rightWords = keywords(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      intersection += 1;
    }
  }
  const union = leftWords.size + rightWords.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function textSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  return longest === 0
    ? 1
    : 1 - levenshteinDistance(normalizedLeft, normalizedRight) / longest;
}

function listCoverage(
  courseItems: readonly string[],
  requirements: readonly string[],
): number {
  if (requirements.length === 0) {
    return 100;
  }
  if (courseItems.length === 0) {
    return 0;
  }

  const courseWords = keywords(courseItems.join(" "));
  const covered = requirements.filter((requirement) => {
    const requirementWords = keywords(requirement);
    if (requirementWords.size === 0) {
      return false;
    }
    let overlap = 0;
    for (const word of requirementWords) {
      if (courseWords.has(word)) {
        overlap += 1;
      }
    }
    return overlap >= requirementWords.size * 0.3;
  }).length;

  return (covered / requirements.length) * 100;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Deterministic local candidate ranking. This is discovery assistance only:
 * the official template and faculty/articulation review remain authoritative.
 */
export function findCCNMatches(
  input: CCNMatchInput,
  standards: readonly StandardLike[],
  options: CCNMatchOptions = {},
): readonly CCNMatchResult[] {
  const threshold = options.minimumConfidence ?? 0.3;
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  const requestedSubject = input.subjectCode?.trim().toUpperCase() ?? "";

  return standards
    .map((standard): CCNMatchResult | null => {
      const ccnCode = stringField(standard, "ccnCode", "ccn_code");
      const title = stringField(standard, "title");
      const discipline = stringField(
        standard,
        "discipline",
        "subjectCode",
        "subject_code",
      ).toUpperCase();
      if (!ccnCode || !title || !discipline) {
        return null;
      }

      let confidence = 0;
      const matchReasons: string[] = [];
      if (requestedSubject) {
        const variants =
          DISCIPLINE_VARIANTS[requestedSubject] ?? [requestedSubject];
        if (variants.includes(discipline)) {
          confidence += 0.35;
          matchReasons.push(`Discipline match: ${discipline}`);
        }
      }

      const titleSimilarity = textSimilarity(input.title, title);
      confidence += titleSimilarity * 0.3;
      if (titleSimilarity > 0.5) {
        matchReasons.push(
          `Title match: "${title}" (${Math.round(titleSimilarity * 100)}% similar)`,
        );
      }

      const titleKeywords = keywordOverlap(input.title, title);
      confidence += titleKeywords * 0.15;
      if (titleKeywords > 0.3) {
        matchReasons.push(
          `Title keywords match (${Math.round(titleKeywords * 100)}% overlap)`,
        );
      }

      const descriptor = stringField(
        standard,
        "descriptor",
        "catalogDescription",
      );
      if (input.description && descriptor) {
        const descriptionSimilarity = textSimilarity(
          input.description,
          descriptor,
        );
        confidence += descriptionSimilarity * 0.2;
        if (descriptionSimilarity > 0.3) {
          matchReasons.push(
            `Description similarity (${Math.round(descriptionSimilarity * 100)}%)`,
          );
        }
      }

      confidence = Math.min(confidence, 1);
      if (confidence < threshold) {
        return null;
      }

      const minimumUnits = toFiniteNumber(
        first(standard, "minimumUnits", "minimum_units"),
      );
      const units = toFiniteNumber(input.units, Number.NaN);
      const unitsSufficient =
        !Number.isFinite(units) || units >= minimumUnits;
      if (!unitsSufficient) {
        matchReasons.push(
          `Units (${units}) are below the template minimum (${minimumUnits})`,
        );
      }

      const contentRequirements = stringList(
        standard,
        "contentRequirements",
        "content_requirements",
      );
      const sloRequirements = stringList(
        standard,
        "sloRequirements",
        "slo_requirements",
      );
      const objectives = stringList(standard, "objectives");
      const impliedTopCode =
        stringField(standard, "impliedTopCode", "implied_top_code") ||
        getTopCodeForDiscipline(discipline);
      const impliedCb05 =
        stringField(standard, "impliedCb05", "implied_cb05") || "A";
      const alignmentStatus: CCNAlignmentStatus =
        confidence >= 0.7 && unitsSufficient
          ? "aligned"
          : confidence >= 0.5
            ? "potential"
            : "review_needed";

      return {
        standardId: stringField(standard, "id") || undefined,
        ccnCode,
        discipline,
        title,
        descriptor: descriptor || undefined,
        minimumUnits,
        confidenceScore: round(confidence),
        matchReasons,
        sloRequirements,
        contentRequirements,
        contentCoverageScore: round(
          listCoverage(input.contentTopics ?? [], contentRequirements),
          1,
        ),
        objectivesCoverageScore: round(
          listCoverage(input.slos ?? [], objectives.length ? objectives : sloRequirements),
          1,
        ),
        alignmentStatus,
        unitsSufficient,
        impliedCbCodes: {
          CB05: impliedCb05,
          ...(impliedTopCode ? { CB03: impliedTopCode } : {}),
        },
      };
    })
    .filter((match): match is CCNMatchResult => match !== null)
    .sort(
      (left, right) =>
        right.confidenceScore - left.confidenceScore ||
        left.ccnCode.localeCompare(right.ccnCode),
    )
    .slice(0, limit);
}

export function planCCNAdoption(
  course: CourseLike,
  standard: StandardLike,
  options: CCNAdoptionOptions = {},
): CCNAdoptionPlan {
  const ccnCode = stringField(standard, "ccnCode", "ccn_code");
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!validateCCNFormat(ccnCode)) {
    errors.push("The selected CCN standard has an invalid or missing CCN code.");
  }

  const courseUnits = toFiniteNumber(first(course, "units"), Number.NaN);
  const minimumUnits = toFiniteNumber(
    first(standard, "minimumUnits", "minimum_units"),
    Number.NaN,
  );
  if (
    Number.isFinite(courseUnits) &&
    Number.isFinite(minimumUnits) &&
    courseUnits < minimumUnits
  ) {
    warnings.push(
      `Course units (${courseUnits}) are below the CCN template minimum (${minimumUnits}).`,
    );
  }

  const currentCodes = first<unknown>(course, "cbCodes", "cb_codes");
  const cbCodes: Record<string, unknown> = { ...recordOf(currentCodes) };
  const cbCodesUpdated: Record<string, string> = {};
  const requiredCb05 =
    stringField(standard, "impliedCb05", "implied_cb05") || "A";
  const existingCb05 =
    typeof cbCodes.CB05 === "string" ? cbCodes.CB05 : undefined;

  if (existingCb05 && existingCb05 !== requiredCb05) {
    warnings.push(
      `Existing CB05 "${existingCb05}" conflicts with the template value "${requiredCb05}".`,
    );
  }

  if (options.autoPopulateCbCodes !== false) {
    cbCodes.CB05 = requiredCb05;
    cbCodesUpdated.CB05 = requiredCb05;

    const discipline = stringField(
      standard,
      "discipline",
      "subjectCode",
      "subject_code",
    );
    const impliedTopCode =
      stringField(standard, "impliedTopCode", "implied_top_code") ||
      getTopCodeForDiscipline(discipline);
    if (impliedTopCode) {
      cbCodes.CB03 = impliedTopCode;
      cbCodesUpdated.CB03 = impliedTopCode;
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      cbCodesUpdated: {},
      warnings,
      errors,
      clearNonMatchJustification: false,
    };
  }

  return {
    success: true,
    ccnCode,
    coursePatch: { ccnCode, cbCodes },
    cbCodesUpdated,
    warnings,
    errors,
    clearNonMatchJustification: true,
  };
}

export function validateCCNNonMatchJustification(
  input: JustificationLike,
  context: CCNJustificationValidationContext = {},
): CCNJustificationValidation {
  const reasonCode = stringField(
    input,
    "reasonCode",
    "reason_code",
  ) as CCNNonMatchReasonCode;
  const justificationText = stringField(
    input,
    "justificationText",
    "justification_text",
    "justification",
  );
  const ccnCode = stringField(input, "ccnCode", "ccn_code");
  const evidence = stringList(input, "evidence")
    .map((item) => item.trim())
    .filter(Boolean);
  const errors: string[] = [];

  const usesReasonCodeShape = Boolean(reasonCode);
  if (
    usesReasonCodeShape &&
    !CCN_NON_MATCH_REASON_CODES.includes(
      reasonCode as (typeof CCN_NON_MATCH_REASON_CODES)[number],
    )
  ) {
    errors.push(
      `Reason code must be one of: ${CCN_NON_MATCH_REASON_CODES.join(", ")}.`,
    );
  }
  if (!usesReasonCodeShape && !ccnCode) {
    errors.push(
      "A justification must identify either a valid reason code or the CCN template being declined.",
    );
  }
  if (ccnCode && !validateCCNFormat(ccnCode)) {
    errors.push("The declined CCN template code is not in a valid format.");
  }
  if (justificationText.length < 20) {
    errors.push("Justification text must be at least 20 characters.");
  }
  if (context.courseCcnCode?.trim()) {
    errors.push(
      "A non-match justification cannot be attached while the course has a CCN code.",
    );
  }

  return {
    valid: errors.length === 0,
    ...(errors.length === 0
      ? {
          normalized: {
            ...(reasonCode ? { reasonCode } : {}),
            ...(ccnCode ? { ccnCode: parseCCNCode(ccnCode)?.fullCode ?? ccnCode } : {}),
            justificationText,
            evidence,
          },
        }
      : {}),
    errors,
  };
}
