import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  BackupEnvelopeSchema,
  CCN_REFERENCE_COUNT,
  CCN_SAFE_DEFAULT_UNIT_CODES,
  DEMO_BACKUP_KIND,
  DEMO_FIXTURE_COUNTS,
  DomainIntegrityError,
  LegacyBackupEnvelopeV1Schema,
  collectReferentialIntegrityIssues,
  backupRecordsToSnapshot,
  createDemoFixture,
  snapshotToBackupRecords,
  stableDemoId,
  validateReferentialIntegrity,
} from ".";

describe("demo domain fixture", () => {
  it("has the exact stable fixture counts and valid references", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");

    expect(fixture.divisions).toHaveLength(DEMO_FIXTURE_COUNTS.divisions);
    expect(fixture.departments).toHaveLength(DEMO_FIXTURE_COUNTS.departments);
    expect(fixture.actors).toHaveLength(DEMO_FIXTURE_COUNTS.actors);
    expect(fixture.topCodes).toHaveLength(DEMO_FIXTURE_COUNTS.topCodes);
    expect(fixture.ccnStandards).toHaveLength(DEMO_FIXTURE_COUNTS.ccnStandards);
    expect(fixture.courses).toHaveLength(DEMO_FIXTURE_COUNTS.courses);
    expect(fixture.slos).toHaveLength(DEMO_FIXTURE_COUNTS.slos);
    expect(fixture.content).toHaveLength(DEMO_FIXTURE_COUNTS.content);
    expect(fixture.programs).toHaveLength(DEMO_FIXTURE_COUNTS.programs);
    expect(fixture.programCourses).toHaveLength(DEMO_FIXTURE_COUNTS.programCourses);
    expect(fixture.requisites).toHaveLength(DEMO_FIXTURE_COUNTS.requisites);
    expect(fixture.comments).toHaveLength(DEMO_FIXTURE_COUNTS.comments);
    expect(fixture.workflowHistory).toHaveLength(DEMO_FIXTURE_COUNTS.workflowHistory);
    expect(fixture.notifications).toHaveLength(DEMO_FIXTURE_COUNTS.notifications);
    expect(fixture.ccnJustifications).toHaveLength(
      DEMO_FIXTURE_COUNTS.ccnJustifications,
    );
    expect(collectReferentialIntegrityIssues(fixture)).toEqual([]);
    expect(validateReferentialIntegrity(fixture)).toEqual(fixture);
  });

  it("is deterministic for a fixed clock and refreshes relative timestamps", () => {
    const first = createDemoFixture("2026-07-30T12:00:00.000Z");
    const again = createDemoFixture("2026-07-30T12:00:00.000Z");
    const reset = createDemoFixture("2026-08-01T12:00:00.000Z");

    expect(again).toEqual(first);
    expect(reset.meta.fixtureHash).toBe(first.meta.fixtureHash);
    expect(reset.meta.lastResetAt).not.toBe(first.meta.lastResetAt);
    expect(reset.courses[0].updatedAt).not.toBe(first.courses[0].updatedAt);
    expect(first.meta.activeActorId).toBe(stableDemoId(3_001));
  });

  it("uses the canonical spaced CCN code format", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");

    expect(CCN_REFERENCE_COUNT).toBe(63);
    expect(
      fixture.ccnStandards.every((standard) =>
        /^[A-Z]{2,6} C\d{4}[HLSE]{0,2}$/.test(standard.ccnCode),
      ),
    ).toBe(true);
    expect(
      fixture.ccnStandards.some((standard) => standard.ccnCode.includes("-C")),
    ).toBe(false);
    expect(
      fixture.ccnStandards.every(
        (standard) =>
          standard.ccnCode ===
          `${standard.subjectCode} ${standard.courseNumber}`,
      ),
    ).toBe(true);
  });

  it("matches the 63-row source projection and documents malformed unit gaps", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const projection = fixture.ccnStandards.map(
      ({
        ccnCode,
        title,
        discipline,
        subjectCode,
        courseNumber,
        minimumUnits,
      }) => ({
        ccnCode,
        title,
        discipline,
        subjectCode,
        courseNumber,
        minimumUnits,
      }),
    );

    expect(
      createHash("sha256").update(JSON.stringify(projection)).digest("hex"),
    ).toBe("394d414eb802ac777ed482801707d6b7d7f8814fd169a349b14ce8e8769a411a");
    expect(fixture.ccnStandards.some(({ ccnCode }) => ccnCode === "")).toBe(false);
    expect(
      fixture.ccnStandards.some(({ ccnCode }) => ccnCode === "ECON C2001"),
    ).toBe(false);
    expect(
      fixture.ccnStandards.find(({ ccnCode }) => ccnCode === "ECON C2001H"),
    ).toMatchObject({
      title: "Principles of Microeconomics - Honors",
      minimumUnits: "3",
      discipline: "ECON",
    });

    const defaulted = fixture.ccnStandards.filter(
      ({ minimumUnitsSource }) => minimumUnitsSource === "safe-default",
    );
    expect(defaulted.map(({ ccnCode }) => ccnCode)).toEqual([
      ...CCN_SAFE_DEFAULT_UNIT_CODES,
    ]);
    expect(defaulted).toHaveLength(18);
    expect(defaulted.every(({ minimumUnits }) => minimumUnits === "3")).toBe(true);
    expect(
      fixture.ccnStandards.every(
        ({ descriptor, sourceFile, approvedDate }) =>
          descriptor.length > 0 &&
          sourceFile.endsWith(".pdf") &&
          /^\d{4}-\d{2}-\d{2}$/.test(approvedDate ?? ""),
      ),
    ).toBe(true);
  });

  it("keeps every valid CCN while treating unavailable implied TOP codes as advisory", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const localTopCodes = new Set(fixture.topCodes.map(({ code }) => code));
    const unavailableImpliedCodes = fixture.ccnStandards.filter(
      ({ impliedTopCode }) =>
        impliedTopCode !== null && !localTopCodes.has(impliedTopCode),
    );

    expect(fixture.topCodes).toHaveLength(20);
    expect(fixture.ccnStandards).toHaveLength(63);
    expect(unavailableImpliedCodes.length).toBeGreaterThan(0);
    expect(collectReferentialIntegrityIssues(fixture)).toEqual([]);
  });

  it("includes the canonical reference projection in the stable fixture hash", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");

    expect(fixture.meta.fixtureHash).toBe("fnv1a32:45bed262");
  });

  it("rejects broken links before import", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const broken = structuredClone(fixture);
    broken.programCourses[0].courseId = stableDemoId(999_999);

    expect(() => validateReferentialIntegrity(broken)).toThrow(DomainIntegrityError);
  });

  it("rejects invalid TOP links, duplicate program membership, and requisite cycles", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const broken = structuredClone(fixture);
    const unknownTopCode = "9999.99";

    broken.courses[0].topCode = unknownTopCode;
    broken.courses[0].cbCodes.CB03 = unknownTopCode;
    broken.programs[0].topCode = unknownTopCode;
    broken.programCourses.push({
      ...broken.programCourses[0],
      id: stableDemoId(990_001),
    });
    broken.requisites[0].courseId = broken.courses[0].id;
    broken.requisites[0].requisiteCourseId = broken.courses[1].id;
    broken.requisites[1].courseId = broken.courses[1].id;
    broken.requisites[1].requisiteCourseId = broken.courses[0].id;

    const issues = collectReferentialIntegrityIssues(broken);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "courses.0.topCode" }),
        expect.objectContaining({ path: "courses.0.cbCodes.CB03" }),
        expect.objectContaining({ path: "programs.0.topCode" }),
        expect.objectContaining({
          path: "programCourses",
          message: expect.stringContaining("appears more than once"),
        }),
        expect.objectContaining({
          path: "programCourses",
          message: expect.stringContaining("Sequence"),
        }),
        expect.objectContaining({
          path: "requisites",
          message: expect.stringContaining("cycle"),
        }),
      ]),
    );
    expect(() => validateReferentialIntegrity(broken)).toThrow(
      DomainIntegrityError,
    );
  });

  it("requires a stored CB03 value to match the canonical local TOP code", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const broken = structuredClone(fixture);
    const otherTopCode = fixture.topCodes.find(
      ({ code }) => code !== broken.courses[0].topCode,
    )?.code;

    expect(otherTopCode).toBeDefined();
    broken.courses[0].cbCodes.CB03 = otherTopCode;

    expect(collectReferentialIntegrityIssues(broken)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "courses.0.cbCodes.CB03",
          message: expect.stringContaining("must match course TOP code"),
        }),
      ]),
    );
    expect(() => validateReferentialIntegrity(broken)).toThrow(
      DomainIntegrityError,
    );
  });

  it("reports broken links and paired-entity metadata across record families", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const broken = structuredClone(fixture);
    const missingId = stableDemoId(990_002);

    broken.courses[1].id = broken.courses[0].id;
    broken.departments[0].divisionId = missingId;
    broken.actors[0].departmentId = missingId;
    broken.courses[0].departmentId = missingId;
    broken.courses[0].createdBy = missingId;
    broken.courses[0].ccnCode = "MATH C9999";
    broken.topCodes[0].parentCode = "9999.99";
    broken.slos[0].courseId = missingId;
    broken.content[0].courseId = missingId;
    broken.content[0].linkedSloIds = [missingId];
    broken.requisites[0].courseId = broken.requisites[0].requisiteCourseId!;
    broken.programs[0].departmentId = missingId;
    broken.programs[0].createdBy = missingId;
    broken.programCourses[0].programId = missingId;
    broken.programCourses[0].courseId = missingId;
    broken.workflowHistory[0].entityId = missingId;
    broken.workflowHistory[0].changedBy = missingId;
    broken.comments[0].entityId = missingId;
    broken.comments[0].authorId = missingId;
    broken.notifications[0].actorId = missingId;
    broken.notifications[0].entityType = "Course";
    broken.notifications[0].entityId = null;
    broken.ccnJustifications[0].createdBy = missingId;
    broken.ccnJustifications[0].ccnCode = "MATH C9999";
    broken.aiConversations.push({
      id: stableDemoId(990_003),
      actorId: missingId,
      entityType: "Course",
      entityId: null,
      title: "Broken conversation",
      messages: [],
      createdAt: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    });
    broken.aiArtifacts.push({
      id: stableDemoId(990_004),
      actorId: missingId,
      conversationId: missingId,
      entityType: "Program",
      entityId: null,
      task: "test",
      content: {},
      modelUsed: null,
      sourceIds: [],
      createdAt: "2026-07-30T12:00:00.000Z",
    });
    broken.aiConversations[0].actorId = missingId;
    broken.aiConversations[0].entityType = "Course";
    broken.aiConversations[0].entityId = null;
    broken.aiArtifacts[0].actorId = missingId;
    broken.aiArtifacts[0].conversationId = missingId;
    broken.aiArtifacts[0].entityType = "Program";
    broken.aiArtifacts[0].entityId = null;
    broken.meta.activeActorId = missingId;

    const paths = collectReferentialIntegrityIssues(broken).map(
      ({ path }) => path,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "courses",
        "departments.0.divisionId",
        "actors.0.departmentId",
        "courses.0.departmentId",
        "courses.0.createdBy",
        "courses.0.ccnCode",
        "topCodes.0.parentCode",
        "slos.0.courseId",
        "content.0.courseId",
        "content.0.linkedSloIds.0",
        "requisites.0.requisiteCourseId",
        "programs.0.departmentId",
        "programs.0.createdBy",
        "programCourses.0.programId",
        "programCourses.0.courseId",
        "workflowHistory.0.entityId",
        "workflowHistory.0.changedBy",
        "comments.0.entityId",
        "comments.0.authorId",
        "notifications.0.actorId",
        "notifications.0",
        "ccnJustifications.0.createdBy",
        "ccnJustifications.0.ccnCode",
        "aiConversations.0.actorId",
        "aiConversations.0",
        "aiArtifacts.0.actorId",
        "aiArtifacts.0.conversationId",
        "aiArtifacts.0",
        "meta.activeActorId",
      ]),
    );
  });

  it("validates the public backup envelope and excludes secrets by shape", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const backup = BackupEnvelopeSchema.parse({
      kind: DEMO_BACKUP_KIND,
      schemaVersion: fixture.meta.schemaVersion,
      seedVersion: fixture.meta.seedVersion,
      appVersion: fixture.meta.appVersion,
      exportedAt: "2026-07-30T12:30:00.000Z",
      records: snapshotToBackupRecords(fixture),
    });

    expect(Object.values(backup.records).every(Array.isArray)).toBe(true);
    expect(backup.records.meta).toEqual([fixture.meta]);
    expect(backupRecordsToSnapshot(backup.records)).toEqual(fixture);
    expect(JSON.stringify(backup.records)).not.toMatch(
      /"key"|api[_-]?key|public[_-]?key|private[_-]?key|sk-or-v1-|authorization|bearer|cookie|session[_-]?token|secret|openrouter|turnstile|service[_-]?worker|serviceWorker|sw\.js|cache[_-]?storage/i,
    );
  });

  it("rejects backup records with missing, unexpected, or duplicate metadata stores", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const records = snapshotToBackupRecords(fixture);

    expect(() =>
      backupRecordsToSnapshot({ ...records, courses: undefined }),
    ).toThrow();
    expect(() =>
      backupRecordsToSnapshot({ ...records, unexpected: [] }),
    ).toThrow("missing or unexpected stores");
    expect(() =>
      backupRecordsToSnapshot({ ...records, meta: [fixture.meta, fixture.meta] }),
    ).toThrow("exactly one metadata row");
  });

  it("rejects unexpected top-level fields in current and legacy backup envelopes", () => {
    const fixture = createDemoFixture("2026-07-30T12:00:00.000Z");
    const envelope = {
      kind: DEMO_BACKUP_KIND,
      schemaVersion: fixture.meta.schemaVersion,
      seedVersion: fixture.meta.seedVersion,
      appVersion: fixture.meta.appVersion,
      exportedAt: "2026-07-30T12:30:00.000Z",
    } as const;

    expect(() =>
      BackupEnvelopeSchema.parse({
        ...envelope,
        records: snapshotToBackupRecords(fixture),
        unexpected: "must not be silently stripped",
      }),
    ).toThrow();
    expect(() =>
      LegacyBackupEnvelopeV1Schema.parse({
        ...envelope,
        schemaVersion: 1,
        records: { ...fixture, meta: { ...fixture.meta, schemaVersion: 1 } },
        unexpected: "must not be silently stripped",
      }),
    ).toThrow();
  });
});
