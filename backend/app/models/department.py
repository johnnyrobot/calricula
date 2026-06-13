"""
Division and Department models for organizational structure.
"""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.course import Course
    from app.models.program import Program


class DivisionBase(SQLModel):
    """Base division fields."""
    name: str = Field(index=True)


class Division(DivisionBase, table=True):
    """
    Division model representing academic divisions.

    Divisions group departments (e.g., STEM, Liberal Arts, CTE).
    """
    __tablename__ = "divisions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dean_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    departments: List["Department"] = Relationship(back_populates="division")


class DivisionCreate(DivisionBase):
    """Schema for creating a new division."""
    dean_id: Optional[uuid.UUID] = None


class DivisionRead(DivisionBase):
    """Schema for reading division data."""
    id: uuid.UUID
    dean_id: Optional[uuid.UUID]
    created_at: datetime


class DepartmentBase(SQLModel):
    """Base department fields."""
    name: str = Field(index=True)
    code: str = Field(index=True)  # e.g., "MATH", "ENGL"


class Department(DepartmentBase, table=True):
    """
    Department model representing academic departments.

    Departments belong to divisions and contain courses and programs.
    """
    __tablename__ = "departments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    division_id: Optional[uuid.UUID] = Field(default=None, foreign_key="divisions.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    division: Optional[Division] = Relationship(back_populates="departments")
    users: List["User"] = Relationship(back_populates="department")
    courses: List["Course"] = Relationship(back_populates="department")
    programs: List["Program"] = Relationship(back_populates="department")


class DepartmentCreate(DepartmentBase):
    """Schema for creating a new department."""
    division_id: Optional[uuid.UUID] = None


class DepartmentRead(DepartmentBase):
    """Schema for reading department data."""
    id: uuid.UUID
    division_id: Optional[uuid.UUID]
    created_at: datetime


class DepartmentWithDivision(DepartmentRead):
    """Schema for reading department data with division info."""
    division: Optional[DivisionRead] = None
