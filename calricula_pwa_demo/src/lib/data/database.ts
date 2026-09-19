import Dexie, { type Table } from "dexie";

import type {
  Actor,
  AIArtifact,
  AIConversation,
  CCNJustification,
  CCNStandard,
  Comment,
  Course,
  CourseContent,
  CourseRequisite,
  DemoMeta,
  Department,
  Division,
  Notification,
  Program,
  ProgramCourse,
  StudentLearningOutcome,
  TopCode,
  WorkflowHistory,
} from "@/lib/domain";

export class CurriculumDatabase extends Dexie {
  meta!: Table<DemoMeta, "demo">;
  actors!: Table<Actor, string>;
  divisions!: Table<Division, string>;
  departments!: Table<Department, string>;
  topCodes!: Table<TopCode, string>;
  ccnStandards!: Table<CCNStandard, string>;
  courses!: Table<Course, string>;
  slos!: Table<StudentLearningOutcome, string>;
  content!: Table<CourseContent, string>;
  requisites!: Table<CourseRequisite, string>;
  programs!: Table<Program, string>;
  programCourses!: Table<ProgramCourse, string>;
  workflowHistory!: Table<WorkflowHistory, string>;
  comments!: Table<Comment, string>;
  notifications!: Table<Notification, string>;
  ccnJustifications!: Table<CCNJustification, string>;
  aiConversations!: Table<AIConversation, string>;
  aiArtifacts!: Table<AIArtifact, string>;

  constructor(name = "calricula-demo") {
    super(name);
    this.version(1).stores({
      meta: "&id",
      actors: "&id, role, departmentId",
      divisions: "&id, &code",
      departments: "&id, &code, divisionId",
      topCodes: "&id, &code, vocational",
      ccnStandards: "&id, ccnCode, subjectCode, courseNumber",
      courses:
        "&id, lineageId, status, departmentId, createdBy, createdAt, updatedAt, " +
        "[status+updatedAt], [departmentId+updatedAt], [subjectCode+courseNumber+departmentId]",
      slos: "&id, courseId, [courseId+sequence]",
      content: "&id, courseId, [courseId+sequence]",
      requisites: "&id, courseId, requisiteCourseId",
      programs:
        "&id, status, departmentId, createdBy, createdAt, updatedAt, " +
        "[status+updatedAt], [departmentId+updatedAt]",
      programCourses: "&id, programId, courseId, [programId+sequence], [programId+courseId]",
      workflowHistory: "&id, entityType, entityId, createdAt, [entityType+entityId]",
      comments: "&id, entityType, entityId, authorId, resolved, createdAt, [entityType+entityId]",
      notifications: "&id, actorId, type, readAt, createdAt, [actorId+createdAt]",
      ccnJustifications: "&id, &courseId, ccnCode",
      aiConversations: "&id, actorId, entityType, entityId, updatedAt",
      aiArtifacts: "&id, actorId, conversationId, entityType, entityId, createdAt",
    });
  }
}
