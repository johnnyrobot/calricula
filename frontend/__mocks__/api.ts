/**
 * Mock API Client for testing
 *
 * Provides mock implementations of API functions for use in tests.
 * Use jest.mock('@/lib/api') to use these mocks.
 */

import type { CourseListItem, CourseListResponse, CourseDetail, Department } from '@/lib/api';

// Sample mock data
export const mockDepartment: Department = {
  id: 'dept-1',
  name: 'Mathematics',
  code: 'MATH',
};

export const mockCourseListItem: CourseListItem = {
  id: 'course-1',
  subject_code: 'MATH',
  course_number: '101',
  title: 'Introduction to Calculus',
  units: 4,
  status: 'Draft',
  department_id: 'dept-1',
  department: mockDepartment,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-15T00:00:00Z',
};

export const mockCourseListResponse: CourseListResponse = {
  items: [mockCourseListItem],
  total: 1,
  page: 1,
  limit: 12,
  pages: 1,
};

export const mockCourseDetail: CourseDetail = {
  id: 'course-1',
  subject_code: 'MATH',
  course_number: '101',
  title: 'Introduction to Calculus',
  catalog_description: 'An introduction to calculus concepts.',
  units: 4,
  minimum_units: null,
  maximum_units: null,
  lecture_hours: 3,
  lab_hours: 1,
  activity_hours: 0,
  tba_hours: 0,
  outside_of_class_hours: 8,
  total_student_learning_hours: 162,
  status: 'Draft',
  version: 1,
  effective_term: 'Fall 2025',
  top_code: '1701.00',
  ccn_id: null,
  department_id: 'dept-1',
  department: mockDepartment,
  cb_codes: {},
  transferability: { uc: true, csu: true },
  ge_applicability: {},
  slos: [],
  content: [],
  requisites: [],
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-15T00:00:00Z',
  approved_at: null,
};

// Mock API functions
export const api = {
  token: null as string | null,

  setToken: jest.fn((token: string) => {
    api.token = token;
  }),

  clearToken: jest.fn(() => {
    api.token = null;
  }),

  listCourses: jest.fn().mockResolvedValue(mockCourseListResponse),

  getCourse: jest.fn().mockResolvedValue(mockCourseDetail),

  createCourse: jest.fn().mockResolvedValue(mockCourseDetail),

  updateCourse: jest.fn().mockResolvedValue(mockCourseDetail),

  deleteCourse: jest.fn().mockResolvedValue(undefined),

  listDepartments: jest.fn().mockResolvedValue([mockDepartment]),

  getCurrentUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    email: 'test@example.com',
    display_name: 'Test User',
    role: 'Faculty',
  }),
};
