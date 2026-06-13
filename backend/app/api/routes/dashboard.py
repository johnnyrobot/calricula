"""
Dashboard API Routes

Provides endpoints for the dashboard:
- Get dashboard stats (my drafts, pending review, recently approved)
- Get recent activity for the current user
"""

import logging
import uuid
from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.course import Course, CourseStatus
from app.models.workflow import WorkflowHistory, EntityType

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

class DashboardStatsResponse(BaseModel):
    """Dashboard statistics."""
    my_drafts: int
    pending_review: int
    recently_approved: int


class ActivityItem(BaseModel):
    """Single activity item for the dashboard."""
    id: uuid.UUID
    title: str  # e.g., "MATH 101 - Introduction to Algebra"
    description: str  # e.g., "Course submitted for review"
    time: str  # e.g., "2 hours ago"
    type: str  # "created", "submitted", "approved", "updated", "returned"
    course_id: uuid.UUID
    created_at: datetime
    actor_id: Optional[uuid.UUID] = None
    actor_name: Optional[str] = None


class DashboardActivityResponse(BaseModel):
    """Dashboard recent activity."""
    items: List[ActivityItem]
    total: int = 0
    has_more: bool = False


# =============================================================================
# Helper Functions
# =============================================================================

def format_relative_time(dt: datetime) -> str:
    """Format a datetime as a relative time string."""
    now = datetime.utcnow()
    diff = now - dt

    if diff.days > 30:
        return dt.strftime("%b %d, %Y")
    elif diff.days > 1:
        return f"{diff.days} days ago"
    elif diff.days == 1:
        return "1 day ago"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif diff.seconds > 60:
        minutes = diff.seconds // 60
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    else:
        return "just now"


def get_activity_type(from_status: str, to_status: str) -> str:
    """Determine the activity type based on status transition."""
    if to_status == CourseStatus.APPROVED.value:
        return "approved"
    elif from_status == CourseStatus.DRAFT.value and to_status != CourseStatus.DRAFT.value:
        return "submitted"
    elif to_status == CourseStatus.DRAFT.value and from_status != CourseStatus.DRAFT.value:
        return "returned"
    else:
        return "updated"


def get_activity_description(from_status: str, to_status: str) -> str:
    """Generate a human-readable description for a status transition."""
    activity_type = get_activity_type(from_status, to_status)

    if activity_type == "approved":
        return "Course approved"
    elif activity_type == "submitted":
        if to_status == CourseStatus.DEPT_REVIEW.value:
            return "Submitted for department review"
        elif to_status == CourseStatus.CURRICULUM_COMMITTEE.value:
            return "Advanced to curriculum committee"
        elif to_status == CourseStatus.ARTICULATION_REVIEW.value:
            return "Advanced to articulation review"
        else:
            return "Submitted for review"
    elif activity_type == "returned":
        return "Returned for revision"
    else:
        return f"Status changed to {to_status}"


# =============================================================================
# Dashboard Endpoints
# =============================================================================

