"""
Approvals API Routes

Provides endpoints for the approval workflow:
- List pending approvals (filtered by role)
- Get approval queue counts
- Transition course status (approve, return for revision)
- Add review comments
"""

import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, func, or_
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user, require_reviewer
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, StudentLearningOutcome, CourseContent
from app.models.department import Department
from app.models.workflow import WorkflowHistory, EntityType
from app.models.reference import CrossListing

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

class DepartmentInfo(BaseModel):
    """Minimal department info."""
    id: uuid.UUID
    name: str
    code: str


class SubmitterInfo(BaseModel):
    """Info about who submitted the item."""
    id: uuid.UUID
    full_name: str
    email: str


class ApprovalQueueItem(BaseModel):
    """Item in the approval queue."""
    id: uuid.UUID
    entity_type: str  # "Course" or "Program"
    subject_code: str
    course_number: str
    title: str
    status: CourseStatus
    department: Optional[DepartmentInfo] = None
    submitter: Optional[SubmitterInfo] = None
    submitted_at: datetime  # When it entered current review status
    updated_at: datetime

    class Config:
        from_attributes = True


class ApprovalQueueResponse(BaseModel):
    """Response for approval queue listing."""
    items: List[ApprovalQueueItem]
    total: int
    page: int
    limit: int
    pages: int


class ApprovalCountsResponse(BaseModel):
    """Counts for approval queue badges."""
    pending_my_review: int
    all_pending: int
    recently_reviewed: int


class StatusTransitionRequest(BaseModel):
    """Request to transition a course to a new status."""
    new_status: CourseStatus
    comment: Optional[str] = None


class StatusTransitionResponse(BaseModel):
    """Response after status transition."""
    id: uuid.UUID
    old_status: CourseStatus
    new_status: CourseStatus
    comment: Optional[str]
    changed_by: uuid.UUID
    changed_at: datetime


# =============================================================================
# Helper Functions
# =============================================================================

def get_review_statuses_for_role(role: UserRole) -> List[CourseStatus]:
    """
    Get the course statuses that a user role can review.

    - CurriculumChair: Reviews DeptReview and CurriculumCommittee
    - ArticulationOfficer: Reviews ArticulationReview
    - Admin: Reviews all pending statuses
    """
    if role == UserRole.ADMIN:
        return [
            CourseStatus.DEPT_REVIEW,
            CourseStatus.CURRICULUM_COMMITTEE,
            CourseStatus.ARTICULATION_REVIEW,
        ]
    elif role == UserRole.CURRICULUM_CHAIR:
        return [
            CourseStatus.DEPT_REVIEW,
            CourseStatus.CURRICULUM_COMMITTEE,
        ]
    elif role == UserRole.ARTICULATION_OFFICER:
        return [CourseStatus.ARTICULATION_REVIEW]
    else:
        return []


def get_valid_transitions(current_status: CourseStatus, role: UserRole) -> List[CourseStatus]:
    """
    Get valid status transitions based on current status and user role.

    Workflow:
    Draft -> DeptReview (by author)
    DeptReview -> CurriculumCommittee | Draft (by CurriculumChair)
    CurriculumCommittee -> ArticulationReview | Draft (by CurriculumChair)
    ArticulationReview -> Approved | Draft (by ArticulationOfficer)
    """
    if role == UserRole.ADMIN:
        # Admin can transition to any status
        return [s for s in CourseStatus if s != current_status]

    transitions = {
        CourseStatus.DRAFT: [CourseStatus.DEPT_REVIEW],  # Author submits
        CourseStatus.DEPT_REVIEW: [CourseStatus.CURRICULUM_COMMITTEE, CourseStatus.DRAFT],
        CourseStatus.CURRICULUM_COMMITTEE: [CourseStatus.ARTICULATION_REVIEW, CourseStatus.DRAFT],
        CourseStatus.ARTICULATION_REVIEW: [CourseStatus.APPROVED, CourseStatus.DRAFT],
        CourseStatus.APPROVED: [],  # No transitions from Approved (create new version instead)
    }

    valid = transitions.get(current_status, [])

    # Filter based on role permissions
    if role == UserRole.CURRICULUM_CHAIR:
        if current_status in [CourseStatus.DEPT_REVIEW, CourseStatus.CURRICULUM_COMMITTEE]:
            return valid
    elif role == UserRole.ARTICULATION_OFFICER:
        if current_status == CourseStatus.ARTICULATION_REVIEW:
            return valid

    return []


