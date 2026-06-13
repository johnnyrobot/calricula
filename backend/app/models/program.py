"""
Program model for degrees and certificates.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, List, TYPE_CHECKING, Dict, Any

from sqlmodel import Field, SQLModel, Relationship, Column
from sqlalchemy import JSON

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User
    from app.models.course import Course


class ProgramType(str, Enum):
    """Types of academic programs."""
    AA = "AA"  # Associate in Arts
    AS = "AS"  # Associate in Science
    AAT = "AAT"  # AA for Transfer (AA-T)
    AST = "AST"  # AS for Transfer (AS-T)
    CERTIFICATE = "Certificate"
    ADT = "ADT"  # Associate Degree for Transfer


class ProgramStatus(str, Enum):
    """Program workflow status."""
    DRAFT = "Draft"
    REVIEW = "Review"
    APPROVED = "Approved"


class RequirementType(str, Enum):
    """Types of program course requirements."""
    REQUIRED_CORE = "RequiredCore"
    LIST_A = "ListA"  # Restricted Electives
    LIST_B = "ListB"  # Additional Electives
    GE = "GE"  # General Education


class ProgramBase(SQLModel):
    """Base program fields."""
    title: str = Field(index=True)
    type: ProgramType
    catalog_description: Optional[str] = None
    total_units: Decimal = Field(default=Decimal("60.0"), max_digits=5, decimal_places=2)
    status: ProgramStatus = Field(default=ProgramStatus.DRAFT)
    top_code: Optional[str] = None  # e.g., "1701.00"
    cip_code: Optional[str] = None  # Classification of Instructional Programs
    program_narrative: Optional[str] = None  # AI-generated narrative
    is_high_unit_major: bool = Field(default=False)  # Override for 60-unit limit
    lmi_data: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))  # Saved Labor Market Information


class Program(ProgramBase, table=True):
    """
    Academic program model (degrees and certificates).

    Programs contain collections of courses organized by requirement type.
    """
    __tablename__ = "programs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: uuid.UUID = Field(foreign_key="departments.id")
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    department: Optional["Department"] = Relationship(back_populates="programs")
    creator: Optional["User"] = Relationship()
    program_courses: List["ProgramCourse"] = Relationship(
        back_populates="program",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class ProgramCreate(ProgramBase):
    """Schema for creating a new program."""
    department_id: uuid.UUID
    created_by: uuid.UUID
    lmi_data: Dict[str, Any] = {}


class ProgramRead(ProgramBase):
    """Schema for reading program data."""
    id: uuid.UUID
    department_id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    lmi_data: Dict[str, Any]


class ProgramUpdate(SQLModel):
    """Schema for updating program data."""
    title: Optional[str] = None
    type: Optional[ProgramType] = None
    catalog_description: Optional[str] = None
    total_units: Optional[Decimal] = None
    top_code: Optional[str] = None
    cip_code: Optional[str] = None
    program_narrative: Optional[str] = None
    is_high_unit_major: Optional[bool] = None
    lmi_data: Optional[Dict[str, Any]] = None


# =============================================================================
# Program-Course Relationship
# =============================================================================

class ProgramCourseBase(SQLModel):
    """Base program-course relationship fields."""
    requirement_type: RequirementType = Field(default=RequirementType.REQUIRED_CORE)
    sequence: int = Field(default=1)
    units_applied: Decimal = Field(default=Decimal("0"), max_digits=4, decimal_places=2)


class ProgramCourse(ProgramCourseBase, table=True):
    """
    Program-Course relationship model.

    Links courses to programs with requirement type and sequencing.
    """
    __tablename__ = "program_courses"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    program_id: uuid.UUID = Field(foreign_key="programs.id")
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    program: Optional[Program] = Relationship(back_populates="program_courses")
    course: Optional["Course"] = Relationship()


class ProgramCourseCreate(ProgramCourseBase):
    """Schema for creating a program-course relationship."""
    program_id: uuid.UUID
    course_id: uuid.UUID


class ProgramCourseRead(ProgramCourseBase):
    """Schema for reading program-course data."""
    id: uuid.UUID
    program_id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime
