import type {
  AddCommentInput,
  Actor,
  AIArtifact,
  AIConversation,
  AIMessage,
  BackupEnvelope,
  CCNStandard,
  Comment,
  Course,
  CourseAggregate,
  CourseContent,
  CourseRequisite,
  CourseStatus,
  CreateCourseInput,
  CreateProgramInput,
  Department,
  Division,
  Notification,
  Program,
  ProgramAggregate,
  ProgramCourseOrderInput,
  ProgramStatus,
  Role,
  StudentLearningOutcome,
  TopCode,
  UpdateCourseInput,
  UpdateProgramInput,
  WorkflowHistory,
} from "@/lib/domain";

export const DATA_SCHEMA_VERSION = 2;
export const DEMO_SEED_VERSION = "2026.07.30.1";

export type SortDirection = "asc" | "desc";

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CourseQuery extends PageRequest {
  search?: string;
  status?: CourseStatus | readonly CourseStatus[];
  departmentId?: string;
  createdBy?: string;
  sortBy?: "updatedAt" | "createdAt" | "title" | "courseCode";
  sortDirection?: SortDirection;
}

export interface ProgramQuery extends PageRequest {
  search?: string;
  status?: Program["status"] | readonly Program["status"][];
  departmentId?: string;
  createdBy?: string;
  sortBy?: "updatedAt" | "createdAt" | "title";
  sortDirection?: SortDirection;
}

export interface NotificationQuery extends PageRequest {
  userId?: string;
  unreadOnly?: boolean;
}

export type StudentLearningOutcomeInput = Omit<
  StudentLearningOutcome,
  "id" | "courseId" | "createdAt" | "updatedAt"
> & { id?: string; clientId?: string };

export type CourseContentInput = Omit<
  CourseContent,
  "id" | "courseId" | "createdAt" | "updatedAt"
> & { id?: string };

export type CourseRequisiteInput = Omit<
  CourseRequisite,
  "id" | "courseId" | "createdAt" | "updatedAt"
> & { id?: string };

export interface TransitionCourseInput {
  targetStatus: CourseStatus;
  comment?: string | null;
  actorId?: string;
}

export interface SetCourseCCNJustificationInput {
  ccnCode: string;
  justification: string;
  evidence: string[];
}

export interface SaveCourseAggregateInput {
  course?: UpdateCourseInput;
  slos?: readonly StudentLearningOutcomeInput[];
  content?: readonly CourseContentInput[];
  requisites?: readonly CourseRequisiteInput[];
  ccnJustification?: SetCourseCCNJustificationInput | null;
}

export interface ReferenceData {
  divisions: Division[];
  departments: Department[];
  topCodes: TopCode[];
  ccnStandards: CCNStandard[];
}

export interface InitializationResult {
  seeded: boolean;
  migrated: boolean;
  schemaVersion: number;
  seedVersion: string;
}

export interface ResetOptions {
  activeActorId?: string;
}

export interface ImportResult {
  recordCount: number;
  schemaVersion: number;
  seedVersion: string;
}

export interface StorageStatus {
  supported: boolean;
  persisted: boolean | null;
  persistenceRequested: boolean;
  usage: number | null;
  quota: number | null;
  usageRatio: number | null;
  warning: "none" | "approaching-quota" | "quota-critical" | "unavailable";
}

export interface DashboardSummary {
  myDrafts: number;
  pendingReview: number;
  recentlyApproved: number;
  unreadNotifications: number;
  coursesByStatus: Array<{ status: CourseStatus; count: number; percentage: number }>;
  recentActivity: WorkflowHistory[];
}

export interface AIConversationQuery {
  actorId?: string;
  entityType?: AIConversation["entityType"];
  entityId?: string | null;
  limit?: number;
}

export interface AIArtifactQuery {
  conversationId?: string;
  entityType?: AIArtifact["entityType"];
  entityId?: string | null;
  limit?: number;
}

export type RepositoryErrorCode =
  | "not-found"
  | "validation"
  | "forbidden"
  | "conflict"
  | "approved-immutable"
  | "circular-requisite"
  | "invalid-transition"
  | "invalid-backup"
  | "unsupported-backup"
  | "storage-unavailable"
  | "quota-exceeded";

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface CurriculumRepository {
  initialize(): Promise<InitializationResult>;
  reset(options?: ResetOptions): Promise<InitializationResult>;
  exportBackup(): Promise<BackupEnvelope>;
  importBackup(value: unknown): Promise<ImportResult>;
  storageStatus(options?: { requestPersistence?: boolean }): Promise<StorageStatus>;

  listCourses(query?: CourseQuery): Promise<PageResult<Course>>;
  getCourse(id: string): Promise<CourseAggregate | null>;
  createCourse(input: CreateCourseInput): Promise<CourseAggregate>;
  deleteCourse(id: string): Promise<void>;
  duplicateCourse(id: string): Promise<CourseAggregate>;
  createNewCourseVersion(id: string): Promise<CourseAggregate>;
  saveCourseAggregate(
    courseId: string,
    input: SaveCourseAggregateInput,
  ): Promise<CourseAggregate>;

  addComment(input: AddCommentInput): Promise<Comment>;
  setCommentResolved(id: string, resolved: boolean): Promise<Comment>;
  transitionCourse(courseId: string, input: TransitionCourseInput): Promise<CourseAggregate>;

  listPrograms(query?: ProgramQuery): Promise<PageResult<Program>>;
  getProgram(id: string): Promise<ProgramAggregate | null>;
  createProgram(input: CreateProgramInput): Promise<ProgramAggregate>;
  updateProgram(id: string, input: UpdateProgramInput): Promise<ProgramAggregate>;
  reorderProgramCourses(
    programId: string,
    order: readonly ProgramCourseOrderInput[],
  ): Promise<ProgramAggregate>;

  listNotifications(query?: NotificationQuery): Promise<PageResult<Notification>>;
  markNotificationRead(id: string, read?: boolean): Promise<Notification>;
  markAllNotificationsRead(userId?: string): Promise<number>;
  getDashboard(actorId?: string): Promise<DashboardSummary>;
  getReferences(): Promise<ReferenceData>;

  listPersonas(): Promise<Actor[]>;
  getActivePersona(): Promise<Actor>;
  setActivePersona(actorId: string): Promise<Actor>;

  listAIConversations(query?: AIConversationQuery): Promise<AIConversation[]>;
  saveAIConversation(value: AIConversation): Promise<AIConversation>;
  appendAIMessage(conversationId: string, value: AIMessage): Promise<AIConversation>;
  saveAIArtifact(value: AIArtifact): Promise<AIArtifact>;

  close(): void;
}

export type {
  Actor,
  AddCommentInput,
  AIArtifact,
  AIConversation,
  AIMessage,
  BackupEnvelope,
  Comment,
  Course,
  CourseAggregate,
  CourseStatus,
  CreateCourseInput,
  CreateProgramInput,
  Notification,
  Program,
  ProgramAggregate,
  ProgramCourseOrderInput,
  ProgramStatus,
  Role,
  UpdateCourseInput,
  UpdateProgramInput,
  WorkflowHistory,
};