def validate_cross_listings_for_approval(course: Course, session: Session) -> List[str]:
    """
    Validate that all cross-listed courses have matching SLOs, content, and units.

    Returns a list of error messages if there are mismatches that block approval.
    Cross-listed courses in California must have identical:
    - Units
    - Student Learning Outcomes (text and Bloom's level)
    - Course content outline (topics and hours)
    """
    errors = []

    # Find all cross-listings for this course (where this course is primary or cross-listed)
    cross_listings = session.exec(
        select(CrossListing).where(
            or_(
                CrossListing.primary_course_id == course.id,
                CrossListing.cross_listed_course_id == course.id
            )
        )
    ).all()

    if not cross_listings:
        return []  # No cross-listings, no validation needed

    # Get this course's SLOs and content
    course_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == course.id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    course_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == course.id)
        .order_by(CourseContent.sequence)
    ).all()

    for cross_listing in cross_listings:
        # Determine the other course in the cross-listing
        if cross_listing.primary_course_id == course.id:
            other_course_id = cross_listing.cross_listed_course_id
        else:
            other_course_id = cross_listing.primary_course_id

        other_course = session.get(Course, other_course_id)
        if not other_course:
            continue

        course_code = f"{other_course.subject_code} {other_course.course_number}"

        # Check units
        if course.units != other_course.units:
            errors.append(
                f"Cross-listing mismatch with {course_code}: Units differ "
                f"({course.units} vs {other_course.units})"
            )

        # Get other course's SLOs
        other_slos = session.exec(
            select(StudentLearningOutcome)
            .where(StudentLearningOutcome.course_id == other_course_id)
            .order_by(StudentLearningOutcome.sequence)
        ).all()

        # Check SLO count
        if len(course_slos) != len(other_slos):
            errors.append(
                f"Cross-listing mismatch with {course_code}: SLO count differs "
                f"({len(course_slos)} vs {len(other_slos)})"
            )
        else:
            # Check individual SLOs
            for i, (slo1, slo2) in enumerate(zip(course_slos, other_slos)):
                if slo1.outcome_text.strip().lower() != slo2.outcome_text.strip().lower():
                    errors.append(
                        f"Cross-listing mismatch with {course_code}: SLO {i+1} text differs"
                    )
                    break  # Only report first mismatch per cross-listing

        # Get other course's content
        other_content = session.exec(
            select(CourseContent)
            .where(CourseContent.course_id == other_course_id)
            .order_by(CourseContent.sequence)
        ).all()

        # Check content count
        if len(course_content) != len(other_content):
            errors.append(
                f"Cross-listing mismatch with {course_code}: Content topic count differs "
                f"({len(course_content)} vs {len(other_content)})"
            )
        else:
            # Check individual content topics
            for i, (c1, c2) in enumerate(zip(course_content, other_content)):
                if c1.topic.strip().lower() != c2.topic.strip().lower():
                    errors.append(
                        f"Cross-listing mismatch with {course_code}: Content topic {i+1} differs"
                    )
                    break  # Only report first mismatch per cross-listing

    return errors


# =============================================================================
# Approval Queue Endpoints
# =============================================================================

