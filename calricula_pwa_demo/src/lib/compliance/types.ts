import type {
  CCNJustification,
  CCNStandard,
  Course,
  CourseContent,
  CourseRequisite,
  StudentLearningOutcome,
} from "@/lib/domain";

/**
 * The compliance engine accepts the canonical domain records directly, but its
 * public input contracts are intentionally structural. That keeps the pure
 * rules usable for unsaved editor drafts and for import validation.
 */
export type NumericValue = number | string | null | undefined;

export const COMPLIANCE_STATUSES = ["pass", "warn", "fail"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_CATEGORIES = [
  "Title 5",
  "PCAH",
  "CB Codes",
  "Units & Hours",
  "Student Learning Outcomes",
  "Course Content",
  "Requisites",
  "General",
  "CCN/AB 1111",
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export type ComplianceAuthority =
  | "regulation"
  | "official-guidance"
  | "demo-heuristic";

export type CitationId =
  | "title5-55002"
  | "title5-55002-5"
  | "title5-55003"
  | "pcah-9"
  | "education-code-66725-5"
  | "ccn-templates"
  | "cb-data-elements";

export interface SourceCitation {
  readonly id: CitationId;
  readonly shortLabel: string;
  readonly title: string;
  readonly issuingBody: string;
  readonly jurisdiction: "California";
  readonly kind: "regulation" | "statute" | "official-handbook" | "official-guidance";
  readonly locator: string;
  readonly url: string;
  readonly version?: string;
  readonly verifiedOn: string;
  readonly notes?: string;
}

export interface ComplianceResult {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly category: ComplianceCategory;
  readonly status: ComplianceStatus;
  readonly message: string;
  readonly section: string;
  readonly authority: ComplianceAuthority;
  readonly citationId?: CitationId;
  readonly citation?: string;
  readonly recommendation?: string;
}

export interface ComplianceAudit {
  readonly overallStatus: ComplianceStatus;
  readonly complianceScore: number;
  readonly totalChecks: number;
  readonly passed: number;
  readonly failed: number;
  readonly warnings: number;
  readonly results: readonly ComplianceResult[];
  readonly resultsByCategory: Readonly<
    Partial<Record<ComplianceCategory, readonly ComplianceResult[]>>
  >;
  readonly calculatedHours: HourCalculation;
}

export interface ComplianceCourseInput {
  readonly id?: string;
  readonly subjectCode?: string | null;
  readonly subject_code?: string | null;
  readonly courseNumber?: string | null;
  readonly course_number?: string | null;
  readonly title?: string | null;
  readonly catalogDescription?: string | null;
  readonly catalog_description?: string | null;
  readonly units?: NumericValue;
  readonly lectureHours?: NumericValue;
  readonly lecture_hours?: NumericValue;
  readonly labHours?: NumericValue;
  readonly lab_hours?: NumericValue;
  readonly activityHours?: NumericValue;
  readonly activity_hours?: NumericValue;
  readonly tbaHours?: NumericValue;
  readonly tba_hours?: NumericValue;
  readonly outsideOfClassHours?: NumericValue;
  readonly outside_of_class_hours?: NumericValue;
  readonly topCode?: string | null;
  readonly top_code?: string | null;
  readonly ccnCode?: string | null;
  readonly ccn_code?: string | null;
  readonly cbCodes?: Readonly<Record<string, unknown>> | null;
  readonly cb_codes?: Readonly<Record<string, unknown>> | null;
}

export interface ComplianceSLOInput {
  readonly id?: string;
  readonly outcomeText?: string | null;
  readonly outcome_text?: string | null;
  readonly bloomLevel?: string | null;
  readonly bloom_level?: string | null;
}

export interface ComplianceContentInput {
  readonly id?: string;
  readonly topic?: string | null;
  readonly hoursAllocated?: NumericValue;
  readonly hours_allocated?: NumericValue;
  readonly linkedSlos?: readonly string[] | null;
  readonly linked_slos?: readonly string[] | null;
  readonly linkedSloIds?: readonly string[] | null;
}

export interface ComplianceRequisiteInput {
  readonly id?: string;
  readonly courseId?: string | null;
  readonly course_id?: string | null;
  readonly requisiteCourseId?: string | null;
  readonly requisite_course_id?: string | null;
  readonly requisiteText?: string | null;
  readonly requisite_text?: string | null;
  readonly type?: string | null;
  readonly validationType?: string | null;
  readonly validation_type?: string | null;
  readonly contentReview?: string | null;
  readonly content_review?: string | null;
}

export interface ComplianceCCNStandardInput {
  readonly id?: string;
  readonly ccnCode?: string | null;
  readonly ccn_code?: string | null;
  readonly discipline?: string | null;
  readonly subjectCode?: string | null;
  readonly subject_code?: string | null;
  readonly title?: string | null;
  readonly descriptor?: string | null;
  readonly catalogDescription?: string | null;
  readonly minimumUnits?: NumericValue;
  readonly minimum_units?: NumericValue;
  readonly prerequisites?: string | null;
  readonly corequisites?: string | null;
  readonly impliedCb05?: string | null;
  readonly implied_cb05?: string | null;
  readonly impliedTopCode?: string | null;
  readonly implied_top_code?: string | null;
  readonly sloRequirements?: readonly string[] | null;
  readonly slo_requirements?: readonly string[] | null;
  readonly objectives?: readonly string[] | null;
  readonly contentRequirements?: readonly string[] | null;
  readonly content_requirements?: readonly string[] | null;
}

export const CCN_NON_MATCH_REASON_CODES = [
  "specialized",
  "vocational",
  "local_need",
  "new_course",
  "other",
] as const;
export type CCNNonMatchReasonCode =
  (typeof CCN_NON_MATCH_REASON_CODES)[number];

export interface ComplianceCCNJustificationInput {
  readonly id?: string;
  readonly courseId?: string | null;
  readonly course_id?: string | null;
  readonly reasonCode?: string | null;
  readonly reason_code?: string | null;
  readonly justificationText?: string | null;
  readonly justification_text?: string | null;
  readonly ccnCode?: string | null;
  readonly justification?: string | null;
  readonly evidence?: readonly string[] | null;
}

export interface ComplianceAuditInput {
  readonly course: ComplianceCourseInput | Course;
  readonly slos?: readonly (
    | ComplianceSLOInput
    | StudentLearningOutcome
  )[];
  readonly contentItems?: readonly (
    | ComplianceContentInput
    | CourseContent
  )[];
  readonly requisites?: readonly (
    | ComplianceRequisiteInput
    | CourseRequisite
  )[];
  readonly ccnStandard?: ComplianceCCNStandardInput | CCNStandard | null;
  readonly ccnJustification?:
    | ComplianceCCNJustificationInput
    | CCNJustification
    | null;
}

export interface ComplianceOptions {
  readonly semesterWeeks?: number;
  readonly minimumHoursPerUnit?: number;
  readonly conventionalHoursPerUnit?: number;
  readonly toleranceUnits?: number;
}

export interface WeeklyHoursInput {
  readonly lectureHours?: NumericValue;
  readonly labHours?: NumericValue;
  readonly activityHours?: NumericValue;
  readonly tbaHours?: NumericValue;
  readonly outsideOfClassHours?: NumericValue;
}

export interface HourCalculation {
  readonly semesterWeeks: number;
  readonly weeklyLectureHours: number;
  readonly weeklyLabHours: number;
  readonly weeklyActivityHours: number;
  readonly weeklyTbaHours: number;
  readonly weeklyOutsideOfClassHours: number;
  readonly semesterLectureHours: number;
  readonly semesterLabHours: number;
  readonly semesterActivityHours: number;
  readonly semesterTbaHours: number;
  readonly semesterOutsideOfClassHours: number;
  readonly totalContactHours: number;
  readonly totalStudentLearningHours: number;
}

export interface MinimumHoursCheck {
  readonly isCompliant: boolean;
  readonly minimumRequiredHours: number;
  readonly allowedShortfallHours: number;
  readonly actualHoursPerUnit: number;
  readonly shortfallHours: number;
}

export interface ParsedCCNCode {
  readonly subject: string;
  readonly courseNumber: string;
  readonly specialty: string;
  readonly isHonors: boolean;
  readonly isLabOnly: boolean;
  readonly isSupport: boolean;
  readonly isEmbedded: boolean;
  readonly fullCode: string;
}

export interface CCNMatchInput {
  readonly title: string;
  readonly description?: string | null;
  readonly subjectCode?: string | null;
  readonly units?: NumericValue;
  readonly slos?: readonly string[];
  readonly contentTopics?: readonly string[];
}

export type CCNAlignmentStatus =
  | "aligned"
  | "potential"
  | "review_needed";

export interface CCNMatchResult {
  readonly standardId?: string;
  readonly ccnCode: string;
  readonly discipline: string;
  readonly title: string;
  readonly descriptor?: string;
  readonly minimumUnits: number;
  readonly confidenceScore: number;
  readonly matchReasons: readonly string[];
  readonly sloRequirements: readonly string[];
  readonly contentRequirements: readonly string[];
  readonly contentCoverageScore: number;
  readonly objectivesCoverageScore: number;
  readonly alignmentStatus: CCNAlignmentStatus;
  readonly unitsSufficient: boolean;
  readonly impliedCbCodes: Readonly<Record<string, string>>;
}

export interface CCNMatchOptions {
  readonly minimumConfidence?: number;
  readonly limit?: number;
}

export interface CCNAdoptionOptions {
  readonly autoPopulateCbCodes?: boolean;
}

export interface CCNAdoptionPlan {
  readonly success: boolean;
  readonly ccnCode?: string;
  readonly coursePatch?: {
    readonly ccnCode: string;
    readonly cbCodes: Readonly<Record<string, unknown>>;
  };
  readonly cbCodesUpdated: Readonly<Record<string, string>>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly clearNonMatchJustification: boolean;
}

export interface CCNJustificationValidation {
  readonly valid: boolean;
  readonly normalized?: {
    readonly reasonCode?: CCNNonMatchReasonCode;
    readonly ccnCode?: string;
    readonly justificationText: string;
    readonly evidence: readonly string[];
  };
  readonly errors: readonly string[];
}

export interface CCNJustificationValidationContext {
  readonly courseCcnCode?: string | null;
}

export interface RequisiteGraphEdge {
  readonly courseId: string;
  readonly requisiteCourseId: string;
}
