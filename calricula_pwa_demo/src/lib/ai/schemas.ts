import { z } from "zod";

/**
 * The catalogs are not defined here. `shared/ai-catalog.ts` holds the one
 * copy, which the Worker reads too, and it is re-exported below under the
 * names the UI has always imported so no consumer changes.
 */
import {
  AI_COMPLIANCE_SOURCE_IDS,
  AI_COMPLIANCE_SOURCE_PACK,
  AI_TOP_CODE_CATALOG,
} from "../../../shared/ai-catalog";
import { AI_OUTPUT_LIMITS } from "../../../shared/ai-limits";

import type { AITask } from "./types";

export {
  AI_COMPLIANCE_SOURCE_PACK,
  AI_TOP_CODE_CATALOG,
  type ComplianceSourceId,
  type TopCodeValue,
} from "../../../shared/ai-catalog";

const trimmedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const uniqueStrings = (values: readonly string[]) =>
  new Set(values.map((value) => value.toLocaleLowerCase())).size ===
  values.length;

const uniqueNumbers = (values: readonly number[]) =>
  new Set(values).size === values.length;

export const AI_HISTORY_CONTEXT_LIMIT = 10;

const complianceSourceIds = AI_COMPLIANCE_SOURCE_IDS;

export const ChatOutputSchema = z
  .object({ message: trimmedText(AI_OUTPUT_LIMITS.chat.message) })
  .strict();

export const CatalogDescriptionOutputSchema = z
  .object({ description: trimmedText(AI_OUTPUT_LIMITS["catalog-description"].description) })
  .strict();

export const SLOOutputSchema = z
  .object({
    slos: z
      .array(trimmedText(AI_OUTPUT_LIMITS.slos.slo))
      .min(AI_OUTPUT_LIMITS.slos.min)
      .max(AI_OUTPUT_LIMITS.slos.max)
      .refine(uniqueStrings, "Student learning outcomes must be unique."),
  })
  .strict();

export const ContentOutlineTopicSchema = z
  .object({
    sequence: z.number().int().min(1).max(AI_OUTPUT_LIMITS["content-outline"].maxTopics),
    topic: trimmedText(AI_OUTPUT_LIMITS["content-outline"].topic),
    contactHours: z
      .number()
      .finite()
      .positive()
      .max(AI_OUTPUT_LIMITS["content-outline"].contactHours),
    relatedSloNumbers: z
      .array(z.number().int().min(1).max(AI_OUTPUT_LIMITS["content-outline"].maxSloNumber))
      .max(AI_OUTPUT_LIMITS["content-outline"].maxRelatedSlos)
      .refine(uniqueNumbers, "Related SLO numbers must be unique."),
  })
  .strict();

export const ContentOutlineOutputSchema = z
  .object({
    topics: z
      .array(ContentOutlineTopicSchema)
      .min(1)
      .max(AI_OUTPUT_LIMITS["content-outline"].maxTopics)
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
    title: trimmedText(AI_OUTPUT_LIMITS["top-code"].title),
    rationale: trimmedText(AI_OUTPUT_LIMITS["top-code"].rationale),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const TopCodeOutputSchema = z
  .object({
    suggestions: z
      .array(TopCodeSuggestionSchema)
      .min(AI_OUTPUT_LIMITS["top-code"].min)
      .max(AI_OUTPUT_LIMITS["top-code"].max)
      .refine(
        (suggestions) =>
          uniqueStrings(suggestions.map((suggestion) => suggestion.code)),
        "Suggested TOP codes must be unique.",
      ),
  })
  .strict();

export const ProgramNarrativeOutputSchema = z
  .object({
    goalsAndObjectives: trimmedText(AI_OUTPUT_LIMITS["program-narrative"].goalsAndObjectives),
    catalogDescription: trimmedText(AI_OUTPUT_LIMITS["program-narrative"].catalogDescription),
    requirementsJustification: trimmedText(
      AI_OUTPUT_LIMITS["program-narrative"].requirementsJustification,
    ),
    laborMarketAnalysis: z
      .string()
      .trim()
      .max(AI_OUTPUT_LIMITS["program-narrative"].laborMarketAnalysis),
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
    supports: trimmedText(AI_OUTPUT_LIMITS["compliance-explanation"].supports),
  })
  .strict();

export const ComplianceExplanationOutputSchema = z
  .object({
    explanation: trimmedText(AI_OUTPUT_LIMITS["compliance-explanation"].explanation),
    recommendations: z
      .array(trimmedText(AI_OUTPUT_LIMITS["compliance-explanation"].recommendation))
      .min(AI_OUTPUT_LIMITS["compliance-explanation"].min)
      .max(AI_OUTPUT_LIMITS["compliance-explanation"].max),
    citations: z
      .array(ComplianceCitationSchema)
      .min(AI_OUTPUT_LIMITS["compliance-explanation"].min)
      .max(AI_OUTPUT_LIMITS["compliance-explanation"].max),
    humanReviewRequired: z.literal(true),
  })
  .strict();

export const AISessionDataSchema = z
  .object({
    expiresAt: z.iso.datetime().optional(),
    // The Worker reports how many of the five daily attempts are left
    // (`MAX_DAILY_ATTEMPTS`, worker/quota-protocol.ts). Optional so an older
    // deployed Worker that omits it still validates; the bound matches the
    // quota protocol's own invariant.
    remainingDailyAttempts: z.number().int().min(0).max(5).optional(),
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
