import {
  AIArtifactSchema,
  AIConversationSchema,
  AIMessageSchema,
  BackupEnvelopeSchema,
  CCNJustificationSchema,
  CommentSchema,
  CourseContentSchema,
  CourseRequisiteSchema,
  CourseSchema,
  DEMO_APP_VERSION,
  DEMO_BACKUP_KIND,
  DEMO_SCHEMA_VERSION,
  DemoMetaSchema,
  DomainSnapshotSchema,
  LegacyBackupEnvelopeV1Schema,
  NotificationSchema,
  ProgramCourseSchema,
  ProgramSchema,
  StudentLearningOutcomeSchema,
  WorkflowHistorySchema,
  backupRecordsToSnapshot,
  canonicalDecimal,
  createDemoFixture,
  snapshotToBackupRecords,
  validateReferentialIntegrity,
  type Actor,
  type AIArtifact,
  type AIConversation,
  type AIMessage,
  type BackupEnvelope,
  type Comment,
  type Course,
  type CourseAggregate,
  type CourseRequisite,
  type CourseStatus,
  type CreateCourseInput,
  type CreateProgramInput,
  type DomainSnapshot,
  type Notification,
  type Program,
  type ProgramAggregate,
  type ProgramCourse,
  type ProgramCourseOrderInput,
  type UpdateProgramInput,
} from "@/lib/domain";
import {
  validateCCNNonMatchJustification,
  wouldCreateRequisiteCycle,
} from "@/lib/compliance";

import type {
  AddCommentInput,
  AIConversationQuery,
  CourseQuery,
  CurriculumRepository,
  DashboardSummary,
  ImportResult,
  InitializationResult,
  NotificationQuery,
  PageResult,
  ProgramQuery,
  ReferenceData,
  ResetOptions,
  SaveCourseAggregateInput,
  StorageStatus,
  TransitionCourseInput,
} from "./contracts";
import { DATA_SCHEMA_VERSION, RepositoryError } from "./contracts";
import { CurriculumDatabase } from "./database";
import {
  RepositoryInvalidationBus,
  repositoryInvalidation,
} from "./invalidation";

const COURSE_STATUSES: readonly CourseStatus[] = [
  "Draft",
  "Department Review",
  "Curriculum Committee",
  "Articulation Review",
  "Approved",
];
const LEGAL_COURSE_TRANSITIONS: Readonly<
  Record<CourseStatus, readonly CourseStatus[]>
> = {
  Draft: ["Department Review"],
  "Department Review": ["Curriculum Committee", "Draft"],
  "Curriculum Committee": ["Articulation Review", "Draft"],
  "Articulation Review": ["Approved", "Draft"],
  Approved: [],
};
const DEFAULT_PAGE_SIZE = 25;
const MAX_AI_MESSAGES = 10;
const MAX_AI_CONVERSATIONS_PER_ACTOR = 50;
const MAX_AI_ARTIFACTS_PER_ACTOR = 100;

function page<T>(values: readonly T[], requestedPage = 1, requestedSize = DEFAULT_PAGE_SIZE): PageResult<T> {
  const pageSize = Math.max(1, Math.min(100, Math.trunc(requestedSize)));
  const pageNumber = Math.max(1, Math.trunc(requestedPage));
  const total = values.length;
  return {
    items: values.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    total,
    page: pageNumber,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function sumDecimals(values: readonly string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split(".")[1]?.length ?? 0));
  const factor = 10n ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole) * factor + BigInt(fraction.padEnd(scale, "0") || "0");
  }, 0n);
  const whole = total / factor;
  const fraction = (total % factor).toString().padStart(scale, "0").replace(/0+$/, "");
  return canonicalDecimal(fraction ? `${whole}.${fraction}` : whole.toString());
}

export interface DexieCurriculumRepositoryOptions {
  databaseName?: string;
  now?: () => Date;
  idFactory?: () => string;
  invalidation?: RepositoryInvalidationBus;
}

export class DexieCurriculumRepository implements CurriculumRepository {
  readonly database: CurriculumDatabase;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly invalidation: RepositoryInvalidationBus;
  private initializePromise: Promise<InitializationResult> | null = null;
  private fallbackLock: Promise<void> = Promise.resolve();

  constructor(options: DexieCurriculumRepositoryOptions = {}) {
    this.database = new CurriculumDatabase(options.databaseName);
    this.now = options.now ?? (() => new Date());
    this.idFactory =
      options.idFactory ??
      (() => {
        if (!globalThis.crypto?.randomUUID) {
          throw new RepositoryError("storage-unavailable", "Secure UUID generation is unavailable.");
        }
        return globalThis.crypto.randomUUID();
      });
    this.invalidation = options.invalidation ?? repositoryInvalidation;
  }

