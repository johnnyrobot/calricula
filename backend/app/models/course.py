"""
Course model and related models (SLOs, Content, Requisites).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, List, Dict, Any, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship, Column
from sqlalchemy import JSON

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User


class CourseStatus(str, Enum):
    """Course workflow status."""
    DRAFT = "Draft"
    DEPT_REVIEW = "DeptReview"
    CURRICULUM_COMMITTEE = "CurriculumCommittee"
    ARTICULATION_REVIEW = "ArticulationReview"
    APPROVED = "Approved"


class BloomLevel(str, Enum):
    """Bloom's Taxonomy cognitive levels."""
    REMEMBER = "Remember"
    UNDERSTAND = "Understand"
    APPLY = "Apply"
    ANALYZE = "Analyze"
    EVALUATE = "Evaluate"
    CREATE = "Create"


class RequisiteType(str, Enum):
    """Types of course requisites."""
    PREREQUISITE = "Prerequisite"
    COREQUISITE = "Corequisite"
    ADVISORY = "Advisory"


class RequisiteValidationType(str, Enum):
    """
    Validation type for requisites (Title 5 § 55003 compliance).

    - CONTENT_REVIEW: Skills/knowledge from prerequisite directly apply to course
    - STATUTORY: Required by law (e.g., health/safety regulations)
    - SEQUENTIAL: Part of a defined course sequence
    - HEALTH_SAFETY: Protects student health and safety
    - RECENCY: Knowledge currency requirement (e.g., within 3 years)
    - OTHER: Other documented validation method
    """
    CONTENT_REVIEW = "ContentReview"
    STATUTORY = "Statutory"
    SEQUENTIAL = "Sequential"
    HEALTH_SAFETY = "HealthSafety"
    RECENCY = "Recency"
    OTHER = "Other"


class CourseBase(SQLModel):
    """Base course fields."""
    subject_code: str = Field(index=True)  # e.g., "MATH"
    course_number: str = Field(index=True)  # e.g., "101"
    title: str
    catalog_description: Optional[str] = None

    # Units - support variable unit courses
    units: Decimal = Field(default=Decimal("3.0"))
    minimum_units: Optional[Decimal] = Field(default=None)
    maximum_units: Optional[Decimal] = Field(default=None)

    # Hours breakdown (aligned with eLumen structure)
    lecture_hours: Decimal = Field(default=Decimal("0"))
    lab_hours: Decimal = Field(default=Decimal("0"))
    activity_hours: Decimal = Field(default=Decimal("0"))
    tba_hours: Decimal = Field(default=Decimal("0"))  # To Be Arranged
    outside_of_class_hours: Decimal = Field(default=Decimal("0"))  # Homework/study
    total_student_learning_hours: Decimal = Field(default=Decimal("0"))  # For 54-hour rule

    # Classification
    top_code: Optional[str] = Field(default=None, index=True)  # e.g., "1701.00"
    status: CourseStatus = Field(default=CourseStatus.DRAFT)
    version: int = Field(default=1)
    effective_term: Optional[str] = None  # e.g., "Fall 2025"
    ccn_id: Optional[str] = None  # C-ID alignment, e.g., "MATH C1051"

    # eLumen tracking
    elumen_id: Optional[int] = Field(default=None, index=True)  # Source record ID from eLumen


