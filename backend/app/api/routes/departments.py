"""
Departments API Routes

Provides endpoints for department lookup and listing.
Used for populating dropdowns in course and program forms.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.department import Department, Division
from app.models.course import Course, CourseStatus

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

from pydantic import BaseModel


class DivisionInfo(BaseModel):
    """Division info for department response."""
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class DepartmentResponse(BaseModel):
    """Department with optional division info."""
    id: uuid.UUID
    code: str
    name: str
    division_id: Optional[uuid.UUID] = None
    division: Optional[DivisionInfo] = None

    class Config:
        from_attributes = True


class DepartmentListResponse(BaseModel):
    """List of departments."""
    items: List[DepartmentResponse]
    total: int


# =============================================================================
# Department List Endpoint
# =============================================================================

@router.get("", response_model=DepartmentListResponse)
async def list_departments(
    division_id: Optional[uuid.UUID] = Query(None, description="Filter by division"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all departments, optionally filtered by division.

    Returns departments sorted alphabetically by name.
    Used for department dropdown in course forms.
    """
    query = select(Department)

    if division_id:
        query = query.where(Department.division_id == division_id)

    query = query.order_by(Department.name)

    departments = session.exec(query).all()

    # Build response with division info
    items = []
    for dept in departments:
        div_info = None
        if dept.division_id:
            div = session.get(Division, dept.division_id)
            if div:
                div_info = DivisionInfo(id=div.id, name=div.name)

        items.append(DepartmentResponse(
            id=dept.id,
            code=dept.code,
            name=dept.name,
            division_id=dept.division_id,
            division=div_info,
        ))

    return DepartmentListResponse(
        items=items,
        total=len(items),
    )


# =============================================================================
# Department Detail Endpoint
# =============================================================================

@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get a single department by ID.
    """
    dept = session.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    div_info = None
    if dept.division_id:
        div = session.get(Division, dept.division_id)
        if div:
            div_info = DivisionInfo(id=div.id, name=div.name)

    return DepartmentResponse(
        id=dept.id,
        code=dept.code,
        name=dept.name,
        division_id=dept.division_id,
        division=div_info,
    )


# =============================================================================
# Department Courses Endpoint
# =============================================================================

class DepartmentCourseItem(BaseModel):
    """Course item for department courses list."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    status: CourseStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentCoursesResponse(BaseModel):
    """Paginated response for department courses."""
    items: List[DepartmentCourseItem]
    total: int
    page: int
    limit: int
    pages: int


@router.get("/{department_id}/courses", response_model=DepartmentCoursesResponse)
async def list_department_courses(
    department_id: uuid.UUID,
    status: Optional[CourseStatus] = Query(None, description="Filter by course status"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all courses in a department with pagination.

    Returns courses sorted by subject code and course number.
    Optionally filter by course status.
    """
    # Verify department exists
    dept = session.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Build query
    query = select(Course).where(Course.department_id == department_id)

    if status:
        query = query.where(Course.status == status)

    # Get total count
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total = session.exec(count_query).one()

    # Calculate pagination
    pages = (total + limit - 1) // limit if total > 0 else 1
    offset = (page - 1) * limit

    # Apply sorting and pagination
    query = query.order_by(Course.subject_code, Course.course_number)
    query = query.offset(offset).limit(limit)

    courses = session.exec(query).all()

    # Build response
    items = [
        DepartmentCourseItem(
            id=course.id,
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            units=course.units,
            status=course.status,
            created_at=course.created_at,
            updated_at=course.updated_at,
        )
        for course in courses
    ]

    return DepartmentCoursesResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )
