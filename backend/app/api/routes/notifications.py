"""
Notification API routes.

Endpoints for managing user notifications.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func, desc

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.notification import (
    Notification,
    NotificationCreate,
    NotificationRead,
    NotificationUpdate,
    NotificationType,
    NotificationCounts,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# =============================================================================
# Helper Functions
# =============================================================================

def notification_to_read(notif: Notification, actor_name: Optional[str] = None) -> dict:
    """Convert notification to read schema dict."""
    return {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "entity_type": notif.entity_type,
        "entity_id": notif.entity_id,
        "entity_title": notif.entity_title,
        "is_read": notif.is_read,
        "user_id": notif.user_id,
        "actor_id": notif.actor_id,
        "actor_name": actor_name,
        "created_at": notif.created_at,
        "read_at": notif.read_at,
    }


async def create_notification(
    session: Session,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    message: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    entity_title: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
) -> Notification:
    """Create a new notification."""
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_title=entity_title,
        actor_id=actor_id,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


# =============================================================================
# API Endpoints
# =============================================================================

@router.get("", response_model=List[dict])
async def list_notifications(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = Query(default=False),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List notifications for the current user.

    Returns notifications in reverse chronological order.
    """
    query = select(Notification).where(
        Notification.user_id == current_user.id
    )

    if unread_only:
        query = query.where(Notification.is_read == False)

    query = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit)

    notifications = session.exec(query).all()

    # Get actor names
    actor_ids = [n.actor_id for n in notifications if n.actor_id]
    actors = {}
    if actor_ids:
        actor_query = select(User).where(User.id.in_(actor_ids))
        actor_users = session.exec(actor_query).all()
        actors = {u.id: u.full_name for u in actor_users}

    return [
        notification_to_read(n, actors.get(n.actor_id) if n.actor_id else None)
        for n in notifications
    ]


@router.get("/counts", response_model=NotificationCounts)
async def get_notification_counts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get notification counts for the current user."""
    # Total count
    total_query = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id
    )
    total = session.exec(total_query).one()

    # Unread count
    unread_query = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    )
    unread = session.exec(unread_query).one()

    return NotificationCounts(total=total, unread=unread)


@router.get("/{notification_id}", response_model=dict)
async def get_notification(
    notification_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get a specific notification."""
    notification = session.get(Notification, notification_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this notification")

    actor_name = None
    if notification.actor_id:
        actor = session.get(User, notification.actor_id)
        if actor:
            actor_name = actor.full_name

    return notification_to_read(notification, actor_name)


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as read."""
    notification = session.get(Notification, notification_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this notification")

    notification.is_read = True
    notification.read_at = datetime.utcnow()
    session.add(notification)
    session.commit()

    return {"status": "ok", "message": "Notification marked as read"}


@router.patch("/{notification_id}/unread")
async def mark_notification_unread(
    notification_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as unread."""
    notification = session.get(Notification, notification_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this notification")

    notification.is_read = False
    notification.read_at = None
    session.add(notification)
    session.commit()

    return {"status": "ok", "message": "Notification marked as unread"}


@router.post("/mark-all-read")
async def mark_all_notifications_read(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications as read for the current user."""
    query = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    )
    notifications = session.exec(query).all()

    now = datetime.utcnow()
    for notification in notifications:
        notification.is_read = True
        notification.read_at = now
        session.add(notification)

    session.commit()

    return {"status": "ok", "message": f"Marked {len(notifications)} notifications as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a notification."""
    notification = session.get(Notification, notification_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this notification")

    session.delete(notification)
    session.commit()

    return {"status": "ok", "message": "Notification deleted"}


# =============================================================================
# Internal Functions for Creating Workflow Notifications
# =============================================================================

async def notify_course_submitted(
    session: Session,
    course_id: uuid.UUID,
    course_title: str,
    submitter_id: uuid.UUID,
    reviewer_ids: List[uuid.UUID],
):
    """
    Create notifications for reviewers when a course is submitted.
    """
    for reviewer_id in reviewer_ids:
        await create_notification(
            session=session,
            user_id=reviewer_id,
            type=NotificationType.COURSE_SUBMITTED,
            title="Course Submitted for Review",
            message=f"{course_title} has been submitted and is awaiting your review.",
            entity_type="Course",
            entity_id=course_id,
            entity_title=course_title,
            actor_id=submitter_id,
        )


async def notify_course_approved(
    session: Session,
    course_id: uuid.UUID,
    course_title: str,
    approver_id: uuid.UUID,
    author_id: uuid.UUID,
):
    """
    Create notification for author when their course is approved.
    """
    await create_notification(
        session=session,
        user_id=author_id,
        type=NotificationType.COURSE_APPROVED,
        title="Course Approved",
        message=f"Your course {course_title} has been approved.",
        entity_type="Course",
        entity_id=course_id,
        entity_title=course_title,
        actor_id=approver_id,
    )


async def notify_course_returned(
    session: Session,
    course_id: uuid.UUID,
    course_title: str,
    reviewer_id: uuid.UUID,
    author_id: uuid.UUID,
    comment: Optional[str] = None,
):
    """
    Create notification for author when their course is returned for revision.
    """
    message = f"Your course {course_title} has been returned for revision."
    if comment:
        message += f" Comment: {comment[:100]}..."

    await create_notification(
        session=session,
        user_id=author_id,
        type=NotificationType.COURSE_RETURNED,
        title="Course Returned for Revision",
        message=message,
        entity_type="Course",
        entity_id=course_id,
        entity_title=course_title,
        actor_id=reviewer_id,
    )


async def notify_course_commented(
    session: Session,
    course_id: uuid.UUID,
    course_title: str,
    commenter_id: uuid.UUID,
    recipient_id: uuid.UUID,
    comment_preview: str,
):
    """
    Create notification when someone comments on a course.
    """
    await create_notification(
        session=session,
        user_id=recipient_id,
        type=NotificationType.COURSE_COMMENTED,
        title="New Comment on Course",
        message=f"New comment on {course_title}: {comment_preview[:100]}...",
        entity_type="Course",
        entity_id=course_id,
        entity_title=course_title,
        actor_id=commenter_id,
    )
