import {
  DEMO_APP_VERSION,
  DEMO_SCHEMA_VERSION,
  DEMO_SEED_VERSION,
  type Actor,
  type Course,
  type CourseContent,
  type Department,
  type Division,
  type DomainSnapshot,
  DomainSnapshotSchema,
  type Program,
  type StudentLearningOutcome,
  type TopCode,
} from "./schemas";
import { createCCNReferenceStandards } from "./ccn-reference";

const REFERENCE_VERSION = "ccn-extracted-2025.06-valid63";

export const DEMO_FIXTURE_COUNTS = Object.freeze({
  divisions: 6,
  departments: 17,
  actors: 4,
  topCodes: 20,
  ccnStandards: 63,
  courses: 22,
  slos: 77,
  content: 125,
  programs: 5,
  programCourses: 11,
  requisites: 2,
  comments: 3,
  workflowHistory: 5,
  notifications: 7,
  ccnJustifications: 1,
});

export function stableDemoId(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 999_999_999_999) {
    throw new Error(`Invalid stable demo identifier sequence: ${sequence}`);
  }
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`;
}

function atDaysAgo(now: Date, days: number, minutes = 0): string {
  return new Date(now.getTime() - days * 86_400_000 - minutes * 60_000).toISOString();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function computeFixtureHash(snapshot: Omit<DomainSnapshot, "meta">): string {
  const omitVolatileTimestamps = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(omitVolatileTimestamps);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) =>
            ![
              "createdAt",
              "updatedAt",
              "approvedAt",
              "effectiveDate",
              "resolvedAt",
              "readAt",
            ].includes(key),
        )
        .map(([key, nested]) => [key, omitVolatileTimestamps(nested)]),
    );
  };
  let hash = 0x811c9dc5;
  for (const character of stableJson(omitVolatileTimestamps(snapshot))) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createDemoFixture(nowInput: Date | string = new Date()): DomainSnapshot {
  const now = new Date(nowInput);
  if (Number.isNaN(now.getTime())) throw new Error("Invalid fixture timestamp");
  const timestamp = now.toISOString();

  const divisionNames = [
    ["MSE", "Mathematics, Sciences, and Engineering"],
    ["LCA", "Language and Communication Arts"],
    ["SBS", "Social and Behavioral Sciences"],
    ["AH", "Arts and Humanities"],
    ["BUS", "Business and Workforce Education"],
    ["LIB", "Liberal Arts and Interdisciplinary Studies"],
  ] as const;
  const divisions: Division[] = divisionNames.map(([code, name], index) => ({
    id: stableDemoId(1_001 + index),
    code,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const departmentDefinitions = [
    ["MATH", "Mathematics", 0],
    ["ENGL", "English", 1],
    ["CS", "Computer Science", 0],
    ["BIOL", "Biology", 0],
    ["CHEM", "Chemistry", 0],
    ["PHYS", "Physics", 0],
    ["PSYC", "Psychology", 2],
    ["ART", "Art", 3],
    ["HIST", "History", 2],
    ["SPAN", "Modern Languages", 1],
    ["COMM", "Communication Studies", 1],
    ["PHIL", "Philosophy", 3],
    ["SOC", "Sociology", 2],
    ["MUS", "Music", 3],
    ["ANTH", "Anthropology", 2],
    ["ECON", "Economics", 4],
    ["POLI", "Political Science", 2],
  ] as const;
  const departments: Department[] = departmentDefinitions.map(
    ([code, name, divisionIndex], index) => ({
      id: stableDemoId(2_001 + index),
      divisionId: divisions[divisionIndex].id,
      code,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  const departmentByCode = new Map(departments.map((value) => [value.code, value]));

  const actorDefinitions = [
    ["Demo Faculty", "faculty", "MATH"],
    ["Demo Curriculum Chair", "chair", "ENGL"],
    ["Demo Articulation Officer", "articulation", "COMM"],
    ["Demo Administrator", "admin", "CS"],
  ] as const;
  const actors: Actor[] = actorDefinitions.map(([fullName, role, department], index) => ({
    id: stableDemoId(3_001 + index),
    email: `${role}@demo.calricula.local`,
    fullName,
    role,
    departmentId: departmentByCode.get(department)?.id ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const topCodeDefinitions = [
    ["1701.00", "Mathematics, General", false, null],
    ["1501.00", "English", false, null],
    ["0707.00", "Computer Information Systems", true, null],
    ["0401.00", "Biological Sciences", false, null],
    ["2001.00", "Psychology, General", false, null],
    ["0505.00", "Business Administration", true, null],
    ["1002.00", "Art", false, null],
    ["2205.00", "History", false, null],
    ["1905.00", "Chemistry, General", false, null],
    ["1230.00", "Nursing", true, null],
    ["1012.00", "Applied Photography", true, null],
    ["0956.00", "Manufacturing Technology", true, null],
    ["2101.00", "Sociology", false, null],
    ["0835.00", "Child Development/Early Care and Education", true, null],
    ["1301.00", "Communication Studies", false, null],
    ["1901.00", "Physical Sciences, General", false, null],
    ["2202.00", "Political Science", false, null],
    ["2203.00", "Economics", false, null],
    ["0502.00", "Accounting", true, "0505.00"],
    ["0701.00", "Information Technology, General", true, null],
  ] as const;
  const topCodes: TopCode[] = topCodeDefinitions.map(
    ([code, title, vocational, parentCode], index) => ({
      id: stableDemoId(4_001 + index),
      code,
      title,
      vocational,
      parentCode,
    }),
  );

  const ccnStandards = createCCNReferenceStandards(
    stableDemoId,
    atDaysAgo(now, 120),
  );

  const courseDefinitions = [
    ["MATH", "101", "College Algebra"],
    ["MATH", "201", "Calculus I"],
    ["ENGL", "101", "College Composition"],
    ["ENGL", "103", "Critical Thinking and Composition"],
    ["CS", "101", "Introduction to Programming"],
    ["CS", "201", "Data Structures"],
    ["BIOL", "101", "General Biology"],
    ["CHEM", "101", "General Chemistry"],
    ["PHYS", "101", "College Physics"],
    ["PSYC", "101", "General Psychology"],
    ["ART", "101", "Art Appreciation"],
    ["HIST", "101", "United States History"],
    ["SPAN", "101", "Elementary Spanish"],
    ["COMM", "101", "Public Speaking"],
    ["PHIL", "101", "Introduction to Philosophy"],
    ["SOC", "101", "Introduction to Sociology"],
    ["MUS", "101", "Music Appreciation"],
    ["ANTH", "101", "Cultural Anthropology"],
    ["ECON", "101", "Principles of Economics"],
    ["POLI", "101", "American Government"],
    ["MATH", "125", "Elementary Statistics"],
    ["CS", "250", "Database Systems"],
  ] as const;
  const statuses: Course["status"][] = [
    "Draft",
    "Department Review",
    "Curriculum Committee",
    "Articulation Review",
    "Approved",
  ];
  const courseCCNByLocalCode = new Map([
    ["MATH 201", "MATH C2210"],
    ["ENGL 101", "ENGL C1000"],
    ["ENGL 103", "ENGL C1001"],
    ["BIOL 101", "BIOL C1000"],
    ["PSYC 101", "PSYC C1000"],
    ["HIST 101", "HIST C1001"],
    ["COMM 101", "COMM C1000"],
    ["SOC 101", "SOCI C1000"],
    ["ECON 101", "ECON C2002"],
    ["POLI 101", "POLS C1000"],
    ["MATH 125", "STAT C1000"],
  ]);
  const courses: Course[] = courseDefinitions.map(([subjectCode, courseNumber, title], index) => {
    const id = stableDemoId(6_001 + index);
    const status = statuses[index % statuses.length];
    const createdAt = atDaysAgo(now, 45 - index);
    const updatedAt = atDaysAgo(now, Math.min(12, index % 13), index * 3);
    const labCourse = ["BIOL", "CHEM", "PHYS", "CS"].includes(subjectCode);
    const selectedCCN = courseCCNByLocalCode.get(`${subjectCode} ${courseNumber}`);
    const ccn = ccnStandards.find((standard) => standard.ccnCode === selectedCCN);
    return {
      id,
      lineageId: id,
      subjectCode,
      courseNumber,
      title,
      catalogDescription:
        `${title} develops foundational concepts, disciplinary practices, and ` +
        "college-level analytical skills through guided study and applied work.",
      units: labCourse ? "4" : "3",
      minimumUnits: null,
      maximumUnits: null,
      lectureHours: "3",
      labHours: labCourse ? "3" : "0",
      activityHours: "0",
      tbaHours: "0",
      outsideOfClassHours: labCourse ? "5" : "6",
      totalStudentLearningHours: labCourse ? "198" : "162",
      topCode: topCodes[index % topCodes.length].code,
      status,
      version: 1,
      effectiveTerm: "Fall 2026",
      ccnCode: ccn?.ccnCode ?? null,
      cId: index % 4 === 0 ? `C-ID ${subjectCode} ${courseNumber}` : null,
      cbCodes: { CB04: "A", CB05: "A", CB08: "A", CB09: "E" },
      transferability: { csu: true, uc: index % 6 !== 0 },
      geApplicability: { calGetc: index % 3 === 0 ? ["Area 2"] : [] },
      lmiData: null,
      departmentId: departmentByCode.get(subjectCode)!.id,
      createdBy: actors[index % actors.length].id,
      createdAt,
      updatedAt,
      approvedAt: status === "Approved" ? updatedAt : null,
    };
  });

  const slos: StudentLearningOutcome[] = courses.flatMap((course, courseIndex) => {
    const count = courseIndex < 11 ? 4 : 3;
    const precedingCount =
      courseIndex < 11 ? courseIndex * 4 : 11 * 4 + (courseIndex - 11) * 3;
    return Array.from({ length: count }, (_, localIndex) => ({
        id: stableDemoId(7_001 + precedingCount + localIndex),
        courseId: course.id,
        sequence: localIndex + 1,
        outcomeText: [
          "Analyze central concepts using discipline-appropriate evidence.",
          "Apply course methods to a representative problem or task.",
          "Evaluate competing explanations and communicate a supported conclusion.",
          "Create an original response that integrates core course concepts.",
        ][localIndex],
        bloomLevel: (["Analyze", "Apply", "Evaluate", "Create"] as const)[localIndex],
        performanceCriteria: "Meets the published rubric at a satisfactory level.",
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      }));
  });

  const content: CourseContent[] = courses.flatMap((course, courseIndex) => {
    const count = courseIndex < 15 ? 6 : 5;
    const courseSlos = slos.filter((slo) => slo.courseId === course.id);
    const precedingCount =
      courseIndex < 15 ? courseIndex * 6 : 15 * 6 + (courseIndex - 15) * 5;
    return Array.from({ length: count }, (_, localIndex) => ({
        id: stableDemoId(8_001 + precedingCount + localIndex),
        courseId: course.id,
        sequence: localIndex + 1,
        topic: `${course.title}: Topic ${localIndex + 1}`,
        subtopics: [
          `Core concept ${localIndex + 1}`,
          `Applied practice ${localIndex + 1}`,
        ],
        hoursAllocated: localIndex === count - 1 ? "9" : "9",
        linkedSloIds: [courseSlos[localIndex % courseSlos.length].id],
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      }));
  });

  const programDefinitions = [
    ["Mathematics Associate in Science", "AS", "MATH"],
    ["Computer Science Associate in Science", "AS", "CS"],
    ["English Associate in Arts", "AA", "ENGL"],
    ["Social Justice Studies", "AAT", "SOC"],
    ["Data Analytics Certificate", "Certificate", "CS"],
  ] as const;
  const programCourseDefinitions = [
    [0, 0, "Required Core"],
    [0, 1, "Required Core"],
    [0, 20, "List A"],
    [1, 4, "Required Core"],
    [1, 5, "Required Core"],
    [1, 21, "List A"],
    [2, 2, "Required Core"],
    [2, 3, "Required Core"],
    [3, 15, "Required Core"],
    [3, 17, "List A"],
    [4, 21, "Required Core"],
  ] as const;
  const programs: Program[] = programDefinitions.map(([title, type, department], index) => ({
    id: stableDemoId(9_001 + index),
    title,
    type,
    catalogDescription: `${title} prepares students for transfer, employment, or further study.`,
    totalUnits: programCourseDefinitions
      .filter(([programIndex]) => programIndex === index)
      .reduce((sum, [, courseIndex]) => sum + Number(courses[courseIndex].units), 0)
      .toString(),
    status: index === 2 ? "Review" : index === 3 ? "Approved" : "Draft",
    topCode: topCodes[index].code,
    cipCode: null,
    programNarrative: null,
    isHighUnitMajor: false,
    departmentId: departmentByCode.get(department)!.id,
    createdBy: actors[index % actors.length].id,
    createdAt: atDaysAgo(now, 60 - index * 3),
    updatedAt: atDaysAgo(now, 8 - index),
  }));

  const programCourseRecords = programCourseDefinitions.map(
    ([programIndex, courseIndex, requirementType], index) => ({
      id: stableDemoId(10_001 + index),
      programId: programs[programIndex].id,
      courseId: courses[courseIndex].id,
      requirementType,
      sequence:
        programCourseDefinitions
          .slice(0, index)
          .filter(([candidateProgram]) => candidateProgram === programIndex).length + 1,
      unitsApplied: courses[courseIndex].units,
    }),
  );

  const requisites = [
    {
      id: stableDemoId(11_001),
      courseId: courses[1].id,
      type: "Prerequisite" as const,
      validationType: "Sequential" as const,
      requisiteCourseId: courses[0].id,
      requisiteText: null,
      contentReview: "College algebra skills are required for calculus.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: stableDemoId(11_002),
      courseId: courses[5].id,
      type: "Prerequisite" as const,
      validationType: "Content Review" as const,
      requisiteCourseId: courses[4].id,
      requisiteText: null,
      contentReview: "Introductory programming proficiency is required.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  const workflowHistory = Array.from({ length: 5 }, (_, index) => {
    const course = courses[index + 1];
    return {
      id: stableDemoId(12_001 + index),
      entityType: "Course" as const,
      entityId: course.id,
      fromStatus: index === 0 ? "Draft" : statuses[index - 1],
      toStatus: course.status,
      comment: index === 3 ? "Articulation review completed." : null,
      changedBy: actors[Math.min(index, actors.length - 1)].id,
      createdAt: course.updatedAt,
    };
  });

  const comments = Array.from({ length: 3 }, (_, index) => ({
    id: stableDemoId(13_001 + index),
    entityType: "Course" as const,
    entityId: courses[index + 1].id,
    authorId: actors[(index + 1) % actors.length].id,
    section: ["Catalog Description", "SLOs", "Course Content"][index],
    content: [
      "Clarify the audience and expected preparation.",
      "Consider a measurable verb in the second outcome.",
      "The content sequence now aligns with the stated outcomes.",
    ][index],
    resolved: index === 2,
    resolvedAt: index === 2 ? atDaysAgo(now, 1) : null,
    createdAt: atDaysAgo(now, 3 - index),
    updatedAt: atDaysAgo(now, 3 - index),
  }));

  const notifications = Array.from({ length: 7 }, (_, index) => ({
    id: stableDemoId(14_001 + index),
    actorId: actors[index % actors.length].id,
    type: (["submission", "approval", "return", "comment", "assignment", "system"] as const)[
      index % 6
    ],
    title: [
      "Course submitted",
      "Course approved",
      "Revision requested",
      "New review comment",
      "Review assigned",
      "Demo data is local",
      "Course submitted",
    ][index],
    message: `Demo notification ${index + 1}.`,
    entityType: index === 5 ? null : ("Course" as const),
    entityId: index === 5 ? null : courses[index].id,
    readAt: index < 2 ? atDaysAgo(now, 1) : null,
    createdAt: atDaysAgo(now, index),
  }));

  const ccnJustifications = [
    {
      id: stableDemoId(15_001),
      courseId: courses[17].id,
      ccnCode: "ANTH C1001",
      justification:
        "This local cultural anthropology course has a distinct scope from the biological anthropology template.",
      evidence: ["Local transfer agreement", "Department content comparison"],
      createdBy: actors[1].id,
      createdAt: atDaysAgo(now, 4),
      updatedAt: atDaysAgo(now, 4),
    },
  ];

  const records = {
    actors,
    divisions,
    departments,
    topCodes,
    ccnStandards,
    courses,
    slos,
    content,
    requisites,
    programs,
    programCourses: programCourseRecords,
    workflowHistory,
    comments,
    notifications,
    ccnJustifications,
    aiConversations: [],
    aiArtifacts: [],
  };
  const fixtureHash = computeFixtureHash(records);
  return DomainSnapshotSchema.parse({
    meta: {
      id: "demo",
      schemaVersion: DEMO_SCHEMA_VERSION,
      seedVersion: DEMO_SEED_VERSION,
      referenceVersion: REFERENCE_VERSION,
      appVersion: DEMO_APP_VERSION,
      fixtureHash,
      initializedAt: timestamp,
      lastResetAt: timestamp,
      activeActorId: actors[0].id,
    },
    ...records,
  });
}
