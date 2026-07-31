import { z } from "zod";

import type { AITask } from "./types";

const trimmedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const uniqueStrings = (values: readonly string[]) =>
  new Set(values.map((value) => value.toLocaleLowerCase())).size ===
  values.length;

const uniqueNumbers = (values: readonly number[]) =>
  new Set(values).size === values.length;

export const AI_HISTORY_CONTEXT_LIMIT = 10;

export const AI_TOP_CODE_CATALOG = {
  "1701.00": "Mathematics, General",
  "1501.00": "English",
  "0707.00": "Computer Information Systems",
  "0401.00": "Biological Sciences",
  "2001.00": "Psychology, General",
  "0505.00": "Business Administration",
  "1002.00": "Art",
  "2205.00": "History",
  "1905.00": "Chemistry, General",
  "1230.00": "Nursing",
  "1012.00": "Applied Photography",
  "0956.00": "Manufacturing Technology",
  "2101.00": "Sociology",
  "0835.00": "Child Development/Early Care and Education",
  "1301.00": "Communication Studies",
  "1901.00": "Physical Sciences, General",
  "2202.00": "Political Science",
  "2203.00": "Economics",
  "0502.00": "Accounting",
  "0701.00": "Information Technology, General",
} as const;

export const AI_COMPLIANCE_SOURCE_PACK = {
  "title5-course-standards": {
    sourceTitle: "California Code of Regulations, title 5, section 55002",
    sourceSection: "§ 55002(a)(1)(C), Units",
    excerpt:
      "Course outlines of record shall record the total number of hours in each instructional category specified in governing board policy.",
    url: "https://govt.westlaw.com/calregs/Document/I825A4A90BB1811F0933DFD2696D93541?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:839c8f4f1bd8d44f1f78137ccf4a812a9c59b819a2da959326bac342e52c78e6",
  },
  "title5-credit-hour": {
    sourceTitle: "California Code of Regulations, title 5, section 55002.5",
    sourceSection: "§ 55002.5(a), Credit Hour Definition",
    excerpt:
      "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
    url: "https://govt.westlaw.com/calregs/Document/IECE98DC0507C11EE80669BF4F3976CB1?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
  },
  "pcah-current-edition": {
    sourceTitle:
      "California Community Colleges Program and Course Approval Handbook, 8th Edition",
    sourceSection: "p. 44, Criteria for the Course Outline of Record",
    excerpt:
      "The Chancellor’s Office review and chaptering processes require the submission of a COR that meets the standards for courses established in Title 5, § 55002.",
    url: "https://www.cccco.edu/-/media/CCCCO-Website/docs/curriculum/program-course-approval-handbook-8th-edition.pdf",
    checksum:
      "sha256:ecbcd9235e013f4b823d5d6605ca1681b9425955f28ce89a20848be7f8d766ee",
  },
  "ccn-current-guidance": {
    sourceTitle: "California Education Code section 66725.5",
    sourceSection: "§ 66725.5(a)(2), Common Course Numbering System",
    excerpt:
      "ensure that comparable courses across all community colleges have the same course number.",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=66725.5.&lawCode=EDC",
    checksum:
      "sha256:bb02261c81bbc8d2fd535db18876b40f482e7cfa9bb74d6d3e3a1bf0a510a0a6",
  },
} as const;

const complianceSourceIds = Object.keys(
  AI_COMPLIANCE_SOURCE_PACK,
) as [
  keyof typeof AI_COMPLIANCE_SOURCE_PACK,
  ...(keyof typeof AI_COMPLIANCE_SOURCE_PACK)[],
];

export const ChatOutputSchema = z
  .object({ message: trimmedText(12_000) })
  .strict();

export const CatalogDescriptionOutputSchema = z
  .object({ description: trimmedText(1_600) })
  .strict();

export const SLOOutputSchema = z
  .object({
    slos: z
      .array(trimmedText(350))
      .min(1)
      .max(6)
      .refine(uniqueStrings, "Student learning outcomes must be unique."),
  })
  .strict();

export const ContentOutlineTopicSchema = z
  .object({
    sequence: z.number().int().min(1).max(20),
    topic: trimmedText(500),
    contactHours: z.number().finite().positive().max(500),
    relatedSloNumbers: z
      .array(z.number().int().min(1).max(6))
      .max(6)
      .refine(uniqueNumbers, "Related SLO numbers must be unique."),
  })
  .strict();

