import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEMO_APP_VERSION,
  DEMO_BACKUP_KIND,
  DEMO_SCHEMA_VERSION,
  backupRecordsToSnapshot,
  createDemoFixture,
  type CourseStatus,
  type Role,
} from "@/lib/domain";

import {
  RepositoryError,
  type CourseContentInput,
  type CourseRequisiteInput,
  type SetCourseCCNJustificationInput,
  type StudentLearningOutcomeInput,
  type UpdateCourseInput,
} from "./contracts";
import { RepositoryInvalidationBus } from "./invalidation";
import { DexieCurriculumRepository } from "./repository";

describe("DexieCurriculumRepository", () => {
  let databaseName: string;
  let ids: number;
  let repository: DexieCurriculumRepository;
  // Revisions are the invalidation bus's to report; the repository only bumps
  // them. Tests observe the bus the repository was handed.
  let invalidation: RepositoryInvalidationBus;

  beforeEach(() => {
    databaseName = `calricula-repository-${crypto.randomUUID()}`;
    ids = 1;
    invalidation = new RepositoryInvalidationBus(`${databaseName}-events`);
    repository = new DexieCurriculumRepository({
      databaseName,
      now: () => new Date("2026-07-30T20:00:00.000Z"),
      idFactory: () =>
        `90000000-0000-4000-8000-${String(ids++).padStart(12, "0")}`,
      invalidation,
    });
  });

  afterEach(async () => {
    repository.close();
    await Dexie.delete(databaseName);
  });

  async function createDraft(
    courseNumber: string,
    title = `Test Course ${courseNumber}`,
  ) {
    const references = await repository.getReferences();
    return repository.createCourse({
      subjectCode: "TST",
      courseNumber,
      title,
      departmentId: references.departments[0].id,
    });
  }

  describe("reading every course and program", () => {
    /**
     * `page()` clamps pageSize to 100, so a caller that wants everything and
     * asks for `pageSize: 250` is silently handed 100 rows with no error and
     * no signal that anything was dropped. Two screens do exactly that. The
     * seeded fixture has 22 courses, so nothing shows today — but the demo
     * lets a user create courses, so the truncation is reachable.
     */
    it("truncates a large page request instead of refusing it", async () => {
      const seeded = await repository.listCourses({ pageSize: 250 });
      await Promise.all(
        Array.from({ length: 120 }, (_, index) =>
          createDraft(`${900 + index}`),
        ),
      );

      const asked = await repository.listCourses({ pageSize: 250 });
      expect(seeded.total + 120).toBeGreaterThan(100);
      expect(asked.total).toBe(seeded.total + 120);
      expect(asked.items).toHaveLength(100);
    });

    it("returns every course when asked for all of them", async () => {
      const seeded = await repository.listCourses({ pageSize: 250 });
      await Promise.all(
        Array.from({ length: 120 }, (_, index) =>
          createDraft(`${900 + index}`),
        ),
      );

      const all = await repository.listAllCourses();
      expect(all).toHaveLength(seeded.total + 120);
    });

    it("applies the same filter and sort as the paged read", async () => {
      const all = await repository.listAllCourses({
        sortBy: "courseCode",
        sortDirection: "asc",
      });
      const firstPage = await repository.listCourses({
        pageSize: 100,
        sortBy: "courseCode",
        sortDirection: "asc",
      });
      expect(all.slice(0, firstPage.items.length)).toEqual(firstPage.items);

      const drafts = await repository.listAllCourses({ status: "Draft" });
      expect(drafts.every((course) => course.status === "Draft")).toBe(true);
    });

    it("returns every program when asked for all of them", async () => {
      const paged = await repository.listPrograms({ pageSize: 100 });
      const all = await repository.listAllPrograms();
      expect(all).toHaveLength(paged.total);
    });
  });

  // The repository exposes one write verb for a course and its children.
  // These name the partial saves the suite exercises so each test still reads
  // as the edit it is making.
  const updateCourse = (courseId: string, course: UpdateCourseInput) =>
    repository.saveCourseAggregate(courseId, { course });

  const replaceCourseSLOs = async (
    courseId: string,
    slos: readonly StudentLearningOutcomeInput[],
  ) => (await repository.saveCourseAggregate(courseId, { slos })).slos;

  const replaceCourseContent = async (
    courseId: string,
    content: readonly CourseContentInput[],
  ) => (await repository.saveCourseAggregate(courseId, { content })).content;

  const replaceCourseRequisites = async (
    courseId: string,
    requisites: readonly CourseRequisiteInput[],
  ) => (await repository.saveCourseAggregate(courseId, { requisites })).requisites;

  const setCourseCCNJustification = async (
    courseId: string,
    ccnJustification: SetCourseCCNJustificationInput | null,
  ) =>
    (await repository.saveCourseAggregate(courseId, { ccnJustification }))
      .ccnJustification;

  const db = () => repository.unsafeDatabaseForTests();

  const listCourseComments = async (courseId: string) =>
    (await repository.getCourse(courseId))?.comments ?? [];

  it("seeds the canonical fixture and exposes references without table access", async () => {
    const initialized = await repository.initialize();
    const courses = await repository.listCourses({ pageSize: 100 });
    const programs = await repository.listPrograms({ pageSize: 100 });
    const references = await repository.getReferences();

    expect(initialized.seeded).toBe(true);
    expect(courses.total).toBe(22);
    expect(programs.total).toBe(5);
    expect(references.departments).toHaveLength(17);
    expect(references.ccnStandards).toHaveLength(63);
    expect((await repository.listPersonas()).map(({ role }) => role)).toEqual([
      "admin",
      "articulation",
      "chair",
      "faculty",
    ]);
  });

  it("coalesces concurrent initialization and remains idempotent afterward", async () => {
    const initialized = await Promise.all([
      repository.initialize(),
      repository.initialize(),
      repository.initialize(),
    ]);
    expect(initialized.every(({ seeded }) => seeded)).toBe(true);
    expect(await db().courses.count()).toBe(22);
    expect(await db().meta.count()).toBe(1);

    expect(await repository.initialize()).toMatchObject({
      seeded: false,
      migrated: false,
      schemaVersion: DEMO_SCHEMA_VERSION,
    });
    expect(await db().courses.count()).toBe(22);
  });

  it("migrates local schema 1 metadata to schema 2 transactionally and only once", async () => {
    await repository.initialize();
    const existing = await db().meta.get("demo");
    expect(existing).toBeTruthy();
    const tableCountsBefore = await Promise.all(
      db().tables.map((table) => table.count()),
    );
    await db().meta.put({
      ...existing!,
      schemaVersion: 1,
      appVersion: "0.0.1",
    });

    expect(await repository.initialize()).toMatchObject({
      seeded: false,
      migrated: true,
      schemaVersion: 2,
      seedVersion: existing!.seedVersion,
    });
    expect(await db().meta.get("demo")).toMatchObject({
      schemaVersion: 2,
      appVersion: DEMO_APP_VERSION,
    });
    expect(
      await Promise.all(
        db().tables.map((table) => table.count()),
      ),
    ).toEqual(tableCountsBefore);
    expect(await repository.initialize()).toMatchObject({
      seeded: false,
      migrated: false,
      schemaVersion: 2,
    });
  });

  it("rejects a newer local schema without changing it", async () => {
    await repository.initialize();
    const existing = await db().meta.get("demo");
    await db().meta.put({
      ...existing!,
      schemaVersion: DEMO_SCHEMA_VERSION + 1,
    });

    await expect(repository.initialize()).rejects.toMatchObject({
      code: "unsupported-backup",
    });
    expect((await db().meta.get("demo"))?.schemaVersion).toBe(
      DEMO_SCHEMA_VERSION + 1,
    );
  });

  it("refuses to hand a screen a stored record that no longer matches the schema", async () => {
    await repository.initialize();
    const course = await createDraft("110");
    const program = await repository.createProgram({
      title: "Validation Certificate",
      type: "Certificate",
      departmentId: course.course.departmentId,
    });
    await repository.reorderProgramCourses(program.program.id, [
      {
        courseId: course.course.id,
        requirementType: "Required Core",
        sequence: 1,
        unitsApplied: "3",
      },
    ]);

    // A row written by an older build: units held a number before the schema
    // pinned them to a string.
    const stored = (await db().courses.get(course.course.id))!;
    await db().courses.put({ ...stored, units: 3 as unknown as string });

    await expect(repository.getCourse(course.course.id)).rejects.toMatchObject({
      code: "invalid-backup",
    });
    // The same row reached through the program join is caught there too.
    await expect(repository.getProgram(program.program.id)).rejects.toMatchObject({
      code: "invalid-backup",
    });

    await db().courses.put(stored);
    expect((await repository.getCourse(course.course.id))?.course.units).toBe(
      stored.units,
    );

    // The newest course entry is the one the summary puts first.
    const activity = (await db().workflowHistory.toArray())
      .filter((item) => item.entityType === "Course")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    await db().workflowHistory.put({
      ...activity,
      changedBy: "legacy-actor-key",
    });
    await expect(repository.getDashboard()).rejects.toMatchObject({
      code: "invalid-backup",
    });
  });

  it("persists course children and rejects circular requisites atomically", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const course = await repository.createCourse({
      subjectCode: "TEST",
      courseNumber: "100",
      title: "Repository Test Course",
      departmentId: references.departments[0].id,
    });
    const slos = await replaceCourseSLOs(course.course.id, [
      {
        sequence: 7,
        outcomeText: "Evaluate a curriculum proposal.",
        bloomLevel: "Evaluate",
        performanceCriteria: null,
      },
    ]);
    await replaceCourseContent(course.course.id, [
      {
        sequence: 9,
        topic: "Curriculum review",
        subtopics: ["Evidence"],
        hoursAllocated: "54",
        linkedSloIds: [slos[0].id],
      },
    ]);

    await expect(
      replaceCourseRequisites(course.course.id, [
        {
          type: "Prerequisite",
          validationType: "Sequential",
          requisiteCourseId: course.course.id,
          requisiteText: null,
          contentReview: "Self reference is invalid.",
        },
      ]),
    ).rejects.toMatchObject({ code: "circular-requisite" });

    const reloaded = await repository.getCourse(course.course.id);
    expect(reloaded?.slos).toHaveLength(1);
    expect(reloaded?.content[0].linkedSloIds).toEqual([slos[0].id]);
    expect(reloaded?.requisites).toEqual([]);
  });

  it("executes the role workflow atomically and makes approval immutable", async () => {
    await repository.initialize();
    const personas = await repository.listPersonas();
    const faculty = personas.find(({ role }) => role === "faculty");
    const chair = personas.find(({ role }) => role === "chair");
    const articulation = personas.find(({ role }) => role === "articulation");
    expect(faculty && chair && articulation).toBeTruthy();
    await repository.setActivePersona(faculty!.id);
    const references = await repository.getReferences();
    const created = await repository.createCourse({
      subjectCode: "TEST",
      courseNumber: "200",
      title: "Workflow Course",
      departmentId: references.departments[0].id,
    });
    await repository.transitionCourse(created.course.id, {
      targetStatus: "Department Review",
    });
    await repository.setActivePersona(chair!.id);
    await repository.transitionCourse(created.course.id, {
      targetStatus: "Curriculum Committee",
    });
    await repository.transitionCourse(created.course.id, {
      targetStatus: "Articulation Review",
    });
    await repository.setActivePersona(articulation!.id);
    const approved = await repository.transitionCourse(created.course.id, {
      targetStatus: "Approved",
    });

    expect(approved.course.status).toBe("Approved");
    expect(approved.history).toHaveLength(4);
    await expect(
      updateCourse(created.course.id, { title: "Changed after approval" }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it("enforces every workflow graph edge across every demo role", async () => {
    await repository.initialize();
    const created = await createDraft("201");
    const personas = await repository.listPersonas();
    const statuses: readonly CourseStatus[] = [
      "Draft",
      "Department Review",
      "Curriculum Committee",
      "Articulation Review",
      "Approved",
    ];
    const roles: readonly Role[] = [
      "faculty",
      "chair",
      "articulation",
      "admin",
    ];
    const graph: Readonly<Record<CourseStatus, readonly CourseStatus[]>> = {
      Draft: ["Department Review"],
      "Department Review": ["Curriculum Committee", "Draft"],
      "Curriculum Committee": ["Articulation Review", "Draft"],
      "Articulation Review": ["Approved", "Draft"],
      Approved: [],
    };
    const reviewerRole: Partial<Record<CourseStatus, Role>> = {
      "Department Review": "chair",
      "Curriculum Committee": "chair",
      "Articulation Review": "articulation",
    };

    for (const fromStatus of statuses) {
      for (const targetStatus of statuses) {
        for (const role of roles) {
          const actor = personas.find((candidate) => candidate.role === role)!;
          const baseline = {
            ...created.course,
            status: fromStatus,
            approvedAt:
              fromStatus === "Approved"
                ? "2026-07-30T19:00:00.000Z"
                : null,
            updatedAt: "2026-07-30T19:00:00.000Z",
          };
          await db().courses.put(baseline);
          await db().workflowHistory
            .where("entityId")
            .equals(created.course.id)
            .delete();
          await db().notifications
            .filter(
              (notification) =>
                notification.entityType === "Course" &&
                notification.entityId === created.course.id,
            )
            .delete();

          const graphAllows = graph[fromStatus].includes(targetStatus);
          const roleAllows =
            fromStatus === "Draft"
              ? role === "faculty" || actor.id === baseline.createdBy
              : role === reviewerRole[fromStatus] || role === "admin";
          const shouldSucceed =
            fromStatus !== "Approved" && graphAllows && roleAllows;
          const revisionBefore = invalidation.getRevision();
          const transition = repository.transitionCourse(created.course.id, {
            targetStatus,
            actorId: actor.id,
            comment:
              targetStatus === "Draft"
                ? "Return reason supplied for the workflow matrix."
                : null,
          });

          if (shouldSucceed) {
            const result = await transition;
            expect(result.course.status).toBe(targetStatus);
            expect(result.history).toHaveLength(1);
            expect(result.history[0]).toMatchObject({
              fromStatus,
              toStatus: targetStatus,
              changedBy: actor.id,
            });
            expect(invalidation.getRevision()).toBeGreaterThan(revisionBefore);
          } else {
            await expect(transition).rejects.toMatchObject({
              code:
                fromStatus === "Approved"
                  ? "approved-immutable"
                  : "invalid-transition",
            });
            expect(await db().courses.get(created.course.id)).toEqual(
              baseline,
            );
            expect(
              await db().workflowHistory
                .where("entityId")
                .equals(created.course.id)
                .count(),
            ).toBe(0);
            expect(
              await db().notifications
                .filter(
                  (notification) =>
                    notification.entityType === "Course" &&
                    notification.entityId === created.course.id,
                )
                .count(),
            ).toBe(0);
            expect(invalidation.getRevision()).toBe(revisionBefore);
          }
        }
      }
    }
  });

  it("allows faculty or the record owner to submit and requires reasons for returns", async () => {
    await repository.initialize();
    const personas = await repository.listPersonas();
    const faculty = personas.find(({ role }) => role === "faculty")!;
    const chair = personas.find(({ role }) => role === "chair")!;
    const articulation = personas.find(({ role }) => role === "articulation")!;
    const admin = personas.find(({ role }) => role === "admin")!;

    await repository.setActivePersona(chair.id);
    const chairOwned = await createDraft("202");
    expect(
      (
        await repository.transitionCourse(chairOwned.course.id, {
          targetStatus: "Department Review",
          actorId: chair.id,
        })
      ).course.status,
    ).toBe("Department Review");

    const facultySubmitted = await createDraft("203");
    expect(facultySubmitted.course.createdBy).toBe(chair.id);
    expect(
      (
        await repository.transitionCourse(facultySubmitted.course.id, {
          targetStatus: "Department Review",
          actorId: faculty.id,
        })
      ).course.status,
    ).toBe("Department Review");

    await repository.setActivePersona(articulation.id);
    const articulationOwned = await createDraft("204");
    await repository.transitionCourse(articulationOwned.course.id, {
      targetStatus: "Department Review",
      actorId: articulation.id,
    });
    await expect(
      repository.transitionCourse(articulationOwned.course.id, {
        targetStatus: "Curriculum Committee",
        actorId: articulation.id,
      }),
    ).rejects.toMatchObject({ code: "invalid-transition" });

    await expect(
      repository.transitionCourse(facultySubmitted.course.id, {
        targetStatus: "Draft",
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.transitionCourse(facultySubmitted.course.id, {
        targetStatus: "Draft",
        actorId: admin.id,
        comment: "   ",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    const returned = await repository.transitionCourse(
      facultySubmitted.course.id,
      {
        targetStatus: "Draft",
        actorId: admin.id,
        comment: "The unit-hour calculation needs revision.",
      },
    );
    expect(returned.course.status).toBe("Draft");

    await expect(
      repository.transitionCourse(returned.course.id, {
        targetStatus: "Approved",
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "invalid-transition" });
  });

  it("rolls back course and history writes when a later workflow notification fails", async () => {
    await repository.initialize();
    const course = await createDraft("205");
    const chair = (await repository.listPersonas()).find(
      ({ role }) => role === "chair",
    )!;
    const collidingNotificationId =
      `90000000-0000-4000-8000-${String(ids + 1).padStart(12, "0")}`;
    await db().notifications.add({
      id: collidingNotificationId,
      actorId: chair.id,
      type: "submission",
      title: "Reserved notification ID",
      message: "Forces the later workflow write to fail.",
      entityType: null,
      entityId: null,
      readAt: null,
      createdAt: "2026-07-30T19:00:00.000Z",
    });
    const before = await repository.getCourse(course.course.id);
    const revisionBefore = invalidation.getRevision();

    await expect(
      repository.transitionCourse(course.course.id, {
        targetStatus: "Department Review",
      }),
    ).rejects.toBeTruthy();

    expect(await repository.getCourse(course.course.id)).toEqual(before);
    expect(
      await db().workflowHistory
        .where("entityId")
        .equals(course.course.id)
        .count(),
    ).toBe(0);
    expect(invalidation.getRevision()).toBe(revisionBefore);
  });

  it("round-trips a backup and reset without exporting provider secrets", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const created = await repository.createProgram({
      title: "Temporary Demo Program",
      type: "Certificate",
      departmentId: references.departments[0].id,
    });
    const backup = await repository.exportBackup();
    expect(JSON.stringify(backup.records)).not.toMatch(
      /"key"|api[_-]?key|public[_-]?key|private[_-]?key|sk-or-v1-|authorization|bearer|cookie|session[_-]?token|secret|openrouter|turnstile|service[_-]?worker|serviceWorker|sw\.js|cache[_-]?storage/i,
    );

    await repository.reset();
    expect(await repository.getProgram(created.program.id)).toBeNull();
    await repository.importBackup(backup);
    expect((await repository.getProgram(created.program.id))?.program.title).toBe(
      "Temporary Demo Program",
    );
  });

  it("imports a legacy schema 1 snapshot and exports it in schema 2 format", async () => {
    await repository.initialize();
    const legacySnapshot = createDemoFixture(
      new Date("2026-07-30T20:00:00.000Z"),
    );
    legacySnapshot.meta.schemaVersion = 1;
    legacySnapshot.meta.appVersion = "0.0.1";
    legacySnapshot.courses[0].title = "Legacy browser course";

    const result = await repository.importBackup({
      kind: DEMO_BACKUP_KIND,
      schemaVersion: 1,
      seedVersion: legacySnapshot.meta.seedVersion,
      appVersion: "0.0.1",
      exportedAt: "2026-07-30T20:00:00.000Z",
      records: legacySnapshot,
    });
    expect(result).toMatchObject({
      schemaVersion: 2,
      seedVersion: legacySnapshot.meta.seedVersion,
    });
    expect((await repository.getCourse(legacySnapshot.courses[0].id))?.course.title).toBe(
      "Legacy browser course",
    );

    const current = await repository.exportBackup();
    expect(current.schemaVersion).toBe(2);
    expect(Object.values(current.records).every(Array.isArray)).toBe(true);
    expect(backupRecordsToSnapshot(current.records).meta).toMatchObject({
      schemaVersion: 2,
      appVersion: DEMO_APP_VERSION,
    });
  });

  it("saves a complete course aggregate atomically and rolls back a later failure", async () => {
    await repository.initialize();
    const created = await createDraft("301");
    const saved = await repository.saveCourseAggregate(created.course.id, {
      course: { title: "Atomic Course Save", units: "4" },
      slos: [
        {
          clientId: "temporary-slo",
          sequence: 99,
          outcomeText: "Create an evidence-based curriculum proposal.",
          bloomLevel: "Create",
          performanceCriteria: null,
        },
      ],
      content: [
        {
          sequence: 99,
          topic: "Proposal workshop",
          subtopics: ["Evidence", "Review"],
          hoursAllocated: "72",
          linkedSloIds: ["temporary-slo"],
        },
      ],
      requisites: [
        {
          type: "Advisory",
          validationType: "Other",
          requisiteCourseId: null,
          requisiteText: "Eligibility for college-level composition",
          contentReview: "Students synthesize written evidence.",
        },
      ],
    });
    expect(saved.course.title).toBe("Atomic Course Save");
    expect(saved.content[0].linkedSloIds).toEqual([saved.slos[0].id]);

    await expect(
      repository.saveCourseAggregate(created.course.id, {
        course: { title: "Must Roll Back" },
        content: [
          {
            sequence: 1,
            topic: "Broken link",
            subtopics: [],
            hoursAllocated: "1",
            linkedSloIds: ["00000000-0000-4000-8000-999999999999"],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect((await repository.getCourse(created.course.id))?.course.title).toBe(
      "Atomic Course Save",
    );
  });

  it("filters, sorts, paginates, updates, duplicates, and versions courses", async () => {
    await repository.initialize();
    const created = await createDraft("401", "Zulu Course");
    const updated = await updateCourse(created.course.id, {
      title: "Alpha Course",
      units: "2.5",
    });
    expect(updated.course.units).toBe("2.5");
    const pageResult = await repository.listCourses({
      search: "alpha",
      status: ["Draft"],
      sortBy: "title",
      sortDirection: "asc",
      page: 1,
      pageSize: 1,
    });
    expect(pageResult.items).toHaveLength(1);
    expect(pageResult.pageCount).toBe(1);

    const duplicate = await repository.duplicateCourse(created.course.id);
    expect(duplicate.course.courseNumber).toContain("COPY");
    expect(duplicate.course.lineageId).not.toBe(created.course.lineageId);
    await expect(validateBackup(repository)).resolves.toBeUndefined();
    await expect(repository.createNewCourseVersion(created.course.id)).rejects.toMatchObject({
      code: "validation",
    });
    const approved = (await repository.listCourses({ status: "Approved", pageSize: 100 }))
      .items[0];
    const version = await repository.createNewCourseVersion(approved.id);
    expect(version.course.lineageId).toBe(approved.lineageId);
    expect(version.course.version).toBeGreaterThan(approved.version);
    expect(version.course.topCode).toBe(approved.topCode);
    expect(version.course.ccnCode).toBe(approved.ccnCode);
    await expect(validateBackup(repository)).resolves.toBeUndefined();
    await updateCourse(version.course.id, { title: `${approved.title} revised` });
  });

  it("enforces course conflicts, references, immutability, and deletion cascades", async () => {
    await repository.initialize();
    const first = await createDraft("501");
    await expect(createDraft("501")).rejects.toMatchObject({ code: "conflict" });
    await expect(
      updateCourse(first.course.id, {
        departmentId: "00000000-0000-4000-8000-999999999999",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(repository.getCourse("00000000-0000-4000-8000-999999999999")).resolves.toBeNull();
    await expect(
      repository.deleteCourse(
        (await repository.listCourses({ status: "Approved", pageSize: 100 })).items[0].id,
      ),
    ).rejects.toMatchObject({ code: "approved-immutable" });

    const program = await repository.createProgram({
      title: "Cascade Program",
      type: "Certificate",
      departmentId: first.course.departmentId,
    });
    await repository.reorderProgramCourses(program.program.id, [
      {
        courseId: first.course.id,
        requirementType: "Required Core",
        sequence: 1,
        unitsApplied: "3",
      },
    ]);
    await repository.addComment({
      entityType: "Course",
      entityId: first.course.id,
      section: null,
      content: "This comment should cascade with its draft course.",
    });
    await repository.deleteCourse(first.course.id);
    expect(await repository.getCourse(first.course.id)).toBeNull();
    expect((await repository.getProgram(program.program.id))?.program.totalUnits).toBe("0");
    expect(await listCourseComments(first.course.id)).toEqual([]);
    await expect(validateBackup(repository)).resolves.toBeUndefined();
  });

  it("canonicalizes course TOP, CB03, and CCN references on create and update", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const departmentId = references.departments[0].id;
    const firstTop = references.topCodes[0].code;
    const secondTop = references.topCodes[1].code;
    const standard = references.ccnStandards.find(
      ({ ccnCode }) => ccnCode === "ENGL C1000",
    )!;

    const created = await repository.createCourse({
      subjectCode: "REF",
      courseNumber: "101",
      title: "Canonical references",
      departmentId,
      topCode: ` ${firstTop} `,
      ccnCode: " engl   c1000 ",
      cbCodes: { CB03: ` ${firstTop} `, CB05: "A" },
    });
    expect(created.course).toMatchObject({
      topCode: firstTop,
      ccnCode: standard.ccnCode,
      cbCodes: { CB03: firstTop, CB05: "A" },
    });
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const changedTop = await updateCourse(created.course.id, {
      topCode: secondTop,
    });
    expect(changedTop.course.topCode).toBe(secondTop);
    expect(changedTop.course.cbCodes.CB03).toBe(secondTop);
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const cleared = await updateCourse(created.course.id, {
      topCode: " ",
      ccnCode: " ",
    });
    expect(cleared.course.topCode).toBeNull();
    expect(cleared.course.ccnCode).toBeNull();
    expect(cleared.course.cbCodes).not.toHaveProperty("CB03");
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const inferred = await updateCourse(created.course.id, {
      cbCodes: { ...cleared.course.cbCodes, CB03: firstTop },
    });
    expect(inferred.course.topCode).toBe(firstTop);
    expect(inferred.course.cbCodes.CB03).toBe(firstTop);
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const blank = await repository.createCourse({
      subjectCode: "REF",
      courseNumber: "102",
      title: "Blank references",
      departmentId,
      topCode: " ",
      ccnCode: " ",
      cbCodes: { CB03: " " },
    });
    expect(blank.course.topCode).toBeNull();
    expect(blank.course.ccnCode).toBeNull();
    expect(blank.course.cbCodes).not.toHaveProperty("CB03");
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const beforeRejectedUpdates = await repository.getCourse(created.course.id);
    await expect(
      updateCourse(created.course.id, {
        topCode: firstTop,
        cbCodes: { CB03: secondTop },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateCourse(created.course.id, {
        topCode: "9999.99",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateCourse(created.course.id, {
        ccnCode: "NOPE C9999",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateCourse(created.course.id, {
        cbCodes: { CB03: "9999.99" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await repository.getCourse(created.course.id)).toEqual(
      beforeRejectedUpdates,
    );

    await expect(
      repository.createCourse({
        subjectCode: "REF",
        courseNumber: "103",
        title: "Unknown TOP",
        departmentId,
        topCode: "9999.99",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.createCourse({
        subjectCode: "REF",
        courseNumber: "104",
        title: "Unknown CCN",
        departmentId,
        ccnCode: "NOPE C9999",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.createCourse({
        subjectCode: "REF",
        courseNumber: "105",
        title: "Unknown CB03",
        departmentId,
        cbCodes: { CB03: "9999.99" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("preserves local TOP coding on CCN adoption and rejects unsupported implied coding", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const localTop = references.topCodes.find(
      ({ code }) => code === "1501.00",
    )!;
    const unsupportedImpliedStandard = references.ccnStandards.find(
      ({ ccnCode }) => ccnCode === "COMM C1000",
    )!;
    expect(
      references.topCodes.some(
        ({ code }) => code === unsupportedImpliedStandard.impliedTopCode,
      ),
    ).toBe(false);

    const created = await repository.createCourse({
      subjectCode: "REF",
      courseNumber: "201",
      title: "CCN adoption",
      departmentId: references.departments[0].id,
      topCode: localTop.code,
      cbCodes: { CB03: localTop.code, CB05: "A" },
    });
    await setCourseCCNJustification(created.course.id, {
      ccnCode: unsupportedImpliedStandard.ccnCode,
      justification:
        "The local course intentionally uses a different sequence and instructional scope.",
      evidence: ["Department review"],
    });

    const adopted = await updateCourse(created.course.id, {
      ccnCode: " comm   c1000 ",
    });
    expect(adopted.course.ccnCode).toBe(
      unsupportedImpliedStandard.ccnCode,
    );
    expect(adopted.course.topCode).toBe(localTop.code);
    expect(adopted.course.cbCodes.CB03).toBe(localTop.code);
    expect(adopted.ccnJustification).toBeNull();
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    await expect(
      updateCourse(created.course.id, {
        topCode: unsupportedImpliedStandard.impliedTopCode,
        cbCodes: { CB03: unsupportedImpliedStandard.impliedTopCode },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect((await repository.getCourse(created.course.id))?.course).toMatchObject({
      topCode: localTop.code,
      ccnCode: unsupportedImpliedStandard.ccnCode,
      cbCodes: { CB03: localTop.code },
    });
  });

  it("validates aggregate TOP and CCN changes atomically before backup round-trip", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const firstTop = references.topCodes[0].code;
    const secondTop = references.topCodes[1].code;
    const standard = references.ccnStandards.find(
      ({ ccnCode }) => ccnCode === "ENGL C1000",
    )!;
    const course = await repository.createCourse({
      subjectCode: "REF",
      courseNumber: "301",
      title: "Aggregate references",
      departmentId: references.departments[0].id,
      topCode: firstTop,
      cbCodes: { CB03: firstTop },
    });
    await setCourseCCNJustification(course.course.id, {
      ccnCode: standard.ccnCode,
      justification:
        "The local course intentionally uses a different sequence and instructional scope.",
      evidence: [],
    });

    const saved = await repository.saveCourseAggregate(course.course.id, {
      course: {
        topCode: secondTop,
        ccnCode: standard.ccnCode,
      },
    });
    expect(saved.course).toMatchObject({
      topCode: secondTop,
      ccnCode: standard.ccnCode,
      cbCodes: { CB03: secondTop },
    });
    expect(saved.ccnJustification).toBeNull();
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const before = await repository.getCourse(course.course.id);
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        course: {
          title: "Must roll back with invalid CCN state",
          ccnCode: standard.ccnCode,
        },
        ccnJustification: {
          ccnCode: standard.ccnCode,
          justification:
            "The local course intentionally uses a different sequence and instructional scope.",
          evidence: [],
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        course: {
          topCode: firstTop,
          cbCodes: { CB03: secondTop },
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        course: { ccnCode: "NOPE C9999" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await repository.getCourse(course.course.id)).toEqual(before);
    await expect(validateBackup(repository)).resolves.toBeUndefined();
  });

  it("validates CCN justifications and supports upsert and removal", async () => {
    await repository.initialize();
    const course = await createDraft("601");
    const standard = (await repository.getReferences()).ccnStandards[0];
    await expect(
      setCourseCCNJustification(course.course.id, {
        ccnCode: "NOT A STANDARD",
        justification: "This is a sufficiently long explanation for testing.",
        evidence: [],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setCourseCCNJustification(course.course.id, {
        ccnCode: standard.ccnCode,
        justification: "short",
        evidence: [],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    const justification = await setCourseCCNJustification(course.course.id, {
      ccnCode: standard.ccnCode,
      justification:
        "The local course intentionally uses a different sequence and learning scope.",
      evidence: ["Department review"],
    });
    expect(justification?.ccnCode).toBe(standard.ccnCode);
    expect((await repository.getCourse(course.course.id))?.ccnJustification?.id).toBe(
      justification?.id,
    );
    await expect(validateBackup(repository)).resolves.toBeUndefined();
    expect(await setCourseCCNJustification(course.course.id, null)).toBeNull();
    await expect(validateBackup(repository)).resolves.toBeUndefined();
  });

  it("supports comments and rejects them for entities that do not exist", async () => {
    await repository.initialize();
    const course = await createDraft("701");
    const comment = await repository.addComment({
      entityType: "Course",
      entityId: course.course.id,
      section: "Description",
      content: "Please clarify the expected student audience.",
    });
    expect((await repository.setCommentResolved(comment.id, true)).resolvedAt).toBeTruthy();
    expect((await repository.setCommentResolved(comment.id, false)).resolvedAt).toBeNull();
    expect((await listCourseComments(course.course.id)).map(({ id }) => id)).toEqual([
      comment.id,
    ]);
    await expect(
      repository.addComment({
        entityType: "Course",
        entityId: "00000000-0000-4000-8000-999999999999",
        section: null,
        content: "Missing entity",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("creates, updates, reorders, totals, and deletes programs with validation", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const courses = (await repository.listCourses({ pageSize: 100 })).items.slice(0, 2);
    const program = await repository.createProgram({
      title: "Data Layer Certificate",
      type: "Certificate",
      departmentId: references.departments[0].id,
    });
    await expect(
      repository.createProgram({
        title: "Data Layer Certificate",
        type: "Certificate",
        departmentId: references.departments[0].id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const updated = await repository.updateProgram(program.program.id, {
      title: "Data Layer Certificate II",
      catalogDescription: "A local-first program.",
    });
    expect(updated.program.title).toContain("II");
    const reordered = await repository.reorderProgramCourses(program.program.id, [
      {
        courseId: courses[0].id,
        requirementType: "Required Core",
        sequence: 3,
        unitsApplied: "2.5",
      },
      {
        courseId: courses[1].id,
        requirementType: "List A",
        sequence: 8,
        unitsApplied: "1.25",
      },
    ]);
    expect(reordered.program.totalUnits).toBe("3.75");
    expect(reordered.courses.map(({ sequence }) => sequence)).toEqual([1, 2]);
    await expect(
      repository.reorderProgramCourses(program.program.id, [
        {
          courseId: courses[0].id,
          requirementType: "GE",
          sequence: 1,
          unitsApplied: "1",
        },
        {
          courseId: courses[0].id,
          requirementType: "GE",
          sequence: 2,
          unitsApplied: "1",
        },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("canonicalizes and validates program TOP codes across backup round-trips", async () => {
    await repository.initialize();
    const references = await repository.getReferences();
    const firstTop = references.topCodes[0].code;
    const secondTop = references.topCodes[1].code;
    const created = await repository.createProgram({
      title: "TOP Reference Certificate",
      type: "Certificate",
      departmentId: references.departments[0].id,
      topCode: ` ${firstTop} `,
    });
    expect(created.program.topCode).toBe(firstTop);
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const changed = await repository.updateProgram(created.program.id, {
      topCode: secondTop,
    });
    expect(changed.program.topCode).toBe(secondTop);
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    const cleared = await repository.updateProgram(created.program.id, {
      topCode: " ",
    });
    expect(cleared.program.topCode).toBeNull();
    await expect(validateBackup(repository)).resolves.toBeUndefined();

    await expect(
      repository.updateProgram(created.program.id, { topCode: "9999.99" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect((await repository.getProgram(created.program.id))?.program.topCode).toBeNull();
    await expect(
      repository.createProgram({
        title: "Unknown TOP Certificate",
        type: "Certificate",
        departmentId: references.departments[0].id,
        topCode: "9999.99",
      }),
    ).rejects.toMatchObject({ code: "validation" });

    const blank = await repository.createProgram({
      title: "Blank TOP Certificate",
      type: "Certificate",
      departmentId: references.departments[0].id,
      topCode: " ",
    });
    expect(blank.program.topCode).toBeNull();
    await expect(validateBackup(repository)).resolves.toBeUndefined();
  });

  it("handles notification reads, role dashboards, and persona validation", async () => {
    await repository.initialize();
    const personas = await repository.listPersonas();
    const chair = personas.find(({ role }) => role === "chair")!;
    const faculty = personas.find(({ role }) => role === "faculty")!;
    await repository.setActivePersona(chair.id);
    const notifications = await repository.listNotifications({ unreadOnly: true, pageSize: 100 });
    if (notifications.items[0]) {
      expect((await repository.markNotificationRead(notifications.items[0].id)).readAt).toBeTruthy();
      expect((await repository.markNotificationRead(notifications.items[0].id, false)).readAt).toBeNull();
    }
    expect(await repository.markAllNotificationsRead()).toBeGreaterThanOrEqual(0);
    expect((await repository.getDashboard()).coursesByStatus).toHaveLength(5);
    await repository.setActivePersona(faculty.id);
    await expect(repository.markAllNotificationsRead(chair.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      repository.setActivePersona("00000000-0000-4000-8000-999999999999"),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("persists AI conversations and artifacts and enforces their references", async () => {
    await repository.initialize();
    const actor = await repository.getActivePersona();
    const course = await createDraft("901");
    const conversationId = "91000000-0000-4000-8000-000000000001";
    const conversation = await repository.saveAIConversation({
      id: conversationId,
      actorId: actor.id,
      entityType: "Course",
      entityId: course.course.id,
      title: "Draft assistance",
      messages: [],
      createdAt: "2026-07-30T20:00:00.000Z",
      updatedAt: "2026-07-30T20:00:00.000Z",
    });
    const withMessage = await repository.appendAIMessage(conversation.id, {
      id: "92000000-0000-4000-8000-000000000001",
      role: "user",
      content: "Draft an outcome.",
      createdAt: "2026-07-30T20:00:00.000Z",
    });
    expect(withMessage.messages).toHaveLength(1);
    expect(await repository.listAIConversations({ entityId: course.course.id })).toEqual([
      withMessage,
    ]);
    await expect(
      repository.saveAIConversation({
        ...conversation,
        id: "91000000-0000-4000-8000-000000000002",
        entityId: "00000000-0000-4000-8000-999999999999",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects malformed and newer backups without mutating current records", async () => {
    await repository.initialize();
    const before = (await repository.listCourses({ pageSize: 100 })).total;
    await expect(repository.importBackup("{bad json")).rejects.toMatchObject({
      code: "invalid-backup",
    });
    const backup = await repository.exportBackup();
    expect(Object.values(backup.records).every(Array.isArray)).toBe(true);
    const backupSnapshot = backupRecordsToSnapshot(backup.records);
    await expect(
      repository.importBackup({ ...backup, schemaVersion: 999 }),
    ).rejects.toMatchObject({ code: "unsupported-backup" });
    await expect(
      repository.importBackup({
        ...backup,
        unexpected: "must not be silently stripped",
      }),
    ).rejects.toMatchObject({ code: "invalid-backup" });
    await expect(
      repository.importBackup({
        ...backup,
        records: {
          ...backup.records,
          meta: [
            {
              ...backupSnapshot.meta,
              activeActorId: "00000000-0000-4000-8000-999999999999",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-backup" });
    const missingStore = { ...backup.records };
    delete missingStore.courses;
    await expect(
      repository.importBackup({ ...backup, records: missingStore }),
    ).rejects.toMatchObject({ code: "invalid-backup" });
    expect((await repository.listCourses({ pageSize: 100 })).total).toBe(before);
  });

  it("reopens existing data, resets to a chosen persona, and publishes revisions", async () => {
    const events: number[] = [];
    const unsubscribe = invalidation.subscribe(() => events.push(invalidation.getRevision()));
    await repository.initialize();
    const personas = await repository.listPersonas();
    const admin = personas.find(({ role }) => role === "admin")!;
    const created = await createDraft("A01");
    expect(events.length).toBeGreaterThan(0);
    await repository.reset({ activeActorId: admin.id });
    expect((await repository.getActivePersona()).id).toBe(admin.id);
    expect(await repository.getCourse(created.course.id)).toBeNull();
    unsubscribe();

    repository.close();
    const reopened = new DexieCurriculumRepository({
      databaseName,
      invalidation: new RepositoryInvalidationBus(`${databaseName}-reopened`),
    });
    repository = reopened;
    expect((await reopened.initialize()).seeded).toBe(false);
    expect((await reopened.listCourses({ pageSize: 100 })).total).toBe(22);
  });

  it("reports persistence estimates, quota warnings, and storage API failures", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "storage");
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({ usage: 80, quota: 100 }),
      },
    });
    const approaching = await repository.storageStatus({ requestPersistence: true });
    expect(approaching).toMatchObject({
      persisted: true,
      persistenceRequested: true,
      usageRatio: 0.8,
      warning: "approaching-quota",
    });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn(),
        estimate: vi.fn().mockResolvedValue({ usage: 95, quota: 100 }),
      },
    });
    expect((await repository.storageStatus()).warning).toBe("quota-critical");
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: vi.fn().mockRejectedValue(new Error("denied")),
        estimate: vi.fn(),
      },
    });
    expect(await repository.storageStatus()).toMatchObject({
      persisted: null,
      warning: "none",
    });
    if (original) Object.defineProperty(navigator, "storage", original);
    else Reflect.deleteProperty(navigator, "storage");
  });

  it("covers child replacement validation and pruning", async () => {
    await repository.initialize();
    const course = await createDraft("A02");
    const first = await replaceCourseSLOs(course.course.id, [
      {
        sequence: 1,
        outcomeText: "Analyze evidence.",
        bloomLevel: "Analyze",
        performanceCriteria: null,
      },
    ]);
    await replaceCourseContent(course.course.id, [
      {
        sequence: 1,
        topic: "Evidence",
        subtopics: [],
        hoursAllocated: "3",
        linkedSloIds: [first[0].id],
      },
    ]);
    const updated = await replaceCourseSLOs(course.course.id, [
      {
        ...first[0],
        outcomeText: "Evaluate evidence.",
      },
    ]);
    expect(updated[0].id).toBe(first[0].id);
    expect((await repository.getCourse(course.course.id))?.content[0].linkedSloIds).toEqual([
      first[0].id,
    ]);
    await expect(
      replaceCourseContent(course.course.id, [
        {
          sequence: 1,
          topic: "Invalid",
          subtopics: [],
          hoursAllocated: "1",
          linkedSloIds: ["00000000-0000-4000-8000-999999999999"],
        },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      replaceCourseRequisites(course.course.id, [
        {
          type: "Prerequisite",
          validationType: "Content Review",
          requisiteCourseId: "00000000-0000-4000-8000-999999999999",
          requisiteText: null,
          contentReview: "Missing course.",
        },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
    expect(
      await replaceCourseRequisites(course.course.id, [
        {
          type: "Advisory",
          validationType: "Other",
          requisiteCourseId: null,
          requisiteText: "Recommended preparation",
          contentReview: null,
        },
      ]),
    ).toHaveLength(1);
  });

  it("covers program validation and approved immutability", async () => {
    await repository.initialize();
    const missing = "00000000-0000-4000-8000-999999999999";
    await expect(
      repository.createCourse({
        subjectCode: "BAD",
        courseNumber: "1",
        title: "Missing Department",
        departmentId: missing,
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.createProgram({
        title: "Missing Department",
        type: "Certificate",
        departmentId: missing,
      }),
    ).rejects.toMatchObject({ code: "validation" });
    const references = await repository.getReferences();
    const first = await repository.createProgram({
      title: "Duplicate One",
      type: "AA",
      departmentId: references.departments[0].id,
    });
    const second = await repository.createProgram({
      title: "Duplicate Two",
      type: "AS",
      departmentId: references.departments[0].id,
    });
    await expect(
      repository.updateProgram(second.program.id, { title: first.program.title }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      repository.reorderProgramCourses(first.program.id, [
        {
          courseId: missing,
          requirementType: "GE",
          sequence: 1,
          unitsApplied: "1",
        },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
    const approved = (await repository.listPrograms({ status: "Approved", pageSize: 100 }))
      .items[0];
    if (approved) {
      await expect(repository.updateProgram(approved.id, { title: "No change" })).rejects.toMatchObject({
        code: "approved-immutable",
      });
    }
  });

  it("covers notification ownership and AI validation failures", async () => {
    await repository.initialize();
    const personas = await repository.listPersonas();
    const chair = personas.find(({ role }) => role === "chair")!;
    const faculty = personas.find(({ role }) => role === "faculty")!;
    await repository.setActivePersona(chair.id);
    const notification = (await repository.listNotifications({ pageSize: 100 })).items[0];
    await repository.setActivePersona(faculty.id);
    if (notification) {
      await expect(repository.markNotificationRead(notification.id)).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    await expect(
      repository.markNotificationRead("00000000-0000-4000-8000-999999999999"),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      repository.appendAIMessage("00000000-0000-4000-8000-999999999999", {
        id: "94000000-0000-4000-8000-000000000001",
        role: "user",
        content: "Missing conversation",
        createdAt: "2026-07-30T20:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      repository.saveAIConversation({
        id: "96000000-0000-4000-8000-000000000001",
        actorId: faculty.id,
        entityType: "Course",
        entityId: null,
        title: "Mismatched entity",
        messages: [],
        createdAt: "2026-07-30T20:00:00.000Z",
        updatedAt: "2026-07-30T20:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("covers list filters, sort modes, dashboard roles, and explicit notification users", async () => {
    await repository.initialize();
    const courses = await repository.listCourses();
    const sample = courses.items[0];
    expect(
      (
        await repository.listCourses({
          departmentId: sample.departmentId,
          createdBy: sample.createdBy,
          status: sample.status,
          sortBy: "courseCode",
          sortDirection: "asc",
          pageSize: 100,
        })
      ).items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await repository.listCourses({
          sortBy: "createdAt",
          sortDirection: "asc",
          pageSize: 100,
        })
      ).items,
    ).toHaveLength(22);
    expect(
      (
        await repository.listCourses({
          sortBy: "title",
          sortDirection: "asc",
          pageSize: 100,
        })
      ).items,
    ).toHaveLength(22);
    const program = (await repository.listPrograms()).items[0];
    expect(
      (
        await repository.listPrograms({
          search: program.title.slice(0, 4),
          status: [program.status],
          departmentId: program.departmentId,
          createdBy: program.createdBy,
          sortBy: "title",
          sortDirection: "asc",
          pageSize: 100,
        })
      ).items.length,
    ).toBeGreaterThan(0);
    await repository.listPrograms({
      sortBy: "createdAt",
      sortDirection: "asc",
      pageSize: 100,
    });
    for (const actor of await repository.listPersonas()) {
      expect((await repository.getDashboard(actor.id)).coursesByStatus).toHaveLength(5);
      await repository.listNotifications({
        userId: actor.id,
        unreadOnly: false,
        pageSize: 1,
      });
    }
  });

  it("covers aggregate optional sections, pruning, and aggregate CCN validation", async () => {
    await repository.initialize();
    const course = await createDraft("A03");
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        course: { departmentId: "00000000-0000-4000-8000-999999999999" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    const first = await repository.saveCourseAggregate(course.course.id, {
      slos: [
        {
          id: "temporary-one",
          sequence: 1,
          outcomeText: "Analyze a local policy.",
          bloomLevel: "Analyze",
          performanceCriteria: null,
        },
      ],
      content: [
        {
          id: "temporary-content",
          sequence: 1,
          topic: "Policy",
          subtopics: [],
          hoursAllocated: "2",
          linkedSloIds: ["temporary-one"],
        },
      ],
    });
    const second = await repository.saveCourseAggregate(course.course.id, {
      slos: [
        {
          ...first.slos[0],
          outcomeText: "Evaluate a local policy.",
        },
      ],
    });
    expect(second.content[0].linkedSloIds).toEqual([first.slos[0].id]);
    const emptied = await repository.saveCourseAggregate(course.course.id, {
      slos: [],
      content: [],
      requisites: [],
    });
    expect(emptied.slos).toEqual([]);
    const standard = (await repository.getReferences()).ccnStandards[0];
    const justified = await repository.saveCourseAggregate(course.course.id, {
      ccnJustification: {
        ccnCode: standard.ccnCode,
        justification:
          "The local course has a deliberately different sequence and instructional scope.",
        evidence: [" Faculty review ", ""],
      },
    });
    expect(justified.ccnJustification?.evidence).toEqual(["Faculty review"]);
    expect(
      (
        await repository.saveCourseAggregate(course.course.id, {
          ccnJustification: null,
        })
      ).ccnJustification,
    ).toBeNull();
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        ccnJustification: {
          ccnCode: "UNKNOWN C1000",
          justification:
            "This intentionally references a standard that is not in local reference data.",
          evidence: [],
        },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repository.saveCourseAggregate(course.course.id, {
        requisites: [
          {
            type: "Prerequisite",
            validationType: "Sequential",
            requisiteCourseId: course.course.id,
            requisiteText: null,
            contentReview: "Cycle",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "circular-requisite" });
  });

  it("covers lock integration, unavailable storage, and quota error translation", async () => {
    const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>,
      ) => callback(),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    const lockedName = `${databaseName}-locked`;
    const locked = new DexieCurriculumRepository({
      databaseName: lockedName,
      invalidation: new RepositoryInvalidationBus(`${lockedName}-events`),
    });
    await locked.initialize();
    expect(request).toHaveBeenCalled();
    locked.close();
    await Dexie.delete(lockedName);
    if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
    else Reflect.deleteProperty(navigator, "locks");

    const internal = repository as unknown as {
      mutate<T>(operation: () => Promise<T>): Promise<T>;
    };
    await expect(
      internal.mutate(() =>
        Promise.reject(new DOMException("quota", "QuotaExceededError")),
      ),
    ).rejects.toMatchObject({ code: "quota-exceeded" });

    const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    const unavailable = new DexieCurriculumRepository({
      databaseName: `${databaseName}-unavailable`,
      invalidation: new RepositoryInvalidationBus(`${databaseName}-unavailable-events`),
    });
    await expect(unavailable.initialize()).rejects.toMatchObject({
      code: "storage-unavailable",
    });
    expect((await unavailable.storageStatus()).warning).toBe("unavailable");
    unavailable.close();
    if (originalIndexedDB) Object.defineProperty(globalThis, "indexedDB", originalIndexedDB);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });

  it("caps retained AI records and messages", async () => {
    await repository.initialize();
    const actor = await repository.getActivePersona();
    const timestamp = "2026-07-30T20:00:00.000Z";
    const messages = Array.from({ length: 105 }, (_, index) => ({
      id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${index}`,
      createdAt: timestamp,
    }));
    const retained = await repository.saveAIConversation({
      id: "97100000-0000-4000-8000-000000000001",
      actorId: actor.id,
      entityType: null,
      entityId: null,
      title: "Retention",
      messages,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(retained.messages).toHaveLength(10);
    const extras = Array.from({ length: 51 }, (_, index) => ({
      ...retained,
      id: `97200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Conversation ${index}`,
      messages: [],
      updatedAt: new Date(Date.parse(timestamp) + index * 1000).toISOString(),
    }));
    await db().aiConversations.bulkPut(extras);
    await repository.saveAIConversation({
      ...retained,
      id: "97200000-0000-4000-8000-000000000099",
      title: "Newest conversation",
      updatedAt: "2026-07-31T20:00:00.000Z",
    });
    expect(await repository.listAIConversations({ actorId: actor.id, limit: 100 })).toHaveLength(50);

    const artifacts = Array.from({ length: 101 }, (_, index) => ({
      id: `97300000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      actorId: actor.id,
      conversationId: null,
      entityType: null,
      entityId: null,
      task: `artifact-${index}`,
      content: {},
      modelUsed: null,
      sourceIds: [],
      createdAt: new Date(Date.parse(timestamp) + index * 1000).toISOString(),
    }));
    await db().aiArtifacts.bulkPut(artifacts);
    // Nothing prunes this table any more because nothing writes to it. Rows
    // put here directly stay exactly as they were.
    expect(await db().aiArtifacts.count()).toBe(101);
  });

  // The interface could write AI artifacts but never read or delete them, so a
  // beta would have accumulated real curriculum text nothing could surface.
  // The write path is gone; the Dexie table stays declared because dropping it
  // is a schema migration and existing installs may hold rows.
  it("exposes no AI artifact read, write, or delete path", async () => {
    for (const method of [
      "saveAIArtifact",
      "listAIArtifacts",
      "deleteAIArtifact",
    ]) {
      expect(method in repository).toBe(false);
    }
  });

  it("writes no AI artifact when a suggestion is accepted end to end", async () => {
    const course = await createDraft("410");
    await repository.saveAIConversation({
      id: "98000000-0000-4000-8000-000000000001",
      actorId: (await repository.getActivePersona()).id,
      entityType: "Course",
      entityId: course.course.id,
      title: "Outcomes",
      messages: [],
      createdAt: "2026-07-30T20:00:00.000Z",
      updatedAt: "2026-07-30T20:00:00.000Z",
    });
    expect(await db().aiArtifacts.count()).toBe(0);
  });

  it("keeps the inert artifact table in the backup round trip", async () => {
    const backup = await repository.exportBackup();
    expect(backup.records.aiArtifacts).toEqual([]);
    await validateBackup(repository);
  });
});

async function validateBackup(repository: DexieCurriculumRepository): Promise<void> {
  await repository.importBackup(await repository.exportBackup());
}
