"""
Workflow API Routes

Provides endpoints for workflow-related operations:
- Comment management (CRUD) for inline reviewing
- Workflow history viewing
"""

import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, func
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user, require_admin
from app.models.user import User, UserRole
from app.models.workflow import (
    Comment,
    CommentCreate,
    CommentRead,
    CommentUpdate,
    EntityType,
    WorkflowHistory,
    WorkflowHistoryRead,
)

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

class UserInfo(BaseModel):
    """Minimal user info for comment display."""
    id: uuid.UUID
    email: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class CommentResponse(BaseModel):
    """Comment response with user info."""
    id: uuid.UUID
    entity_type: EntityType
    entity_id: uuid.UUID
    section: Optional[str] = None
    content: str
    resolved: bool
    user_id: uuid.UUID
    user: Optional[UserInfo] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CommentListResponse(BaseModel):
    """Paginated response for comment list."""
    items: List[CommentResponse]
    total: int
    page: int
    limit: int
    pages: int


class CommentCreateRequest(BaseModel):
    """Request schema for creating a comment."""
    entity_type: EntityType
    entity_id: uuid.UUID
    section: Optional[str] = None
    content: str


class CommentUpdateRequest(BaseModel):
    """Request schema for updating a comment."""
    content: Optional[str] = None


class WorkflowHistoryResponse(BaseModel):
    """Workflow history response with user info."""
    id: uuid.UUID
    entity_type: EntityType
    entity_id: uuid.UUID
    from_status: str
    to_status: str
    comment: Optional[str] = None
    changed_by: uuid.UUID
    user: Optional[UserInfo] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Comment Endpoints
# =============================================================================

@router.post("/comment", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    comment_data: CommentCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new comment on a course or program.

    Comments can be attached to:
    - A specific section (e.g., "SLOs", "CB Codes", "Description")
    - The entity as a whole (section=None)

    **Required fields:**
    - `entity_type`: "Course" or "Program"
    - `entity_id`: UUID of the course or program
    - `content`: The comment text (Markdown supported)

    **Optional fields:**
    - `section`: Which part of the COR this comment refers to
    """
    # Validate content is not empty
    if not comment_data.content or not comment_data.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment content cannot be empty"
        )

    # Create comment
    comment = Comment(
        entity_type=comment_data.entity_type,
        entity_id=comment_data.entity_id,
        section=comment_data.section,
        content=comment_data.content.strip(),
        resolved=False,
        user_id=current_user.id,
    )

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Build response with user info
    user_info = UserInfo(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
    )

    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        section=comment.section,
        content=comment.content,
        resolved=comment.resolved,
        user_id=comment.user_id,
        user=user_info,
        created_at=comment.created_at,
    )


@router.get("/comments", response_model=CommentListResponse)
async def list_comments(
    entity_type: Optional[EntityType] = Query(None, description="Filter by entity type"),
    entity_id: Optional[uuid.UUID] = Query(None, description="Filter by entity ID"),
    section: Optional[str] = Query(None, description="Filter by section"),
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by user ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List comments with optional filtering.

    **Filters:**
    - `entity_type`: Filter by "Course" or "Program"
    - `entity_id`: Filter by specific course/program UUID
    - `section`: Filter by section name (e.g., "SLOs", "CB Codes")
    - `resolved`: Filter by resolved status (true/false)
    - `user_id`: Filter by commenter's user ID

    **Pagination:**
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 50, max: 100)
    """
    # Build base query
    query = select(Comment)
    count_query = select(func.count(Comment.id))

    # Apply filters
    if entity_type:
        query = query.where(Comment.entity_type == entity_type)
        count_query = count_query.where(Comment.entity_type == entity_type)

    if entity_id:
        query = query.where(Comment.entity_id == entity_id)
        count_query = count_query.where(Comment.entity_id == entity_id)

    if section:
        query = query.where(Comment.section == section)
        count_query = count_query.where(Comment.section == section)

    if resolved is not None:
        query = query.where(Comment.resolved == resolved)
        count_query = count_query.where(Comment.resolved == resolved)

    if user_id:
        query = query.where(Comment.user_id == user_id)
        count_query = count_query.where(Comment.user_id == user_id)

    # Get total count
    total = session.exec(count_query).one()

    # Apply pagination and ordering (newest first)
    offset = (page - 1) * limit
    query = query.order_by(Comment.created_at.desc()).offset(offset).limit(limit)

    # Execute query
    comments = session.exec(query).all()

    # Build response items with user info
    items = []
    user_cache = {}  # Cache user lookups

    for comment in comments:
        # Get user info (with caching)
        if comment.user_id not in user_cache:
            user = session.get(User, comment.user_id)
            if user:
                user_cache[comment.user_id] = UserInfo(
                    id=user.id,
                    email=user.email,
                    full_name=user.full_name,
                    role=user.role.value,
                )
            else:
                user_cache[comment.user_id] = None

        items.append(CommentResponse(
            id=comment.id,
            entity_type=comment.entity_type,
            entity_id=comment.entity_id,
            section=comment.section,
            content=comment.content,
            resolved=comment.resolved,
            user_id=comment.user_id,
            user=user_cache.get(comment.user_id),
            created_at=comment.created_at,
        ))

    # Calculate total pages
    pages = (total + limit - 1) // limit if total > 0 else 1

    return CommentListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/comment/{comment_id}", response_model=CommentResponse)
async def get_comment(
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get a single comment by ID.
    """
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )

    # Get user info
    user = session.get(User, comment.user_id)
    user_info = None
    if user:
        user_info = UserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
        )

    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        section=comment.section,
        content=comment.content,
        resolved=comment.resolved,
        user_id=comment.user_id,
        user=user_info,
        created_at=comment.created_at,
    )


@router.patch("/comment/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: uuid.UUID,
    comment_data: CommentUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update a comment's content.

    Only the comment author can update their own comments.
    Admins can update any comment.
    """
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )

    # Check permissions - only author or admin can update
    if current_user.role != UserRole.ADMIN and comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own comments"
        )

    # Update content if provided
    if comment_data.content is not None:
        if not comment_data.content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Comment content cannot be empty"
            )
        comment.content = comment_data.content.strip()

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Get user info
    user = session.get(User, comment.user_id)
    user_info = None
    if user:
        user_info = UserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
        )

    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        section=comment.section,
        content=comment.content,
        resolved=comment.resolved,
        user_id=comment.user_id,
        user=user_info,
        created_at=comment.created_at,
    )


