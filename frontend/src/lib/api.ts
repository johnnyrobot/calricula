/**
 * API Client for Calricula Backend
 *
 * Provides typed fetch functions for all API endpoints.
 * Handles authentication headers and error responses.
 */

// API Base URL - use environment variable or default
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// =============================================================================
// Types
// =============================================================================

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface CourseListItem {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  status: CourseStatus;
  department_id: string;
  department: Department | null;
  ccn_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseListResponse {
  items: CourseListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export type CourseStatus =
  | 'Draft'
  | 'DeptReview'
  | 'CurriculumCommittee'
  | 'ArticulationReview'
  | 'Approved';

export interface SLOItem {
  id: string;
  sequence: number;
  outcome_text: string;
  bloom_level: string;
  performance_criteria: string | null;
}

export interface ContentItem {
  id: string;
  sequence: number;
  topic: string;
  subtopics: string[];
  hours_allocated: number;
  linked_slos: string[];
}

export type RequisiteType = 'Prerequisite' | 'Corequisite' | 'Advisory';

// Title 5 § 55003 compliance validation types
export type RequisiteValidationType =
  | 'ContentReview'   // Skills/knowledge from prerequisite directly apply
  | 'Statutory'       // Required by law
  | 'Sequential'      // Part of course sequence
  | 'HealthSafety'    // Safety requirements
  | 'Recency'         // Knowledge currency
  | 'Other';          // Other validation method

export interface RequisiteCourseInfo {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
}

export interface RequisiteItem {
  id: string;
  type: RequisiteType;
  validation_type: RequisiteValidationType | null;
  requisite_course_id: string | null;
  requisite_course: RequisiteCourseInfo | null;
  requisite_text: string | null;
  content_review: string | null;
}

export interface CourseDetail {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  catalog_description: string | null;

  // Units - support variable unit courses
  units: number;
  minimum_units: number | null;
  maximum_units: number | null;

  // Hours breakdown (aligned with eLumen structure)
  lecture_hours: number;
  lab_hours: number;
  activity_hours: number;
  tba_hours: number;
  outside_of_class_hours: number;
  total_student_learning_hours: number;

  // Classification
  top_code: string | null;
  status: CourseStatus;
  version: number;
  effective_term: string | null;
  ccn_id: string | null;
  ccn_justification: Record<string, unknown> | null;

  // eLumen tracking
  elumen_id: number | null;

  department_id: string;
  department: Department | null;
  cb_codes: Record<string, unknown>;
  transferability: Record<string, unknown>;
  ge_applicability: Record<string, unknown>;
  // LMI (Labor Market Information) fields
  lmi_data: Record<string, unknown> | null;
  lmi_soc_code: string | null;
  lmi_occupation_title: string | null;
  lmi_wage_data: Record<string, unknown> | null;
  lmi_projection_data: Record<string, unknown> | null;
  lmi_narrative: string | null;
  lmi_retrieved_at: string | null;
  created_by: string;
  creator_email?: string;  // For ownership checks
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  slos: SLOItem[];
  content_items: ContentItem[];
  requisites: RequisiteItem[];
}

export interface CourseCreateData {
  subject_code: string;
  course_number: string;
  title: string;
  department_id: string;
  catalog_description?: string;
  units?: number;
  minimum_units?: number;
  maximum_units?: number;
  lecture_hours?: number;
  lab_hours?: number;
  activity_hours?: number;
  tba_hours?: number;
  outside_of_class_hours?: number;
  total_student_learning_hours?: number;
  top_code?: string;
  effective_term?: string;
  ccn_id?: string;
  cb_codes?: Record<string, unknown>;
  transferability?: Record<string, unknown>;
  ge_applicability?: Record<string, unknown>;
}

// Update type allows null values for fields that can be cleared
export interface CourseUpdateData {
  subject_code?: string;
  course_number?: string;
  title?: string;
  department_id?: string;
  catalog_description?: string | null;
  units?: number;
  minimum_units?: number | null;
  maximum_units?: number | null;
  lecture_hours?: number;
  lab_hours?: number;
  activity_hours?: number;
  tba_hours?: number;
  outside_of_class_hours?: number;
  total_student_learning_hours?: number;
  top_code?: string | null;
  effective_term?: string | null;
  ccn_id?: string | null;
  ccn_justification?: Record<string, unknown> | null;
  cb_codes?: Record<string, unknown>;
  transferability?: Record<string, unknown>;
  ge_applicability?: Record<string, unknown>;
  // LMI (Labor Market Information) fields
  lmi_data?: Record<string, unknown> | null;
  lmi_soc_code?: string | null;
  lmi_occupation_title?: string | null;
  lmi_wage_data?: Record<string, unknown> | null;
  lmi_projection_data?: Record<string, unknown> | null;
  lmi_narrative?: string | null;
  lmi_retrieved_at?: string | null;
}

export interface CourseDuplicateResponse {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  version: number;
  status: CourseStatus;
  message: string;
}

export interface CourseSearchItem {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  status: CourseStatus;
  department_id: string;
  department_name: string | null;
  department_code: string | null;
}

export interface CourseSearchResponse {
  items: CourseSearchItem[];
  total: number;
}

export interface APIError {
  detail: string;
}

// =============================================================================
// Approval Types
// =============================================================================

export interface SubmitterInfo {
  id: string;
  full_name: string;
  email: string;
}

export interface ApprovalQueueItem {
  id: string;
  entity_type: string;
  subject_code: string;
  course_number: string;
  title: string;
  status: CourseStatus;
  department: Department | null;
  submitter: SubmitterInfo | null;
  submitted_at: string;
  updated_at: string;
}

export interface ApprovalQueueResponse {
  items: ApprovalQueueItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApprovalCountsResponse {
  pending_my_review: number;
  all_pending: number;
  recently_reviewed: number;
}

export interface StatusTransitionRequest {
  new_status: CourseStatus;
  comment?: string;
}

export interface StatusTransitionResponse {
  id: string;
  old_status: CourseStatus;
  new_status: CourseStatus;
  comment: string | null;
  changed_by: string;
  changed_at: string;
}

export interface WorkflowHistoryUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface WorkflowHistoryItem {
  id: string;
  entity_type: 'Course' | 'Program';
  entity_id: string;
  from_status: string;
  to_status: string;
  comment: string | null;
  changed_by: string;
  user: WorkflowHistoryUser | null;
  created_at: string;
}

// Legacy alias for backward compatibility
export interface WorkflowHistoryResponse {
  items: WorkflowHistoryItem[];
}

export interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  division_id: string | null;
  division: { id: string; name: string } | null;
}

export interface DepartmentListResponse {
  items: DepartmentItem[];
  total: number;
}

export interface DepartmentCourseItem {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCoursesResponse {
  items: DepartmentCourseItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// =============================================================================
// Program Types
// =============================================================================

export type ProgramType = 'AA' | 'AS' | 'AAT' | 'AST' | 'Certificate' | 'ADT';
export type ProgramStatus = 'Draft' | 'Review' | 'Approved';

export interface ProgramListItem {
  id: string;
  title: string;
  type: ProgramType;
  total_units: number;
  status: ProgramStatus;
  department_id: string;
  department: Department | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramListResponse {
  items: ProgramListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CourseInProgram {
  id: string;
  course_id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  requirement_type: 'RequiredCore' | 'ListA' | 'ListB' | 'GE';
  sequence: number;
  units_applied: number;
}

export interface ProgramDetail {
  id: string;
  title: string;
  type: ProgramType;
  catalog_description: string | null;
  total_units: number;
  status: ProgramStatus;
  top_code: string | null;
  cip_code: string | null;
  program_narrative: string | null;
  is_high_unit_major: boolean;
  department_id: string;
  department: Department | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  courses: CourseInProgram[];
}

export interface ProgramCreateData {
  title: string;
  type: ProgramType;
  department_id: string;
  catalog_description?: string;
  total_units?: number;
  top_code?: string;
  cip_code?: string;
}

export interface ProgramUpdateData {
  title?: string;
  type?: ProgramType;
  catalog_description?: string;
  total_units?: number;
  top_code?: string;
  cip_code?: string;
  program_narrative?: string;
  is_high_unit_major?: boolean;
}

// =============================================================================
// Dashboard Types
// =============================================================================

export interface DashboardStatsResponse {
  my_drafts: number;
  pending_review: number;
  recently_approved: number;
}

export type DashboardActivityType = 'created' | 'submitted' | 'approved' | 'updated' | 'returned';

export interface DashboardActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: DashboardActivityType;
  course_id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
}

export interface DashboardActivityResponse {
  items: DashboardActivityItem[];
  total: number;
  has_more: boolean;
}

export type StaleItemUrgency = 'warning' | 'critical';
export type StaleItemCategory = 'stale_draft' | 'stale_review';

export interface StaleItem {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  status: string;
  updated_at: string;
  days_stale: number;
  urgency: StaleItemUrgency;
  category: StaleItemCategory;
}

export interface StaleItemsResponse {
  stale_drafts: StaleItem[];
  stale_reviews: StaleItem[];
  total_count: number;
}

export interface CoursesByStatusItem {
  status: string;
  count: number;
  percentage: number;
}

export interface DepartmentAnalyticsResponse {
  department_id: string | null;
  department_name: string | null;
  total_courses: number;
  courses_by_status: CoursesByStatusItem[];
  approval_rate: number;
  avg_review_days: number | null;
  period_comparison: Record<string, unknown> | null;
}

// =============================================================================
// API Client
// =============================================================================

class APIClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      // Handle FastAPI validation errors (detail can be an array)
      let errorMessage: string;
      if (Array.isArray(error.detail)) {
        // FastAPI validation error format: [{loc: [...], msg: "...", type: "..."}]
        errorMessage = error.detail.map((e: { msg: string; loc?: string[] }) => e.msg).join(', ');
      } else if (typeof error.detail === 'string') {
        errorMessage = error.detail;
      } else if (error.detail) {
        errorMessage = JSON.stringify(error.detail);
      } else {
        errorMessage = `HTTP ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ==========================================================================
  // Courses API
  // ==========================================================================

  async listCourses(params?: {
    department?: string;
    status?: CourseStatus;
    search?: string;
    created_by?: string;
    mine?: boolean;
    page?: number;
    limit?: number;
  }): Promise<CourseListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set('department', params.department);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.created_by) searchParams.set('created_by', params.created_by);
    if (params?.mine) searchParams.set('mine', 'true');
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const path = `/api/courses${query ? `?${query}` : ''}`;
    return this.request<CourseListResponse>(path);
  }

  async getCourse(id: string): Promise<CourseDetail> {
    return this.request<CourseDetail>(`/api/courses/${id}`);
  }

  async createCourse(data: CourseCreateData): Promise<CourseDetail> {
    return this.request<CourseDetail>('/api/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCourse(id: string, data: CourseUpdateData): Promise<CourseDetail> {
    return this.request<CourseDetail>(`/api/courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCourse(id: string): Promise<void> {
    await this.request<void>(`/api/courses/${id}`, {
      method: 'DELETE',
    });
  }

  async duplicateCourse(id: string): Promise<CourseDuplicateResponse> {
    return this.request<CourseDuplicateResponse>(`/api/courses/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async searchCourses(params: {
    q: string;
    exclude_id?: string;
    status?: CourseStatus;
    limit?: number;
  }): Promise<CourseSearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.exclude_id) searchParams.set('exclude_id', params.exclude_id);
    if (params.status) searchParams.set('status', params.status);
    if (params.limit) searchParams.set('limit', params.limit.toString());

    return this.request<CourseSearchResponse>(`/api/courses/search?${searchParams.toString()}`);
  }

  // ==========================================================================
  // Course Requisites API
  // ==========================================================================

  async listCourseRequisites(courseId: string): Promise<RequisiteItem[]> {
    return this.request<RequisiteItem[]>(`/api/courses/${courseId}/requisites`);
  }

  async createCourseRequisite(
    courseId: string,
    data: {
      type: RequisiteType;
      validation_type?: RequisiteValidationType;
      requisite_course_id?: string;
      requisite_text?: string;
      content_review?: string;
    }
  ): Promise<RequisiteItem> {
    return this.request<RequisiteItem>(`/api/courses/${courseId}/requisites`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCourseRequisite(
    courseId: string,
    requisiteId: string,
    data: {
      type?: RequisiteType;
      validation_type?: RequisiteValidationType;
      requisite_course_id?: string;
      requisite_text?: string;
      content_review?: string;
    }
  ): Promise<RequisiteItem> {
    return this.request<RequisiteItem>(
      `/api/courses/${courseId}/requisites/${requisiteId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async deleteCourseRequisite(courseId: string, requisiteId: string): Promise<void> {
    await this.request<void>(
      `/api/courses/${courseId}/requisites/${requisiteId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ==========================================================================
  // Departments API
  // ==========================================================================

  async listDepartments(params?: {
    division_id?: string;
  }): Promise<DepartmentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.division_id) searchParams.set('division_id', params.division_id);

    const query = searchParams.toString();
    const path = `/api/departments${query ? `?${query}` : ''}`;
    return this.request<DepartmentListResponse>(path);
  }

  async listDepartmentCourses(
    departmentId: string,
    params?: {
      status?: CourseStatus;
      page?: number;
      limit?: number;
    }
  ): Promise<DepartmentCoursesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const path = `/api/departments/${departmentId}/courses${query ? `?${query}` : ''}`;
    return this.request<DepartmentCoursesResponse>(path);
  }

  // ==========================================================================
  // Auth API (for reference)
  // ==========================================================================

  async checkAuth(): Promise<{ authenticated: boolean; user?: unknown }> {
    return this.request('/api/auth/check');
  }

  // ==========================================================================
  // Approvals API
  // ==========================================================================

  async getApprovalCounts(): Promise<ApprovalCountsResponse> {
    return this.request<ApprovalCountsResponse>('/api/approvals/counts');
  }

  async listPendingApprovals(params?: {
    tab?: 'my_review' | 'all_pending' | 'recently_reviewed';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApprovalQueueResponse> {
    const searchParams = new URLSearchParams();
    if (params?.tab) searchParams.set('tab', params.tab);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const path = `/api/approvals/pending${query ? `?${query}` : ''}`;
    return this.request<ApprovalQueueResponse>(path);
  }

  async transitionCourseStatus(
    courseId: string,
    data: StatusTransitionRequest
  ): Promise<StatusTransitionResponse> {
    return this.request<StatusTransitionResponse>(`/api/approvals/${courseId}/transition`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWorkflowHistory(
    entityType: 'Course' | 'Program',
    entityId: string
  ): Promise<WorkflowHistoryItem[]> {
    return this.request<WorkflowHistoryItem[]>(`/api/workflow/history/${entityType}/${entityId}`);
  }

  // Legacy method for backward compatibility
  async getCourseWorkflowHistory(courseId: string): Promise<WorkflowHistoryItem[]> {
    return this.getWorkflowHistory('Course', courseId);
  }

  // ==========================================================================
  // Programs API
  // ==========================================================================

  async listPrograms(params?: {
    department?: string;
    type?: ProgramType;
    status?: ProgramStatus;
    search?: string;
    created_by?: string;
    page?: number;
    limit?: number;
  }): Promise<ProgramListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set('department', params.department);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.created_by) searchParams.set('created_by', params.created_by);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const path = `/api/programs${query ? `?${query}` : ''}`;
    return this.request<ProgramListResponse>(path);
  }

  async getProgram(id: string): Promise<ProgramDetail> {
    return this.request<ProgramDetail>(`/api/programs/${id}`);
  }

  async createProgram(data: ProgramCreateData): Promise<ProgramDetail> {
    return this.request<ProgramDetail>('/api/programs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProgram(id: string, data: ProgramUpdateData): Promise<ProgramDetail> {
    return this.request<ProgramDetail>(`/api/programs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProgram(id: string): Promise<void> {
    await this.request<void>(`/api/programs/${id}`, {
      method: 'DELETE',
    });
  }

  async addCourseToProgram(
    programId: string,
    courseId: string,
    requirementType: 'RequiredCore' | 'ListA' | 'ListB' | 'GE' = 'RequiredCore',
    unitsApplied?: number
  ): Promise<CourseInProgram> {
    return this.request<CourseInProgram>(`/api/programs/${programId}/courses`, {
      method: 'POST',
      body: JSON.stringify({
        course_id: courseId,
        requirement_type: requirementType,
        units_applied: unitsApplied,
      }),
    });
  }

  async removeCourseFromProgram(programId: string, programCourseId: string): Promise<void> {
    await this.request<void>(`/api/programs/${programId}/courses/${programCourseId}`, {
      method: 'DELETE',
    });
  }

  async updateCourseInProgram(
    programId: string,
    programCourseId: string,
    data: {
      requirement_type?: 'RequiredCore' | 'ListA' | 'ListB' | 'GE';
      units_applied?: number;
      sequence?: number;
    }
  ): Promise<CourseInProgram> {
    return this.request<CourseInProgram>(`/api/programs/${programId}/courses/${programCourseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async reorderCoursesInProgram(
    programId: string,
    requirementType: 'RequiredCore' | 'ListA' | 'ListB' | 'GE',
    courses: Array<{ program_course_id: string; sequence: number }>
  ): Promise<CourseInProgram[]> {
    return this.request<CourseInProgram[]>(`/api/programs/${programId}/courses/reorder`, {
      method: 'PUT',
      body: JSON.stringify({
        requirement_type: requirementType,
        courses,
      }),
    });
  }

  async getProgramCourses(
    programId: string,
    requirementType?: 'RequiredCore' | 'ListA' | 'ListB' | 'GE'
  ): Promise<CourseInProgram[]> {
    const query = requirementType ? `?requirement_type=${requirementType}` : '';
    return this.request<CourseInProgram[]>(`/api/programs/${programId}/courses${query}`);
  }

  // ==========================================================================
  // AI Assistant API
  // ==========================================================================

  async chatWithAI(
    message: string,
    history?: AIMessage[],
    courseContext?: AICourseContext
  ): Promise<AIResponse> {
    return this.request<AIResponse>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        history: history?.map(m => ({ role: m.role, content: m.content })),
        course_context: courseContext,
      }),
    });
  }

  async suggestCatalogDescription(data: {
    course_title: string;
    subject_code: string;
    course_number: string;
    units: number;
    existing_description?: string;
    slos?: string[];
  }): Promise<AIResponse> {
    return this.request<AIResponse>('/api/ai/suggest/catalog-description', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async suggestSLOs(data: {
    course_title: string;
    subject_code: string;
    catalog_description?: string;
    existing_slos?: string[];
    num_suggestions?: number;
  }): Promise<AIResponse> {
    return this.request<AIResponse>('/api/ai/suggest/slos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async suggestContentOutline(data: {
    course_title: string;
    subject_code: string;
    contact_hours: number;
    catalog_description?: string;
    slos?: string[];
    textbook_info?: string;
    num_topics?: number;
  }): Promise<ContentOutlineResponse> {
    return this.request<ContentOutlineResponse>('/api/ai/suggest/content-outline', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async explainCompliance(
    issueType: string,
    context: Record<string, unknown>
  ): Promise<AIResponse> {
    return this.request<AIResponse>('/api/ai/explain/compliance', {
      method: 'POST',
      body: JSON.stringify({
        issue_type: issueType,
        context,
      }),
    });
  }

  async suggestTOPCode(data: {
    course_title: string;
    course_description?: string;
  }): Promise<TOPCodeSuggestionResponse> {
    return this.request<TOPCodeSuggestionResponse>('/api/ai/suggest/top-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async suggestProgramNarrative(data: ProgramNarrativeRequest): Promise<ProgramNarrativeResponse> {
    return this.request<ProgramNarrativeResponse>('/api/ai/suggest/program-narrative', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async checkAIHealth(): Promise<{ status: string; service?: string; error?: string }> {
    return this.request('/api/ai/health');
  }

  // ==========================================================================
  // Course Comparison API
  // ==========================================================================

  async compareCourses(
    sourceId: string,
    targetId: string
  ): Promise<CourseCompareResponse> {
    return this.request<CourseCompareResponse>(
      `/api/courses/${sourceId}/compare/${targetId}`
    );
  }

  async getCourseVersions(courseId: string): Promise<CourseListItem[]> {
    return this.request<CourseListItem[]>(`/api/courses/${courseId}/versions`);
  }

  // ==========================================================================
  // Workflow Comments API
  // ==========================================================================

  async listComments(params?: {
    entity_type?: EntityType;
    entity_id?: string;
    section?: string;
    resolved?: boolean;
    page?: number;
    limit?: number;
  }): Promise<CommentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.entity_type) searchParams.set('entity_type', params.entity_type);
    if (params?.entity_id) searchParams.set('entity_id', params.entity_id);
    if (params?.section) searchParams.set('section', params.section);
    if (params?.resolved !== undefined) searchParams.set('resolved', params.resolved.toString());
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const path = `/api/workflow/comments${query ? `?${query}` : ''}`;
    return this.request<CommentListResponse>(path);
  }

  async getCourseComments(
    courseId: string,
    params?: { section?: string; resolved?: boolean }
  ): Promise<WorkflowComment[]> {
    const searchParams = new URLSearchParams();
    if (params?.section) searchParams.set('section', params.section);
    if (params?.resolved !== undefined) searchParams.set('resolved', params.resolved.toString());

    const query = searchParams.toString();
    const path = `/api/workflow/courses/${courseId}/comments${query ? `?${query}` : ''}`;
    return this.request<WorkflowComment[]>(path);
  }

  async createComment(data: CreateCommentData): Promise<WorkflowComment> {
    return this.request<WorkflowComment>('/api/workflow/comment', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateComment(commentId: string, content: string): Promise<WorkflowComment> {
    return this.request<WorkflowComment>(`/api/workflow/comment/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async resolveComment(commentId: string): Promise<WorkflowComment> {
    return this.request<WorkflowComment>(`/api/workflow/comment/${commentId}/resolve`, {
      method: 'PATCH',
    });
  }

  async unresolveComment(commentId: string): Promise<WorkflowComment> {
    return this.request<WorkflowComment>(`/api/workflow/comment/${commentId}/unresolve`, {
      method: 'PATCH',
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.request<void>(`/api/workflow/comment/${commentId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // Document Upload API
  // ==========================================================================

  async uploadDocument(
    file: File,
    options: {
      document_type?: RAGDocumentType;
      display_name?: string;
      course_id?: string;
      department_id?: string;
    } = {}
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.document_type) {
      formData.append('document_type', options.document_type);
    }
    if (options.display_name) {
      formData.append('display_name', options.display_name);
    }
    if (options.course_id) {
      formData.append('course_id', options.course_id);
    }
    if (options.department_id) {
      formData.append('department_id', options.department_id);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  }

  async listDocuments(params?: {
    course_id?: string;
    department_id?: string;
    document_type?: RAGDocumentType;
    indexing_status?: IndexingStatus;
    page?: number;
    page_size?: number;
  }): Promise<DocumentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.course_id) searchParams.set('course_id', params.course_id);
    if (params?.department_id) searchParams.set('department_id', params.department_id);
    if (params?.document_type) searchParams.set('document_type', params.document_type);
    if (params?.indexing_status) searchParams.set('indexing_status', params.indexing_status);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());

    const query = searchParams.toString();
    const path = `/api/documents${query ? `?${query}` : ''}`;
    return this.request<DocumentListResponse>(path);
  }

  async getCourseDocuments(
    courseId: string,
    page?: number,
    pageSize?: number
  ): Promise<DocumentListResponse> {
    const searchParams = new URLSearchParams();
    if (page) searchParams.set('page', page.toString());
    if (pageSize) searchParams.set('page_size', pageSize.toString());

    const query = searchParams.toString();
    const path = `/api/documents/course/${courseId}${query ? `?${query}` : ''}`;
    return this.request<DocumentListResponse>(path);
  }

  async getDocument(documentId: string): Promise<RAGDocument> {
    return this.request<RAGDocument>(`/api/documents/${documentId}`);
  }

  async getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    return this.request<DocumentStatusResponse>(`/api/documents/${documentId}/status`);
  }

  async updateDocument(
    documentId: string,
    data: {
      display_name?: string;
      document_type?: RAGDocumentType;
    }
  ): Promise<RAGDocument> {
    return this.request<RAGDocument>(`/api/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteDocument(documentId: string): Promise<{ message: string; id: string }> {
    return this.request<{ message: string; id: string }>(`/api/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  async triggerDocumentIndexing(documentId: string): Promise<{ message: string; id: string; status: string }> {
    return this.request<{ message: string; id: string; status: string }>(`/api/documents/index/${documentId}`, {
      method: 'POST',
    });
  }

  async getDocumentTypes(): Promise<{ types: Array<{ value: string; label: string }> }> {
    return this.request<{ types: Array<{ value: string; label: string }> }>('/api/documents/types/list');
  }

  // ==========================================================================
  // Notifications API
  // ==========================================================================

  async listNotifications(params?: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
  }): Promise<Notification[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.unread_only) searchParams.set('unread_only', params.unread_only.toString());

    const query = searchParams.toString();
    const path = `/api/notifications${query ? `?${query}` : ''}`;
    return this.request<Notification[]>(path);
  }

  async getNotificationCounts(): Promise<NotificationCounts> {
    return this.request<NotificationCounts>('/api/notifications/counts');
  }

  async getNotification(id: string): Promise<Notification> {
    return this.request<Notification>(`/api/notifications/${id}`);
  }

  async markNotificationRead(id: string): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  async markNotificationUnread(id: string): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>(`/api/notifications/${id}/unread`, {
      method: 'PATCH',
    });
  }

  async markAllNotificationsRead(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>('/api/notifications/mark-all-read', {
      method: 'POST',
    });
  }

  async deleteNotification(id: string): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>(`/api/notifications/${id}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // Cross-Listing API
  // ==========================================================================

  async listCrossListings(courseId: string): Promise<CrossListingResponse[]> {
    return this.request<CrossListingResponse[]>(`/api/courses/${courseId}/cross-listings`);
  }

  async createCrossListing(
    courseId: string,
    crossListedCourseId: string
  ): Promise<CrossListingResponse> {
    return this.request<CrossListingResponse>(
      `/api/courses/${courseId}/cross-listings?cross_listed_course_id=${crossListedCourseId}`,
      { method: 'POST' }
    );
  }

  async deleteCrossListing(courseId: string, crossListingId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/courses/${courseId}/cross-listings/${crossListingId}`,
      { method: 'DELETE' }
    );
  }

  async validateCrossListing(
    courseId: string,
    targetCourseId: string
  ): Promise<CrossListingValidationResponse> {
    return this.request<CrossListingValidationResponse>(
      `/api/courses/${courseId}/cross-listings/validate/${targetCourseId}`
    );
  }

  async compareCrossListingCourses(
    courseId: string,
    targetCourseId: string
  ): Promise<DetailedComparisonResponse> {
    return this.request<DetailedComparisonResponse>(
      `/api/courses/${courseId}/cross-listings/compare/${targetCourseId}`
    );
  }

  async searchCoursesForCrossListing(
    query: string,
    excludeCourseId?: string
  ): Promise<CrossListedCourseInfo[]> {
    const params = new URLSearchParams({ query });
    if (excludeCourseId) {
      params.set('exclude_course_id', excludeCourseId);
    }
    return this.request<CrossListedCourseInfo[]>(
      `/api/courses/cross-listings/search?${params.toString()}`
    );
  }

  async syncCrossListing(
    courseId: string,
    crossListingId: string,
    options?: { sync_slos?: boolean; sync_content?: boolean; sync_units?: boolean }
  ): Promise<CrossListingSyncResponse> {
    return this.request<CrossListingSyncResponse>(
      `/api/courses/${courseId}/cross-listings/${crossListingId}/sync`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }
    );
  }

  // ==========================================================================
  // Dashboard API
  // ==========================================================================

  async getDashboardStats(): Promise<DashboardStatsResponse> {
    return this.request<DashboardStatsResponse>('/api/dashboard/stats');
  }

  async getDashboardActivity(params?: {
    limit?: number;
    offset?: number;
    activity_type?: DashboardActivityType;
  }): Promise<DashboardActivityResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    if (params?.activity_type) queryParams.set('activity_type', params.activity_type);
    const query = queryParams.toString();
    return this.request<DashboardActivityResponse>(`/api/dashboard/activity${query ? `?${query}` : ''}`);
  }

  async getStaleItems(params?: {
    draft_threshold_days?: number;
    review_threshold_days?: number;
  }): Promise<StaleItemsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.draft_threshold_days) queryParams.set('draft_threshold_days', params.draft_threshold_days.toString());
    if (params?.review_threshold_days) queryParams.set('review_threshold_days', params.review_threshold_days.toString());
    const query = queryParams.toString();
    return this.request<StaleItemsResponse>(`/api/dashboard/stale-items${query ? `?${query}` : ''}`);
  }

  async getDepartmentAnalytics(): Promise<DepartmentAnalyticsResponse> {
    return this.request<DepartmentAnalyticsResponse>('/api/dashboard/analytics');
  }
}

// =============================================================================
// AI Types
// =============================================================================

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface AICourseContext {
  course_code?: string;
  course_title?: string;
  department?: string;
  units?: number;
  current_section?: string;
  existing_slos?: string[];
  catalog_description?: string;
}

export interface AIResponse {
  text: string;
  citations: unknown[];
  success: boolean;
  error?: string;
}

export interface ContentOutlineTopic {
  sequence: number;
  title: string;
  description: string;
  hours: number;
  slo_alignment: number[];
  subtopics: string[];
}

export interface ContentOutlineResponse {
  topics: ContentOutlineTopic[];
  total_hours: number;
  raw_text?: string;
  success: boolean;
  error?: string;
}

export interface TOPCodeSuggestion {
  code: string;
  title: string;
  is_vocational: boolean;
  confidence: number;
  explanation: string;
}

export interface TOPCodeSuggestionResponse {
  suggestions: TOPCodeSuggestion[];
  raw_text?: string;
  success: boolean;
  error?: string;
}

export interface ProgramCourseForNarrative {
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
}

export interface ProgramNarrativeRequest {
  program_title: string;
  program_type: string;
  total_units: number;
  catalog_description?: string;
  courses?: ProgramCourseForNarrative[];
  department?: string;
  top_code?: string;
  is_cte?: boolean;
}

export interface ProgramNarrativeResponse {
  narrative: string;
  goals_and_objectives?: string;
  requirements_justification?: string;
  catalog_description?: string;
  labor_market_analysis?: string;
  success: boolean;
  error?: string;
}

// =============================================================================
// Workflow Comment Types
// =============================================================================

export type EntityType = 'Course' | 'Program';

export interface CommentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface WorkflowComment {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  section: string | null;
  content: string;
  resolved: boolean;
  user_id: string;
  user: CommentUser | null;
  created_at: string;
}

export interface CommentListResponse {
  items: WorkflowComment[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateCommentData {
  entity_type: EntityType;
  entity_id: string;
  section?: string;
  content: string;
}

// =============================================================================
// Course Comparison Types
// =============================================================================

export interface DiffField {
  field: string;
  label: string;
  old_value: unknown;
  new_value: unknown;
  changed: boolean;
}

export interface SLODiff {
  id: string | null;
  sequence: number;
  outcome_text: string;
  bloom_level: string;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  old_text: string | null;
}

export interface ContentDiff {
  id: string | null;
  sequence: number;
  topic: string;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  old_topic: string | null;
}

export interface CourseCompareResponse {
  source_course: Record<string, unknown>;
  target_course: Record<string, unknown>;
  basic_info_diff: DiffField[];
  slo_diff: SLODiff[];
  content_diff: ContentDiff[];
  cb_codes_diff: DiffField[];
  has_changes: boolean;
  summary: string;
}

// =============================================================================
// Document Upload Types
// =============================================================================

export type RAGDocumentType =
  | 'syllabus'
  | 'textbook'
  | 'standard'
  | 'regulation'
  | 'advisory_notes'
  | 'other';

export type IndexingStatus = 'pending' | 'indexing' | 'completed' | 'failed';

export interface RAGDocument {
  id: string;
  filename: string;
  display_name: string;
  document_type: RAGDocumentType;
  file_size_bytes: number;
  mime_type: string | null;
  indexing_status: IndexingStatus;
  file_search_document_id: string | null;
  file_search_store_name: string | null;
  department_id: string | null;
  course_id: string | null;
  uploaded_by: string;
  custom_metadata: Record<string, unknown>;
  created_at: string;
  indexed_at: string | null;
}

export interface DocumentUploadResponse {
  id: string;
  filename: string;
  display_name: string;
  document_type: RAGDocumentType;
  file_size_bytes: number;
  mime_type: string | null;
  indexing_status: IndexingStatus;
  course_id: string | null;
  created_at: string;
  message: string;
}

export interface DocumentListResponse {
  documents: RAGDocument[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentStatusResponse {
  id: string;
  filename: string;
  indexing_status: IndexingStatus;
  indexed_at: string | null;
}

// =============================================================================
// Notification Types
// =============================================================================

export type NotificationType =
  | 'course_submitted'
  | 'course_approved'
  | 'course_returned'
  | 'course_commented'
  | 'program_submitted'
  | 'program_approved'
  | 'program_returned'
  | 'program_commented'
  | 'mention'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_title: string | null;
  is_read: boolean;
  user_id: string;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationCounts {
  total: number;
  unread: number;
}

// =============================================================================
// Cross-Listing Types
// =============================================================================

export interface CrossListedCourseInfo {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  status: CourseStatus;
  department_id: string;
  department_name: string | null;
  department_code: string | null;
}

export interface CrossListingResponse {
  id: string;
  primary_course_id: string;
  cross_listed_course_id: string;
  primary_course: CrossListedCourseInfo;
  cross_listed_course: CrossListedCourseInfo;
  created_at: string;
}

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
  primary_value: string | null;
  cross_listed_value: string | null;
}

export interface CrossListingValidationResponse {
  is_valid: boolean;
  issues: ValidationIssue[];
  summary: string;
}

export interface SLOComparisonItem {
  sequence: number;
  primary_text: string;
  cross_listed_text: string | null;
  primary_bloom: string;
  cross_listed_bloom: string | null;
  matches: boolean;
}

export interface ContentComparisonItem {
  sequence: number;
  primary_topic: string;
  cross_listed_topic: string | null;
  primary_hours: number;
  cross_listed_hours: number | null;
  matches: boolean;
}

export interface DetailedComparisonResponse {
  units_match: boolean;
  primary_units: number;
  cross_listed_units: number;
  slo_comparison: SLOComparisonItem[];
  slos_match: boolean;
  content_comparison: ContentComparisonItem[];
  content_matches: boolean;
  overall_valid: boolean;
}

export interface CrossListingSyncResponse {
  success: boolean;
  message: string;
  slos_synced: number;
  content_topics_synced: number;
  units_updated: boolean;
}

// Export singleton instance
export const api = new APIClient(API_BASE_URL);

// Export types
export default api;
