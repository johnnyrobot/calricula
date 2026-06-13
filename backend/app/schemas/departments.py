"""
Department Pydantic schemas.

Request and response schemas for department-related API endpoints.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Department Schemas
# =============================================================================

class DepartmentBase(BaseModel):
    """Base department fields."""
    name: str = Field(description="Department name", min_length=1, max_length=200)
    code: str = Field(description="Department code (e.g., 'MATH')", min_length=1, max_length=20)
    division: Optional[str] = Field(None, description="Academic division")


class DepartmentCreate(DepartmentBase):
    """Schema for creating a new department."""
    pass


class DepartmentUpdate(BaseModel):
    """Schema for updating a department."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    division: Optional[str] = None


class DepartmentInfo(BaseModel):
    """Minimal department info for nested responses."""
    id: uuid.UUID
    name: str
    code: str

    class Config:
        from_attributes = True


class DepartmentResponse(DepartmentBase):
    """Full department response."""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentListItem(BaseModel):
    """Department item for list view."""
    id: uuid.UUID
    name: str
    code: str
    division: Optional[str] = None
    course_count: int = Field(default=0, description="Number of courses in department")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentListResponse(BaseModel):
    """Paginated response for department list."""
    items: List[DepartmentListItem]
    total: int
    page: int
    limit: int
    pages: int
