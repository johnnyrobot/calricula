"""
Reference data models: TOP codes, CCN standards, cross-listings, colleges.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Column
from sqlalchemy import JSON

if TYPE_CHECKING:
    from app.models.course import Course


# =============================================================================
# College/Institution
# =============================================================================

class CollegeBase(SQLModel):
    """Base college fields."""
    abbreviation: str = Field(index=True, unique=True)  # e.g., "LAMC"
    name: str  # e.g., "Los Angeles Mission College"
    domain: Optional[str] = None  # e.g., "lamission.elumenapp.com"


class College(CollegeBase, table=True):
    """
    College/Institution model for LACCD colleges.

    Represents the 9 LACCD colleges:
    ELAC, LACC, LAHC, LAMC, LAPC, LASC, LATTC, LAVC, WLAC
    """
    __tablename__ = "colleges"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    elumen_id: Optional[int] = None  # ID from eLumen API
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CollegeCreate(CollegeBase):
    """Schema for creating a college."""
    elumen_id: Optional[int] = None


class CollegeRead(CollegeBase):
    """Schema for reading college data."""
    id: uuid.UUID
    elumen_id: Optional[int]
    created_at: datetime


# =============================================================================
# TOP Codes (Taxonomy of Programs)
# =============================================================================

class TOPCodeBase(SQLModel):
    """Base TOP code fields."""
    code: str = Field(index=True)  # e.g., "1701.00"
    title: str
    is_vocational: bool = Field(default=False)
    parent_code: Optional[str] = None


class TOPCode(TOPCodeBase, table=True):
    """
    Taxonomy of Programs (TOP) code model.

    Official community college program classification codes.
    Used for CB03 state reporting.
    """
    __tablename__ = "top_codes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TOPCodeCreate(TOPCodeBase):
    """Schema for creating a TOP code."""
    pass


class TOPCodeRead(TOPCodeBase):
    """Schema for reading TOP code data."""
    id: uuid.UUID
    created_at: datetime


# =============================================================================
# CCN Standards (Common Course Numbering / C-ID)
# =============================================================================

class CCNStandardBase(SQLModel):
    """Base CCN standard fields."""
    c_id: str = Field(index=True)  # e.g., "MATH C2210"
    discipline: str = Field(index=True)  # e.g., "MATH"
    title: str
    descriptor: Optional[str] = None  # Catalog description
    minimum_units: float = Field(default=3.0)

    # Course identification (from extracted PDF data)
    subject_code: Optional[str] = None  # e.g., "MATH"
    course_number: Optional[str] = None  # e.g., "C2210"

    # Requisites
    prerequisites: Optional[str] = None  # Identical prerequisite text
    corequisites: Optional[str] = None  # Identical corequisite text

    # Assessment
    evaluation_methods: Optional[str] = None  # Assessment description

    # Variant flags (from CCN specialty identifiers)
    is_honors: bool = Field(default=False)  # H suffix
    is_lab_only: bool = Field(default=False)  # L suffix
    is_support_course: bool = Field(default=False)  # S suffix
    has_embedded_support: bool = Field(default=False)  # E suffix

    # CB code implications
    implied_cb05: str = Field(default="A")  # All CCN = UC+CSU transferable
    implied_top_code: Optional[str] = None  # TOP code from discipline

    # Metadata
    source_file: Optional[str] = None  # Original PDF filename
    approved_date: Optional[datetime] = None  # Template approval date


class CCNStandard(CCNStandardBase, table=True):
    """
    Common Course Numbering (CCN) / C-ID standard model.

    State-mandated course standards for AB 1111 compliance.
    Courses can align to these standards for transferability.
    """
    __tablename__ = "ccn_standards"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # JSON fields for list data
    slo_requirements: List[str] = Field(default=[], sa_column=Column(JSON))
    content_requirements: List[str] = Field(default=[], sa_column=Column(JSON))
    objectives: List[str] = Field(default=[], sa_column=Column(JSON))  # Part 1 required objectives
    representative_texts: List[str] = Field(default=[], sa_column=Column(JSON))  # Sample textbooks

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CCNStandardCreate(CCNStandardBase):
    """Schema for creating a CCN standard."""
    slo_requirements: List[str] = []
    content_requirements: List[str] = []
    objectives: List[str] = []
    representative_texts: List[str] = []


class CCNStandardRead(CCNStandardBase):
    """Schema for reading CCN standard data."""
    id: uuid.UUID
    slo_requirements: List[str]
    content_requirements: List[str]
    objectives: List[str]
    representative_texts: List[str]
    created_at: datetime
    updated_at: Optional[datetime] = None


# =============================================================================
# Cross-Listings
# =============================================================================

class CrossListingBase(SQLModel):
    """Base cross-listing fields."""
    pass


class CrossListing(CrossListingBase, table=True):
    """
    Cross-listing model for courses shared across departments.

    Cross-listed courses must have identical SLOs, content, and units.
    """
    __tablename__ = "cross_listings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    primary_course_id: uuid.UUID = Field(foreign_key="courses.id")
    cross_listed_course_id: uuid.UUID = Field(foreign_key="courses.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CrossListingCreate(SQLModel):
    """Schema for creating a cross-listing."""
    primary_course_id: uuid.UUID
    cross_listed_course_id: uuid.UUID


class CrossListingRead(CrossListingBase):
    """Schema for reading cross-listing data."""
    id: uuid.UUID
    primary_course_id: uuid.UUID
    cross_listed_course_id: uuid.UUID
    created_at: datetime


# =============================================================================
# CCN Non-Match Justification
# =============================================================================

class CCNNonMatchJustificationBase(SQLModel):
    """Base CCN non-match justification fields."""
    reason_code: str  # specialized, vocational, local_need, new_course, other
    justification_text: str


class CCNNonMatchJustification(CCNNonMatchJustificationBase, table=True):
    """
    CCN Non-Match Justification model.

    Per AB 1111, courses that don't align with a CCN standard must provide
    a documented justification explaining why.
    """
    __tablename__ = "ccn_non_match_justifications"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id", unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CCNNonMatchJustificationCreate(CCNNonMatchJustificationBase):
    """Schema for creating a CCN non-match justification."""
    course_id: uuid.UUID


class CCNNonMatchJustificationRead(CCNNonMatchJustificationBase):
    """Schema for reading CCN non-match justification data."""
    id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