@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get dashboard statistics for the current user.

    Returns:
    - my_drafts: Number of courses in Draft status created by the user
    - pending_review: Number of courses in any review status
    - recently_approved: Number of courses approved in the last 30 days
    """
    # Count my drafts (courses I created that are in Draft status)
    my_drafts = session.exec(
        select(func.count(Course.id)).where(
            Course.created_by == current_user.id,
            Course.status == CourseStatus.DRAFT,
        )
    ).one()

    # Count all pending review (any review status)
    pending_statuses = [
        CourseStatus.DEPT_REVIEW,
        CourseStatus.CURRICULUM_COMMITTEE,
        CourseStatus.ARTICULATION_REVIEW,
    ]
    pending_review = session.exec(
        select(func.count(Course.id)).where(Course.status.in_(pending_statuses))
    ).one()

    # Count recently approved (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recently_approved = session.exec(
        select(func.count(Course.id)).where(
            Course.status == CourseStatus.APPROVED,
            Course.approved_at >= thirty_days_ago,
        )
    ).one()

    return DashboardStatsResponse(
        my_drafts=my_drafts,
        pending_review=pending_review,
        recently_approved=recently_approved,
    )


@router.get("/activity", response_model=DashboardActivityResponse)
async def get_dashboard_activity(
    limit: int = 10,
    offset: int = 0,
    activity_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get recent activity for the dashboard.

    Shows workflow changes for courses created by the current user
    or courses they have reviewed.

    Args:
        limit: Maximum number of items to return (default 10, max 50)
        offset: Number of items to skip for pagination
        activity_type: Filter by activity type (submitted, approved, returned, updated)

    Returns the most recent activity items with pagination info.
    """
    # Clamp limit
    limit = min(limit, 50)

    # Get recent workflow history for courses the user owns or has touched
    # First, get course IDs the user created
    user_course_ids = session.exec(
        select(Course.id).where(Course.created_by == current_user.id)
    ).all()

    # Also get course IDs the user has reviewed (from workflow history)
    reviewed_course_ids = session.exec(
        select(WorkflowHistory.entity_id).where(
            WorkflowHistory.changed_by == current_user.id,
            WorkflowHistory.entity_type == EntityType.COURSE,
        ).distinct()
    ).all()

    # Combine and deduplicate
    all_course_ids = list(set(user_course_ids) | set(reviewed_course_ids))

    if not all_course_ids:
        return DashboardActivityResponse(items=[], total=0, has_more=False)

    # Build base query for workflow history
    base_query = select(WorkflowHistory).where(
        WorkflowHistory.entity_type == EntityType.COURSE,
        WorkflowHistory.entity_id.in_(all_course_ids),
    )

    # Get total count for pagination
    count_query = select(func.count(WorkflowHistory.id)).where(
        WorkflowHistory.entity_type == EntityType.COURSE,
        WorkflowHistory.entity_id.in_(all_course_ids),
    )
    total_count = session.exec(count_query).one()

    # Get workflow items with pagination
    workflow_items = session.exec(
        base_query
        .order_by(WorkflowHistory.created_at.desc())
        .offset(offset)
        .limit(limit + 1)  # Fetch one extra to check if there are more
    ).all()

    # Check if there are more items
    has_more = len(workflow_items) > limit
    if has_more:
        workflow_items = workflow_items[:limit]

    # Get actor names (users who made the changes)
    actor_ids = [wf.changed_by for wf in workflow_items if wf.changed_by]
    actors = {}
    if actor_ids:
        actor_query = select(User).where(User.id.in_(actor_ids))
        actor_users = session.exec(actor_query).all()
        actors = {u.id: u.full_name for u in actor_users}

    # Build activity items
    items = []
    for wf in workflow_items:
        # Get the course
        course = session.get(Course, wf.entity_id)
        if not course:
            continue

        # Build the activity item
        act_type = get_activity_type(wf.from_status, wf.to_status)

        # Filter by activity type if specified
        if activity_type and act_type != activity_type:
            continue

        items.append(ActivityItem(
            id=wf.id,
            title=f"{course.subject_code} {course.course_number} - {course.title}",
            description=get_activity_description(wf.from_status, wf.to_status),
            time=format_relative_time(wf.created_at),
            type=act_type,
            course_id=course.id,
            created_at=wf.created_at,
            actor_id=wf.changed_by,
            actor_name=actors.get(wf.changed_by) if wf.changed_by else None,
        ))

    return DashboardActivityResponse(
        items=items,
        total=total_count,
        has_more=has_more,
    )


# =============================================================================
# Stale Items Response Schemas
# =============================================================================

class StaleItem(BaseModel):
    """A stale course item for the deadline alerts widget."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    status: str
    updated_at: datetime
    days_stale: int
    urgency: str  # "warning" (amber) or "critical" (red)
    category: str  # "stale_draft" or "stale_review"


class StaleItemsResponse(BaseModel):
    """Response for stale items endpoint."""
    stale_drafts: List[StaleItem]
    stale_reviews: List[StaleItem]
    total_count: int


# =============================================================================
# Stale Items Endpoint
# =============================================================================

@router.get("/stale-items", response_model=StaleItemsResponse)
async def get_stale_items(
    draft_threshold_days: int = 30,
    review_threshold_days: int = 7,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get stale items for the deadline alerts widget.

    Args:
        draft_threshold_days: Days before a draft is considered stale (default 30)
        review_threshold_days: Days before a review item is considered stale (default 7)

    Returns:
        - stale_drafts: Courses in Draft status not updated in threshold days
        - stale_reviews: Courses in review statuses not updated in threshold days
        - total_count: Total number of stale items
    """
    now = datetime.utcnow()

    # Get stale drafts (user's own drafts that haven't been updated)
    draft_cutoff = now - timedelta(days=draft_threshold_days)
    critical_draft_cutoff = now - timedelta(days=draft_threshold_days * 2)  # 60 days = critical

    stale_draft_courses = session.exec(
        select(Course)
        .where(
            Course.created_by == current_user.id,
            Course.status == CourseStatus.DRAFT,
            Course.updated_at < draft_cutoff,
        )
        .order_by(Course.updated_at.asc())
        .limit(10)
    ).all()

    stale_drafts = []
    for course in stale_draft_courses:
        days_stale = (now - course.updated_at).days
        stale_drafts.append(StaleItem(
            id=course.id,
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            status=course.status.value,
            updated_at=course.updated_at,
            days_stale=days_stale,
            urgency="critical" if course.updated_at < critical_draft_cutoff else "warning",
            category="stale_draft",
        ))

    # Get stale reviews (items waiting for review that the user can see)
    review_cutoff = now - timedelta(days=review_threshold_days)
    critical_review_cutoff = now - timedelta(days=review_threshold_days * 2)  # 14 days = critical

    review_statuses = [
        CourseStatus.DEPT_REVIEW,
        CourseStatus.CURRICULUM_COMMITTEE,
        CourseStatus.ARTICULATION_REVIEW,
    ]

    # For reviewers, show items in review they can act on
    # For authors, show their items stuck in review
    stale_review_courses = session.exec(
        select(Course)
        .where(
            Course.status.in_(review_statuses),
            Course.updated_at < review_cutoff,
        )
        .order_by(Course.updated_at.asc())
        .limit(10)
    ).all()

    stale_reviews = []
    for course in stale_review_courses:
        days_stale = (now - course.updated_at).days
        stale_reviews.append(StaleItem(
            id=course.id,
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            status=course.status.value,
            updated_at=course.updated_at,
            days_stale=days_stale,
            urgency="critical" if course.updated_at < critical_review_cutoff else "warning",
            category="stale_review",
        ))

    total_count = len(stale_drafts) + len(stale_reviews)

    return StaleItemsResponse(
        stale_drafts=stale_drafts,
        stale_reviews=stale_reviews,
        total_count=total_count,
    )


