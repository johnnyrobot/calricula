"""
Workflow, comments, and audit trail models.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class EntityType(str, Enum):
    """Types of entities that can have workflow/comments."""
    COURSE = "Course"
    PROGRAM = "Program"


class WorkflowHistoryBase(SQLModel):
    """Base workflow history fields."""
    entity_type: EntityType
    entity_id: uuid.UUID
    from_status: str
    to_status: str
    comment: Optional[str] = None


class WorkflowHistory(WorkflowHistoryBase, table=True):
    """
    Workflow history model for audit trail.

    Tracks status transitions for courses and programs.
    """
    __tablename__ = "workflow_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    changed_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    user: Optional["User"] = Relationship()


class WorkflowHistoryCreate(WorkflowHistoryBase):
    """Schema for creating workflow history."""
    changed_by: uuid.UUID


class WorkflowHistoryRead(WorkflowHistoryBase):
    """Schema for reading workflow history."""
    id: uuid.UUID
    changed_by: uuid.UUID
    created_at: datetime


# =============================================================================
# Comments
# =============================================================================

class CommentBase(SQLModel):
    """Base comment fields."""
    entity_type: EntityType
    entity_id: uuid.UUID
    section: Optional[str] = None  # Which part of the COR (e.g., "SLOs", "CB Codes")
    content: str
    resolved: bool = Field(default=False)


class Comment(CommentBase, table=True):
    """
    Comment model for inline feedback on courses and programs.

    Used during the review/approval workflow for specific feedback.
    """
    __tablename__ = "comments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    user: Optional["User"] = Relationship()


class CommentCreate(CommentBase):
    """Schema for creating a comment."""
    user_id: uuid.UUID


class CommentRead(CommentBase):
    """Schema for reading comment data."""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime


class CommentUpdate(SQLModel):
    """Schema for updating a comment."""
    content: Optional[str] = None
    resolved: Optional[bool] = None
