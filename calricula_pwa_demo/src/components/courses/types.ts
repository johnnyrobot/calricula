export type CourseStatus =
  | 'Draft'
  | 'Department Review'
  | 'Curriculum Committee'
  | 'Articulation Review'
  | 'Approved';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export type BloomLevel =
  | 'Remember'
  | 'Understand'
  | 'Apply'
  | 'Analyze'
  | 'Evaluate'
  | 'Create';

export interface CourseDepartment {
  id: string;
  code: string;
  name: string;
}

export interface CourseSLO {
  id: string;
  sequence: number;
  outcomeText: string;
  bloomLevel: BloomLevel | '';
  performanceCriteria?: string;
}

export interface CourseContentItem {
  id: string;
  sequence: number;
  topic: string;
  subtopics: string[];
  hours: string;
  linkedSloIds: string[];
}

export type RequisiteType = 'Prerequisite' | 'Corequisite' | 'Advisory';

export interface CourseRequisite {
  id: string;
  type: RequisiteType;
  validationType?:
    | 'Content Review'
    | 'Statutory'
    | 'Sequential'
    | 'Health/Safety'
    | 'Recency'
    | 'Other';
  courseId?: string;
  courseCode?: string;
  courseTitle?: string;
  text?: string;
  contentReview?: string;
  circularDependency?: string;
}

export interface CourseComment {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  section: string;
  resolved?: boolean;
  createdAt: string;
}

export interface CourseHistoryEntry {
  id: string;
  action: string;
  actorName: string;
  detail: string;
  createdAt: string;
}

export type CCNDisposition = 'unreviewed' | 'adopted' | 'non-match';

export interface CourseViewModel {
  id: string;
  subjectCode: string;
  courseNumber: string;
  title: string;
  departmentId: string;
  departmentName: string;
  catalogDescription: string;
  units: string;
  lectureHours: string;
  labHours: string;
  activityHours: string;
  tbaHours: string;
  outsideHours: string;
  totalStudentHours: string;
  status: CourseStatus;
  version: number;
  effectiveTerm: string;
  topCode: string;
  cId: string;
  ccnCode: string;
  ccnCandidateCode: string;
  ccnDisposition: CCNDisposition;
  ccnJustification: string;
  slos: CourseSLO[];
  contentItems: CourseContentItem[];
  requisites: CourseRequisite[];
  comments: CourseComment[];
  history: CourseHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface CourseCreateValues {
  subjectCode: string;
  courseNumber: string;
  title: string;
  departmentId: string;
}

export interface ComplianceResultView {
  ruleId: string;
  ruleName: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  section: string;
  citation?: string;
  recommendation?: string;
}

export interface ComplianceAuditView {
  overallStatus: 'pass' | 'warn' | 'fail';
  complianceScore: number;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ComplianceResultView[];
}

export interface CourseListFilters {
  query: string;
  status: CourseStatus | 'All';
}

export interface CCNMatchView {
  standardId: string;
  ccnCode: string;
  title: string;
  minimumUnits: string;
  confidenceScore: number;
  matchReasons: string[];
  impliedTopCode?: string;
}

export interface CourseEditorPatch {
  title?: string;
  departmentId?: string;
  catalogDescription?: string;
  units?: string;
  lectureHours?: string;
  labHours?: string;
  activityHours?: string;
  tbaHours?: string;
  outsideHours?: string;
  totalStudentHours?: string;
  effectiveTerm?: string;
  topCode?: string;
  ccnCode?: string;
  ccnCandidateCode?: string;
  ccnDisposition?: CCNDisposition;
  ccnJustification?: string;
  slos?: CourseSLO[];
  contentItems?: CourseContentItem[];
  requisites?: CourseRequisite[];
}
