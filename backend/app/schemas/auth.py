"""
Authentication Pydantic schemas.

Request and response schemas for authentication-related API endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr

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
    firebase_uid: str = Field(description="Firebase UID from authentication")
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
    firebase_uid: str
    role: UserRole
    department_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    """User profile response with additional info."""
    id: uuid.UUID
    email: str
    display_name: Optional[str]
    role: UserRole
    department_id: Optional[uuid.UUID]
    department_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Auth Schemas
# =============================================================================

class TokenVerifyRequest(BaseModel):
    """Request to verify Firebase token."""
    token: str = Field(description="Firebase ID token")


class TokenVerifyResponse(BaseModel):
    """Response after token verification."""
    valid: bool = Field(description="Whether token is valid")
    user_id: Optional[uuid.UUID] = Field(None, description="User ID if valid")
    firebase_uid: Optional[str] = Field(None, description="Firebase UID")


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

    class Config:
        from_attributes = True