export const ContentOutlineOutputSchema = z
  .object({
    topics: z
      .array(ContentOutlineTopicSchema)
      .min(1)
      .max(20)
      .superRefine((topics, context) => {
        topics.forEach((topic, index) => {
          if (topic.sequence !== index + 1) {
            context.addIssue({
              code: "custom",
              message:
                "Topic sequence values must be consecutive and one-based.",
              path: [index, "sequence"],
            });
          }
        });
      }),
  })
  .strict();

const TopCodeSuggestionSchema = z
  .object({
    code: z.string().regex(/^\d{4}\.\d{2}$/),
    title: trimmedText(200),
    rationale: trimmedText(700),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const TopCodeOutputSchema = z
  .object({
    suggestions: z
      .array(TopCodeSuggestionSchema)
      .min(1)
      .max(3)
      .refine(
        (suggestions) =>
          uniqueStrings(suggestions.map((suggestion) => suggestion.code)),
        "Suggested TOP codes must be unique.",
      ),
  })
  .strict();

export const ProgramNarrativeOutputSchema = z
  .object({
    goalsAndObjectives: trimmedText(3_000),
    catalogDescription: trimmedText(2_000),
    requirementsJustification: trimmedText(3_000),
    laborMarketAnalysis: z.string().trim().max(3_000),
  })
  .strict();

const ComplianceCitationSchema = z
  .object({
    sourceId: z.enum(complianceSourceIds),
    sourceTitle: trimmedText(300),
    sourceSection: trimmedText(300),
    excerpt: trimmedText(1_000),
    url: z.url().refine((value) => value.startsWith("https://"), {
      message: "Compliance source URLs must use HTTPS.",
    }),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    supports: trimmedText(500),
  })
  .strict();

export const ComplianceExplanationOutputSchema = z
  .object({
    explanation: trimmedText(3_000),
    recommendations: z.array(trimmedText(600)).min(1).max(8),
    citations: z.array(ComplianceCitationSchema).min(1).max(8),
    humanReviewRequired: z.literal(true),
  })
  .strict();

export const AISessionDataSchema = z
  .object({
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();

export interface AITaskOutputMap {
  chat: z.infer<typeof ChatOutputSchema>;
  "catalog-description": z.infer<typeof CatalogDescriptionOutputSchema>;
  slos: z.infer<typeof SLOOutputSchema>;
  "content-outline": z.infer<typeof ContentOutlineOutputSchema>;
  "top-code": z.infer<typeof TopCodeOutputSchema>;
  "program-narrative": z.infer<typeof ProgramNarrativeOutputSchema>;
  "compliance-explanation": z.infer<
    typeof ComplianceExplanationOutputSchema
  >;
}

export interface AIOutputIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}

export type AIOutputRejectionReason = "schema" | "domain";

export class AIOutputValidationError extends Error {
  constructor(
    readonly task: AITask | "session",
    readonly reason: AIOutputRejectionReason,
    readonly issues: readonly AIOutputIssue[],
    readonly model: string | null = null,
    readonly requestId: string | null = null,
  ) {
    super(
      "The AI response did not pass Calricula’s browser-side format and safety checks.",
    );
    this.name = "AIOutputValidationError";
  }
}

const taskSchemas: {
  [Task in AITask]: z.ZodType<AITaskOutputMap[Task]>;
} = {
  chat: ChatOutputSchema,
  "catalog-description": CatalogDescriptionOutputSchema,
  slos: SLOOutputSchema,
  "content-outline": ContentOutlineOutputSchema,
  "top-code": TopCodeOutputSchema,
  "program-narrative": ProgramNarrativeOutputSchema,
  "compliance-explanation": ComplianceExplanationOutputSchema,
};

function issuesFromZod(error: z.ZodError): AIOutputIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment),
    ),
    code: issue.code,
    message: issue.message,
  }));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function expectedContactHours(input: unknown): number | null {
  const value = record(input);
  if (!value) return null;
  for (const key of ["contactHours", "totalContactHours"]) {
    const candidate = value[key];
    if (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }
  }
  return null;
}

function currentSloNumbers(input: unknown): Set<number> | null {
  const context = record(record(input)?.context);
  const slos = context?.slos;
  if (!Array.isArray(slos)) return null;
  const values = slos.flatMap((item, index) => {
    const sequence = record(item)?.sequence;
    return typeof sequence === "number" && Number.isInteger(sequence)
      ? [sequence]
      : [index + 1];
  });
  return new Set(values);
}

