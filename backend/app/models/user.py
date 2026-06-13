"""
User model with Firebase UID integration and role-based access control.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship

if TYPE_CHECKING:
    from app.models.department import Department


class UserRole(str, Enum):
    """User roles for role-based access control."""
    FACULTY = "Faculty"
    CURRICULUM_CHAIR = "CurriculumChair"
    ARTICULATION_OFFICER = "ArticulationOfficer"
    ADMIN = "Admin"


class UserBase(SQLModel):
    """Base user fields."""
    email: str = Field(index=True)
    full_name: str
    role: UserRole = Field(default=UserRole.FACULTY)
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id")


class User(UserBase, table=True):
    """
    User model for database storage.

    Links to Firebase via firebase_uid for authentication.
    Supports role-based access control with the UserRole enum.
    """
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    firebase_uid: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    department: Optional["Department"] = Relationship(back_populates="users")


class UserCreate(UserBase):
    """Schema for creating a new user."""
    firebase_uid: str


class UserRead(UserBase):
    """Schema for reading user data."""
    id: uuid.UUID
    firebase_uid: str
    created_at: datetime
    updated_at: datetime


class UserUpdate(SQLModel):
    """Schema for updating user data."""
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    department_id: Optional[uuid.UUID] = None