class Course(CourseBase, table=True):
    """
    Course Outline of Record (COR) model.

    The central model for curriculum management, containing all course
    information required for community college compliance.
    """
    __tablename__ = "courses"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: uuid.UUID = Field(foreign_key="departments.id")

    # JSONB fields for complex data
    cb_codes: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    transferability: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))  # UC, CSU flags
    ge_applicability: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))  # Cal-GETC, local GE
    lmi_data: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))  # Legacy field - kept for compatibility

    # LMI (Labor Market Information) Data Fields - CUR-190
    lmi_soc_code: Optional[str] = Field(default=None, max_length=10)  # SOC code, e.g., "29-1141"
    lmi_occupation_title: Optional[str] = Field(default=None, max_length=255)  # e.g., "Registered Nurses"
    lmi_area: Optional[str] = Field(default=None, max_length=100)  # e.g., "Los Angeles County"
    lmi_retrieved_at: Optional[datetime] = Field(default=None)  # When LMI data was fetched
    lmi_wage_data: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))  # Wage statistics
    lmi_projection_data: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))  # Employment projections
    lmi_narrative: Optional[str] = Field(default=None)  # User-editable narrative text

    # Metadata
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None

    # Relationships
    department: Optional["Department"] = Relationship(back_populates="courses")
    creator: Optional["User"] = Relationship()
    slos: List["StudentLearningOutcome"] = Relationship(
        back_populates="course",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    content_items: List["CourseContent"] = Relationship(
        back_populates="course",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    requisites: List["CourseRequisite"] = Relationship(
        back_populates="course",
        sa_relationship_kwargs={
            "foreign_keys": "[CourseRequisite.course_id]",
            "cascade": "all, delete-orphan"
        }
    )


class CourseCreate(CourseBase):
    """Schema for creating a new course."""
    department_id: uuid.UUID
    created_by: uuid.UUID
    cb_codes: Dict[str, Any] = {}
    transferability: Dict[str, Any] = {}
    ge_applicability: Dict[str, Any] = {}
    lmi_data: Dict[str, Any] = {}
    # LMI fields
    lmi_soc_code: Optional[str] = None
    lmi_occupation_title: Optional[str] = None
    lmi_area: Optional[str] = None
    lmi_retrieved_at: Optional[datetime] = None
    lmi_wage_data: Optional[Dict[str, Any]] = None
    lmi_projection_data: Optional[Dict[str, Any]] = None
    lmi_narrative: Optional[str] = None


class CourseRead(CourseBase):
    """Schema for reading course data."""
    id: uuid.UUID
    department_id: uuid.UUID
    cb_codes: Dict[str, Any]
    transferability: Dict[str, Any]
    ge_applicability: Dict[str, Any]
    lmi_data: Dict[str, Any]
    # LMI fields
    lmi_soc_code: Optional[str] = None
    lmi_occupation_title: Optional[str] = None
    lmi_area: Optional[str] = None
    lmi_retrieved_at: Optional[datetime] = None
    lmi_wage_data: Optional[Dict[str, Any]] = None
    lmi_projection_data: Optional[Dict[str, Any]] = None
    lmi_narrative: Optional[str] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]


class CourseUpdate(SQLModel):
    """Schema for updating course data."""
    title: Optional[str] = None
    catalog_description: Optional[str] = None
    units: Optional[Decimal] = None
    minimum_units: Optional[Decimal] = None
    maximum_units: Optional[Decimal] = None
    lecture_hours: Optional[Decimal] = None
    lab_hours: Optional[Decimal] = None
    activity_hours: Optional[Decimal] = None
    tba_hours: Optional[Decimal] = None
    outside_of_class_hours: Optional[Decimal] = None
    total_student_learning_hours: Optional[Decimal] = None
    top_code: Optional[str] = None
    effective_term: Optional[str] = None
    ccn_id: Optional[str] = None
    elumen_id: Optional[int] = None
    cb_codes: Optional[Dict[str, Any]] = None
    transferability: Optional[Dict[str, Any]] = None
    ge_applicability: Optional[Dict[str, Any]] = None
    lmi_data: Optional[Dict[str, Any]] = None
    # LMI fields
    lmi_soc_code: Optional[str] = None
    lmi_occupation_title: Optional[str] = None
    lmi_area: Optional[str] = None
    lmi_retrieved_at: Optional[datetime] = None
    lmi_wage_data: Optional[Dict[str, Any]] = None
    lmi_projection_data: Optional[Dict[str, Any]] = None
    lmi_narrative: Optional[str] = None


# =============================================================================
# Student Learning Outcomes (SLOs)
# =============================================================================

class StudentLearningOutcomeBase(SQLModel):
    """Base SLO fields."""
    sequence: int = Field(default=1)
    outcome_text: str
    bloom_level: BloomLevel = Field(default=BloomLevel.APPLY)
    performance_criteria: Optional[str] = None  # For eLumen compatibility


class StudentLearningOutcome(StudentLearningOutcomeBase, table=True):
    """
    Student Learning Outcome model.

    SLOs define what students will be able to do after completing the course.
    Aligned with Bloom's Taxonomy cognitive levels.
    """
    __tablename__ = "student_learning_outcomes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    course: Optional[Course] = Relationship(back_populates="slos")


class SLOCreate(StudentLearningOutcomeBase):
    """Schema for creating a new SLO."""
    course_id: uuid.UUID


class SLORead(StudentLearningOutcomeBase):
    """Schema for reading SLO data."""
    id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime


class SLOUpdate(SQLModel):
    """Schema for updating SLO data."""
    sequence: Optional[int] = None
    outcome_text: Optional[str] = None
    bloom_level: Optional[BloomLevel] = None
    performance_criteria: Optional[str] = None


# =============================================================================
# Course Content Outline
# =============================================================================

class CourseContentBase(SQLModel):
    """Base course content fields."""
    sequence: int = Field(default=1)
    topic: str
    subtopics: List[str] = Field(default=[], sa_column=Column(JSON))
    hours_allocated: Decimal = Field(default=Decimal("0"))
    linked_slos: List[str] = Field(default=[], sa_column=Column(JSON))  # Array of SLO UUIDs


class CourseContent(CourseContentBase, table=True):
    """
    Course content outline model.

    Defines the topics covered in the course, with time allocation
    and mapping to Student Learning Outcomes.
    """
    __tablename__ = "course_content"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    course: Optional[Course] = Relationship(back_populates="content_items")


class CourseContentCreate(CourseContentBase):
    """Schema for creating course content."""
    course_id: uuid.UUID


class CourseContentRead(CourseContentBase):
    """Schema for reading course content data."""
    id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime


class CourseContentUpdate(SQLModel):
    """Schema for updating course content."""
    sequence: Optional[int] = None
    topic: Optional[str] = None
    subtopics: Optional[List[str]] = None
    hours_allocated: Optional[Decimal] = None
    linked_slos: Optional[List[str]] = None


# =============================================================================
# Course Requisites (Prerequisites, Corequisites, Advisories)
# =============================================================================

class CourseRequisiteBase(SQLModel):
    """Base course requisite fields."""
    type: RequisiteType = Field(default=RequisiteType.PREREQUISITE)
    validation_type: Optional[RequisiteValidationType] = Field(default=None)  # Title 5 compliance
    content_review: Optional[str] = None  # Skill matching documentation (entry/exit skills)


class CourseRequisite(CourseRequisiteBase, table=True):
    """
    Course requisite model.

    Defines prerequisites, corequisites, and advisories for courses.
    Supports Content Review documentation for Title 5 compliance.
    """
    __tablename__ = "course_requisites"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    requisite_course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="courses.id")
    requisite_text: Optional[str] = None  # For non-course requisites (e.g., "Eligibility for ENGL 101")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    course: Optional[Course] = Relationship(
        back_populates="requisites",
        sa_relationship_kwargs={"foreign_keys": "[CourseRequisite.course_id]"}
    )
    requisite_course: Optional[Course] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[CourseRequisite.requisite_course_id]"}
    )


class CourseRequisiteCreate(CourseRequisiteBase):
    """Schema for creating a course requisite."""
    course_id: uuid.UUID
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_text: Optional[str] = None


class CourseRequisiteRead(CourseRequisiteBase):
    """Schema for reading course requisite data."""
    id: uuid.UUID
    course_id: uuid.UUID
    requisite_course_id: Optional[uuid.UUID]
    requisite_text: Optional[str]
    created_at: datetime


class CourseRequisiteUpdate(SQLModel):
    """Schema for updating course requisite."""
    type: Optional[RequisiteType] = None
    validation_type: Optional[RequisiteValidationType] = None
    content_review: Optional[str] = None
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_text: Optional[str] = None
