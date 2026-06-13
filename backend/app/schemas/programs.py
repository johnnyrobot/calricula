"""
Program Pydantic schemas.

Request and response schemas for program-related API endpoints.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.program import ProgramType, ProgramStatus, RequirementType
from app.schemas.departments import DepartmentInfo


# =============================================================================
# Program Course Schemas
# =============================================================================

class ProgramCourseBase(BaseModel):
    """Base program-course relationship fields."""
    course_id: uuid.UUID = Field(description="Course ID")
    requirement_type: RequirementType = Field(
        default=RequirementType.REQUIRED,
        description="Type of requirement"
    )
    sequence: int = Field(default=1, ge=1, description="Display order")
    group_name: Optional[str] = Field(None, description="Elective group name")
    units_override: Optional[Decimal] = Field(None, ge=0, description="Override course units")
    notes: Optional[str] = Field(None, description="Additional notes")


class ProgramCourseCreate(ProgramCourseBase):
    """Schema for adding a course to a program."""
    pass


class ProgramCourseUpdate(BaseModel):
    """Schema for updating a program course relationship."""
    requirement_type: Optional[RequirementType] = None
    sequence: Optional[int] = Field(None, ge=1)
    group_name: Optional[str] = None
    units_override: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class CourseInProgramItem(BaseModel):
    """Course item within a program."""
    id: uuid.UUID
    course_id: uuid.UUID
    subject_code: str
    course_number: str
    course_title: str
    units: Decimal
    requirement_type: RequirementType
    sequence: int
    group_name: Optional[str] = None
    units_override: Optional[Decimal] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# =============================================================================
# Program Schemas
# =============================================================================

class ProgramBase(BaseModel):
    """Base program fields."""
    title: str = Field(description="Program title", min_length=3, max_length=300)
    type: ProgramType = Field(description="Program type (AA, AS, Certificate, etc.)")
    description: Optional[str] = Field(None, description="Program description")
    catalog_description: Optional[str] = Field(None, description="Catalog description")
    career_opportunities: Optional[str] = Field(None, description="Career opportunities narrative")
    learning_outcomes: Optional[str] = Field(None, description="Program learning outcomes")
    total_units: Decimal = Field(default=Decimal("0"), ge=0, description="Total program units")
    effective_term: Optional[str] = Field(None, description="Effective term (e.g., 'Fall 2025')")
    top_code: Optional[str] = Field(None, description="Taxonomy of Programs code")


class ProgramCreateRequest(ProgramBase):
    """Schema for creating a new program."""
    department_id: uuid.UUID = Field(description="Department ID")


class ProgramUpdateRequest(BaseModel):
    """Schema for updating a program."""
    title: Optional[str] = Field(None, min_length=3, max_length=300)
    type: Optional[ProgramType] = None
    description: Optional[str] = None
    catalog_description: Optional[str] = None
    career_opportunities: Optional[str] = None
    learning_outcomes: Optional[str] = None
    total_units: Optional[Decimal] = Field(None, ge=0)
    effective_term: Optional[str] = None
    top_code: Optional[str] = None
    department_id: Optional[uuid.UUID] = None


class ProgramListItem(BaseModel):
    """Program item for list view."""
    id: uuid.UUID
    title: str
    type: ProgramType
    total_units: Decimal
    status: ProgramStatus
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProgramListResponse(BaseModel):
    """Paginated response for program list."""
    items: List[ProgramListItem]
    total: int = Field(description="Total number of programs matching filters")
    page: int = Field(ge=1, description="Current page number")
    limit: int = Field(ge=1, description="Items per page")
    pages: int = Field(ge=0, description="Total number of pages")


class ProgramDetailResponse(BaseModel):
    """Full program detail including courses."""
    id: uuid.UUID
    title: str
    type: ProgramType
    description: Optional[str]
    catalog_description: Optional[str]
    career_opportunities: Optional[str]
    learning_outcomes: Optional[str]
    total_units: Decimal
    status: ProgramStatus
    effective_term: Optional[str]
    top_code: Optional[str]
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]
    courses: List[CourseInProgramItem] = []

    class Config:
        from_attributes = True
