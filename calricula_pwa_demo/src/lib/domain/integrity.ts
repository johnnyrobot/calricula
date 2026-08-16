import {
  DomainSnapshotSchema,
  type DomainSnapshot,
  type EntityType,
} from "./schemas";

export interface IntegrityIssue {
  path: string;
  message: string;
}

export class DomainIntegrityError extends Error {
  constructor(readonly issues: IntegrityIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "DomainIntegrityError";
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues];
}

export function collectReferentialIntegrityIssues(input: unknown): IntegrityIssue[] {
  const parsed = DomainSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }
  const snapshot = parsed.data;
  const issues: IntegrityIssue[] = [];
  const entityCollections: Array<[string, Array<{ id: string }>]> = [
    ["actors", snapshot.actors],
    ["divisions", snapshot.divisions],
    ["departments", snapshot.departments],
    ["topCodes", snapshot.topCodes],
    ["ccnStandards", snapshot.ccnStandards],
    ["courses", snapshot.courses],
    ["slos", snapshot.slos],
    ["content", snapshot.content],
    ["requisites", snapshot.requisites],
    ["programs", snapshot.programs],
    ["programCourses", snapshot.programCourses],
    ["workflowHistory", snapshot.workflowHistory],
    ["comments", snapshot.comments],
    ["notifications", snapshot.notifications],
    ["ccnJustifications", snapshot.ccnJustifications],
    ["aiConversations", snapshot.aiConversations],
    ["aiArtifacts", snapshot.aiArtifacts],
  ];
  for (const [name, records] of entityCollections) {
    for (const id of duplicates(records.map((record) => record.id))) {
      issues.push({ path: name, message: `Duplicate id ${id}` });
    }
  }

  const actorIds = new Set(snapshot.actors.map(({ id }) => id));
  const divisionIds = new Set(snapshot.divisions.map(({ id }) => id));
  const departmentIds = new Set(snapshot.departments.map(({ id }) => id));
  const topCodeValues = new Set(snapshot.topCodes.map(({ code }) => code));
  const courseIds = new Set(snapshot.courses.map(({ id }) => id));
  const sloIds = new Set(snapshot.slos.map(({ id }) => id));
  const programIds = new Set(snapshot.programs.map(({ id }) => id));
  const ccnCodes = new Set(snapshot.ccnStandards.map(({ ccnCode }) => ccnCode));
  const conversationIds = new Set(snapshot.aiConversations.map(({ id }) => id));

  const requireLink = (
    path: string,
    value: string | null,
    allowed: ReadonlySet<string>,
    optional = false,
  ) => {
    if (value === null && optional) return;
    if (value === null || !allowed.has(value)) {
      issues.push({ path, message: `Unresolved reference ${String(value)}` });
    }
  };
  const requireEntity = (path: string, type: EntityType, id: string) =>
    requireLink(path, id, type === "Course" ? courseIds : programIds);

  snapshot.departments.forEach((record, index) =>
    requireLink(`departments.${index}.divisionId`, record.divisionId, divisionIds),
  );
  snapshot.actors.forEach((record, index) =>
    requireLink(`actors.${index}.departmentId`, record.departmentId, departmentIds, true),
  );
  snapshot.courses.forEach((record, index) => {
    requireLink(`courses.${index}.departmentId`, record.departmentId, departmentIds);
    requireLink(`courses.${index}.createdBy`, record.createdBy, actorIds);
    requireLink(`courses.${index}.topCode`, record.topCode, topCodeValues, true);
    if (Object.hasOwn(record.cbCodes, "CB03")) {
      const cb03 = record.cbCodes.CB03;
      if (typeof cb03 !== "string" || !topCodeValues.has(cb03)) {
        issues.push({
          path: `courses.${index}.cbCodes.CB03`,
          message: `Unknown TOP code ${String(cb03)}`,
        });
      } else if (record.topCode !== cb03) {
        issues.push({
          path: `courses.${index}.cbCodes.CB03`,
          message: `CB03 ${cb03} must match course TOP code ${String(record.topCode)}`,
        });
      }
    }
    if (record.ccnCode && !ccnCodes.has(record.ccnCode)) {
      issues.push({
        path: `courses.${index}.ccnCode`,
        message: `Unknown CCN code ${record.ccnCode}`,
      });
    }
  });
  for (const code of duplicates(snapshot.ccnStandards.map(({ ccnCode }) => ccnCode))) {
    issues.push({
      path: "ccnStandards",
      message: `Duplicate CCN code ${code}`,
    });
  }
  snapshot.ccnStandards.forEach((record, index) => {
    const expectedCode = `${record.subjectCode} ${record.courseNumber}`;
    if (record.ccnCode !== expectedCode) {
      issues.push({
        path: `ccnStandards.${index}.ccnCode`,
        message: `CCN code must equal subject and course number (${expectedCode})`,
      });
    }
    const specialty = record.courseNumber.replace(/^C\d{4}/, "");
    if (record.isHonors !== specialty.includes("H")) {
      issues.push({
        path: `ccnStandards.${index}.isHonors`,
        message: `Honors flag disagrees with ${record.ccnCode}`,
      });
    }
    if (record.isLabOnly !== specialty.includes("L")) {
      issues.push({
        path: `ccnStandards.${index}.isLabOnly`,
        message: `Lab-only flag disagrees with ${record.ccnCode}`,
      });
    }
    if (record.hasEmbeddedSupport !== specialty.includes("E")) {
      issues.push({
        path: `ccnStandards.${index}.hasEmbeddedSupport`,
        message: `Embedded-support flag disagrees with ${record.ccnCode}`,
      });
    }
    if (Number(record.minimumUnits) <= 0) {
      issues.push({
        path: `ccnStandards.${index}.minimumUnits`,
        message: "CCN minimum units must be positive",
      });
    }
  });
  snapshot.topCodes.forEach((record, index) => {
    if (record.parentCode && !topCodeValues.has(record.parentCode)) {
      issues.push({
        path: `topCodes.${index}.parentCode`,
        message: `Unknown parent TOP code ${record.parentCode}`,
      });
    }
  });
  snapshot.slos.forEach((record, index) =>
    requireLink(`slos.${index}.courseId`, record.courseId, courseIds),
  );
  snapshot.content.forEach((record, index) => {
    requireLink(`content.${index}.courseId`, record.courseId, courseIds);
    record.linkedSloIds.forEach((id, linkIndex) =>
      requireLink(`content.${index}.linkedSloIds.${linkIndex}`, id, sloIds),
    );
  });
  snapshot.requisites.forEach((record, index) => {
    requireLink(`requisites.${index}.courseId`, record.courseId, courseIds);
    requireLink(
      `requisites.${index}.requisiteCourseId`,
      record.requisiteCourseId,
      courseIds,
      true,
    );
    if (record.courseId === record.requisiteCourseId) {
      issues.push({
        path: `requisites.${index}.requisiteCourseId`,
        message: "A course cannot require itself",
      });
    }
  });
  const requisiteGraph = new Map<string, string[]>();
  snapshot.requisites.forEach(({ courseId, requisiteCourseId }) => {
    if (!requisiteCourseId || !courseIds.has(courseId) || !courseIds.has(requisiteCourseId)) {
      return;
    }
    const edges = requisiteGraph.get(courseId) ?? [];
    edges.push(requisiteCourseId);
    requisiteGraph.set(courseId, edges);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitRequisite = (courseId: string): boolean => {
    if (visiting.has(courseId)) return true;
    if (visited.has(courseId)) return false;
    visiting.add(courseId);
    const cyclic = (requisiteGraph.get(courseId) ?? []).some(visitRequisite);
    visiting.delete(courseId);
    visited.add(courseId);
    return cyclic;
  };
  if ([...courseIds].some(visitRequisite)) {
    issues.push({
      path: "requisites",
      message: "Requisite relationships cannot contain a cycle",
    });
  }
  snapshot.programs.forEach((record, index) => {
    requireLink(`programs.${index}.departmentId`, record.departmentId, departmentIds);
    requireLink(`programs.${index}.createdBy`, record.createdBy, actorIds);
    requireLink(`programs.${index}.topCode`, record.topCode, topCodeValues, true);
  });
  snapshot.programCourses.forEach((record, index) => {
    requireLink(`programCourses.${index}.programId`, record.programId, programIds);
    requireLink(`programCourses.${index}.courseId`, record.courseId, courseIds);
  });
  for (const programId of programIds) {
    const memberships = snapshot.programCourses.filter(
      (record) => record.programId === programId,
    );
    for (const courseId of duplicates(memberships.map(({ courseId }) => courseId))) {
      issues.push({
        path: "programCourses",
        message: `Course ${courseId} appears more than once in program ${programId}`,
      });
    }
    for (const sequence of duplicates(
      memberships.map(({ sequence }) => String(sequence)),
    )) {
      issues.push({
        path: "programCourses",
        message: `Sequence ${sequence} appears more than once in program ${programId}`,
      });
    }
  }
  snapshot.workflowHistory.forEach((record, index) => {
    requireEntity(`workflowHistory.${index}.entityId`, record.entityType, record.entityId);
    requireLink(`workflowHistory.${index}.changedBy`, record.changedBy, actorIds);
  });
  snapshot.comments.forEach((record, index) => {
    requireEntity(`comments.${index}.entityId`, record.entityType, record.entityId);
    requireLink(`comments.${index}.authorId`, record.authorId, actorIds);
  });
  snapshot.notifications.forEach((record, index) => {
    requireLink(`notifications.${index}.actorId`, record.actorId, actorIds);
    if (record.entityType && record.entityId) {
      requireEntity(`notifications.${index}.entityId`, record.entityType, record.entityId);
    } else if (record.entityType || record.entityId) {
      issues.push({
        path: `notifications.${index}`,
        message: "entityType and entityId must both be set or both be null",
      });
    }
  });
  const justificationCourses = snapshot.ccnJustifications.map(({ courseId }) => courseId);
  duplicates(justificationCourses).forEach((id) =>
    issues.push({
      path: "ccnJustifications",
      message: `More than one CCN justification for course ${id}`,
    }),
  );
  snapshot.ccnJustifications.forEach((record, index) => {
    requireLink(`ccnJustifications.${index}.courseId`, record.courseId, courseIds);
    requireLink(`ccnJustifications.${index}.createdBy`, record.createdBy, actorIds);
    if (!ccnCodes.has(record.ccnCode)) {
      issues.push({
        path: `ccnJustifications.${index}.ccnCode`,
        message: `Unknown CCN code ${record.ccnCode}`,
      });
    }
    const course = snapshot.courses.find(({ id }) => id === record.courseId);
    if (course?.ccnCode) {
      issues.push({
        path: `ccnJustifications.${index}.courseId`,
        message: "A course cannot have both an adopted CCN code and a non-match justification",
      });
    }
  });
  snapshot.aiConversations.forEach((record, index) => {
    requireLink(`aiConversations.${index}.actorId`, record.actorId, actorIds);
    if (record.entityType && record.entityId) {
      requireEntity(`aiConversations.${index}.entityId`, record.entityType, record.entityId);
    } else if (record.entityType || record.entityId) {
      issues.push({
        path: `aiConversations.${index}`,
        message: "entityType and entityId must both be set or both be null",
      });
    }
  });
  snapshot.aiArtifacts.forEach((record, index) => {
    requireLink(`aiArtifacts.${index}.actorId`, record.actorId, actorIds);
    requireLink(
      `aiArtifacts.${index}.conversationId`,
      record.conversationId,
      conversationIds,
      true,
    );
    if (record.entityType && record.entityId) {
      requireEntity(`aiArtifacts.${index}.entityId`, record.entityType, record.entityId);
    } else if (record.entityType || record.entityId) {
      issues.push({
        path: `aiArtifacts.${index}`,
        message: "entityType and entityId must both be set or both be null",
      });
    }
  });
  requireLink("meta.activeActorId", snapshot.meta.activeActorId, actorIds);

  return issues;
}

export function validateReferentialIntegrity(input: unknown): DomainSnapshot {
  const parsed = DomainSnapshotSchema.parse(input);
  const issues = collectReferentialIntegrityIssues(parsed);
  if (issues.length > 0) throw new DomainIntegrityError(issues);
  return parsed;
}