# =============================================================================
# Department Analytics Response Schemas
# =============================================================================

class CoursesByStatusItem(BaseModel):
    """Count of courses by status."""
    status: str
    count: int
    percentage: float


class DepartmentAnalyticsResponse(BaseModel):
    """Department-level analytics for curriculum work."""
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    total_courses: int
    courses_by_status: List[CoursesByStatusItem]
    approval_rate: float  # Percentage of approved vs returned
    avg_review_days: Optional[float] = None  # Average days in review
    period_comparison: Optional[dict] = None  # Optional comparison to previous period


# =============================================================================
# Department Analytics Endpoint
# =============================================================================

@router.get("/analytics", response_model=DepartmentAnalyticsResponse)
async def get_department_analytics(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get department-level analytics for curriculum work.

    For department chairs: Shows analytics for their department.
    For admins: Shows analytics for all courses.
    For regular faculty: Shows analytics for their own courses only.
    """
    try:
        from app.models.department import Department

        # Determine scope based on role
        is_admin = current_user.role.value == "Admin"
        is_chair = current_user.role.value == "CurriculumChair"

        # Build base query
        if is_admin:
            base_query = select(Course)
            department_name = "All Departments"
            department_id = None
        elif is_chair and current_user.department_id:
            base_query = select(Course).where(Course.department_id == current_user.department_id)
            dept = session.get(Department, current_user.department_id)
            department_name = dept.name if dept else "Unknown Department"
            department_id = current_user.department_id
        else:
            base_query = select(Course).where(Course.created_by == current_user.id)
            department_name = "My Courses"
            department_id = current_user.department_id

        all_courses = session.exec(base_query).all()
        total_courses = len(all_courses)

        status_counts = {}
        for course in all_courses:
            status = course.status.value
            status_counts[status] = status_counts.get(status, 0) + 1

        courses_by_status = [
            CoursesByStatusItem(
                status=status,
                count=count,
                percentage=round((count / total_courses * 100) if total_courses > 0 else 0, 1),
            )
            for status, count in status_counts.items()
        ]
        courses_by_status.sort(key=lambda x: x.count, reverse=True)

        from app.models.workflow import WorkflowHistory, EntityType
        course_ids = [c.id for c in all_courses]

        if course_ids:
            approvals_count = session.exec(
                select(func.count(WorkflowHistory.id)).where(
                    WorkflowHistory.entity_type == EntityType.COURSE,
                    WorkflowHistory.entity_id.in_(course_ids),
                    WorkflowHistory.to_status == CourseStatus.APPROVED.value,
                )
            ).one()

            returns_count = session.exec(
                select(func.count(WorkflowHistory.id)).where(
                    WorkflowHistory.entity_type == EntityType.COURSE,
                    WorkflowHistory.entity_id.in_(course_ids),
                    WorkflowHistory.to_status == CourseStatus.DRAFT.value,
                    WorkflowHistory.from_status.in_([
                        CourseStatus.DEPT_REVIEW.value,
                        CourseStatus.CURRICULUM_COMMITTEE.value,
                        CourseStatus.ARTICULATION_REVIEW.value,
                    ]),
                )
            ).one()

            total_decisions = approvals_count + returns_count
            approval_rate = round((approvals_count / total_decisions * 100) if total_decisions > 0 else 0, 1)

            review_statuses = [
                CourseStatus.DEPT_REVIEW,
                CourseStatus.CURRICULUM_COMMITTEE,
                CourseStatus.ARTICULATION_REVIEW,
            ]

            in_review_courses = [c for c in all_courses if c.status in review_statuses]
            if in_review_courses:
                now = datetime.utcnow()
                total_days = sum((now - c.updated_at).days for c in in_review_courses)
                avg_review_days = round(total_days / len(in_review_courses), 1)
            else:
                avg_review_days = None
        else:
            approval_rate = 0.0
            avg_review_days = None

        return DepartmentAnalyticsResponse(
            department_id=department_id,
            department_name=department_name,
            total_courses=total_courses,
            courses_by_status=courses_by_status,
            approval_rate=approval_rate,
            avg_review_days=avg_review_days,
            period_comparison=None,
        )
    except Exception as exc:
        logger.error("Department analytics query failed: %s", exc)
        return DepartmentAnalyticsResponse(
            department_id=None,
            department_name=None,
            total_courses=0,
            courses_by_status=[],
            approval_rate=0.0,
            avg_review_days=None,
            period_comparison=None,
        )
