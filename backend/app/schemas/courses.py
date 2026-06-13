"""
Course Pydantic schemas.

Request and response schemas for course-related API endpoints.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.course import CourseStatus, BloomLevel, RequisiteType
from app.schemas.departments import DepartmentInfo


# =============================================================================
# SLO Schemas
# =============================================================================

class SLOBase(BaseModel):
    """Base SLO fields."""
    outcome_text: str = Field(description="The learning outcome text", min_length=10)
    bloom_level: BloomLevel = Field(default=BloomLevel.APPLY, description="Bloom's taxonomy level")
    performance_criteria: Optional[str] = Field(None, description="Performance criteria for assessment")


class SLOCreate(SLOBase):
    """Schema for creating a new SLO."""
    sequence: int = Field(default=1, ge=1, description="Display order sequence")


class SLOUpdate(BaseModel):
    """Schema for updating an SLO."""
    sequence: Optional[int] = Field(None, ge=1)
    outcome_text: Optional[str] = Field(None, min_length=10)
    bloom_level: Optional[BloomLevel] = None
    performance_criteria: Optional[str] = None


class SLOResponse(SLOBase):
    """SLO response schema."""
    id: uuid.UUID
    sequence: int
    created_at: datetime

    class Config:
        from_attributes = True


class SLOItem(BaseModel):
    """SLO item for course detail (minimal fields)."""
    id: uuid.UUID
    sequence: int
    outcome_text: str
    bloom_level: str
    performance_criteria: Optional[str] = None

    class Config:
        from_attributes = True


# =============================================================================
# Content Outline Schemas
# =============================================================================

class ContentBase(BaseModel):
    """Base content outline fields."""
    topic: str = Field(description="Main topic heading", min_length=1)
    subtopics: List[str] = Field(default=[], description="List of subtopics")
    hours_allocated: Decimal = Field(default=Decimal("0"), ge=0, description="Hours allocated to this topic")
    linked_slos: List[str] = Field(default=[], description="List of linked SLO IDs")


class ContentCreate(ContentBase):
    """Schema for creating course content."""
    sequence: int = Field(default=1, ge=1, description="Display order sequence")


class ContentUpdate(BaseModel):
    """Schema for updating course content."""
    sequence: Optional[int] = Field(None, ge=1)
    topic: Optional[str] = Field(None, min_length=1)
    subtopics: Optional[List[str]] = None
    hours_allocated: Optional[Decimal] = Field(None, ge=0)
    linked_slos: Optional[List[str]] = None


class ContentResponse(ContentBase):
    """Content outline response schema."""
    id: uuid.UUID
    sequence: int
    created_at: datetime

    class Config:
        from_attributes = True


class ContentItem(BaseModel):
    """Content item for course detail."""
    id: uuid.UUID
    sequence: int
    topic: str
    subtopics: List[str]
    hours_allocated: Decimal
    linked_slos: List[str]

    class Config:
        from_attributes = True


# =============================================================================
# Requisite Schemas
# =============================================================================

class RequisiteCourseInfo(BaseModel):
    """Minimal course info for requisite display."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str


class RequisiteBase(BaseModel):
    """Base requisite fields."""
    type: RequisiteType = Field(description="Type of requisite")
    requisite_course_id: Optional[uuid.UUID] = Field(None, description="Related course ID")
    requisite_text: Optional[str] = Field(None, description="Free-text requisite description")
    content_review: Optional[str] = Field(None, description="Content review justification")


class RequisiteCreate(RequisiteBase):
    """Schema for creating a course requisite."""
    pass


class RequisiteUpdate(BaseModel):
    """Schema for updating a requisite."""
    type: Optional[RequisiteType] = None
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_text: Optional[str] = None
    content_review: Optional[str] = None


class RequisiteResponse(RequisiteBase):
    """Requisite response schema."""
    id: uuid.UUID
    requisite_course: Optional[RequisiteCourseInfo] = None

    class Config:
        from_attributes = True


class RequisiteItem(BaseModel):
    """Requisite item for course detail."""
    id: uuid.UUID
    type: str
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_course: Optional[RequisiteCourseInfo] = None
    requisite_text: Optional[str] = None
    content_review: Optional[str] = None

    class Config:
        from_attributes = True


# =============================================================================
# Course Schemas
# =============================================================================

