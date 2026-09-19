"""
Authentication Pydantic schemas.

Request and response schemas for authentication-related API endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import ConfigDict, BaseModel, Field, EmailStr, computed_field

from app.models.user import UserRole


# =============================================================================
# User Schemas
# =============================================================================

class UserBase(BaseModel):
    """Base user fields."""
    email: EmailStr = Field(description="User email address")
    display_name: Optional[str] = Field(None, description="Display name", max_length=100)


class UserCreate(UserBase):
    """Schema for creating a new user."""
    auth_subject: str = Field(description="OIDC subject (`sub`) from the provider")
    auth_issuer: Optional[str] = Field(None, description="OIDC issuer that minted the subject")
    role: UserRole = Field(default=UserRole.FACULTY, description="User role")
    department_id: Optional[uuid.UUID] = Field(None, description="Associated department")


class UserUpdate(BaseModel):
    """Schema for updating user data."""
    display_name: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = None
    department_id: Optional[uuid.UUID] = None


class UserResponse(UserBase):
    """User response schema."""
    id: uuid.UUID
    auth_subject: str
    role: UserRole
    department_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def firebase_uid(self) -> str:
        """DEPRECATED read-only alias for `auth_subject`, kept for one release
        so a client built against the pre-ADR-0001 response keeps working.
        Remove once no client reads it."""
        return self.auth_subject


class UserProfileResponse(BaseModel):
    """User profile response with additional info."""
    id: uuid.UUID
    email: str
    display_name: Optional[str]
    role: UserRole
    department_id: Optional[uuid.UUID]
    department_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# Auth Schemas
# =============================================================================

class TokenVerifyRequest(BaseModel):
    """Request to verify an OIDC token."""
    token: str = Field(description="OIDC ID token")


class TokenVerifyResponse(BaseModel):
    """Response after token verification."""
    valid: bool = Field(description="Whether token is valid")
    user_id: Optional[uuid.UUID] = Field(None, description="User ID if valid")
    auth_subject: Optional[str] = Field(None, description="OIDC subject (`sub`)")


class LoginResponse(BaseModel):
    """Response after successful login/registration."""
    user: UserResponse
    message: str = Field(description="Status message")
    is_new_user: bool = Field(default=False, description="Whether this is a new registration")


class CurrentUserResponse(BaseModel):
    """Response for current authenticated user."""
    id: uuid.UUID
    email: str
    display_name: Optional[str]
    role: UserRole
    department_id: Optional[uuid.UUID]
    department_name: Optional[str] = None
    permissions: list[str] = Field(default=[], description="User permissions")

    model_config = ConfigDict(from_attributes=True)