@router.get("/counts", response_model=ApprovalCountsResponse)
async def get_approval_counts(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get counts for the approval queue badges.

    Returns counts for:
    - pending_my_review: Items the current user can review based on role
    - all_pending: All items in any review status
    - recently_reviewed: Items reviewed in the last 7 days
    """
    # Get statuses this user can review
    my_review_statuses = get_review_statuses_for_role(current_user.role)

    # Count pending my review
    if my_review_statuses:
        pending_my_review = session.exec(
            select(func.count(Course.id)).where(Course.status.in_(my_review_statuses))
        ).one()
    else:
        pending_my_review = 0

    # Count all pending
    all_pending_statuses = [
        CourseStatus.DEPT_REVIEW,
        CourseStatus.CURRICULUM_COMMITTEE,
        CourseStatus.ARTICULATION_REVIEW,
    ]
    all_pending = session.exec(
        select(func.count(Course.id)).where(Course.status.in_(all_pending_statuses))
    ).one()

    # Count recently reviewed (by this user in last 7 days)
    from datetime import timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recently_reviewed = session.exec(
        select(func.count(WorkflowHistory.id)).where(
            WorkflowHistory.changed_by == current_user.id,
            WorkflowHistory.created_at >= seven_days_ago,
        )
    ).one()

    return ApprovalCountsResponse(
        pending_my_review=pending_my_review,
        all_pending=all_pending,
        recently_reviewed=recently_reviewed,
    )


@router.get("/pending", response_model=ApprovalQueueResponse)
async def list_pending_approvals(
    # Filters
    tab: str = Query("my_review", description="Tab: my_review, all_pending, recently_reviewed"),
    search: Optional[str] = Query(None, description="Search in title or course number"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    # Dependencies
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List items pending approval.

    **Tabs:**
    - `my_review`: Items the current user can review based on their role
    - `all_pending`: All items in any review status
    - `recently_reviewed`: Items this user reviewed in the last 7 days

    **Search:**
    - Searches in course title and course number
    """
    from datetime import timedelta

    # Build base query depending on tab
    if tab == "recently_reviewed":
        # Get course IDs from workflow history
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        reviewed_ids_query = select(WorkflowHistory.entity_id).where(
            WorkflowHistory.changed_by == current_user.id,
            WorkflowHistory.entity_type == EntityType.COURSE,
            WorkflowHistory.created_at >= seven_days_ago,
        ).distinct()
        reviewed_ids = session.exec(reviewed_ids_query).all()

        if not reviewed_ids:
            return ApprovalQueueResponse(
                items=[],
                total=0,
                page=page,
                limit=limit,
                pages=1,
            )

        query = select(Course).where(Course.id.in_(reviewed_ids))
        count_query = select(func.count(Course.id)).where(Course.id.in_(reviewed_ids))

    elif tab == "all_pending":
        # All items in review statuses
        pending_statuses = [
            CourseStatus.DEPT_REVIEW,
            CourseStatus.CURRICULUM_COMMITTEE,
            CourseStatus.ARTICULATION_REVIEW,
        ]
        query = select(Course).where(Course.status.in_(pending_statuses))
        count_query = select(func.count(Course.id)).where(Course.status.in_(pending_statuses))

    else:  # my_review (default)
        # Items this user can review based on role
        my_review_statuses = get_review_statuses_for_role(current_user.role)
        if not my_review_statuses:
            return ApprovalQueueResponse(
                items=[],
                total=0,
                page=page,
                limit=limit,
                pages=1,
            )

        query = select(Course).where(Course.status.in_(my_review_statuses))
        count_query = select(func.count(Course.id)).where(Course.status.in_(my_review_statuses))

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        search_filter = or_(
            Course.title.ilike(search_term),
            Course.course_number.ilike(search_term),
            Course.subject_code.ilike(search_term),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # Get total count
    total = session.exec(count_query).one()

    # Apply pagination and ordering
    offset = (page - 1) * limit
    query = query.order_by(Course.updated_at.desc()).offset(offset).limit(limit)

    # Execute query
    courses = session.exec(query).all()

    # Build response items
    items = []
    for course in courses:
        # Get department info
        dept = session.get(Department, course.department_id)
        dept_info = None
        if dept:
            dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

        # Get submitter info
        submitter = session.get(User, course.created_by)
        submitter_info = None
        if submitter:
            submitter_info = SubmitterInfo(
                id=submitter.id,
                full_name=submitter.full_name,
                email=submitter.email,
            )

        items.append(ApprovalQueueItem(
            id=course.id,
            entity_type="Course",
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            status=course.status,
            department=dept_info,
            submitter=submitter_info,
            submitted_at=course.updated_at,  # Using updated_at as proxy for submission time
            updated_at=course.updated_at,
        ))

    # Calculate total pages
    pages = (total + limit - 1) // limit if total > 0 else 1

    return ApprovalQueueResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# =============================================================================
# Status Transition Endpoint
# =============================================================================

@router.post("/{course_id}/transition", response_model=StatusTransitionResponse)
async def transition_course_status(
    course_id: uuid.UUID,
    request: StatusTransitionRequest,
    current_user: User = Depends(require_reviewer()),
    session: Session = Depends(get_session),
):
    """
    Transition a course to a new workflow status.

    Valid transitions depend on the current status and user role:
    - CurriculumChair: Can advance from DeptReview/CurriculumCommittee or return to Draft
    - ArticulationOfficer: Can approve from ArticulationReview or return to Draft
    - Admin: Can transition to any status

    A comment can be included to document the decision.
    """
    # Get the course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    old_status = course.status
    new_status = request.new_status

    # Validate the transition
    valid_transitions = get_valid_transitions(old_status, current_user.role)
    if new_status not in valid_transitions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition from {old_status.value} to {new_status.value} with your role"
        )

    # Block approval if cross-listings have mismatches
    # Cross-listed courses must have identical SLOs, content, and units per California regulations
    if new_status == CourseStatus.APPROVED:
        cross_listing_errors = validate_cross_listings_for_approval(course, session)
        if cross_listing_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Cannot approve: Cross-listing validation failed",
                    "errors": cross_listing_errors,
                    "help": "Resolve cross-listing mismatches using the Sync feature or manually update the cross-listed courses to match."
                }
            )

    # Update the course status
    course.status = new_status
    course.updated_at = datetime.utcnow()

    # Set approved_at if transitioning to Approved
    if new_status == CourseStatus.APPROVED:
        course.approved_at = datetime.utcnow()

    # Create workflow history record
    workflow_history = WorkflowHistory(
        entity_type=EntityType.COURSE,
        entity_id=course.id,
        from_status=old_status.value,
        to_status=new_status.value,
        comment=request.comment,
        changed_by=current_user.id,
    )

    session.add(course)
    session.add(workflow_history)
    session.commit()
    session.refresh(workflow_history)

    return StatusTransitionResponse(
        id=workflow_history.id,
        old_status=old_status,
        new_status=new_status,
        comment=request.comment,
        changed_by=current_user.id,
        changed_at=workflow_history.created_at,
    )