function domainIssues<Task extends AITask>(
  task: Task,
  output: AITaskOutputMap[Task],
  input: unknown,
): AIOutputIssue[] {
  const issues: AIOutputIssue[] = [];

  if (task === "content-outline") {
    const outline = output as AITaskOutputMap["content-outline"];
    const expectedHours = expectedContactHours(input);
    if (expectedHours !== null) {
      const actualHours = outline.topics.reduce(
        (total, topic) => total + topic.contactHours,
        0,
      );
      if (Math.abs(actualHours - expectedHours) > 0.01) {
        issues.push({
          path: ["topics"],
          code: "contact-hours-mismatch",
          message:
            "Generated contact hours no longer match the current course total.",
        });
      }
    }
    const sloNumbers = currentSloNumbers(input);
    if (sloNumbers) {
      outline.topics.forEach((topic, topicIndex) => {
        topic.relatedSloNumbers.forEach((sequence, sequenceIndex) => {
          if (!sloNumbers.has(sequence)) {
            issues.push({
              path: [
                "topics",
                topicIndex,
                "relatedSloNumbers",
                sequenceIndex,
              ],
              code: "unknown-slo",
              message:
                "A related SLO number is not present in the current course draft.",
            });
          }
        });
      });
    }
  }

  if (task === "top-code") {
    const topCodes = output as AITaskOutputMap["top-code"];
    topCodes.suggestions.forEach((suggestion, index) => {
      const title =
        AI_TOP_CODE_CATALOG[
          suggestion.code as keyof typeof AI_TOP_CODE_CATALOG
        ];
      if (!title) {
        issues.push({
          path: ["suggestions", index, "code"],
          code: "unknown-top-code",
          message:
            "A suggested TOP code is outside Calricula’s verified demo catalog.",
        });
      } else if (title !== suggestion.title) {
        issues.push({
          path: ["suggestions", index, "title"],
          code: "top-code-title-mismatch",
          message:
            "A suggested TOP code title does not match the verified demo catalog.",
        });
      }
    });
  }

  if (task === "compliance-explanation") {
    const compliance =
      output as AITaskOutputMap["compliance-explanation"];
    compliance.citations.forEach((citation, index) => {
      const source = AI_COMPLIANCE_SOURCE_PACK[citation.sourceId];
      (
        [
          "sourceTitle",
          "sourceSection",
          "excerpt",
          "url",
          "checksum",
        ] as const
      ).forEach((key) => {
        if (citation[key] !== source[key]) {
          issues.push({
            path: ["citations", index, key],
            code: "source-metadata-mismatch",
            message:
              "Compliance source metadata does not match Calricula’s browser-verified source pack.",
          });
        }
      });
    });
  }

  return issues;
}

export function validateAITaskOutput<Task extends AITask>(
  task: Task,
  value: unknown,
  options: {
    input?: unknown;
    model?: string | null;
    requestId?: string | null;
  } = {},
): AITaskOutputMap[Task] {
  const parsed = taskSchemas[task].safeParse(value);
  if (!parsed.success) {
    throw new AIOutputValidationError(
      task,
      "schema",
      issuesFromZod(parsed.error),
      options.model ?? null,
      options.requestId ?? null,
    );
  }

  const issues = domainIssues(task, parsed.data, options.input);
  if (issues.length) {
    throw new AIOutputValidationError(
      task,
      "domain",
      issues,
      options.model ?? null,
      options.requestId ?? null,
    );
  }
  return parsed.data;
}

export function validateAISessionData(
  value: unknown,
  options: { model?: string | null; requestId?: string | null } = {},
): z.infer<typeof AISessionDataSchema> {
  const parsed = AISessionDataSchema.safeParse(value);
  if (!parsed.success) {
    throw new AIOutputValidationError(
      "session",
      "schema",
      issuesFromZod(parsed.error),
      options.model ?? null,
      options.requestId ?? null,
    );
  }
  return parsed.data;
}

export function getAIComplianceSource(
  sourceId: keyof typeof AI_COMPLIANCE_SOURCE_PACK,
) {
  return AI_COMPLIANCE_SOURCE_PACK[sourceId];
}