class CourseBase(BaseModel):
    """Base course fields for creation and updates."""
    subject_code: str = Field(description="Subject code (e.g., 'MATH')", min_length=1, max_length=10)
    course_number: str = Field(description="Course number (e.g., '101')", min_length=1, max_length=10)
    title: str = Field(description="Course title", min_length=3, max_length=200)
    catalog_description: Optional[str] = Field(None, description="Course catalog description")
    units: Decimal = Field(default=Decimal("3.0"), ge=0, le=20, description="Course units")
    lecture_hours: int = Field(default=0, ge=0, description="Weekly lecture hours")
    lab_hours: int = Field(default=0, ge=0, description="Weekly lab hours")
    activity_hours: int = Field(default=0, ge=0, description="Weekly activity hours")
    tba_hours: int = Field(default=0, ge=0, description="TBA hours")
    homework_hours: int = Field(default=0, ge=0, description="Expected homework hours")
    total_student_hours: int = Field(default=0, ge=0, description="Total student learning hours")
    effective_term: Optional[str] = Field(None, description="Effective term (e.g., 'Fall 2025')")
    ccn_id: Optional[str] = Field(None, description="C-ID alignment identifier")


class CourseCreateRequest(CourseBase):
    """Schema for creating a new course."""
    department_id: uuid.UUID = Field(description="Department ID")
    cb_codes: Dict[str, Any] = Field(default={}, description="California Basic codes")
    transferability: Dict[str, Any] = Field(default={}, description="Transfer articulation")
    ge_applicability: Dict[str, Any] = Field(default={}, description="GE applicability")

    @field_validator('subject_code')
    @classmethod
    def uppercase_subject_code(cls, v: str) -> str:
        return v.upper()


class CourseUpdateRequest(BaseModel):
    """Schema for updating a course."""
    subject_code: Optional[str] = Field(None, min_length=1, max_length=10)
    course_number: Optional[str] = Field(None, min_length=1, max_length=10)
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    catalog_description: Optional[str] = None
    units: Optional[Decimal] = Field(None, ge=0, le=20)
    lecture_hours: Optional[int] = Field(None, ge=0)
    lab_hours: Optional[int] = Field(None, ge=0)
    activity_hours: Optional[int] = Field(None, ge=0)
    tba_hours: Optional[int] = Field(None, ge=0)
    homework_hours: Optional[int] = Field(None, ge=0)
    total_student_hours: Optional[int] = Field(None, ge=0)
    effective_term: Optional[str] = None
    ccn_id: Optional[str] = None
    cb_codes: Optional[Dict[str, Any]] = None
    transferability: Optional[Dict[str, Any]] = None
    ge_applicability: Optional[Dict[str, Any]] = None

    @field_validator('subject_code')
    @classmethod
    def uppercase_subject_code(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


class CourseListItem(BaseModel):
    """Course item for list view (minimal data for performance)."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    status: CourseStatus
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    """Paginated response for course list."""
    items: List[CourseListItem]
    total: int = Field(description="Total number of courses matching filters")
    page: int = Field(ge=1, description="Current page number")
    limit: int = Field(ge=1, description="Items per page")
    pages: int = Field(ge=0, description="Total number of pages")


class CourseDetailResponse(BaseModel):
    """Full course detail including SLOs and content."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    catalog_description: Optional[str]
    units: Decimal
    lecture_hours: int
    lab_hours: int
    activity_hours: int
    tba_hours: int
    outside_of_class_hours: int
    total_student_learning_hours: int
    status: CourseStatus
    version: int
    effective_term: Optional[str]
    ccn_id: Optional[str]
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    cb_codes: Dict[str, Any]
    transferability: Dict[str, Any]
    ge_applicability: Dict[str, Any]
    # LMI (Labor Market Information) fields
    lmi_data: Dict[str, Any] = {}
    lmi_soc_code: Optional[str] = None
    lmi_occupation_title: Optional[str] = None
    lmi_wage_data: Optional[Dict[str, Any]] = None
    lmi_projection_data: Optional[Dict[str, Any]] = None
    lmi_narrative: Optional[str] = None
    lmi_retrieved_at: Optional[datetime] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]
    slos: List[SLOItem] = []
    content_items: List[ContentItem] = []
    requisites: List[RequisiteItem] = []

    class Config:
        from_attributes = True


class CourseDuplicateRequest(BaseModel):
    """Request to duplicate/version a course."""
    reason: Optional[str] = Field(None, description="Reason for creating new version")


class CourseDuplicateResponse(BaseModel):
    """Response after duplicating a course."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    version: int
    status: CourseStatus
    message: str = Field(description="Success message")
