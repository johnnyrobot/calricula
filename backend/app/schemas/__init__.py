"""
Pydantic schemas module.

Centralized request/response schemas for API validation.
All schemas are organized by domain and re-exported here for convenience.
"""

# Common schemas
from app.schemas.common import (
    PaginatedResponse,
    ErrorDetail,
    ValidationErrorResponse,
    HTTPErrorResponse,
    MessageResponse,
    DeleteResponse,
    HealthCheckResponse,
)

# Department schemas
from app.schemas.departments import (
    DepartmentBase,
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentInfo,
    DepartmentResponse,
    DepartmentListItem,
    DepartmentListResponse,
)

# Course schemas
from app.schemas.courses import (
    # SLO schemas
    SLOBase,
    SLOCreate,
    SLOUpdate,
    SLOResponse,
    SLOItem,
    # Content schemas
    ContentBase,
    ContentCreate,
    ContentUpdate,
    ContentResponse,
    ContentItem,
    # Requisite schemas
    RequisiteCourseInfo,
    RequisiteBase,
    RequisiteCreate,
    RequisiteUpdate,
    RequisiteResponse,
    RequisiteItem,
    # Course schemas
    CourseBase,
    CourseCreateRequest,
    CourseUpdateRequest,
    CourseListItem,
    CourseListResponse,
    CourseDetailResponse,
    CourseDuplicateRequest,
    CourseDuplicateResponse,
)

# Program schemas
from app.schemas.programs import (
    ProgramCourseBase,
    ProgramCourseCreate,
    ProgramCourseUpdate,
    CourseInProgramItem,
    ProgramBase,
    ProgramCreateRequest,
    ProgramUpdateRequest,
    ProgramListItem,
    ProgramListResponse,
    ProgramDetailResponse,
)

# Auth schemas
from app.schemas.auth import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserResponse,
    UserProfileResponse,
    TokenVerifyRequest,
    TokenVerifyResponse,
    LoginResponse,
    CurrentUserResponse,
)

__all__ = [
    # Common
    "PaginatedResponse",
    "ErrorDetail",
    "ValidationErrorResponse",
    "HTTPErrorResponse",
    "MessageResponse",
    "DeleteResponse",
    "HealthCheckResponse",
    # Departments
    "DepartmentBase",
    "DepartmentCreate",
    "DepartmentUpdate",
    "DepartmentInfo",
    "DepartmentResponse",
    "DepartmentListItem",
    "DepartmentListResponse",
    # Courses - SLOs
    "SLOBase",
    "SLOCreate",
    "SLOUpdate",
    "SLOResponse",
    "SLOItem",
    # Courses - Content
    "ContentBase",
    "ContentCreate",
    "ContentUpdate",
    "ContentResponse",
    "ContentItem",
    # Courses - Requisites
    "RequisiteCourseInfo",
    "RequisiteBase",
    "RequisiteCreate",
    "RequisiteUpdate",
    "RequisiteResponse",
    "RequisiteItem",
    # Courses
    "CourseBase",
    "CourseCreateRequest",
    "CourseUpdateRequest",
    "CourseListItem",
    "CourseListResponse",
    "CourseDetailResponse",
    "CourseDuplicateRequest",
    "CourseDuplicateResponse",
    # Programs
    "ProgramCourseBase",
    "ProgramCourseCreate",
    "ProgramCourseUpdate",
    "CourseInProgramItem",
    "ProgramBase",
    "ProgramCreateRequest",
    "ProgramUpdateRequest",
    "ProgramListItem",
    "ProgramListResponse",
    "ProgramDetailResponse",
    # Auth
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserProfileResponse",
    "TokenVerifyRequest",
    "TokenVerifyResponse",
    "LoginResponse",
    "CurrentUserResponse",
]