  initialize(): Promise<InitializationResult> {
    this.initializePromise ??= this.initializeInternal().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  private async initializeInternal(): Promise<InitializationResult> {
    if (typeof indexedDB === "undefined") {
      throw new RepositoryError("storage-unavailable", "IndexedDB is unavailable.");
    }
    await this.database.open();
    return this.withExclusiveLock("initialize", async () => {
      const existing = await this.database.meta.get("demo");
      if (existing) {
        if (existing.schemaVersion > DATA_SCHEMA_VERSION) {
          throw new RepositoryError(
            "unsupported-backup",
            `Local data schema ${existing.schemaVersion} is newer than this app supports.`,
          );
        }
        if (existing.schemaVersion === DATA_SCHEMA_VERSION) {
          return {
            seeded: false,
            migrated: false,
            schemaVersion: existing.schemaVersion,
            seedVersion: existing.seedVersion,
          };
        }
        if (existing.schemaVersion !== 1 || DATA_SCHEMA_VERSION !== 2) {
          throw new RepositoryError(
            "unsupported-backup",
            `Local data schema ${existing.schemaVersion} cannot be migrated by this app.`,
          );
        }
        const migrated = DemoMetaSchema.parse({
          ...existing,
          schemaVersion: DATA_SCHEMA_VERSION,
          appVersion: DEMO_APP_VERSION,
        });
        await this.database.transaction("rw", this.database.meta, async () => {
          const current = await this.database.meta.get("demo");
          if (!current || current.schemaVersion !== existing.schemaVersion) {
            throw new RepositoryError(
              "conflict",
              "Local data changed while the schema migration was running.",
            );
          }
          await this.database.meta.put(migrated);
        });
        this.invalidation.invalidate("initialize");
        return {
          seeded: false,
          migrated: true,
          schemaVersion: migrated.schemaVersion,
          seedVersion: migrated.seedVersion,
        };
      }
      const snapshot = validateReferentialIntegrity(createDemoFixture(this.now()));
      await this.replaceSnapshot(snapshot);
      this.invalidation.invalidate("initialize");
      return {
        seeded: true,
        migrated: false,
        schemaVersion: snapshot.meta.schemaVersion,
        seedVersion: snapshot.meta.seedVersion,
      };
    });
  }

  async reset(options: ResetOptions = {}): Promise<InitializationResult> {
    await this.initialize();
    return this.withExclusiveLock("replace-data", async () => {
      const snapshot = createDemoFixture(this.now());
      if (options.activeActorId) snapshot.meta.activeActorId = options.activeActorId;
      const parsed = validateReferentialIntegrity(snapshot);
      await this.replaceSnapshot(parsed);
      this.invalidation.invalidate("reset");
      return {
        seeded: true,
        migrated: false,
        schemaVersion: parsed.meta.schemaVersion,
        seedVersion: parsed.meta.seedVersion,
      };
    });
  }

  async exportBackup(): Promise<BackupEnvelope> {
    await this.initialize();
    const snapshot = validateReferentialIntegrity(await this.readSnapshot());
    return BackupEnvelopeSchema.parse({
      kind: DEMO_BACKUP_KIND,
      schemaVersion: DEMO_SCHEMA_VERSION,
      seedVersion: snapshot.meta.seedVersion,
      appVersion: DEMO_APP_VERSION,
      exportedAt: this.now().toISOString(),
      records: snapshotToBackupRecords(snapshot),
    });
  }

  async importBackup(value: unknown): Promise<ImportResult> {
    await this.initialize();
    let decoded: unknown;
    try {
      decoded = typeof value === "string" ? JSON.parse(value) : value;
    } catch (error) {
      throw new RepositoryError(
        "invalid-backup",
        "This file is not a valid Calricula demo backup.",
        error,
      );
    }
    const decodedSchemaVersion =
      decoded && typeof decoded === "object" && "schemaVersion" in decoded
        ? (decoded as { schemaVersion?: unknown }).schemaVersion
        : undefined;
    if (
      typeof decodedSchemaVersion === "number" &&
      Number.isInteger(decodedSchemaVersion) &&
      decodedSchemaVersion > DATA_SCHEMA_VERSION
    ) {
      throw new RepositoryError(
        "unsupported-backup",
        `Backup schema ${decodedSchemaVersion} is newer than this app supports.`,
      );
    }
    let records: DomainSnapshot;
    let seedVersion: string;
    try {
      if (decodedSchemaVersion === 1) {
        const legacy = LegacyBackupEnvelopeV1Schema.parse(decoded);
        const legacyRecords = validateReferentialIntegrity(legacy.records);
        records = validateReferentialIntegrity({
          ...legacyRecords,
          meta: DemoMetaSchema.parse({
            ...legacyRecords.meta,
            schemaVersion: DATA_SCHEMA_VERSION,
            appVersion: DEMO_APP_VERSION,
          }),
        });
        seedVersion = legacy.seedVersion;
      } else {
        const envelope = BackupEnvelopeSchema.parse(decoded);
        if (envelope.schemaVersion !== DATA_SCHEMA_VERSION) {
          throw new Error(`Unsupported backup schema ${envelope.schemaVersion}.`);
        }
        records = validateReferentialIntegrity(
          backupRecordsToSnapshot(envelope.records),
        );
        seedVersion = envelope.seedVersion;
      }
      if (
        records.meta.schemaVersion !== DATA_SCHEMA_VERSION ||
        records.meta.seedVersion !== seedVersion
      ) {
        throw new Error("Backup metadata does not match its envelope.");
      }
    } catch (error) {
      throw new RepositoryError(
        "invalid-backup",
        "This file is not a valid Calricula demo backup.",
        error,
      );
    }
    return this.withExclusiveLock("replace-data", async () => {
      await this.replaceSnapshot(records);
      this.invalidation.invalidate("import");
      return {
        recordCount: this.snapshotRecordCount(records),
        schemaVersion: records.meta.schemaVersion,
        seedVersion,
      };
    });
  }

  async storageStatus(options: { requestPersistence?: boolean } = {}): Promise<StorageStatus> {
    const supported = typeof indexedDB !== "undefined";
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    let persistenceRequested = false;
    let persisted: boolean | null = null;
    let usage: number | null = null;
    let quota: number | null = null;
    try {
      if (storage) {
        persisted =
          typeof storage.persisted === "function" ? await storage.persisted() : null;
        if (
          options.requestPersistence &&
          !persisted &&
          typeof storage.persist === "function"
        ) {
          persistenceRequested = true;
          persisted = await storage.persist();
        }
        const estimate = await storage.estimate();
        usage = estimate.usage ?? null;
        quota = estimate.quota ?? null;
      }
    } catch {
      persisted = null;
    }
    const usageRatio = usage !== null && quota ? usage / quota : null;
    return {
      supported,
      persisted,
      persistenceRequested,
      usage,
      quota,
      usageRatio,
      warning: !supported
        ? "unavailable"
        : usageRatio !== null && usageRatio >= 0.9
          ? "quota-critical"
          : usageRatio !== null && usageRatio >= 0.75
            ? "approaching-quota"
            : "none",
    };
  }

  async listCourses(query: CourseQuery = {}): Promise<PageResult<Course>> {
    await this.initialize();
    let values = await this.database.courses.toArray();
    const statuses = query.status
      ? new Set(Array.isArray(query.status) ? query.status : [query.status])
      : null;
    const search = query.search?.trim().toLocaleLowerCase();
    values = values.filter(
      (course) =>
        (!statuses || statuses.has(course.status)) &&
        (!query.departmentId || course.departmentId === query.departmentId) &&
        (!query.createdBy || course.createdBy === query.createdBy) &&
        (!search ||
          `${course.subjectCode} ${course.courseNumber} ${course.title}`
            .toLocaleLowerCase()
            .includes(search)),
    );
    const direction = query.sortDirection === "asc" ? 1 : -1;
    values.sort((left, right) => {
      if (query.sortBy === "title") return direction * left.title.localeCompare(right.title);
      if (query.sortBy === "courseCode") {
        return (
          direction *
          `${left.subjectCode} ${left.courseNumber}`.localeCompare(
            `${right.subjectCode} ${right.courseNumber}`,
            undefined,
            { numeric: true },
          )
        );
      }
      const field = query.sortBy === "createdAt" ? "createdAt" : "updatedAt";
      return direction * left[field].localeCompare(right[field]);
    });
    return page(values, query.page, query.pageSize);
  }

  async getCourse(id: string): Promise<CourseAggregate | null> {
    await this.initialize();
    return this.getCourseAggregateUnsafe(id);
  }

  async createCourse(input: CreateCourseInput): Promise<CourseAggregate> {
    return this.mutate(async () =>
      this.database.transaction("rw", [
        this.database.courses,
        this.database.departments,
        this.database.topCodes,
        this.database.ccnStandards,
        this.database.meta,
        this.database.actors,
      ], async () => {
        if (!(await this.database.departments.get(input.departmentId))) {
          throw new RepositoryError("validation", "The selected department does not exist.");
        }
        await this.assertCourseIdentifierAvailable(
          input.subjectCode,
          input.courseNumber,
          input.departmentId,
        );
        const actor = await this.getActivePersonaUnsafe();
        const timestamp = this.now().toISOString();
        const id = this.idFactory();
        const { topCode, cbCodes } = await this.resolveCourseClassification(
          null,
          input,
        );
        const ccnCode = await this.resolveCCNCode(input.ccnCode);
        const course = CourseSchema.parse({
          catalogDescription: null,
          units: "3",
          minimumUnits: null,
          maximumUnits: null,
          lectureHours: "54",
          labHours: "0",
          activityHours: "0",
          tbaHours: "0",
          outsideOfClassHours: "108",
          totalStudentLearningHours: "162",
          effectiveTerm: null,
          cId: null,
          transferability: {},
          geApplicability: {},
          lmiData: null,
          ...input,
          topCode,
          ccnCode,
          cbCodes,
          id,
          lineageId: id,
          subjectCode: input.subjectCode.trim().toUpperCase(),
          courseNumber: input.courseNumber.trim().toUpperCase(),
          status: "Draft",
          version: 1,
          createdBy: actor.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          approvedAt: null,
        });
        await this.database.courses.add(course);
        return {
          course,
          slos: [],
          content: [],
          requisites: [],
          comments: [],
          history: [],
          ccnJustification: null,
        };
      }),
    );
  }

  async deleteCourse(id: string): Promise<void> {
    await this.mutate(async () =>
      this.database.transaction("rw", this.database.tables, async () => {
        const course = await this.requireCourse(id);
        this.assertCourseMutable(course);
        const affectedPrograms = new Set(
          (await this.database.programCourses.toArray())
            .filter((item) => item.courseId === id)
            .map((item) => item.programId),
        );
        await this.database.courses.delete(id);
        await this.deleteCourseDependents(id);
        for (const programId of affectedPrograms) await this.recalculateProgramUnits(programId);
      }),
    );
  }

  duplicateCourse(id: string): Promise<CourseAggregate> {
    return this.copyCourse(id, false);
  }

  createNewCourseVersion(id: string): Promise<CourseAggregate> {
    return this.copyCourse(id, true);
  }

  async saveCourseAggregate(
    courseId: string,
    input: SaveCourseAggregateInput,
  ): Promise<CourseAggregate> {
    return this.mutate(async () =>
      this.database.transaction("rw", this.database.tables, async () => {
        const current = await this.requireCourse(courseId);
        this.assertCourseMutable(current);
        const timestamp = this.now().toISOString();
        let course = current;
        if (input.course) {
          const departmentId = input.course.departmentId ?? current.departmentId;
          if (!(await this.database.departments.get(departmentId))) {
            throw new RepositoryError("validation", "The selected department does not exist.");
          }
          await this.assertCourseIdentifierAvailable(
            input.course.subjectCode ?? current.subjectCode,
            input.course.courseNumber ?? current.courseNumber,
            departmentId,
            current.id,
            current.lineageId,
          );
          const { topCode, cbCodes } = await this.resolveCourseClassification(
            current,
            input.course,
          );
          const ccnCode =
            input.course.ccnCode === undefined
              ? current.ccnCode
              : await this.resolveCCNCode(input.course.ccnCode);
          if (ccnCode && input.ccnJustification) {
            throw new RepositoryError(
              "validation",
              "A course cannot adopt a CCN code and retain a non-match justification.",
            );
          }
          course = CourseSchema.parse({
            ...current,
            ...input.course,
            topCode,
            ccnCode,
            cbCodes,
            id: current.id,
            lineageId: current.lineageId,
            subjectCode: (input.course.subjectCode ?? current.subjectCode).trim().toUpperCase(),
            courseNumber: (input.course.courseNumber ?? current.courseNumber)
              .trim()
              .toUpperCase(),
            status: current.status,
            version: current.version,
            createdBy: current.createdBy,
            createdAt: current.createdAt,
            updatedAt: timestamp,
            approvedAt: current.approvedAt,
          });
          await this.database.courses.put(course);
          if (course.ccnCode) {
            await this.database.ccnJustifications
              .where("courseId")
              .equals(courseId)
              .delete();
          }
        }

        const sloIdMap = new Map<string, string>();
        if (input.slos) {
          const existing = new Map(
            (await this.database.slos.where("courseId").equals(courseId).toArray()).map((item) => [
              item.id,
              item,
            ]),
          );
          const replacements = input.slos.map((value, index) => {
            const previous = value.id ? existing.get(value.id) : undefined;
            const id = previous?.id ?? this.idFactory();
            if (value.id) sloIdMap.set(value.id, id);
            if (value.clientId) sloIdMap.set(value.clientId, id);
            return StudentLearningOutcomeSchema.parse({
              ...value,
              id,
              courseId,
              sequence: index + 1,
              createdAt: previous?.createdAt ?? timestamp,
              updatedAt: timestamp,
            });
          });
          await this.database.slos.where("courseId").equals(courseId).delete();
          if (replacements.length) await this.database.slos.bulkPut(replacements);
        }

        if (input.content) {
          const validSloIds = new Set(
            (await this.database.slos.where("courseId").equals(courseId).primaryKeys()).map(String),
          );
          const existing = new Map(
            (await this.database.content.where("courseId").equals(courseId).toArray()).map(
              (item) => [item.id, item],
            ),
          );
          const replacements = input.content.map((value, index) => {
            const linkedSloIds = value.linkedSloIds.map(
              (sloId) => sloIdMap.get(sloId) ?? sloId,
            );
            if (linkedSloIds.some((sloId) => !validSloIds.has(sloId))) {
              throw new RepositoryError(
                "validation",
                "Course content can only link outcomes from the same course.",
              );
            }
            const previous = value.id ? existing.get(value.id) : undefined;
            return CourseContentSchema.parse({
              ...value,
              linkedSloIds,
              id: previous?.id ?? this.idFactory(),
              courseId,
              sequence: index + 1,
              createdAt: previous?.createdAt ?? timestamp,
              updatedAt: timestamp,
            });
          });
          await this.database.content.where("courseId").equals(courseId).delete();
          if (replacements.length) await this.database.content.bulkPut(replacements);
        } else if (input.slos) {
          const validSloIds = new Set(
            (await this.database.slos.where("courseId").equals(courseId).primaryKeys()).map(String),
          );
          const content = await this.database.content.where("courseId").equals(courseId).toArray();
          await this.database.content.bulkPut(
            content.map((item) => ({
              ...item,
              linkedSloIds: item.linkedSloIds.filter((sloId) => validSloIds.has(sloId)),
              updatedAt: timestamp,
            })),
          );
        }

        if (input.requisites) {
          const existing = new Map(
            (await this.database.requisites.where("courseId").equals(courseId).toArray()).map(
              (item) => [item.id, item],
            ),
          );
          const graph = (await this.database.requisites.toArray())
            .filter((item) => item.courseId !== courseId && item.requisiteCourseId)
            .map((item) => ({
              courseId: item.courseId,
              requisiteCourseId: item.requisiteCourseId as string,
            }));
          const replacements: CourseRequisite[] = [];
          for (const value of input.requisites) {
            if (
              value.requisiteCourseId &&
              !(await this.database.courses.get(value.requisiteCourseId))
            ) {
              throw new RepositoryError("validation", "The requisite course does not exist.");
            }
            if (
              value.requisiteCourseId &&
              wouldCreateRequisiteCycle(courseId, value.requisiteCourseId, graph)
            ) {
              throw new RepositoryError(
                "circular-requisite",
                "This requisite would create a circular dependency.",
              );
            }
            if (value.requisiteCourseId) {
              graph.push({ courseId, requisiteCourseId: value.requisiteCourseId });
            }
            const previous = value.id ? existing.get(value.id) : undefined;
            replacements.push(
              CourseRequisiteSchema.parse({
                ...value,
                id: previous?.id ?? this.idFactory(),
                courseId,
                createdAt: previous?.createdAt ?? timestamp,
                updatedAt: timestamp,
              }),
            );
          }
          await this.database.requisites.where("courseId").equals(courseId).delete();
          if (replacements.length) await this.database.requisites.bulkPut(replacements);
        }

        if (input.ccnJustification !== undefined) {
          const existing = await this.database.ccnJustifications
            .where("courseId")
            .equals(courseId)
            .first();
          if (input.ccnJustification === null) {
            if (existing) await this.database.ccnJustifications.delete(existing.id);
          } else {
            const ccnCode = await this.resolveCCNCode(
              input.ccnJustification.ccnCode,
            );
            if (!ccnCode) {
              throw new RepositoryError(
                "validation",
                "The selected CCN standard does not exist.",
              );
            }
            const justificationInput = {
              ...input.ccnJustification,
              ccnCode,
            };
            const validation = validateCCNNonMatchJustification(
              justificationInput,
              { courseCcnCode: course.ccnCode },
            );
            if (!validation.valid) {
              throw new RepositoryError(
                "validation",
                validation.errors.join(" "),
                validation.errors,
              );
            }
            const actor = await this.getActivePersonaUnsafe();
            await this.database.ccnJustifications.put(
              CCNJustificationSchema.parse({
                id: existing?.id ?? this.idFactory(),
                courseId,
                ccnCode,
                justification: input.ccnJustification.justification.trim(),
                evidence: input.ccnJustification.evidence
                  .map((item) => item.trim())
                  .filter(Boolean),
                createdBy: existing?.createdBy ?? actor.id,
                createdAt: existing?.createdAt ?? timestamp,
                updatedAt: timestamp,
              }),
            );
          }
        }
        if (!input.course) await this.touchCourse(course, timestamp);
        return this.requireCourseAggregateUnsafe(courseId);
      }),
    );
  }

  async addComment(input: AddCommentInput): Promise<Comment> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        [
          this.database.comments,
          this.database.notifications,
          this.database.courses,
          this.database.programs,
          this.database.meta,
          this.database.actors,
        ],
        async () => {
          const entity =
            input.entityType === "Course"
              ? await this.database.courses.get(input.entityId)
              : await this.database.programs.get(input.entityId);
          if (!entity) throw new RepositoryError("not-found", "The commented record does not exist.");
          const actor = await this.getActivePersonaUnsafe();
          const timestamp = this.now().toISOString();
          const comment = CommentSchema.parse({
            id: this.idFactory(),
            ...input,
            section: input.section ?? null,
            authorId: actor.id,
            resolved: false,
            resolvedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          await this.database.comments.add(comment);
          if (entity.createdBy !== actor.id) {
            await this.database.notifications.add(
              NotificationSchema.parse({
                id: this.idFactory(),
                actorId: entity.createdBy,
                type: "comment",
                title: "New review comment",
                message: `${actor.fullName} commented on ${"title" in entity ? entity.title : "a record"}.`,
                entityType: input.entityType,
                entityId: input.entityId,
                readAt: null,
                createdAt: timestamp,
              }),
            );
          }
          return comment;
        },
      ),
    );
  }