# =============================================================================
# Workflow History Endpoint
# =============================================================================

class WorkflowHistoryItem(BaseModel):
    """Item in workflow history."""
    id: uuid.UUID
    from_status: str
    to_status: str
    comment: Optional[str]
    changed_by: uuid.UUID
    changed_by_name: Optional[str] = None
    created_at: datetime


class WorkflowHistoryResponse(BaseModel):
    """Response for workflow history."""
    items: List[WorkflowHistoryItem]


@router.get("/{course_id}/history", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get the workflow history for a course.

    Shows all status transitions with who made them and any comments.
    """
    # Verify course exists
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Get workflow history
    query = select(WorkflowHistory).where(
        WorkflowHistory.entity_type == EntityType.COURSE,
        WorkflowHistory.entity_id == course_id,
    ).order_by(WorkflowHistory.created_at.desc())

    history_items = session.exec(query).all()

    # Build response
    items = []
    for item in history_items:
        # Get user name
        user = session.get(User, item.changed_by)
        user_name = user.full_name if user else None

        items.append(WorkflowHistoryItem(
            id=item.id,
            from_status=item.from_status,
            to_status=item.to_status,
            comment=item.comment,
            changed_by=item.changed_by,
            changed_by_name=user_name,
            created_at=item.created_at,
        ))

    return WorkflowHistoryResponse(items=items)
