"""
User model keyed by OIDC subject, with role-based access control.
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

    Identity comes from the OIDC provider (Logto, ADR-0001): `auth_subject` is
    the token's `sub` claim and is the only key authentication looks up;
    `auth_issuer` records which issuer minted it ("dev" for the documented
    dev-mode tokens). A NULL `auth_issuer` marks a pre-migration row whose
    subject still belongs to the retired provider -- POST /api/auth/login
    adopts such a row once, on a verified email match.

    Supports role-based access control with the UserRole enum.
    """
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    auth_subject: str = Field(unique=True, index=True)
    auth_issuer: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    department: Optional["Department"] = Relationship(back_populates="users")


class UserCreate(UserBase):
    """Schema for creating a new user."""
    auth_subject: str
    auth_issuer: Optional[str] = None


class UserRead(UserBase):
    """Schema for reading user data."""
    id: uuid.UUID
    auth_subject: str
    auth_issuer: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class UserUpdate(SQLModel):
    """Schema for updating user data."""
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    department_id: Optional[uuid.UUID] = None