  async setCommentResolved(id: string, resolved: boolean): Promise<Comment> {
    return this.mutate(async () =>
      this.database.transaction("rw", this.database.comments, async () => {
        const comment = await this.database.comments.get(id);
        if (!comment) throw new RepositoryError("not-found", "Comment not found.");
        const timestamp = this.now().toISOString();
        const updated = CommentSchema.parse({
          ...comment,
          resolved,
          resolvedAt: resolved ? timestamp : null,
          updatedAt: timestamp,
        });
        await this.database.comments.put(updated);
        return updated;
      }),
    );
  }

  async transitionCourse(
    courseId: string,
    input: TransitionCourseInput,
  ): Promise<CourseAggregate> {
    return this.mutate(async () =>
      this.database.transaction("rw", this.database.tables, async () => {
        const course = await this.requireCourse(courseId);
        this.assertCourseMutable(course);
        const actor = input.actorId
          ? await this.requireActor(input.actorId)
          : await this.getActivePersonaUnsafe();
        const comment = input.comment?.trim() || null;
        if (course.status === input.targetStatus) {
          throw new RepositoryError("invalid-transition", "The course is already in that status.");
        }
        if (!LEGAL_COURSE_TRANSITIONS[course.status].includes(input.targetStatus)) {
          throw new RepositoryError(
            "invalid-transition",
            `${course.status} cannot move directly to ${input.targetStatus}.`,
          );
        }
        const returning = input.targetStatus === "Draft";
        if (returning && !comment) {
          throw new RepositoryError(
            "validation",
            "A reason is required when returning a course to Draft.",
          );
        }
        if (
          !this.canTransition(course, input.targetStatus, actor)
        ) {
          throw new RepositoryError(
            "invalid-transition",
            `${actor.fullName} cannot move ${course.status} to ${input.targetStatus}.`,
          );
        }
        const timestamp = this.now().toISOString();
        const updated = CourseSchema.parse({
          ...course,
          status: input.targetStatus,
          updatedAt: timestamp,
          approvedAt: input.targetStatus === "Approved" ? timestamp : null,
        });
        const history = WorkflowHistorySchema.parse({
          id: this.idFactory(),
          entityType: "Course",
          entityId: course.id,
          fromStatus: course.status,
          toStatus: input.targetStatus,
          comment,
          changedBy: actor.id,
          createdAt: timestamp,
        });
        await this.database.courses.put(updated);
        await this.database.workflowHistory.add(history);
        const recipients = await this.transitionRecipients(updated, actor.id);
        const notificationType =
          input.targetStatus === "Approved"
            ? "approval"
            : input.targetStatus === "Draft"
              ? "return"
              : "submission";
        if (recipients.length) {
          await this.database.notifications.bulkAdd(
            recipients.map((recipient) =>
              NotificationSchema.parse({
                id: this.idFactory(),
                actorId: recipient.id,
                type: notificationType,
                title:
                  input.targetStatus === "Draft"
                    ? "Course returned for revision"
                    : `Course moved to ${input.targetStatus}`,
                message: `${course.subjectCode} ${course.courseNumber}: ${course.title}`,
                entityType: "Course",
                entityId: course.id,
                readAt: null,
                createdAt: timestamp,
              }),
            ),
          );
        }
        return this.requireCourseAggregateUnsafe(courseId);
      }),
    );
  }
  async listPrograms(query: ProgramQuery = {}): Promise<PageResult<Program>> {
    await this.initialize();
    let values = await this.database.programs.toArray();
    const statuses = query.status
      ? new Set(Array.isArray(query.status) ? query.status : [query.status])
      : null;
    const search = query.search?.trim().toLocaleLowerCase();
    values = values.filter(
      (program) =>
        (!statuses || statuses.has(program.status)) &&
        (!query.departmentId || program.departmentId === query.departmentId) &&
        (!query.createdBy || program.createdBy === query.createdBy) &&
        (!search || program.title.toLocaleLowerCase().includes(search)),
    );
    const direction = query.sortDirection === "asc" ? 1 : -1;
    values.sort((left, right) => {
      if (query.sortBy === "title") return direction * left.title.localeCompare(right.title);
      const field = query.sortBy === "createdAt" ? "createdAt" : "updatedAt";
      return direction * left[field].localeCompare(right[field]);
    });
    return page(values, query.page, query.pageSize);
  }