@router.patch("/comment/{comment_id}/resolve", response_model=CommentResponse)
async def resolve_comment(
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Mark a comment as resolved.

    Any authenticated user can resolve a comment.
    This is typically done by the course author after addressing feedback.
    """
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )

    comment.resolved = True

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Get user info
    user = session.get(User, comment.user_id)
    user_info = None
    if user:
        user_info = UserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
        )

    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        section=comment.section,
        content=comment.content,
        resolved=comment.resolved,
        user_id=comment.user_id,
        user=user_info,
        created_at=comment.created_at,
    )


@router.patch("/comment/{comment_id}/unresolve", response_model=CommentResponse)
async def unresolve_comment(
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Mark a comment as unresolved.

    This is useful when a previously resolved issue needs to be reopened.
    """
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )

    comment.resolved = False

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Get user info
    user = session.get(User, comment.user_id)
    user_info = None
    if user:
        user_info = UserInfo(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
        )

    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        section=comment.section,
        content=comment.content,
        resolved=comment.resolved,
        user_id=comment.user_id,
        user=user_info,
        created_at=comment.created_at,
    )


@router.delete("/comment/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    current_user: User = Depends(require_admin()),
    session: Session = Depends(get_session),
):
    """
    Delete a comment (admin only).

    Regular users cannot delete comments - they should be resolved instead.
    """
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )

    session.delete(comment)
    session.commit()

    return None


# =============================================================================
# Course-specific Comment Endpoints
# =============================================================================

@router.get("/courses/{course_id}/comments", response_model=List[CommentResponse])
async def get_course_comments(
    course_id: uuid.UUID,
    section: Optional[str] = Query(None, description="Filter by section"),
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get all comments for a specific course.

    This is a convenience endpoint that filters comments by entity_type=Course
    and the specified course_id.

    **Filters:**
    - `section`: Filter by section name (e.g., "SLOs", "CB Codes")
    - `resolved`: Filter by resolved status (true/false)
    """
    query = select(Comment).where(
        Comment.entity_type == EntityType.COURSE,
        Comment.entity_id == course_id,
    )

    if section:
        query = query.where(Comment.section == section)

    if resolved is not None:
        query = query.where(Comment.resolved == resolved)

    query = query.order_by(Comment.created_at.desc())

    comments = session.exec(query).all()

    # Build response items with user info
    items = []
    user_cache = {}

    for comment in comments:
        if comment.user_id not in user_cache:
            user = session.get(User, comment.user_id)
            if user:
                user_cache[comment.user_id] = UserInfo(
                    id=user.id,
                    email=user.email,
                    full_name=user.full_name,
                    role=user.role.value,
                )
            else:
                user_cache[comment.user_id] = None

        items.append(CommentResponse(
            id=comment.id,
            entity_type=comment.entity_type,
            entity_id=comment.entity_id,
            section=comment.section,
            content=comment.content,
            resolved=comment.resolved,
            user_id=comment.user_id,
            user=user_cache.get(comment.user_id),
            created_at=comment.created_at,
        ))

    return items


# =============================================================================
# Workflow History Endpoints
# =============================================================================

@router.get("/history/{entity_type}/{entity_id}", response_model=List[WorkflowHistoryResponse])
async def get_workflow_history(
    entity_type: EntityType,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get the complete workflow history for a course or program.

    Returns all status transitions in chronological order (oldest first),
    showing who made each change and any comments associated with the transition.

    **Path Parameters:**
    - `entity_type`: "Course" or "Program"
    - `entity_id`: UUID of the course or program
    """
    query = select(WorkflowHistory).where(
        WorkflowHistory.entity_type == entity_type,
        WorkflowHistory.entity_id == entity_id,
    ).order_by(WorkflowHistory.created_at.asc())

    history_items = session.exec(query).all()

    # Build response with user info
    items = []
    user_cache = {}

    for item in history_items:
        if item.changed_by not in user_cache:
            user = session.get(User, item.changed_by)
            if user:
                user_cache[item.changed_by] = UserInfo(
                    id=user.id,
                    email=user.email,
                    full_name=user.full_name,
                    role=user.role.value,
                )
            else:
                user_cache[item.changed_by] = None

        items.append(WorkflowHistoryResponse(
            id=item.id,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            from_status=item.from_status,
            to_status=item.to_status,
            comment=item.comment,
            changed_by=item.changed_by,
            user=user_cache.get(item.changed_by),
            created_at=item.created_at,
        ))

    return items
