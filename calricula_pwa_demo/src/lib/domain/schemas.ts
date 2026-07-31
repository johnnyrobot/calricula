import { z } from "zod";

export const DEMO_SCHEMA_VERSION = 2;
export const DEMO_SEED_VERSION = "2026.07.30.1";
export const DEMO_APP_VERSION = "0.1.0";
export const DEMO_BACKUP_KIND = "calricula-local-backup" as const;

export const UuidSchema = z.string().uuid();
export const IsoUtcSchema = z.string().datetime({ offset: true });
export const UnitValueSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Expected a canonical non-negative decimal string");

export function canonicalDecimal(value: string | number): string {
  const numeric = typeof value === "number" ? value.toString() : value.trim();
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(numeric)) {
    throw new Error(`Invalid non-negative decimal value: ${value}`);
  }
  if (!numeric.includes(".")) return numeric;
  const canonical = numeric.replace(/0+$/, "").replace(/\.$/, "");
  return canonical || "0";
}

export const RoleSchema = z.enum(["faculty", "chair", "articulation", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

export const CourseStatusSchema = z.enum([
  "Draft",
  "Department Review",
  "Curriculum Committee",
  "Articulation Review",
  "Approved",
]);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const ProgramStatusSchema = z.enum(["Draft", "Review", "Approved"]);
export type ProgramStatus = z.infer<typeof ProgramStatusSchema>;

export const ProgramTypeSchema = z.enum([
  "AA",
  "AS",
  "AAT",
  "AST",
  "Certificate",
  "ADT",
]);
export type ProgramType = z.infer<typeof ProgramTypeSchema>;

export const RequisiteTypeSchema = z.enum([
  "Prerequisite",
  "Corequisite",
  "Advisory",
]);
export type RequisiteType = z.infer<typeof RequisiteTypeSchema>;

export const RequisiteValidationTypeSchema = z.enum([
  "Content Review",
  "Statutory",
  "Sequential",
  "Health/Safety",
  "Recency",
  "Other",
]);
export type RequisiteValidationType = z.infer<
  typeof RequisiteValidationTypeSchema
>;

export const RequirementTypeSchema = z.enum([
  "Required Core",
  "List A",
  "List B",
  "GE",
]);
export type RequirementType = z.infer<typeof RequirementTypeSchema>;

export const EntityTypeSchema = z.enum(["Course", "Program"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const NotificationTypeSchema = z.enum([
  "submission",
  "approval",
  "return",
  "comment",
  "assignment",
  "system",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const BloomLevelSchema = z.enum([
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
]);
export type BloomLevel = z.infer<typeof BloomLevelSchema>;

export const ActorSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  fullName: z.string().min(1),
  role: RoleSchema,
  departmentId: UuidSchema.nullable(),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type Actor = z.infer<typeof ActorSchema>;

export const DivisionSchema = z.object({
  id: UuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type Division = z.infer<typeof DivisionSchema>;

export const DepartmentSchema = z.object({
  id: UuidSchema,
  divisionId: UuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type Department = z.infer<typeof DepartmentSchema>;

export const TopCodeSchema = z.object({
  id: UuidSchema,
  code: z.string().regex(/^\d{2,4}\.\d{2}$/),
  title: z.string().min(1),
  vocational: z.boolean(),
  parentCode: z.string().nullable(),
});
export type TopCode = z.infer<typeof TopCodeSchema>;

export const CcnCodeSchema = z
  .string()
  .regex(
    /^[A-Z]{2,6} C\d{4}[HLSE]{0,2}$/,
    "Expected an AB 1111 CCN code such as ENGL C1000",
  );

export const CCNStandardSchema = z.object({
  id: UuidSchema,
  ccnCode: CcnCodeSchema,
  discipline: z.string().regex(/^[A-Z]{2,6}$/),
  subjectCode: z.string().regex(/^[A-Z]{2,6}$/),
  courseNumber: z.string().regex(/^C\d{4}[HLSE]{0,2}$/),
  title: z.string().min(1),
  descriptor: z.string().min(1),
  minimumUnits: UnitValueSchema,
  maximumUnits: UnitValueSchema,
  catalogDescription: z.string().nullable(),
  minimumUnitsSource: z.enum(["extracted", "safe-default"]),
  isHonors: z.boolean(),
  isLabOnly: z.boolean(),
  isSupportCourse: z.boolean(),
  hasEmbeddedSupport: z.boolean(),
  impliedCb05: z.literal("A"),
  impliedTopCode: z.string().nullable(),
  sourceFile: z.string().min(1),
  approvedDate: z.string().date().nullable(),
  version: z.number().int().positive(),
  effectiveDate: IsoUtcSchema.nullable(),
});
export type CCNStandard = z.infer<typeof CCNStandardSchema>;

const UnknownRecordSchema = z.record(z.string(), z.unknown());

export const CourseSchema = z.object({
  id: UuidSchema,
  lineageId: UuidSchema,
  subjectCode: z.string().trim().min(1).max(12),
  courseNumber: z.string().trim().min(1).max(16),
  title: z.string().trim().min(1),
  catalogDescription: z.string().nullable(),
  units: UnitValueSchema,
  minimumUnits: UnitValueSchema.nullable(),
  maximumUnits: UnitValueSchema.nullable(),
  lectureHours: UnitValueSchema,
  labHours: UnitValueSchema,
  activityHours: UnitValueSchema,
  tbaHours: UnitValueSchema,
  outsideOfClassHours: UnitValueSchema,
  totalStudentLearningHours: UnitValueSchema,
  topCode: z.string().nullable(),
  status: CourseStatusSchema,
  version: z.number().int().positive(),
  effectiveTerm: z.string().nullable(),
  ccnCode: z.string().nullable(),
  cId: z.string().nullable(),
  cbCodes: UnknownRecordSchema,
  transferability: UnknownRecordSchema,
  geApplicability: UnknownRecordSchema,
  lmiData: UnknownRecordSchema.nullable(),
  departmentId: UuidSchema,
  createdBy: UuidSchema,
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
  approvedAt: IsoUtcSchema.nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const StudentLearningOutcomeSchema = z.object({
  id: UuidSchema,
  courseId: UuidSchema,
  sequence: z.number().int().positive(),
  outcomeText: z.string().trim().min(1),
  bloomLevel: BloomLevelSchema,
  performanceCriteria: z.string().nullable(),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type StudentLearningOutcome = z.infer<
  typeof StudentLearningOutcomeSchema
>;

export const CourseContentSchema = z.object({
  id: UuidSchema,
  courseId: UuidSchema,
  sequence: z.number().int().positive(),
  topic: z.string().trim().min(1),
  subtopics: z.array(z.string()),
  hoursAllocated: UnitValueSchema,
  linkedSloIds: z.array(UuidSchema),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type CourseContent = z.infer<typeof CourseContentSchema>;

export const CourseRequisiteSchema = z
  .object({
    id: UuidSchema,
    courseId: UuidSchema,
    type: RequisiteTypeSchema,
    validationType: RequisiteValidationTypeSchema.nullable(),
    requisiteCourseId: UuidSchema.nullable(),
    requisiteText: z.string().nullable(),
    contentReview: z.string().nullable(),
    createdAt: IsoUtcSchema,
    updatedAt: IsoUtcSchema,
  })
  .refine(
    (value) => Boolean(value.requisiteCourseId || value.requisiteText?.trim()),
    "A requisite must reference a course or provide requisite text",
  );
export type CourseRequisite = z.infer<typeof CourseRequisiteSchema>;

export const ProgramSchema = z.object({
  id: UuidSchema,
  title: z.string().trim().min(1),
  type: ProgramTypeSchema,
  catalogDescription: z.string().nullable(),
  totalUnits: UnitValueSchema,
  status: ProgramStatusSchema,
  topCode: z.string().nullable(),
  cipCode: z.string().nullable(),
  programNarrative: z.string().nullable(),
  isHighUnitMajor: z.boolean(),
  departmentId: UuidSchema,
  createdBy: UuidSchema,
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type Program = z.infer<typeof ProgramSchema>;

export const ProgramCourseSchema = z.object({
  id: UuidSchema,
  programId: UuidSchema,
  courseId: UuidSchema,
  requirementType: RequirementTypeSchema,
  sequence: z.number().int().positive(),
  unitsApplied: UnitValueSchema,
});
export type ProgramCourse = z.infer<typeof ProgramCourseSchema>;

export const ProgramCourseOrderInputSchema = z.object({
  courseId: UuidSchema,
  requirementType: RequirementTypeSchema,
  sequence: z.number().int().positive(),
  unitsApplied: UnitValueSchema,
});
export type ProgramCourseOrderInput = z.infer<
  typeof ProgramCourseOrderInputSchema
>;

export const WorkflowHistorySchema = z.object({
  id: UuidSchema,
  entityType: EntityTypeSchema,
  entityId: UuidSchema,
  fromStatus: z.string().nullable(),
  toStatus: z.string().min(1),
  comment: z.string().nullable(),
  changedBy: UuidSchema,
  createdAt: IsoUtcSchema,
});
export type WorkflowHistory = z.infer<typeof WorkflowHistorySchema>;

export const CommentSchema = z.object({
  id: UuidSchema,
  entityType: EntityTypeSchema,
  entityId: UuidSchema,
  authorId: UuidSchema,
  section: z.string().trim().min(1).nullable(),
  content: z.string().trim().min(1),
  resolved: z.boolean(),
  resolvedAt: IsoUtcSchema.nullable(),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type Comment = z.infer<typeof CommentSchema>;

export const AddCommentInputSchema = CommentSchema.pick({
  entityType: true,
  entityId: true,
  section: true,
  content: true,
});
export type AddCommentInput = z.infer<typeof AddCommentInputSchema>;

export const NotificationSchema = z.object({
  id: UuidSchema,
  actorId: UuidSchema,
  type: NotificationTypeSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  entityType: EntityTypeSchema.nullable(),
  entityId: UuidSchema.nullable(),
  readAt: IsoUtcSchema.nullable(),
  createdAt: IsoUtcSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

export const CCNJustificationSchema = z.object({
  id: UuidSchema,
  courseId: UuidSchema,
  ccnCode: z.string().min(1),
  justification: z.string().trim().min(1),
  evidence: z.array(z.string()),
  createdBy: UuidSchema,
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type CCNJustification = z.infer<typeof CCNJustificationSchema>;

export const AIMessageSchema = z.object({
  id: UuidSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: IsoUtcSchema,
});
export type AIMessage = z.infer<typeof AIMessageSchema>;

export const AIConversationSchema = z.object({
  id: UuidSchema,
  actorId: UuidSchema,
  entityType: EntityTypeSchema.nullable(),
  entityId: UuidSchema.nullable(),
  title: z.string().min(1),
  messages: z.array(AIMessageSchema),
  createdAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema,
});
export type AIConversation = z.infer<typeof AIConversationSchema>;

export const AIArtifactSchema = z.object({
  id: UuidSchema,
  actorId: UuidSchema,
  conversationId: UuidSchema.nullable(),
  entityType: EntityTypeSchema.nullable(),
  entityId: UuidSchema.nullable(),
  task: z.string().min(1),
  content: z.unknown(),
  modelUsed: z.string().nullable(),
  sourceIds: z.array(z.string()),
  createdAt: IsoUtcSchema,
});
export type AIArtifact = z.infer<typeof AIArtifactSchema>;

export const DemoMetaSchema = z.object({
  id: z.literal("demo"),
  schemaVersion: z.number().int().positive(),
  seedVersion: z.string().min(1),
  referenceVersion: z.string().min(1),
  appVersion: z.string().min(1),
  fixtureHash: z.string().min(1),
  initializedAt: IsoUtcSchema,
  lastResetAt: IsoUtcSchema,
  activeActorId: UuidSchema,
});
export type DemoMeta = z.infer<typeof DemoMetaSchema>;

export const DomainSnapshotSchema = z.object({
  meta: DemoMetaSchema,
  actors: z.array(ActorSchema),
  divisions: z.array(DivisionSchema),
  departments: z.array(DepartmentSchema),
  topCodes: z.array(TopCodeSchema),
  ccnStandards: z.array(CCNStandardSchema),
  courses: z.array(CourseSchema),
  slos: z.array(StudentLearningOutcomeSchema),
  content: z.array(CourseContentSchema),
  requisites: z.array(CourseRequisiteSchema),
  programs: z.array(ProgramSchema),
  programCourses: z.array(ProgramCourseSchema),
  workflowHistory: z.array(WorkflowHistorySchema),
  comments: z.array(CommentSchema),
  notifications: z.array(NotificationSchema),
  ccnJustifications: z.array(CCNJustificationSchema),
  aiConversations: z.array(AIConversationSchema),
  aiArtifacts: z.array(AIArtifactSchema),
});
export type DomainSnapshot = z.infer<typeof DomainSnapshotSchema>;

const BACKUP_RECORD_KEYS = [
  "meta",
  "actors",
  "divisions",
  "departments",
  "topCodes",
  "ccnStandards",
  "courses",
  "slos",
  "content",
  "requisites",
  "programs",
  "programCourses",
  "workflowHistory",
  "comments",
  "notifications",
  "ccnJustifications",
  "aiConversations",
  "aiArtifacts",
] as const;

export const BackupRecordsSchema = z.record(z.string(), z.array(z.unknown()));
export type BackupRecords = z.infer<typeof BackupRecordsSchema>;

/**
 * The public backup format deliberately keeps every store as an array. This
 * makes the envelope stable for future migrations and prevents IndexedDB
 * implementation details from leaking into exported files.
 */
export function snapshotToBackupRecords(
  snapshot: DomainSnapshot,
): BackupRecords {
  const parsed = DomainSnapshotSchema.parse(snapshot);
  return {
    meta: [parsed.meta],
    actors: parsed.actors,
    divisions: parsed.divisions,
    departments: parsed.departments,
    topCodes: parsed.topCodes,
    ccnStandards: parsed.ccnStandards,
    courses: parsed.courses,
    slos: parsed.slos,
    content: parsed.content,
    requisites: parsed.requisites,
    programs: parsed.programs,
    programCourses: parsed.programCourses,
    workflowHistory: parsed.workflowHistory,
    comments: parsed.comments,
    notifications: parsed.notifications,
    ccnJustifications: parsed.ccnJustifications,
    aiConversations: parsed.aiConversations,
    aiArtifacts: parsed.aiArtifacts,
  };
}

export function backupRecordsToSnapshot(records: unknown): DomainSnapshot {
  const parsed = BackupRecordsSchema.parse(records);
  const actualKeys = Object.keys(parsed).sort();
  const expectedKeys = [...BACKUP_RECORD_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error("Backup records contain missing or unexpected stores.");
  }
  if (parsed.meta.length !== 1) {
    throw new Error("Backup records must contain exactly one metadata row.");
  }
  return DomainSnapshotSchema.parse({
    meta: parsed.meta[0],
    actors: parsed.actors,
    divisions: parsed.divisions,
    departments: parsed.departments,
    topCodes: parsed.topCodes,
    ccnStandards: parsed.ccnStandards,
    courses: parsed.courses,
    slos: parsed.slos,
    content: parsed.content,
    requisites: parsed.requisites,
    programs: parsed.programs,
    programCourses: parsed.programCourses,
    workflowHistory: parsed.workflowHistory,
    comments: parsed.comments,
    notifications: parsed.notifications,
    ccnJustifications: parsed.ccnJustifications,
    aiConversations: parsed.aiConversations,
    aiArtifacts: parsed.aiArtifacts,
  });
}

export const BackupEnvelopeSchema = z.object({
  kind: z.literal(DEMO_BACKUP_KIND),
  schemaVersion: z.number().int().positive(),
  seedVersion: z.string().min(1),
  appVersion: z.string().min(1),
  exportedAt: IsoUtcSchema,
  records: BackupRecordsSchema,
}).strict();
export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

/**
 * Pre-release schema 1 used a DomainSnapshot directly. It remains readable so
 * a browser that exercised an earlier local build can upgrade without losing
 * its records; all newly exported backups use the array-per-store contract.
 */
export const LegacyBackupEnvelopeV1Schema = z.object({
  kind: z.literal(DEMO_BACKUP_KIND),
  schemaVersion: z.literal(1),
  seedVersion: z.string().min(1),
  appVersion: z.string().min(1),
  exportedAt: IsoUtcSchema,
  records: DomainSnapshotSchema,
}).strict();

export const CreateCourseInputSchema = CourseSchema.omit({
  id: true,
  status: true,
  version: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
})
  .partial()
  .extend({
    subjectCode: CourseSchema.shape.subjectCode,
    courseNumber: CourseSchema.shape.courseNumber,
    title: CourseSchema.shape.title,
    departmentId: CourseSchema.shape.departmentId,
  });
export type CreateCourseInput = z.infer<typeof CreateCourseInputSchema>;

export const UpdateCourseInputSchema = CourseSchema.omit({
  id: true,
  status: true,
  version: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
}).partial();
export type UpdateCourseInput = z.infer<typeof UpdateCourseInputSchema>;

export const CreateProgramInputSchema = ProgramSchema.omit({
  id: true,
  status: true,
  totalUnits: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
})
  .partial()
  .extend({
    title: ProgramSchema.shape.title,
    type: ProgramSchema.shape.type,
    departmentId: ProgramSchema.shape.departmentId,
  });
export type CreateProgramInput = z.infer<typeof CreateProgramInputSchema>;

export const UpdateProgramInputSchema = ProgramSchema.omit({
  id: true,
  status: true,
  totalUnits: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
}).partial();
export type UpdateProgramInput = z.infer<typeof UpdateProgramInputSchema>;

export interface CourseAggregate {
  course: Course;
  slos: StudentLearningOutcome[];
  content: CourseContent[];
  requisites: CourseRequisite[];
  comments: Comment[];
  history: WorkflowHistory[];
  ccnJustification: CCNJustification | null;
}

export interface ProgramAggregate {
  program: Program;
  courses: Array<ProgramCourse & { course: Course }>;
  comments: Comment[];
  history: WorkflowHistory[];
}