  async getProgram(id: string): Promise<ProgramAggregate | null> {
    await this.initialize();
    return this.getProgramAggregateUnsafe(id);
  }

  async createProgram(input: CreateProgramInput): Promise<ProgramAggregate> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.tables,
        async () => {
          if (!(await this.database.departments.get(input.departmentId))) {
            throw new RepositoryError("validation", "The selected department does not exist.");
          }
          const duplicate = (await this.database.programs.toArray()).some(
            (program) =>
              program.departmentId === input.departmentId &&
              program.title.trim().toLowerCase() === input.title.trim().toLowerCase(),
          );
          if (duplicate) {
            throw new RepositoryError(
              "conflict",
              "A program with this title already exists in the department.",
            );
          }
          const actor = await this.getActivePersonaUnsafe();
          const timestamp = this.now().toISOString();
          const topCode = await this.resolveTopCode(input.topCode);
          const program = ProgramSchema.parse({
            catalogDescription: null,
            cipCode: null,
            programNarrative: null,
            isHighUnitMajor: false,
            ...input,
            topCode,
            id: this.idFactory(),
            totalUnits: "0",
            status: "Draft",
            createdBy: actor.id,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          await this.database.programs.add(program);
          return { program, courses: [], comments: [], history: [] };
        },
      ),
    );
  }

  async updateProgram(id: string, input: UpdateProgramInput): Promise<ProgramAggregate> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.tables,
        async () => {
          const program = await this.requireProgram(id);
          this.assertProgramMutable(program);
          const departmentId = input.departmentId ?? program.departmentId;
          if (!(await this.database.departments.get(departmentId))) {
            throw new RepositoryError("validation", "The selected department does not exist.");
          }
          const title = input.title ?? program.title;
          const topCode =
            input.topCode === undefined
              ? program.topCode
              : await this.resolveTopCode(input.topCode);
          const duplicate = (await this.database.programs.toArray()).some(
            (item) =>
              item.id !== id &&
              item.departmentId === departmentId &&
              item.title.trim().toLowerCase() === title.trim().toLowerCase(),
          );
          if (duplicate) {
            throw new RepositoryError(
              "conflict",
              "A program with this title already exists in the department.",
            );
          }
          const updated = ProgramSchema.parse({
            ...program,
            ...input,
            topCode,
            id: program.id,
            totalUnits: program.totalUnits,
            status: program.status,
            createdBy: program.createdBy,
            createdAt: program.createdAt,
            updatedAt: this.now().toISOString(),
          });
          await this.database.programs.put(updated);
          return this.requireProgramAggregateUnsafe(id);
        },
      ),
    );
  }

  async reorderProgramCourses(
    programId: string,
    order: readonly ProgramCourseOrderInput[],
  ): Promise<ProgramAggregate> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.tables,
        async () => {
          const program = await this.requireProgram(programId);
          this.assertProgramMutable(program);
          const uniqueIds = new Set(order.map(({ courseId }) => courseId));
          if (uniqueIds.size !== order.length) {
            throw new RepositoryError("validation", "A course can appear only once in a program.");
          }
          const existingLinks = new Map(
            (await this.database.programCourses.where("programId").equals(programId).toArray()).map(
              (item) => [item.courseId, item],
            ),
          );
          const links: ProgramCourse[] = [];
          for (let index = 0; index < order.length; index += 1) {
            const item = order[index];
            if (!(await this.database.courses.get(item.courseId))) {
              throw new RepositoryError("validation", "A selected program course does not exist.");
            }
            links.push(
              ProgramCourseSchema.parse({
                ...item,
                id: existingLinks.get(item.courseId)?.id ?? this.idFactory(),
                programId,
                sequence: index + 1,
                unitsApplied: canonicalDecimal(item.unitsApplied),
              }),
            );
          }
          await this.database.programCourses.where("programId").equals(programId).delete();
          if (links.length) await this.database.programCourses.bulkPut(links);
          await this.database.programs.put(
            ProgramSchema.parse({
              ...program,
              totalUnits: sumDecimals(links.map(({ unitsApplied }) => unitsApplied)),
              updatedAt: this.now().toISOString(),
            }),
          );
          return this.requireProgramAggregateUnsafe(programId);
        },
      ),
    );
  }
  async listNotifications(
    query: NotificationQuery = {},
  ): Promise<PageResult<Notification>> {
    await this.initialize();
    const actor = query.userId
      ? await this.requireActor(query.userId)
      : await this.getActivePersonaUnsafe();
    const values = (await this.database.notifications.toArray())
      .filter(
        (item) =>
          item.actorId === actor.id && (!query.unreadOnly || item.readAt === null),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return page(values, query.page, query.pageSize);
  }

  async markNotificationRead(id: string, read = true): Promise<Notification> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.notifications,
        this.database.meta,
        this.database.actors,
        async () => {
          const notification = await this.database.notifications.get(id);
          if (!notification) throw new RepositoryError("not-found", "Notification not found.");
          const actor = await this.getActivePersonaUnsafe();
          if (notification.actorId !== actor.id && actor.role !== "admin") {
            throw new RepositoryError("forbidden", "This notification belongs to another persona.");
          }
          const updated = NotificationSchema.parse({
            ...notification,
            readAt: read ? this.now().toISOString() : null,
          });
          await this.database.notifications.put(updated);
          return updated;
        },
      ),
    );
  }

  async markAllNotificationsRead(userId?: string): Promise<number> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.notifications,
        this.database.meta,
        this.database.actors,
        async () => {
          const actor = await this.getActivePersonaUnsafe();
          const targetId = userId ?? actor.id;
          if (targetId !== actor.id && actor.role !== "admin") {
            throw new RepositoryError("forbidden", "Cannot update another persona's notifications.");
          }
          const unread = (await this.database.notifications.toArray()).filter(
            (item) => item.actorId === targetId && item.readAt === null,
          );
          const timestamp = this.now().toISOString();
          await this.database.notifications.bulkPut(
            unread.map((item) => ({ ...item, readAt: timestamp })),
          );
          return unread.length;
        },
      ),
    );
  }

  async getDashboard(actorId?: string): Promise<DashboardSummary> {
    await this.initialize();
    const actor = actorId ? await this.requireActor(actorId) : await this.getActivePersonaUnsafe();
    const [courses, history, notifications] = await Promise.all([
      this.database.courses.toArray(),
      this.database.workflowHistory.toArray(),
      this.database.notifications.toArray(),
    ]);
    const pendingStatuses =
      actor.role === "chair"
        ? new Set<CourseStatus>(["Department Review", "Curriculum Committee"])
        : actor.role === "articulation"
          ? new Set<CourseStatus>(["Articulation Review"])
          : actor.role === "admin"
            ? new Set<CourseStatus>([
                "Department Review",
                "Curriculum Committee",
                "Articulation Review",
              ])
            : new Set<CourseStatus>();
    return {
      myDrafts: courses.filter(
        (course) => course.status === "Draft" && course.createdBy === actor.id,
      ).length,
      pendingReview: courses.filter((course) => pendingStatuses.has(course.status)).length,
      recentlyApproved: courses.filter((course) => course.status === "Approved").length,
      unreadNotifications: notifications.filter(
        (notification) => notification.actorId === actor.id && notification.readAt === null,
      ).length,
      coursesByStatus: COURSE_STATUSES.map((status) => {
        const count = courses.filter((course) => course.status === status).length;
        return {
          status,
          count,
          percentage: courses.length ? Math.round((count / courses.length) * 1000) / 10 : 0,
        };
      }),
      recentActivity: history
        .filter((item) => item.entityType === "Course")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10),
    };
  }

  async getReferences(): Promise<ReferenceData> {
    await this.initialize();
    const [divisions, departments, topCodes, ccnStandards] = await Promise.all([
      this.database.divisions.toArray(),
      this.database.departments.toArray(),
      this.database.topCodes.orderBy("code").toArray(),
      this.database.ccnStandards.orderBy("ccnCode").toArray(),
    ]);
    divisions.sort((left, right) => left.name.localeCompare(right.name));
    departments.sort((left, right) => left.name.localeCompare(right.name));
    return { divisions, departments, topCodes, ccnStandards };
  }

  async listPersonas(): Promise<Actor[]> {
    await this.initialize();
    return (await this.database.actors.toArray()).sort((left, right) =>
      left.fullName.localeCompare(right.fullName),
    );
  }

  async getActivePersona(): Promise<Actor> {
    await this.initialize();
    return this.getActivePersonaUnsafe();
  }

  async setActivePersona(actorId: string): Promise<Actor> {
    return this.mutate(
      async () =>
        this.database.transaction(
          "rw",
          this.database.meta,
          this.database.actors,
          async () => {
            const actor = await this.requireActor(actorId);
            const meta = await this.database.meta.get("demo");
            if (!meta) throw new RepositoryError("storage-unavailable", "Demo metadata is missing.");
            await this.database.meta.put({ ...meta, activeActorId: actor.id });
            return actor;
          },
        ),
      "persona",
    );
  }
  async listAIConversations(query: AIConversationQuery = {}): Promise<AIConversation[]> {
    await this.initialize();
    const values = (await this.database.aiConversations.toArray())
      .filter(
        (item) =>
          (!query.actorId || item.actorId === query.actorId) &&
          (!query.entityType || item.entityType === query.entityType) &&
          (query.entityId === undefined || item.entityId === query.entityId),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return values.slice(0, Math.max(1, query.limit ?? MAX_AI_CONVERSATIONS_PER_ACTOR));
  }

  async saveAIConversation(value: AIConversation): Promise<AIConversation> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        [
          this.database.aiConversations,
          this.database.aiArtifacts,
          this.database.actors,
          this.database.courses,
          this.database.programs,
        ],
        async () => {
          await this.requireActor(value.actorId);
          await this.assertEntityReference(value.entityType, value.entityId);
          const conversation = AIConversationSchema.parse({
            ...value,
            messages: value.messages.slice(-MAX_AI_MESSAGES),
          });
          await this.database.aiConversations.put(conversation);
          await this.pruneAIConversations(conversation.actorId);
          return conversation;
        },
      ),
    );
  }

  async appendAIMessage(
    conversationId: string,
    value: AIMessage,
  ): Promise<AIConversation> {
    return this.mutate(async () =>
      this.database.transaction("rw", this.database.aiConversations, async () => {
        const conversation = await this.database.aiConversations.get(conversationId);
        if (!conversation) throw new RepositoryError("not-found", "AI conversation not found.");
        const message = AIMessageSchema.parse(value);
        const updated = AIConversationSchema.parse({
          ...conversation,
          messages: [...conversation.messages, message].slice(-MAX_AI_MESSAGES),
          updatedAt: this.now().toISOString(),
        });
        await this.database.aiConversations.put(updated);
        return updated;
      }),
    );
  }

  async saveAIArtifact(value: AIArtifact): Promise<AIArtifact> {
    return this.mutate(async () =>
      this.database.transaction(
        "rw",
        this.database.aiArtifacts,
        this.database.aiConversations,
        this.database.actors,
        this.database.courses,
        this.database.programs,
        async () => {
          await this.requireActor(value.actorId);
          await this.assertEntityReference(value.entityType, value.entityId);
          if (
            value.conversationId &&
            !(await this.database.aiConversations.get(value.conversationId))
          ) {
            throw new RepositoryError("validation", "AI conversation reference does not exist.");
          }
          const artifact = AIArtifactSchema.parse(value);
          await this.database.aiArtifacts.put(artifact);
          await this.pruneAIArtifacts(artifact.actorId);
          return artifact;
        },
      ),
    );
  }

  close(): void {
    this.database.close();
    this.invalidation.close();
  }

  private async mutate<T>(
    operation: () => Promise<T>,
    reason: "mutation" | "persona" = "mutation",
  ): Promise<T> {
    await this.initialize();
    try {
      const result = await operation();
      this.invalidation.invalidate(reason);
      return result;
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
      ) {
        throw new RepositoryError(
          "quota-exceeded",
          "The browser could not save this change because local storage is full.",
          error,
        );
      }
      throw error;
    }
  }

  private async withExclusiveLock<T>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const manager =
      typeof navigator === "undefined" ? undefined : navigator.locks;
    if (manager) {
      return manager.request(
        `calricula:${this.database.name}:${name}`,
        { mode: "exclusive" },
        operation,
      );
    }
    const previous = this.fallbackLock;
    let release: () => void = () => undefined;
    this.fallbackLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async requireActor(id: string): Promise<Actor> {
    const actor = await this.database.actors.get(id);
    if (!actor) throw new RepositoryError("not-found", "Demo persona not found.");
    return actor;
  }

  private async resolveTopCode(value: string | null | undefined): Promise<string | null> {
    const normalized = value?.trim() ?? "";
    if (!normalized) return null;
    const reference = await this.database.topCodes.where("code").equals(normalized).first();
    if (!reference) {
      throw new RepositoryError(
        "validation",
        `TOP code ${normalized} is not available in the local reference set.`,
      );
    }
    return reference.code;
  }

  private async resolveCourseClassification(
    existing: Pick<Course, "topCode" | "cbCodes"> | null,
    input: {
      topCode?: string | null;
      cbCodes?: Record<string, unknown>;
    },
  ): Promise<{ topCode: string | null; cbCodes: Record<string, unknown> }> {
    const topCodeWasProvided = input.topCode !== undefined;
    const cbCodesWereProvided = input.cbCodes !== undefined;
    let topCode = topCodeWasProvided
      ? await this.resolveTopCode(input.topCode)
      : (existing?.topCode ?? null);
    const cbCodes = {
      ...(cbCodesWereProvided ? input.cbCodes : (existing?.cbCodes ?? {})),
    };

    if (
      existing &&
      topCodeWasProvided &&
      !cbCodesWereProvided &&
      Object.hasOwn(existing.cbCodes, "CB03")
    ) {
      if (topCode) cbCodes.CB03 = topCode;
      else delete cbCodes.CB03;
      return { topCode, cbCodes };
    }

    if (!Object.hasOwn(cbCodes, "CB03")) return { topCode, cbCodes };
    const candidate = cbCodes.CB03;
    if (
      candidate === null ||
      (typeof candidate === "string" && candidate.trim() === "")
    ) {
      delete cbCodes.CB03;
      return { topCode, cbCodes };
    }
    if (typeof candidate !== "string") {
      throw new RepositoryError(
        "validation",
        "CB03 must be a TOP code from the local reference set.",
      );
    }
    const cb03 = await this.resolveTopCode(candidate);
    if (!cb03) {
      delete cbCodes.CB03;
      return { topCode, cbCodes };
    }
    if (topCodeWasProvided && topCode !== cb03) {
      throw new RepositoryError(
        "validation",
        `CB03 ${cb03} must match the selected TOP code ${String(topCode)}.`,
      );
    }
    if (topCode && topCode !== cb03) {
      throw new RepositoryError(
        "validation",
        `CB03 ${cb03} must match the course TOP code ${topCode}.`,
      );
    }
    topCode ??= cb03;
    cbCodes.CB03 = cb03;
    return { topCode, cbCodes };
  }

  private async resolveCCNCode(value: string | null | undefined): Promise<string | null> {
    const normalized = value?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
    if (!normalized) return null;
    const standard = await this.database.ccnStandards
      .where("ccnCode")
      .equals(normalized)
      .first();
    if (!standard) {
      throw new RepositoryError(
        "validation",
        `CCN code ${normalized} is not available in the local reference set.`,
      );
    }
    return standard.ccnCode;
  }

  private async getActivePersonaUnsafe(): Promise<Actor> {
    const meta = await this.database.meta.get("demo");
    if (!meta) throw new RepositoryError("storage-unavailable", "Demo metadata is missing.");
    return this.requireActor(meta.activeActorId);
  }

  private async requireCourse(id: string): Promise<Course> {
    const course = await this.database.courses.get(id);
    if (!course) throw new RepositoryError("not-found", "Course not found.");
    return course;
  }

  private async requireProgram(id: string): Promise<Program> {
    const program = await this.database.programs.get(id);
    if (!program) throw new RepositoryError("not-found", "Program not found.");
    return program;
  }

  private assertCourseMutable(course: Course): void {
    if (course.status === "Approved") {
      throw new RepositoryError(
        "approved-immutable",
        "Approved courses are immutable. Create a new version to make changes.",
      );
    }
  }

  private assertProgramMutable(program: Program): void {
    if (program.status === "Approved") {
      throw new RepositoryError(
        "approved-immutable",
        "Approved programs are immutable.",
      );
    }
  }

  private async assertCourseIdentifierAvailable(
    subjectCode: string,
    courseNumber: string,
    departmentId: string,
    excludeId?: string,
    allowedLineageId?: string,
  ): Promise<void> {
    const subject = subjectCode.trim().toUpperCase();
    const number = courseNumber.trim().toUpperCase();
    const duplicate = (await this.database.courses.toArray()).some(
      (course) =>
        course.id !== excludeId &&
        course.lineageId !== allowedLineageId &&
        course.departmentId === departmentId &&
        course.subjectCode.toUpperCase() === subject &&
        course.courseNumber.toUpperCase() === number &&
        course.version === 1,
    );
    if (duplicate) {
      throw new RepositoryError(
        "conflict",
        `${subject} ${number} already exists in this department.`,
      );
    }
  }

  private async getCourseAggregateUnsafe(id: string): Promise<CourseAggregate | null> {
    const course = await this.database.courses.get(id);
    if (!course) return null;
    const [slos, content, requisites, comments, history, ccnJustification] =
      await Promise.all([
        this.database.slos.where("courseId").equals(id).sortBy("sequence"),
        this.database.content.where("courseId").equals(id).sortBy("sequence"),
        this.database.requisites.where("courseId").equals(id).toArray(),
        this.database.comments
          .filter((item) => item.entityType === "Course" && item.entityId === id)
          .sortBy("createdAt"),
        this.database.workflowHistory
          .filter((item) => item.entityType === "Course" && item.entityId === id)
          .sortBy("createdAt"),
        this.database.ccnJustifications.where("courseId").equals(id).first(),
      ]);
    return {
      course,
      slos,
      content,
      requisites,
      comments,
      history,
      ccnJustification: ccnJustification ?? null,
    };
  }

  private async requireCourseAggregateUnsafe(id: string): Promise<CourseAggregate> {
    const aggregate = await this.getCourseAggregateUnsafe(id);
    if (!aggregate) throw new RepositoryError("not-found", "Course not found.");
    return aggregate;
  }

  private async getProgramAggregateUnsafe(id: string): Promise<ProgramAggregate | null> {
    const program = await this.database.programs.get(id);
    if (!program) return null;
    const [links, comments, history] = await Promise.all([
      this.database.programCourses.where("programId").equals(id).sortBy("sequence"),
      this.database.comments
        .filter((item) => item.entityType === "Program" && item.entityId === id)
        .sortBy("createdAt"),
      this.database.workflowHistory
        .filter((item) => item.entityType === "Program" && item.entityId === id)
        .sortBy("createdAt"),
    ]);
    const joined = [];
    for (const link of links) {
      const course = await this.database.courses.get(link.courseId);
      if (!course) {
        throw new RepositoryError(
          "validation",
          `Program ${program.id} contains an unresolved course.`,
        );
      }
      joined.push({ ...link, course });
    }
    return { program, courses: joined, comments, history };
  }

  private async requireProgramAggregateUnsafe(id: string): Promise<ProgramAggregate> {
    const aggregate = await this.getProgramAggregateUnsafe(id);
    if (!aggregate) throw new RepositoryError("not-found", "Program not found.");
    return aggregate;
  }

  private async touchCourse(course: Course, timestamp = this.now().toISOString()): Promise<void> {
    await this.database.courses.put({ ...course, updatedAt: timestamp });
  }

  private async deleteCourseDependents(courseId: string): Promise<void> {
    const conversationIds = new Set(
      (
        await this.database.aiConversations
          .filter((item) => item.entityType === "Course" && item.entityId === courseId)
          .toArray()
      ).map(({ id }) => id),
    );
    await this.database.slos.where("courseId").equals(courseId).delete();
    await this.database.content.where("courseId").equals(courseId).delete();
    await this.database.requisites
      .filter(
        (item) =>
          item.courseId === courseId || item.requisiteCourseId === courseId,
      )
      .delete();
    await this.database.programCourses.where("courseId").equals(courseId).delete();
    await this.database.comments
      .filter((item) => item.entityType === "Course" && item.entityId === courseId)
      .delete();
    await this.database.workflowHistory
      .filter((item) => item.entityType === "Course" && item.entityId === courseId)
      .delete();
    await this.database.notifications
      .filter((item) => item.entityType === "Course" && item.entityId === courseId)
      .delete();
    await this.database.ccnJustifications.where("courseId").equals(courseId).delete();
    await this.database.aiConversations
      .filter((item) => item.entityType === "Course" && item.entityId === courseId)
      .delete();
    await this.database.aiArtifacts
      .filter(
        (item) =>
          (item.entityType === "Course" && item.entityId === courseId) ||
          Boolean(item.conversationId && conversationIds.has(item.conversationId)),
      )
      .delete();
  }

  private async recalculateProgramUnits(programId: string): Promise<void> {
    const program = await this.database.programs.get(programId);
    if (!program) return;
    const links = await this.database.programCourses
      .where("programId")
      .equals(programId)
      .toArray();
    await this.database.programs.put({
      ...program,
      totalUnits: sumDecimals(links.map(({ unitsApplied }) => unitsApplied)),
      updatedAt: this.now().toISOString(),
    });
  }

  private async copyCourse(sourceId: string, newVersion: boolean): Promise<CourseAggregate> {
    return this.mutate(async () =>
      this.database.transaction("rw", this.database.tables, async () => {
        const source = await this.requireCourseAggregateUnsafe(sourceId);
        if (newVersion && source.course.status !== "Approved") {
          throw new RepositoryError(
            "validation",
            "Only an approved course can start a new catalog version.",
          );
        }
        const actor = await this.getActivePersonaUnsafe();
        const timestamp = this.now().toISOString();
        const id = this.idFactory();
        let courseNumber = source.course.courseNumber;
        if (!newVersion) {
          let suffix = 1;
          const existing = await this.database.courses.toArray();
          do {
            const marker = suffix === 1 ? "COPY" : `COPY${suffix}`;
            courseNumber = `${source.course.courseNumber}-${marker}`.slice(0, 16);
            suffix += 1;
          } while (
            existing.some(
              (course) =>
                course.departmentId === source.course.departmentId &&
                course.subjectCode === source.course.subjectCode &&
                course.courseNumber === courseNumber,
            )
          );
        }
        const version = newVersion
          ? Math.max(
              ...(await this.database.courses
                .where("lineageId")
                .equals(source.course.lineageId)
                .toArray()).map(({ version: value }) => value),
            ) + 1
          : 1;
        const { topCode, cbCodes } = await this.resolveCourseClassification(
          null,
          {
            topCode: source.course.topCode,
            cbCodes: source.course.cbCodes,
          },
        );
        const ccnCode = await this.resolveCCNCode(source.course.ccnCode);
        const course = CourseSchema.parse({
          ...source.course,
          topCode,
          ccnCode,
          cbCodes,
          id,
          lineageId: newVersion ? source.course.lineageId : id,
          courseNumber,
          title: newVersion ? source.course.title : `${source.course.title} (Copy)`,
          status: "Draft",
          version,
          createdBy: actor.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          approvedAt: null,
        });
        const sloMap = new Map<string, string>();
        const slos = source.slos.map((item) => {
          const newId = this.idFactory();
          sloMap.set(item.id, newId);
          return StudentLearningOutcomeSchema.parse({
            ...item,
            id: newId,
            courseId: id,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
        const content = source.content.map((item) =>
          CourseContentSchema.parse({
            ...item,
            id: this.idFactory(),
            courseId: id,
            linkedSloIds: item.linkedSloIds
              .map((sloId) => sloMap.get(sloId))
              .filter((sloId): sloId is string => Boolean(sloId)),
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        );
        const requisites = source.requisites.map((item) =>
          CourseRequisiteSchema.parse({
            ...item,
            id: this.idFactory(),
            courseId: id,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        );
        const history = WorkflowHistorySchema.parse({
          id: this.idFactory(),
          entityType: "Course",
          entityId: id,
          fromStatus: newVersion ? source.course.status : null,
          toStatus: "Draft",
          comment: newVersion ? `Created version ${version}.` : "Duplicated course.",
          changedBy: actor.id,
          createdAt: timestamp,
        });
        await this.database.courses.add(course);
        if (slos.length) await this.database.slos.bulkAdd(slos);
        if (content.length) await this.database.content.bulkAdd(content);
        if (requisites.length) await this.database.requisites.bulkAdd(requisites);
        await this.database.workflowHistory.add(history);
        return {
          course,
          slos,
          content,
          requisites,
          comments: [],
          history: [history],
          ccnJustification: null,
        };
      }),
    );
  }

  private canTransition(
    course: Course,
    target: CourseStatus,
    actor: Actor,
  ): boolean {
    if (!LEGAL_COURSE_TRANSITIONS[course.status].includes(target)) return false;
    if (course.status === "Draft") {
      return actor.role === "faculty" || actor.id === course.createdBy;
    }
    if (actor.role === "admin") return true;
    if (
      course.status === "Department Review" ||
      course.status === "Curriculum Committee"
    ) {
      return actor.role === "chair";
    }
    return course.status === "Articulation Review" && actor.role === "articulation";
  }

  private async transitionRecipients(course: Course, actorId: string): Promise<Actor[]> {
    const actors = await this.database.actors.toArray();
    if (course.status === "Department Review" || course.status === "Curriculum Committee") {
      return actors.filter((actor) => actor.role === "chair" && actor.id !== actorId);
    }
    if (course.status === "Articulation Review") {
      return actors.filter((actor) => actor.role === "articulation" && actor.id !== actorId);
    }
    return actors.filter((actor) => actor.id === course.createdBy && actor.id !== actorId);
  }

  private async assertEntityReference(
    entityType: AIConversation["entityType"],
    entityId: string | null,
  ): Promise<void> {
    if ((entityType === null) !== (entityId === null)) {
      throw new RepositoryError(
        "validation",
        "Entity type and entity id must both be set or both be null.",
      );
    }
    if (!entityType || !entityId) return;
    const exists =
      entityType === "Course"
        ? await this.database.courses.get(entityId)
        : await this.database.programs.get(entityId);
    if (!exists) throw new RepositoryError("validation", "The linked entity does not exist.");
  }

  private async pruneAIConversations(actorId: string): Promise<void> {
    const values = (await this.database.aiConversations.where("actorId").equals(actorId).toArray())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const remove = values.slice(MAX_AI_CONVERSATIONS_PER_ACTOR);
    if (!remove.length) return;
    const ids = new Set(remove.map(({ id }) => id));
    await this.database.aiConversations.bulkDelete([...ids]);
    await this.database.aiArtifacts
      .filter((artifact) => Boolean(artifact.conversationId && ids.has(artifact.conversationId)))
      .delete();
  }

  private async pruneAIArtifacts(actorId: string): Promise<void> {
    const values = (await this.database.aiArtifacts.where("actorId").equals(actorId).toArray())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    await this.database.aiArtifacts.bulkDelete(
      values.slice(MAX_AI_ARTIFACTS_PER_ACTOR).map(({ id }) => id),
    );
  }

  private async readSnapshot(): Promise<DomainSnapshot> {
    return this.database.transaction("r", this.database.tables, async () => {
      const meta = await this.database.meta.get("demo");
      if (!meta) throw new RepositoryError("storage-unavailable", "Demo data is uninitialized.");
      return DomainSnapshotSchema.parse({
        meta,
        actors: await this.database.actors.toArray(),
        divisions: await this.database.divisions.toArray(),
        departments: await this.database.departments.toArray(),
        topCodes: await this.database.topCodes.toArray(),
        ccnStandards: await this.database.ccnStandards.toArray(),
        courses: await this.database.courses.toArray(),
        slos: await this.database.slos.toArray(),
        content: await this.database.content.toArray(),
        requisites: await this.database.requisites.toArray(),
        programs: await this.database.programs.toArray(),
        programCourses: await this.database.programCourses.toArray(),
        workflowHistory: await this.database.workflowHistory.toArray(),
        comments: await this.database.comments.toArray(),
        notifications: await this.database.notifications.toArray(),
        ccnJustifications: await this.database.ccnJustifications.toArray(),
        aiConversations: await this.database.aiConversations.toArray(),
        aiArtifacts: await this.database.aiArtifacts.toArray(),
      });
    });
  }

  private async replaceSnapshot(snapshot: DomainSnapshot): Promise<void> {
    await this.database.transaction("rw", this.database.tables, async () => {
      await Promise.all(this.database.tables.map((table) => table.clear()));
      await this.database.meta.put(snapshot.meta);
      await this.database.actors.bulkPut(snapshot.actors);
      await this.database.divisions.bulkPut(snapshot.divisions);
      await this.database.departments.bulkPut(snapshot.departments);
      await this.database.topCodes.bulkPut(snapshot.topCodes);
      await this.database.ccnStandards.bulkPut(snapshot.ccnStandards);
      await this.database.courses.bulkPut(snapshot.courses);
      await this.database.slos.bulkPut(snapshot.slos);
      await this.database.content.bulkPut(snapshot.content);
      await this.database.requisites.bulkPut(snapshot.requisites);
      await this.database.programs.bulkPut(snapshot.programs);
      await this.database.programCourses.bulkPut(snapshot.programCourses);
      await this.database.workflowHistory.bulkPut(snapshot.workflowHistory);
      await this.database.comments.bulkPut(snapshot.comments);
      await this.database.notifications.bulkPut(snapshot.notifications);
      await this.database.ccnJustifications.bulkPut(snapshot.ccnJustifications);
      await this.database.aiConversations.bulkPut(snapshot.aiConversations);
      await this.database.aiArtifacts.bulkPut(snapshot.aiArtifacts);
    });
  }

  private snapshotRecordCount(snapshot: DomainSnapshot): number {
    return Object.values(snapshot).reduce(
      (count, value) => count + (Array.isArray(value) ? value.length : 0),
      0,
    );
  }

}

export const curriculumRepository: CurriculumRepository =
  new DexieCurriculumRepository();
