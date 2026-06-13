"""
Notification model for in-app notifications.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class NotificationType(str, Enum):
    """Types of notifications."""
    COURSE_SUBMITTED = "course_submitted"
    COURSE_APPROVED = "course_approved"
    COURSE_RETURNED = "course_returned"
    COURSE_COMMENTED = "course_commented"
    PROGRAM_SUBMITTED = "program_submitted"
    PROGRAM_APPROVED = "program_approved"
    PROGRAM_RETURNED = "program_returned"
    PROGRAM_COMMENTED = "program_commented"
    MENTION = "mention"
    SYSTEM = "system"


class NotificationBase(SQLModel):
    """Base notification fields."""
    type: NotificationType
    title: str
    message: str
    entity_type: Optional[str] = None  # "Course" or "Program"
    entity_id: Optional[uuid.UUID] = None
    entity_title: Optional[str] = None  # Display name like "MATH 101"
    is_read: bool = Field(default=False)


class Notification(NotificationBase, table=True):
    """
    Notification model for in-app notifications.

    Stores notifications for workflow events like course submissions,
    approvals, returns, and comments.
    """
    __tablename__ = "notifications"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    actor_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")  # Who triggered the notification
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    read_at: Optional[datetime] = None

    # Relationships
    user: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Notification.user_id]"}
    )
    actor: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Notification.actor_id]"}
    )


class NotificationCreate(NotificationBase):
    """Schema for creating a notification."""
    user_id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None


class NotificationRead(NotificationBase):
    """Schema for reading notification data."""
    id: uuid.UUID
    user_id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    created_at: datetime
    read_at: Optional[datetime]
    actor_name: Optional[str] = None  # Populated from actor relationship


class NotificationUpdate(SQLModel):
    """Schema for updating a notification."""
    is_read: Optional[bool] = None


class NotificationCounts(SQLModel):
    """Schema for notification counts."""
    total: int
    unread: int
