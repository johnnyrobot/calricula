"""
Courses API Routes

Provides endpoints for Course Outline of Record (COR) management:
- List courses with filtering and pagination
- Get single course with full details
- Create new course
- Update existing course
- Delete course (admin only)
"""

import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlmodel import Session, select, func, or_
from sqlalchemy.orm import joinedload, selectinload
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user, require_role, require_admin, require_reviewer
from app.models.user import User, UserRole
from app.models.workflow import WorkflowHistory, EntityType
from app.models.notification import Notification, NotificationType
from app.models.course import (
    Course,
    CourseCreate,
    CourseRead,
    CourseUpdate,
    CourseStatus,
    StudentLearningOutcome,
    CourseContent,
    CourseRequisite,
    RequisiteType,
    RequisiteValidationType,
)
from app.models.department import Department
from app.services.lmi_client import LMIClient
from app.services.pdf_generator import generate_lmi_pdf

router = APIRouter()


# =============================================================================
# 54-Hour Rule Validation Helper
# =============================================================================

def validate_54_hour_rule(
    units: Decimal,
    lecture_hours: int,
    lab_hours: int,
    outside_of_class_hours: int,
    tolerance: Decimal = Decimal("0.25"),
) -> tuple[bool, Optional[str]]:
    """
    Validate that the unit/hour calculation complies with Title 5 § 55002.5 (54-hour rule).

    The 54-hour rule states:
    - Total Student Learning Hours = (Lecture Hours × 18) + (Lab Hours × 54) + (Outside Hours × 18)
    - Units = Total Student Learning Hours ÷ 54

    Args:
        units: The specified unit value
        lecture_hours: Weekly lecture hours
        lab_hours: Weekly lab hours
        outside_of_class_hours: Weekly outside-of-class (homework) hours
        tolerance: Allowed deviation from exact calculation (default 0.25 units)

    Returns:
        Tuple of (is_valid, error_message). If valid, error_message is None.
    """
    # Calculate total student learning hours
    total_hours = (
        (lecture_hours * 18) +      # Lecture hours × 18 weeks
        (lab_hours * 54) +           # Lab hours × 54 (direct mapping)
        (outside_of_class_hours * 18)  # Outside hours × 18 weeks
    )

    # Calculate expected units
    expected_units = Decimal(str(total_hours)) / Decimal("54")

    # Check if within tolerance
    difference = abs(expected_units - units)

    if difference > tolerance:
        return False, (
            f"54-Hour Rule Violation: Hours do not match units. "
            f"Total Student Learning Hours ({total_hours}) ÷ 54 = {expected_units:.2f} units, "
            f"but {units} units specified. "
            f"Adjust hours or units to comply with Title 5 § 55002.5. "
            f"Required hours for {units} units: {int(units * 54)}."
        )

    return True, None


# =============================================================================
# Response Schemas
# =============================================================================

from pydantic import BaseModel
from decimal import Decimal
from typing import Any, Dict


class DepartmentInfo(BaseModel):
    """Minimal department info for course list."""
    id: uuid.UUID
    name: str
    code: str


class CourseListItem(BaseModel):
    """Course item for list view (minimal data for performance)."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    status: CourseStatus
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    """Paginated response for course list."""
    items: List[CourseListItem]
    total: int
    page: int
    limit: int
    pages: int


class SLOItem(BaseModel):
    """SLO item for course detail."""
    id: uuid.UUID
    sequence: int
    outcome_text: str
    bloom_level: str
    performance_criteria: Optional[str] = None

    class Config:
        from_attributes = True


class ContentItem(BaseModel):
    """Content item for course detail."""
    id: uuid.UUID
    sequence: int
    topic: str
    subtopics: List[str]
    hours_allocated: Decimal
    linked_slos: List[str]

    class Config:
        from_attributes = True


class RequisiteCourseInfo(BaseModel):
    """Minimal course info for requisite display."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str


class RequisiteItem(BaseModel):
    """Requisite item for course detail."""
    id: uuid.UUID
    type: str  # Prerequisite, Corequisite, Advisory
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_course: Optional[RequisiteCourseInfo] = None
    requisite_text: Optional[str] = None
    content_review: Optional[str] = None
    validation_type: Optional[str] = None  # Title 5 compliance type

    class Config:
        from_attributes = True


class RequisitesGroupedResponse(BaseModel):
    """Requisites grouped by type for easier display."""
    prerequisites: List[RequisiteItem] = []
    corequisites: List[RequisiteItem] = []
    advisories: List[RequisiteItem] = []


class CourseDetailResponse(BaseModel):
    """Full course detail including SLOs and content."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    catalog_description: Optional[str]
    units: Decimal
    lecture_hours: int
    lab_hours: int
    activity_hours: int
    tba_hours: int
    outside_of_class_hours: int
    total_student_learning_hours: int
    status: CourseStatus
    version: int
    effective_term: Optional[str]
    ccn_id: Optional[str]
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    cb_codes: Dict[str, Any]
    transferability: Dict[str, Any]
    ge_applicability: Dict[str, Any]
    # LMI (Labor Market Information) fields
    lmi_data: Optional[Dict[str, Any]] = None
    lmi_soc_code: Optional[str] = None
    lmi_occupation_title: Optional[str] = None
    lmi_wage_data: Optional[Dict[str, Any]] = None
    lmi_projection_data: Optional[Dict[str, Any]] = None
    lmi_narrative: Optional[str] = None
    lmi_retrieved_at: Optional[datetime] = None
    created_by: uuid.UUID
    creator_email: Optional[str] = None  # For ownership checks in frontend
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]
    slos: List[SLOItem] = []
    content_items: List[ContentItem] = []
    requisites: List[RequisiteItem] = []

    class Config:
        from_attributes = True


# =============================================================================
# Course List Endpoint
# =============================================================================

@router.get("", response_model=CourseListResponse)
async def list_courses(
    # Filters
    department: Optional[str] = Query(None, description="Filter by department code or ID"),
    status: Optional[CourseStatus] = Query(None, description="Filter by course status"),
    search: Optional[str] = Query(None, description="Search in title or course number"),
    created_by: Optional[uuid.UUID] = Query(None, description="Filter by creator"),
    mine: bool = Query(False, description="Filter to only courses created by the current user"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    # Dependencies
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List courses with filtering, search, and pagination.

    **Filters:**
    - `department`: Filter by department code (e.g., "MATH") or department UUID
    - `status`: Filter by workflow status (Draft, DeptReview, etc.)
    - `search`: Search in course title or number
    - `created_by`: Filter by creator user ID
    - `mine`: If true, filter to only courses created by the current user

    **Pagination:**
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 20, max: 100)

    Returns paginated list with total count for pagination UI.
    """
    # Build base query with eager loading for department (prevents N+1 queries)
    query = select(Course).options(joinedload(Course.department))
    count_query = select(func.count(Course.id))

    # Apply department filter
    if department:
        # Try to parse as UUID first
        try:
            dept_uuid = uuid.UUID(department)
            query = query.where(Course.department_id == dept_uuid)
            count_query = count_query.where(Course.department_id == dept_uuid)
        except ValueError:
            # Not a UUID, treat as department code
            dept_subquery = select(Department.id).where(Department.code == department.upper())
            query = query.where(Course.department_id.in_(dept_subquery))
            count_query = count_query.where(Course.department_id.in_(dept_subquery))

    # Apply status filter
    if status:
        query = query.where(Course.status == status)
        count_query = count_query.where(Course.status == status)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Course.title.ilike(search_term),
                Course.course_number.ilike(search_term),
                Course.subject_code.ilike(search_term),
            )
        )
        count_query = count_query.where(
            or_(
                Course.title.ilike(search_term),
                Course.course_number.ilike(search_term),
                Course.subject_code.ilike(search_term),
            )
        )

    # Apply created_by filter
    if created_by:
        query = query.where(Course.created_by == created_by)
        count_query = count_query.where(Course.created_by == created_by)

    # Apply mine filter (overrides created_by if both specified)
    if mine:
        query = query.where(Course.created_by == current_user.id)
        count_query = count_query.where(Course.created_by == current_user.id)

    # Get total count
    total = session.exec(count_query).one()

    # Apply pagination and ordering
    offset = (page - 1) * limit
    query = query.order_by(Course.updated_at.desc()).offset(offset).limit(limit)

    # Execute query
    courses = session.exec(query).all()

    # Build response items with department info (already loaded via joinedload)
    items = []
    for course in courses:
        # Department is already loaded via eager loading - no additional query
        dept_info = None
        if course.department:
            dept_info = DepartmentInfo(
                id=course.department.id,
                name=course.department.name,
                code=course.department.code
            )

        items.append(CourseListItem(
            id=course.id,
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            units=course.units,
            status=course.status,
            department_id=course.department_id,
            department=dept_info,
            created_at=course.created_at,
            updated_at=course.updated_at,
        ))

    # Calculate total pages
    pages = (total + limit - 1) // limit if total > 0 else 1

    return CourseListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# =============================================================================
# Course Search Endpoint (Simple search for requisites, cross-listings, etc.)
# =============================================================================

class CourseSearchItem(BaseModel):
    """Minimal course info for search results."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    status: CourseStatus
    department_id: uuid.UUID
    department_name: Optional[str] = None
    department_code: Optional[str] = None

    class Config:
        from_attributes = True


class CourseSearchResponse(BaseModel):
    """Response for course search."""
    items: List[CourseSearchItem]
    total: int


@router.get("/search", response_model=CourseSearchResponse)
async def search_courses(
    q: str = Query(..., min_length=1, description="Search query (course code, number, or title)"),
    exclude_id: Optional[uuid.UUID] = Query(None, description="Course ID to exclude from results"),
    status: Optional[CourseStatus] = Query(None, description="Filter by status"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Search for courses by code, number, or title.

    This is a simplified search endpoint optimized for course lookups in
    requisites, cross-listings, and program management.

    **Parameters:**
    - `q`: Search query (matches subject_code, course_number, or title)
    - `exclude_id`: Optional course ID to exclude (useful for self-reference prevention)
    - `status`: Optional status filter
    - `limit`: Maximum results (default: 20, max: 100)

    **Returns:**
    Minimal course info suitable for selection UIs.
    """
    search_term = f"%{q}%"

    # Build search query
    query = select(Course).where(
        or_(
            Course.title.ilike(search_term),
            Course.subject_code.ilike(search_term),
            Course.course_number.ilike(search_term),
            # Also search combined "SUBJ 101" format
            (Course.subject_code + " " + Course.course_number).ilike(search_term),
        )
    )

    # Count query (without exclude filter for accurate total)
    count_query = select(func.count(Course.id)).where(
        or_(
            Course.title.ilike(search_term),
            Course.subject_code.ilike(search_term),
            Course.course_number.ilike(search_term),
            (Course.subject_code + " " + Course.course_number).ilike(search_term),
        )
    )

    # Apply exclude filter
    if exclude_id:
        query = query.where(Course.id != exclude_id)

    # Apply status filter
    if status:
        query = query.where(Course.status == status)
        count_query = count_query.where(Course.status == status)

    # Get total count
    total = session.exec(count_query).one()

    # Apply ordering and limit
    query = query.order_by(Course.subject_code, Course.course_number).limit(limit)

    # Execute query
    courses = session.exec(query).all()

    # Build response with department info
    items = []
    for course in courses:
        dept = session.get(Department, course.department_id) if course.department_id else None
        items.append(CourseSearchItem(
            id=course.id,
            subject_code=course.subject_code,
            course_number=course.course_number,
            title=course.title,
            units=course.units,
            status=course.status,
            department_id=course.department_id,
            department_name=dept.name if dept else None,
            department_code=dept.code if dept else None,
        ))

    return CourseSearchResponse(items=items, total=total)


# =============================================================================
# Course Detail Endpoint
# =============================================================================

@router.get("/{course_id}", response_model=CourseDetailResponse)
async def get_course(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get a single course with full details including SLOs and content outline.

    Uses eager loading to fetch all related data in minimal queries (prevents N+1).
    """
    # Use eager loading to fetch course with all related data in a single query
    # - joinedload for single relationships (department)
    # - selectinload for collections (slos, content_items, requisites)
    query = (
        select(Course)
        .options(
            joinedload(Course.department),
            selectinload(Course.slos),
            selectinload(Course.content_items),
            selectinload(Course.requisites).selectinload(CourseRequisite.requisite_course),
        )
        .where(Course.id == course_id)
    )

    result = session.exec(query).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    course = result

    # Department is already loaded via eager loading
    dept_info = None
    if course.department:
        dept_info = DepartmentInfo(
            id=course.department.id,
            name=course.department.name,
            code=course.department.code
        )

    # SLOs are already loaded - just sort them
    slos = sorted(course.slos, key=lambda s: s.sequence)

    # Content items are already loaded - just sort them
    content_items = sorted(course.content_items, key=lambda c: c.sequence)

    # Build requisite items (requisite_course is already loaded via selectinload)
    requisite_items = []
    for req in course.requisites:
        req_course_info = None
        if req.requisite_course:
            req_course_info = RequisiteCourseInfo(
                id=req.requisite_course.id,
                subject_code=req.requisite_course.subject_code,
                course_number=req.requisite_course.course_number,
                title=req.requisite_course.title,
            )
        requisite_items.append(RequisiteItem(
            id=req.id,
            type=req.type.value,
            requisite_course_id=req.requisite_course_id,
            requisite_course=req_course_info,
            requisite_text=req.requisite_text,
            content_review=req.content_review,
        ))

    # Calculate total student hours using the 54-hour rule (Title 5 § 55002.5)
    # Users enter WEEKLY hours, we calculate SEMESTER totals:
    # - Lecture: weekly hours × 18 weeks per semester
    # - Lab: weekly hours × 54 (labs count 1:1 with student hours)
    # - Outside of class (homework): weekly hours × 18 weeks per semester
    # Total Student Hours / 54 = Units
    calculated_total_hours = (
        (int(course.lecture_hours) * 18) +  # Lecture hours × 18 weeks
        (int(course.lab_hours) * 54) +      # Lab hours × 54 (direct mapping)
        (int(course.outside_of_class_hours) * 18)   # Outside-of-class hours × 18 weeks
    )

    # Look up creator email for ownership checks in frontend
    creator_email = None
    if course.created_by:
        creator = session.get(User, course.created_by)
        if creator:
            creator_email = creator.email

    return CourseDetailResponse(
        id=course.id,
        subject_code=course.subject_code,
        course_number=course.course_number,
        title=course.title,
        catalog_description=course.catalog_description,
        units=course.units,
        lecture_hours=int(course.lecture_hours),
        lab_hours=int(course.lab_hours),
        activity_hours=int(course.activity_hours),
        tba_hours=int(course.tba_hours),
        outside_of_class_hours=int(course.outside_of_class_hours),
        total_student_learning_hours=calculated_total_hours,
        status=course.status,
        version=course.version,
        effective_term=course.effective_term,
        ccn_id=course.ccn_id,
        department_id=course.department_id,
        department=dept_info,
        cb_codes=course.cb_codes,
        transferability=course.transferability,
        ge_applicability=course.ge_applicability,
        # LMI (Labor Market Information) fields
        lmi_data=course.lmi_data or {},
        lmi_soc_code=course.lmi_soc_code,
        lmi_occupation_title=course.lmi_occupation_title,
        lmi_wage_data=course.lmi_wage_data,
        lmi_projection_data=course.lmi_projection_data,
        lmi_narrative=course.lmi_narrative,
        lmi_retrieved_at=course.lmi_retrieved_at,
        created_by=course.created_by,
        creator_email=creator_email,
        created_at=course.created_at,
        updated_at=course.updated_at,
        approved_at=course.approved_at,
        slos=[SLOItem(
            id=slo.id,
            sequence=slo.sequence,
            outcome_text=slo.outcome_text,
            bloom_level=slo.bloom_level.value,
            performance_criteria=slo.performance_criteria,
        ) for slo in slos],
        content_items=[ContentItem(
            id=item.id,
            sequence=item.sequence,
            topic=item.topic,
            subtopics=item.subtopics,
            hours_allocated=item.hours_allocated,
            linked_slos=item.linked_slos,
        ) for item in content_items],
        requisites=requisite_items,
    )


# =============================================================================
# Course Create Endpoint
# =============================================================================

class CourseCreateRequest(BaseModel):
    """Request schema for creating a course."""
    subject_code: str
    course_number: str
    title: str
    department_id: uuid.UUID
    catalog_description: Optional[str] = None
    units: Decimal = Decimal("3.0")
    lecture_hours: int = 0
    lab_hours: int = 0
    activity_hours: int = 0
    tba_hours: int = 0
    outside_of_class_hours: int = 0
    total_student_learning_hours: int = 0
    effective_term: Optional[str] = None
    ccn_id: Optional[str] = None
    cb_codes: Dict[str, Any] = {}
    transferability: Dict[str, Any] = {}
    ge_applicability: Dict[str, Any] = {}


@router.post("", response_model=CourseDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_data: CourseCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new course in Draft status.

    The course will be assigned to the current user as creator.
    Status is automatically set to Draft.
    """
    # Verify department exists
    dept = session.get(Department, course_data.department_id)
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department not found"
        )

    # Check for duplicate course
    existing = session.exec(
        select(Course).where(
            Course.subject_code == course_data.subject_code.upper(),
            Course.course_number == course_data.course_number,
            Course.department_id == course_data.department_id,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Course {course_data.subject_code} {course_data.course_number} already exists"
        )

    # Validate 54-hour rule compliance (Title 5 § 55002.5) if hours are specified
    if course_data.lecture_hours or course_data.lab_hours or course_data.outside_of_class_hours:
        is_valid, error_message = validate_54_hour_rule(
            units=course_data.units,
            lecture_hours=course_data.lecture_hours,
            lab_hours=course_data.lab_hours,
            outside_of_class_hours=course_data.outside_of_class_hours,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_message
            )

    # Create course
    course = Course(
        subject_code=course_data.subject_code.upper(),
        course_number=course_data.course_number,
        title=course_data.title,
        catalog_description=course_data.catalog_description,
        units=course_data.units,
        lecture_hours=course_data.lecture_hours,
        lab_hours=course_data.lab_hours,
        activity_hours=course_data.activity_hours,
        tba_hours=course_data.tba_hours,
        outside_of_class_hours=course_data.outside_of_class_hours,
        total_student_learning_hours=course_data.total_student_learning_hours,
        effective_term=course_data.effective_term,
        ccn_id=course_data.ccn_id,
        department_id=course_data.department_id,
        cb_codes=course_data.cb_codes,
        transferability=course_data.transferability,
        ge_applicability=course_data.ge_applicability,
        status=CourseStatus.DRAFT,
        created_by=current_user.id,
    )

    session.add(course)
    session.commit()
    session.refresh(course)

    # Return full course detail
    dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

    # Calculate total student hours using the 54-hour rule (Title 5 § 55002.5)
    calculated_total_hours = (
        (int(course.lecture_hours) * 18) +  # Lecture hours × 18 weeks
        (int(course.lab_hours) * 54) +      # Lab hours × 54 (direct mapping)
        (int(course.outside_of_class_hours) * 18)   # Outside-of-class hours × 18 weeks
    )

    return CourseDetailResponse(
        id=course.id,
        subject_code=course.subject_code,
        course_number=course.course_number,
        title=course.title,
        catalog_description=course.catalog_description,
        units=course.units,
        lecture_hours=int(course.lecture_hours),
        lab_hours=int(course.lab_hours),
        activity_hours=int(course.activity_hours),
        tba_hours=int(course.tba_hours),
        outside_of_class_hours=int(course.outside_of_class_hours),
        total_student_learning_hours=calculated_total_hours,
        status=course.status,
        version=course.version,
        effective_term=course.effective_term,
        ccn_id=course.ccn_id,
        department_id=course.department_id,
        department=dept_info,
        cb_codes=course.cb_codes,
        transferability=course.transferability,
        ge_applicability=course.ge_applicability,
        created_by=course.created_by,
        creator_email=current_user.email,  # Current user is the creator
        created_at=course.created_at,
        updated_at=course.updated_at,
        approved_at=course.approved_at,
        slos=[],
        content_items=[],
    )


# =============================================================================
# Course Update Endpoint
# =============================================================================

@router.put("/{course_id}", response_model=CourseDetailResponse)
async def update_course(
    course_id: uuid.UUID,
    course_data: CourseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update an existing course.

    Only the creator or admins can update a course.
    Only Draft courses can be edited.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Update fields
    update_data = course_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(course, key, value)

    # Validate 54-hour rule compliance (Title 5 § 55002.5)
    # Get the final values after update (use new values if provided, else existing)
    final_units = update_data.get("units", course.units)
    final_lecture_hours = update_data.get("lecture_hours", course.lecture_hours)
    final_lab_hours = update_data.get("lab_hours", course.lab_hours)
    final_outside_hours = update_data.get("outside_of_class_hours", course.outside_of_class_hours)

    # Only validate if all required hours fields are present (not zero defaults)
    # This allows partial saves while still catching violations
    has_hours_data = (
        final_lecture_hours is not None and
        final_lab_hours is not None and
        final_outside_hours is not None
    )

    if has_hours_data and final_units is not None:
        is_valid, error_message = validate_54_hour_rule(
            units=Decimal(str(final_units)),
            lecture_hours=int(final_lecture_hours or 0),
            lab_hours=int(final_lab_hours or 0),
            outside_of_class_hours=int(final_outside_hours or 0),
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_message
            )

    course.updated_at = datetime.utcnow()

    session.add(course)
    session.commit()
    session.refresh(course)

    # Return updated course
    return await get_course(course_id, current_user, session)


# =============================================================================
# Course Duplicate Endpoint (Create New Version)
# =============================================================================

class CourseDuplicateResponse(BaseModel):
    """Response schema for course duplication."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    version: int
    status: CourseStatus
    message: str


@router.post("/{course_id}/duplicate", response_model=CourseDuplicateResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_course(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a duplicate of an existing course as a new draft version.

    This is typically used to create a new version of an approved course
    for modification. The new course will:
    - Copy all course data (title, description, units, hours, CB codes, etc.)
    - Copy all SLOs, content items, and requisites
    - Set status to Draft
    - Increment version number
    - Set created_by to current user
    """
    # Get the source course
    source_course = session.get(Course, course_id)
    if not source_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Get the highest version number for this course (same subject_code and course_number)
    max_version_query = select(func.max(Course.version)).where(
        Course.subject_code == source_course.subject_code,
        Course.course_number == source_course.course_number,
        Course.department_id == source_course.department_id,
    )
    max_version = session.exec(max_version_query).one() or 0
    new_version = max_version + 1

    # Create new course with incremented version
    new_course = Course(
        subject_code=source_course.subject_code,
        course_number=source_course.course_number,
        title=source_course.title,
        catalog_description=source_course.catalog_description,
        units=source_course.units,
        lecture_hours=source_course.lecture_hours,
        lab_hours=source_course.lab_hours,
        activity_hours=source_course.activity_hours,
        tba_hours=source_course.tba_hours,
        outside_of_class_hours=source_course.outside_of_class_hours,
        total_student_learning_hours=source_course.total_student_learning_hours,
        effective_term=None,  # Clear effective term for new version
        ccn_id=source_course.ccn_id,
        department_id=source_course.department_id,
        cb_codes=source_course.cb_codes.copy() if source_course.cb_codes else {},
        transferability=source_course.transferability.copy() if source_course.transferability else {},
        ge_applicability=source_course.ge_applicability.copy() if source_course.ge_applicability else {},
        status=CourseStatus.DRAFT,
        version=new_version,
        created_by=current_user.id,
    )

    session.add(new_course)
    session.flush()  # Get the new course ID

    # Copy SLOs
    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    source_slos = session.exec(slos_query).all()

    for slo in source_slos:
        new_slo = StudentLearningOutcome(
            course_id=new_course.id,
            sequence=slo.sequence,
            outcome_text=slo.outcome_text,
            bloom_level=slo.bloom_level,
            performance_criteria=slo.performance_criteria,
        )
        session.add(new_slo)

    # Copy content items
    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    source_content = session.exec(content_query).all()

    for content in source_content:
        new_content = CourseContent(
            course_id=new_course.id,
            sequence=content.sequence,
            topic=content.topic,
            subtopics=content.subtopics.copy() if content.subtopics else [],
            hours_allocated=content.hours_allocated,
            linked_slos=content.linked_slos.copy() if content.linked_slos else [],
        )
        session.add(new_content)

    # Copy requisites (linking to same requisite courses)
    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    source_requisites = session.exec(requisites_query).all()

    for req in source_requisites:
        new_requisite = CourseRequisite(
            course_id=new_course.id,
            type=req.type,
            requisite_course_id=req.requisite_course_id,
            requisite_text=req.requisite_text,
            content_review=req.content_review,
        )
        session.add(new_requisite)

    session.commit()
    session.refresh(new_course)

    return CourseDuplicateResponse(
        id=new_course.id,
        subject_code=new_course.subject_code,
        course_number=new_course.course_number,
        title=new_course.title,
        version=new_course.version,
        status=new_course.status,
        message=f"Created version {new_version} as draft. You can now edit this version.",
    )


# =============================================================================
# Course Delete Endpoint
# =============================================================================

@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: uuid.UUID,
    current_user: User = Depends(require_admin()),
    session: Session = Depends(get_session),
):
    """
    Delete a course (admin only).

    Only Draft courses can be deleted.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Only allow deleting Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be deleted"
        )

    session.delete(course)
    session.commit()

    return None


# =============================================================================
# Course Requisites Endpoints
# =============================================================================

class RequisiteCreateRequest(BaseModel):
    """Request schema for creating a course requisite."""
    type: RequisiteType
    validation_type: Optional[RequisiteValidationType] = None  # Title 5 compliance type
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_text: Optional[str] = None
    content_review: Optional[str] = None


class RequisiteUpdateRequest(BaseModel):
    """Request schema for updating a course requisite."""
    type: Optional[RequisiteType] = None
    validation_type: Optional[RequisiteValidationType] = None  # Title 5 compliance type
    requisite_course_id: Optional[uuid.UUID] = None
    requisite_text: Optional[str] = None
    content_review: Optional[str] = None


def _build_requisite_item(req: CourseRequisite, session: Session) -> RequisiteItem:
    """Helper to build a RequisiteItem from a CourseRequisite."""
    req_course_info = None
    if req.requisite_course_id:
        req_course = session.get(Course, req.requisite_course_id)
        if req_course:
            req_course_info = RequisiteCourseInfo(
                id=req_course.id,
                subject_code=req_course.subject_code,
                course_number=req_course.course_number,
                title=req_course.title,
            )
    return RequisiteItem(
        id=req.id,
        type=req.type.value,
        requisite_course_id=req.requisite_course_id,
        requisite_course=req_course_info,
        requisite_text=req.requisite_text,
        content_review=req.content_review,
        validation_type=req.validation_type.value if req.validation_type else None,
    )


def _check_circular_dependency(
    course_id: uuid.UUID,
    requisite_course_id: uuid.UUID,
    session: Session,
    visited: Optional[set] = None
) -> bool:
    """
    Check for circular dependencies in requisite chains.
    Returns True if a circular dependency would be created.

    For example: If MATH 102 requires MATH 101, adding MATH 102 as a
    prerequisite for MATH 101 would create a circular dependency.
    """
    if visited is None:
        visited = set()

    # If we've seen this course before, there's a cycle
    if requisite_course_id in visited:
        return True

    # If the requisite course requires the original course, that's circular
    if requisite_course_id == course_id:
        return True

    visited.add(course_id)

    # Check what courses the requisite_course requires
    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == requisite_course_id,
        CourseRequisite.requisite_course_id.isnot(None)
    )
    requisites = session.exec(requisites_query).all()

    for req in requisites:
        if req.requisite_course_id == course_id:
            return True
        # Recursively check deeper levels (limit depth to prevent stack overflow)
        if len(visited) < 10:  # Max depth of 10
            if _check_circular_dependency(course_id, req.requisite_course_id, session, visited):
                return True

    return False


@router.get("/{course_id}/requisites", response_model=List[RequisiteItem])
async def list_course_requisites(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all requisites for a course.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    requisites = session.exec(requisites_query).all()

    # Build requisite items with course info
    requisite_items = [_build_requisite_item(req, session) for req in requisites]

    return requisite_items


@router.get("/{course_id}/requisites/grouped", response_model=RequisitesGroupedResponse)
async def list_course_requisites_grouped(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all requisites for a course, grouped by type (prerequisites, corequisites, advisories).
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    requisites = session.exec(requisites_query).all()

    # Group by type
    prerequisites = []
    corequisites = []
    advisories = []

    for req in requisites:
        item = _build_requisite_item(req, session)
        if req.type == RequisiteType.PREREQUISITE:
            prerequisites.append(item)
        elif req.type == RequisiteType.COREQUISITE:
            corequisites.append(item)
        elif req.type == RequisiteType.ADVISORY:
            advisories.append(item)

    return RequisitesGroupedResponse(
        prerequisites=prerequisites,
        corequisites=corequisites,
        advisories=advisories,
    )


@router.post("/{course_id}/requisites", response_model=RequisiteItem, status_code=status.HTTP_201_CREATED)
async def create_course_requisite(
    course_id: uuid.UUID,
    requisite_data: RequisiteCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new requisite for a course.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Validate requisite_course_id if provided
    req_course_info = None
    if requisite_data.requisite_course_id:
        req_course = session.get(Course, requisite_data.requisite_course_id)
        if not req_course:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Requisite course not found"
            )
        # Prevent self-reference
        if req_course.id == course_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A course cannot be its own requisite"
            )
        # Check for circular dependencies
        if _check_circular_dependency(course_id, requisite_data.requisite_course_id, session):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Circular dependency detected: {req_course.subject_code} {req_course.course_number} "
                       f"already requires this course directly or indirectly"
            )
        req_course_info = RequisiteCourseInfo(
            id=req_course.id,
            subject_code=req_course.subject_code,
            course_number=req_course.course_number,
            title=req_course.title,
        )

    # Create requisite
    requisite = CourseRequisite(
        course_id=course_id,
        type=requisite_data.type,
        validation_type=requisite_data.validation_type,
        requisite_course_id=requisite_data.requisite_course_id,
        requisite_text=requisite_data.requisite_text,
        content_review=requisite_data.content_review,
    )

    session.add(requisite)
    session.commit()
    session.refresh(requisite)

    return _build_requisite_item(requisite, session)


@router.put("/{course_id}/requisites/{requisite_id}", response_model=RequisiteItem)
async def update_course_requisite(
    course_id: uuid.UUID,
    requisite_id: uuid.UUID,
    requisite_data: RequisiteUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update a course requisite (full replacement of provided fields).
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    requisite = session.get(CourseRequisite, requisite_id)
    if not requisite or requisite.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requisite not found"
        )

    # Check for circular dependency if changing requisite_course_id
    if requisite_data.requisite_course_id and requisite_data.requisite_course_id != requisite.requisite_course_id:
        if _check_circular_dependency(course_id, requisite_data.requisite_course_id, session):
            req_course = session.get(Course, requisite_data.requisite_course_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Circular dependency detected: {req_course.subject_code} {req_course.course_number} "
                       f"already requires this course directly or indirectly"
            )

    # Update fields
    update_data = requisite_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(requisite, key, value)

    session.add(requisite)
    session.commit()
    session.refresh(requisite)

    return _build_requisite_item(requisite, session)


@router.patch("/{course_id}/requisites/{requisite_id}", response_model=RequisiteItem)
async def patch_course_requisite(
    course_id: uuid.UUID,
    requisite_id: uuid.UUID,
    requisite_data: RequisiteUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Partially update a course requisite (PATCH semantics).
    Useful for updating just the content_review field for Title 5 compliance.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    requisite = session.get(CourseRequisite, requisite_id)
    if not requisite or requisite.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requisite not found"
        )

    # Check for circular dependency if changing requisite_course_id
    if requisite_data.requisite_course_id and requisite_data.requisite_course_id != requisite.requisite_course_id:
        if _check_circular_dependency(course_id, requisite_data.requisite_course_id, session):
            req_course = session.get(Course, requisite_data.requisite_course_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Circular dependency detected: {req_course.subject_code} {req_course.course_number} "
                       f"already requires this course directly or indirectly"
            )

    # Update only provided fields (PATCH semantics)
    update_data = requisite_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(requisite, key, value)

    session.add(requisite)
    session.commit()
    session.refresh(requisite)

    return _build_requisite_item(requisite, session)


@router.delete("/{course_id}/requisites/{requisite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_requisite(
    course_id: uuid.UUID,
    requisite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Delete a course requisite.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    requisite = session.get(CourseRequisite, requisite_id)
    if not requisite or requisite.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requisite not found"
        )

    session.delete(requisite)
    session.commit()

    return None


# =============================================================================
# Student Learning Outcomes (SLO) Endpoints
# =============================================================================

from app.models.course import BloomLevel, SLORead


class SLOCreateRequest(BaseModel):
    """Request schema for creating an SLO."""
    outcome_text: str
    bloom_level: BloomLevel = BloomLevel.APPLY
    performance_criteria: Optional[str] = None


class SLOUpdateRequest(BaseModel):
    """Request schema for updating an SLO."""
    outcome_text: Optional[str] = None
    bloom_level: Optional[BloomLevel] = None
    performance_criteria: Optional[str] = None


class SLOReorderRequest(BaseModel):
    """Request schema for reordering SLOs."""
    slo_ids: List[uuid.UUID]


class SLOResponse(BaseModel):
    """Response schema for SLO operations."""
    id: uuid.UUID
    course_id: uuid.UUID
    sequence: int
    outcome_text: str
    bloom_level: str
    performance_criteria: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{course_id}/slos", response_model=List[SLOResponse])
async def list_course_slos(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all Student Learning Outcomes for a course, ordered by sequence.

    Returns SLOs with their Bloom's taxonomy level and performance criteria.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    slos = session.exec(slos_query).all()

    return [
        SLOResponse(
            id=slo.id,
            course_id=slo.course_id,
            sequence=slo.sequence,
            outcome_text=slo.outcome_text,
            bloom_level=slo.bloom_level.value,
            performance_criteria=slo.performance_criteria,
            created_at=slo.created_at,
        )
        for slo in slos
    ]


@router.post("/{course_id}/slos", response_model=SLOResponse, status_code=status.HTTP_201_CREATED)
async def create_course_slo(
    course_id: uuid.UUID,
    slo_data: SLOCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new Student Learning Outcome for a course.

    The SLO will be automatically assigned the next sequence number.
    Bloom's taxonomy level defaults to 'Apply' if not specified.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Get the next sequence number
    max_sequence_query = select(func.max(StudentLearningOutcome.sequence)).where(
        StudentLearningOutcome.course_id == course_id
    )
    max_sequence = session.exec(max_sequence_query).one() or 0
    next_sequence = max_sequence + 1

    # Create the SLO
    slo = StudentLearningOutcome(
        course_id=course_id,
        sequence=next_sequence,
        outcome_text=slo_data.outcome_text,
        bloom_level=slo_data.bloom_level,
        performance_criteria=slo_data.performance_criteria,
    )

    session.add(slo)
    session.commit()
    session.refresh(slo)

    return SLOResponse(
        id=slo.id,
        course_id=slo.course_id,
        sequence=slo.sequence,
        outcome_text=slo.outcome_text,
        bloom_level=slo.bloom_level.value,
        performance_criteria=slo.performance_criteria,
        created_at=slo.created_at,
    )


@router.patch("/{course_id}/slos/{slo_id}", response_model=SLOResponse)
async def update_course_slo(
    course_id: uuid.UUID,
    slo_id: uuid.UUID,
    slo_data: SLOUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update a Student Learning Outcome.

    Only the outcome_text, bloom_level, and performance_criteria can be updated.
    Use the reorder endpoint to change sequence.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    slo = session.get(StudentLearningOutcome, slo_id)
    if not slo or slo.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SLO not found"
        )

    # Update fields
    update_data = slo_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(slo, key, value)

    session.add(slo)
    session.commit()
    session.refresh(slo)

    return SLOResponse(
        id=slo.id,
        course_id=slo.course_id,
        sequence=slo.sequence,
        outcome_text=slo.outcome_text,
        bloom_level=slo.bloom_level.value,
        performance_criteria=slo.performance_criteria,
        created_at=slo.created_at,
    )


@router.delete("/{course_id}/slos/{slo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_slo(
    course_id: uuid.UUID,
    slo_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Delete a Student Learning Outcome.

    After deletion, remaining SLOs are NOT automatically resequenced.
    Use the reorder endpoint if you need to update sequence numbers.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    slo = session.get(StudentLearningOutcome, slo_id)
    if not slo or slo.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SLO not found"
        )

    session.delete(slo)
    session.commit()

    return None


@router.put("/{course_id}/slos/reorder", response_model=List[SLOResponse])
async def reorder_course_slos(
    course_id: uuid.UUID,
    reorder_data: SLOReorderRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Reorder Student Learning Outcomes for drag-and-drop functionality.

    The slo_ids array should contain all SLO UUIDs in the desired order.
    Sequence numbers will be assigned based on array position (1-indexed).
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Get all SLOs for this course
    existing_slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    )
    existing_slos = session.exec(existing_slos_query).all()
    existing_ids = {slo.id for slo in existing_slos}

    # Validate that all provided IDs belong to this course
    provided_ids = set(reorder_data.slo_ids)
    if provided_ids != existing_ids:
        missing = existing_ids - provided_ids
        extra = provided_ids - existing_ids
        errors = []
        if missing:
            errors.append(f"Missing SLO IDs: {missing}")
        if extra:
            errors.append(f"Unknown SLO IDs: {extra}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SLO ID mismatch. {'; '.join(errors)}"
        )

    # Create a map for quick lookup
    slo_map = {slo.id: slo for slo in existing_slos}

    # Update sequence numbers based on position in array
    for index, slo_id in enumerate(reorder_data.slo_ids, start=1):
        slo = slo_map[slo_id]
        slo.sequence = index
        session.add(slo)

    session.commit()

    # Return the reordered SLOs
    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    reordered_slos = session.exec(slos_query).all()

    return [
        SLOResponse(
            id=slo.id,
            course_id=slo.course_id,
            sequence=slo.sequence,
            outcome_text=slo.outcome_text,
            bloom_level=slo.bloom_level.value,
            performance_criteria=slo.performance_criteria,
            created_at=slo.created_at,
        )
        for slo in reordered_slos
    ]


# =============================================================================
# Course Content Outline Endpoints
# =============================================================================

from decimal import Decimal as PyDecimal


class ContentCreateRequest(BaseModel):
    """Request schema for creating a content topic."""
    topic: str
    subtopics: List[str] = []
    hours_allocated: float = 0.0
    linked_slos: List[str] = []  # List of SLO UUIDs as strings


class ContentUpdateRequest(BaseModel):
    """Request schema for updating a content topic."""
    topic: Optional[str] = None
    subtopics: Optional[List[str]] = None
    hours_allocated: Optional[float] = None
    linked_slos: Optional[List[str]] = None


class ContentReorderRequest(BaseModel):
    """Request schema for reordering content topics."""
    content_ids: List[uuid.UUID]


class ContentResponse(BaseModel):
    """Response schema for content operations."""
    id: uuid.UUID
    course_id: uuid.UUID
    sequence: int
    topic: str
    subtopics: List[str]
    hours_allocated: float
    linked_slos: List[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{course_id}/content", response_model=List[ContentResponse])
async def list_course_content(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all content topics for a course, ordered by sequence.

    Returns content outline with topics, subtopics, hours allocation,
    and linked SLOs for curriculum mapping.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    content_items = session.exec(content_query).all()

    return [
        ContentResponse(
            id=item.id,
            course_id=item.course_id,
            sequence=item.sequence,
            topic=item.topic,
            subtopics=item.subtopics or [],
            hours_allocated=float(item.hours_allocated),
            linked_slos=item.linked_slos or [],
            created_at=item.created_at,
        )
        for item in content_items
    ]


@router.post("/{course_id}/content", response_model=ContentResponse, status_code=status.HTTP_201_CREATED)
async def create_course_content(
    course_id: uuid.UUID,
    content_data: ContentCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new content topic for a course.

    The topic will be automatically assigned the next sequence number.
    Hours must be a positive number. Linked SLOs should be valid UUIDs
    of SLOs belonging to this course.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Validate hours are positive
    if content_data.hours_allocated < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hours allocated must be a positive number"
        )

    # Get the next sequence number
    max_sequence_query = select(func.max(CourseContent.sequence)).where(
        CourseContent.course_id == course_id
    )
    max_sequence = session.exec(max_sequence_query).one() or 0
    next_sequence = max_sequence + 1

    # Create the content topic
    content = CourseContent(
        course_id=course_id,
        sequence=next_sequence,
        topic=content_data.topic,
        subtopics=content_data.subtopics,
        hours_allocated=PyDecimal(str(content_data.hours_allocated)),
        linked_slos=content_data.linked_slos,
    )

    session.add(content)
    session.commit()
    session.refresh(content)

    return ContentResponse(
        id=content.id,
        course_id=content.course_id,
        sequence=content.sequence,
        topic=content.topic,
        subtopics=content.subtopics or [],
        hours_allocated=float(content.hours_allocated),
        linked_slos=content.linked_slos or [],
        created_at=content.created_at,
    )


@router.patch("/{course_id}/content/{content_id}", response_model=ContentResponse)
async def update_course_content(
    course_id: uuid.UUID,
    content_id: uuid.UUID,
    content_data: ContentUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update a content topic for a course.

    Only provide fields that need to be updated.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Get the content item
    content = session.get(CourseContent, content_id)
    if not content or content.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content topic not found"
        )

    # Update fields if provided
    if content_data.topic is not None:
        content.topic = content_data.topic
    if content_data.subtopics is not None:
        content.subtopics = content_data.subtopics
    if content_data.hours_allocated is not None:
        if content_data.hours_allocated < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hours allocated must be a positive number"
            )
        content.hours_allocated = PyDecimal(str(content_data.hours_allocated))
    if content_data.linked_slos is not None:
        content.linked_slos = content_data.linked_slos

    session.add(content)
    session.commit()
    session.refresh(content)

    return ContentResponse(
        id=content.id,
        course_id=content.course_id,
        sequence=content.sequence,
        topic=content.topic,
        subtopics=content.subtopics or [],
        hours_allocated=float(content.hours_allocated),
        linked_slos=content.linked_slos or [],
        created_at=content.created_at,
    )


@router.delete("/{course_id}/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_content(
    course_id: uuid.UUID,
    content_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Delete a content topic from a course.

    This will remove the topic and resequence remaining topics.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Get the content item
    content = session.get(CourseContent, content_id)
    if not content or content.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content topic not found"
        )

    deleted_sequence = content.sequence

    # Delete the content
    session.delete(content)

    # Resequence remaining content items
    remaining_query = select(CourseContent).where(
        CourseContent.course_id == course_id,
        CourseContent.sequence > deleted_sequence
    )
    remaining_items = session.exec(remaining_query).all()

    for item in remaining_items:
        item.sequence -= 1
        session.add(item)

    session.commit()


@router.put("/{course_id}/content/reorder", response_model=List[ContentResponse])
async def reorder_course_content(
    course_id: uuid.UUID,
    reorder_data: ContentReorderRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Reorder content topics for a course.

    Provide an array of content IDs in the desired order.
    All existing content IDs must be included.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own courses"
        )

    # Only allow editing Draft courses
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft courses can be edited"
        )

    # Get all content items for this course
    existing_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    )
    existing_items = session.exec(existing_query).all()
    existing_ids = {item.id for item in existing_items}

    # Validate that all provided IDs belong to this course
    provided_ids = set(reorder_data.content_ids)
    if provided_ids != existing_ids:
        missing = existing_ids - provided_ids
        extra = provided_ids - existing_ids
        errors = []
        if missing:
            errors.append(f"Missing content IDs: {missing}")
        if extra:
            errors.append(f"Unknown content IDs: {extra}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content ID mismatch. {'; '.join(errors)}"
        )

    # Create a map for quick lookup
    content_map = {item.id: item for item in existing_items}

    # Update sequence numbers based on position in array
    for index, content_id in enumerate(reorder_data.content_ids, start=1):
        item = content_map[content_id]
        item.sequence = index
        session.add(item)

    session.commit()

    # Return the reordered content
    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    reordered_content = session.exec(content_query).all()

    return [
        ContentResponse(
            id=item.id,
            course_id=item.course_id,
            sequence=item.sequence,
            topic=item.topic,
            subtopics=item.subtopics or [],
            hours_allocated=float(item.hours_allocated),
            linked_slos=item.linked_slos or [],
            created_at=item.created_at,
        )
        for item in reordered_content
    ]


# =============================================================================
# Course Version Comparison Endpoint
# =============================================================================

class DiffField(BaseModel):
    """A single field difference in the comparison."""
    field: str
    label: str
    old_value: Any
    new_value: Any
    changed: bool


class SLODiff(BaseModel):
    """SLO comparison item."""
    id: Optional[uuid.UUID] = None
    sequence: int
    outcome_text: str
    bloom_level: str
    change_type: str  # 'added', 'removed', 'modified', 'unchanged'
    old_text: Optional[str] = None


class ContentDiff(BaseModel):
    """Content outline comparison item."""
    id: Optional[uuid.UUID] = None
    sequence: int
    topic: str
    change_type: str  # 'added', 'removed', 'modified', 'unchanged'
    old_topic: Optional[str] = None


class CourseCompareResponse(BaseModel):
    """Response for course version comparison."""
    source_course: Dict[str, Any]
    target_course: Dict[str, Any]
    basic_info_diff: List[DiffField]
    slo_diff: List[SLODiff]
    content_diff: List[ContentDiff]
    cb_codes_diff: List[DiffField]
    has_changes: bool
    summary: str


def get_course_dict(course: Course, session: Session) -> Dict[str, Any]:
    """Convert course to dictionary for comparison."""
    dept = session.get(Department, course.department_id)
    return {
        "id": str(course.id),
        "subject_code": course.subject_code,
        "course_number": course.course_number,
        "title": course.title,
        "catalog_description": course.catalog_description or "",
        "units": float(course.units),
        "lecture_hours": float(course.lecture_hours),
        "lab_hours": float(course.lab_hours),
        "activity_hours": float(course.activity_hours),
        "outside_of_class_hours": float(course.outside_of_class_hours),
        "total_student_learning_hours": float(course.total_student_learning_hours),
        "status": course.status.value,
        "version": course.version,
        "effective_term": course.effective_term,
        "department_name": dept.name if dept else "Unknown",
        "cb_codes": course.cb_codes or {},
        "transferability": course.transferability or {},
        "ge_applicability": course.ge_applicability or {},
    }


def compare_basic_fields(source: Dict, target: Dict) -> List[DiffField]:
    """Compare basic course fields."""
    fields_to_compare = [
        ("title", "Course Title"),
        ("catalog_description", "Catalog Description"),
        ("units", "Units"),
        ("lecture_hours", "Lecture Hours"),
        ("lab_hours", "Lab Hours"),
        ("activity_hours", "Activity Hours"),
        ("outside_of_class_hours", "Outside-of-Class Hours"),
        ("total_student_learning_hours", "Total Student Learning Hours"),
        ("effective_term", "Effective Term"),
    ]

    diffs = []
    for field, label in fields_to_compare:
        old_val = source.get(field)
        new_val = target.get(field)
        changed = old_val != new_val
        diffs.append(DiffField(
            field=field,
            label=label,
            old_value=old_val,
            new_value=new_val,
            changed=changed
        ))
    return diffs


def compare_cb_codes(source: Dict, target: Dict) -> List[DiffField]:
    """Compare CB codes between two versions."""
    source_codes = source.get("cb_codes", {})
    target_codes = target.get("cb_codes", {})

    all_keys = set(list(source_codes.keys()) + list(target_codes.keys()))

    diffs = []
    for key in sorted(all_keys):
        old_val = source_codes.get(key)
        new_val = target_codes.get(key)
        changed = old_val != new_val
        diffs.append(DiffField(
            field=key,
            label=key.upper(),
            old_value=old_val,
            new_value=new_val,
            changed=changed
        ))
    return diffs


def compare_slos(source_slos: List[StudentLearningOutcome], target_slos: List[StudentLearningOutcome]) -> List[SLODiff]:
    """Compare SLOs between two course versions."""
    diffs = []

    # Create maps by sequence number
    source_map = {slo.sequence: slo for slo in source_slos}
    target_map = {slo.sequence: slo for slo in target_slos}

    all_sequences = set(list(source_map.keys()) + list(target_map.keys()))

    for seq in sorted(all_sequences):
        source_slo = source_map.get(seq)
        target_slo = target_map.get(seq)

        if source_slo and target_slo:
            # Both exist - check for modifications
            if source_slo.outcome_text == target_slo.outcome_text and source_slo.bloom_level == target_slo.bloom_level:
                change_type = "unchanged"
            else:
                change_type = "modified"
            diffs.append(SLODiff(
                id=target_slo.id,
                sequence=seq,
                outcome_text=target_slo.outcome_text,
                bloom_level=target_slo.bloom_level.value,
                change_type=change_type,
                old_text=source_slo.outcome_text if change_type == "modified" else None
            ))
        elif target_slo:
            # Only in target - added
            diffs.append(SLODiff(
                id=target_slo.id,
                sequence=seq,
                outcome_text=target_slo.outcome_text,
                bloom_level=target_slo.bloom_level.value,
                change_type="added",
                old_text=None
            ))
        else:
            # Only in source - removed
            diffs.append(SLODiff(
                id=source_slo.id,
                sequence=seq,
                outcome_text=source_slo.outcome_text,
                bloom_level=source_slo.bloom_level.value,
                change_type="removed",
                old_text=None
            ))

    return diffs


def compare_content(source_content: List[CourseContent], target_content: List[CourseContent]) -> List[ContentDiff]:
    """Compare course content outlines between two versions."""
    diffs = []

    # Create maps by sequence number
    source_map = {c.sequence: c for c in source_content}
    target_map = {c.sequence: c for c in target_content}

    all_sequences = set(list(source_map.keys()) + list(target_map.keys()))

    for seq in sorted(all_sequences):
        source_item = source_map.get(seq)
        target_item = target_map.get(seq)

        if source_item and target_item:
            if source_item.topic == target_item.topic:
                change_type = "unchanged"
            else:
                change_type = "modified"
            diffs.append(ContentDiff(
                id=target_item.id,
                sequence=seq,
                topic=target_item.topic,
                change_type=change_type,
                old_topic=source_item.topic if change_type == "modified" else None
            ))
        elif target_item:
            diffs.append(ContentDiff(
                id=target_item.id,
                sequence=seq,
                topic=target_item.topic,
                change_type="added",
                old_topic=None
            ))
        else:
            diffs.append(ContentDiff(
                id=source_item.id,
                sequence=seq,
                topic=source_item.topic,
                change_type="removed",
                old_topic=None
            ))

    return diffs


@router.get("/{course_id}/compare/{other_course_id}", response_model=CourseCompareResponse)
async def compare_courses(
    course_id: uuid.UUID,
    other_course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Compare two course versions side-by-side.

    The source course (course_id) is typically the older version,
    and the target course (other_course_id) is the newer version.

    Returns a detailed diff showing:
    - Basic info changes (title, description, units, hours)
    - SLO changes (added, removed, modified)
    - Content outline changes
    - CB code changes
    """
    # Get both courses
    source_course = session.get(Course, course_id)
    if not source_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source course not found"
        )

    target_course = session.get(Course, other_course_id)
    if not target_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target course not found"
        )

    # Get SLOs for both courses
    source_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == course_id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    target_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == other_course_id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    # Get content for both courses
    source_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == course_id)
        .order_by(CourseContent.sequence)
    ).all()

    target_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == other_course_id)
        .order_by(CourseContent.sequence)
    ).all()

    # Convert to dicts for comparison
    source_dict = get_course_dict(source_course, session)
    target_dict = get_course_dict(target_course, session)

    # Perform comparisons
    basic_diff = compare_basic_fields(source_dict, target_dict)
    cb_codes_diff = compare_cb_codes(source_dict, target_dict)
    slo_diff = compare_slos(list(source_slos), list(target_slos))
    content_diff = compare_content(list(source_content), list(target_content))

    # Check if there are any changes
    has_basic_changes = any(d.changed for d in basic_diff)
    has_cb_changes = any(d.changed for d in cb_codes_diff)
    has_slo_changes = any(s.change_type != "unchanged" for s in slo_diff)
    has_content_changes = any(c.change_type != "unchanged" for c in content_diff)
    has_changes = has_basic_changes or has_cb_changes or has_slo_changes or has_content_changes

    # Generate summary
    changes = []
    basic_changed_count = sum(1 for d in basic_diff if d.changed)
    if basic_changed_count:
        changes.append(f"{basic_changed_count} basic info field(s)")

    slo_added = sum(1 for s in slo_diff if s.change_type == "added")
    slo_removed = sum(1 for s in slo_diff if s.change_type == "removed")
    slo_modified = sum(1 for s in slo_diff if s.change_type == "modified")
    if slo_added or slo_removed or slo_modified:
        slo_parts = []
        if slo_added: slo_parts.append(f"{slo_added} added")
        if slo_removed: slo_parts.append(f"{slo_removed} removed")
        if slo_modified: slo_parts.append(f"{slo_modified} modified")
        changes.append(f"SLOs: {', '.join(slo_parts)}")

    content_added = sum(1 for c in content_diff if c.change_type == "added")
    content_removed = sum(1 for c in content_diff if c.change_type == "removed")
    content_modified = sum(1 for c in content_diff if c.change_type == "modified")
    if content_added or content_removed or content_modified:
        content_parts = []
        if content_added: content_parts.append(f"{content_added} added")
        if content_removed: content_parts.append(f"{content_removed} removed")
        if content_modified: content_parts.append(f"{content_modified} modified")
        changes.append(f"Content topics: {', '.join(content_parts)}")

    cb_changed_count = sum(1 for d in cb_codes_diff if d.changed)
    if cb_changed_count:
        changes.append(f"{cb_changed_count} CB code(s)")

    if changes:
        summary = f"Changes detected: {'; '.join(changes)}"
    else:
        summary = "No differences found between the two versions."

    return CourseCompareResponse(
        source_course=source_dict,
        target_course=target_dict,
        basic_info_diff=basic_diff,
        slo_diff=slo_diff,
        content_diff=content_diff,
        cb_codes_diff=cb_codes_diff,
        has_changes=has_changes,
        summary=summary
    )


@router.get("/{course_id}/versions", response_model=List[CourseListItem])
async def get_course_versions(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get all versions of a course (same subject_code and course_number).

    This is useful for viewing the version history and selecting
    versions to compare.
    """
    # Get the course to find its subject_code and course_number
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Find all courses with the same subject_code and course_number
    query = select(Course).where(
        Course.subject_code == course.subject_code,
        Course.course_number == course.course_number,
    ).order_by(Course.version.desc())

    versions = session.exec(query).all()

    # Get departments for all versions
    dept_ids = list(set(v.department_id for v in versions))
    depts = session.exec(select(Department).where(Department.id.in_(dept_ids))).all()
    dept_map = {d.id: d for d in depts}

    result = []
    for v in versions:
        dept = dept_map.get(v.department_id)
        dept_info = None
        if dept:
            dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

        result.append(CourseListItem(
            id=v.id,
            subject_code=v.subject_code,
            course_number=v.course_number,
            title=v.title,
            units=v.units,
            status=v.status,
            department_id=v.department_id,
            department=dept_info,
            created_at=v.created_at,
            updated_at=v.updated_at,
        ))

    return result


# =============================================================================
# Status Transition Convenience Endpoints
# =============================================================================

class StatusTransitionResponse(BaseModel):
    """Response after a status transition."""
    id: uuid.UUID
    old_status: CourseStatus
    new_status: CourseStatus
    comment: Optional[str] = None
    changed_by: uuid.UUID
    changed_at: datetime


class ReturnRequest(BaseModel):
    """Request body for returning a course with comments."""
    comment: str


# Workflow state machine - defines valid transitions
WORKFLOW_ADVANCE = {
    CourseStatus.DRAFT: CourseStatus.DEPT_REVIEW,
    CourseStatus.DEPT_REVIEW: CourseStatus.CURRICULUM_COMMITTEE,
    CourseStatus.CURRICULUM_COMMITTEE: CourseStatus.ARTICULATION_REVIEW,
    CourseStatus.ARTICULATION_REVIEW: CourseStatus.APPROVED,
}

# Roles allowed to review each status
REVIEWER_ROLES_FOR_STATUS = {
    CourseStatus.DEPT_REVIEW: [UserRole.CURRICULUM_CHAIR, UserRole.ADMIN],
    CourseStatus.CURRICULUM_COMMITTEE: [UserRole.CURRICULUM_CHAIR, UserRole.ADMIN],
    CourseStatus.ARTICULATION_REVIEW: [UserRole.ARTICULATION_OFFICER, UserRole.ADMIN],
}


@router.post("/{course_id}/submit", response_model=StatusTransitionResponse)
async def submit_course_for_review(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Submit a draft course for department review.

    This is the first step in the approval workflow. Only the course author
    (or an admin) can submit their own course for review.

    **Workflow:** Draft → DeptReview
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permissions - only author or admin can submit
    if current_user.role != UserRole.ADMIN and course.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit your own courses"
        )

    # Validate current status
    if course.status != CourseStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit course with status '{course.status.value}'. Only Draft courses can be submitted."
        )

    # CUR-188: Validate LMI data recency for CTE courses
    # CTE courses are identified by CB09 (SAM Priority Code) != 'E' (Non-Occupational)
    cb_codes = course.cb_codes or {}
    cb09 = cb_codes.get("CB09", "")
    is_cte_course = cb09 and cb09 != "E"  # A, B, C, D are all CTE/vocational

    if is_cte_course and course.lmi_soc_code:
        # Course has LMI data attached - validate its age
        is_valid, age_months, validity_status = calculate_lmi_validity(course.lmi_retrieved_at)

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit CTE course: LMI data is {age_months} months old and exceeds the 24-month limit. "
                       f"Per community colleges Technical Manual, LMI data must be less than 2 years old. "
                       f"Please refresh the LMI data before submitting."
            )
        elif validity_status == "warning":
            # Log warning but allow submission (18-24 months old)
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Course {course.id} submitted with aging LMI data ({age_months} months old). "
                f"Consider refreshing before final approval."
            )

    old_status = course.status
    new_status = CourseStatus.DEPT_REVIEW

    # Update course status
    course.status = new_status
    course.updated_at = datetime.utcnow()

    # Create workflow history record
    workflow_history = WorkflowHistory(
        entity_type=EntityType.COURSE,
        entity_id=course.id,
        from_status=old_status.value,
        to_status=new_status.value,
        comment="Submitted for review",
        changed_by=current_user.id,
    )

    session.add(course)
    session.add(workflow_history)

    # Create notifications for reviewers (CurriculumChair and Admin users)
    course_title = f"{course.subject_code} {course.course_number} - {course.title}"
    reviewer_query = select(User).where(
        User.role.in_([UserRole.CURRICULUM_CHAIR, UserRole.ADMIN]),
        User.id != current_user.id  # Don't notify yourself
    )
    reviewers = session.exec(reviewer_query).all()

    for reviewer in reviewers:
        notification = Notification(
            user_id=reviewer.id,
            type=NotificationType.COURSE_SUBMITTED,
            title="Course Submitted for Review",
            message=f"{course_title} has been submitted and is awaiting your review.",
            entity_type="Course",
            entity_id=course.id,
            entity_title=course_title,
            actor_id=current_user.id,
        )
        session.add(notification)

    session.commit()
    session.refresh(workflow_history)

    return StatusTransitionResponse(
        id=workflow_history.id,
        old_status=old_status,
        new_status=new_status,
        comment="Submitted for review",
        changed_by=current_user.id,
        changed_at=workflow_history.created_at,
    )


@router.post("/{course_id}/approve", response_model=StatusTransitionResponse)
async def approve_course(
    course_id: uuid.UUID,
    current_user: User = Depends(require_reviewer()),
    session: Session = Depends(get_session),
):
    """
    Approve a course and advance it to the next workflow stage.

    This endpoint advances the course through the workflow:
    - DeptReview → CurriculumCommittee (by CurriculumChair)
    - CurriculumCommittee → ArticulationReview (by CurriculumChair)
    - ArticulationReview → Approved (by ArticulationOfficer)

    Only users with appropriate reviewer roles can approve courses at their stage.
    Admin users can approve at any stage.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    old_status = course.status

    # Check if course is in a reviewable status
    if old_status not in REVIEWER_ROLES_FOR_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Course with status '{old_status.value}' cannot be approved. Must be in a review status."
        )

    # Check if user has permission to review this status
    allowed_roles = REVIEWER_ROLES_FOR_STATUS[old_status]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role ({current_user.role.value}) cannot approve courses in '{old_status.value}' status"
        )

    # Get the next status in the workflow
    new_status = WORKFLOW_ADVANCE.get(old_status)
    if not new_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No valid transition from '{old_status.value}' status"
        )

    # Update course status
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
        comment=f"Approved by {current_user.full_name}",
        changed_by=current_user.id,
    )

    session.add(course)
    session.add(workflow_history)

    # Create notification for the course author
    course_title = f"{course.subject_code} {course.course_number} - {course.title}"
    if course.created_by and course.created_by != current_user.id:
        notification = Notification(
            user_id=course.created_by,
            type=NotificationType.COURSE_APPROVED,
            title="Course Approved",
            message=f"Your course {course_title} has been approved and advanced to {new_status.value}.",
            entity_type="Course",
            entity_id=course.id,
            entity_title=course_title,
            actor_id=current_user.id,
        )
        session.add(notification)

    session.commit()
    session.refresh(workflow_history)

    return StatusTransitionResponse(
        id=workflow_history.id,
        old_status=old_status,
        new_status=new_status,
        comment=f"Approved by {current_user.full_name}",
        changed_by=current_user.id,
        changed_at=workflow_history.created_at,
    )


@router.post("/{course_id}/return", response_model=StatusTransitionResponse)
async def return_course_for_revision(
    course_id: uuid.UUID,
    request: ReturnRequest,
    current_user: User = Depends(require_reviewer()),
    session: Session = Depends(get_session),
):
    """
    Return a course to the author for revisions.

    This endpoint returns the course to Draft status with a comment explaining
    what changes are needed. A comment is required.

    Only users with appropriate reviewer roles can return courses.
    Admin users can return courses at any review stage.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    old_status = course.status

    # Check if course is in a reviewable status
    if old_status not in REVIEWER_ROLES_FOR_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Course with status '{old_status.value}' cannot be returned. Must be in a review status."
        )

    # Check if user has permission to review this status
    allowed_roles = REVIEWER_ROLES_FOR_STATUS[old_status]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role ({current_user.role.value}) cannot return courses in '{old_status.value}' status"
        )

    # Validate comment is not empty
    if not request.comment or not request.comment.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A comment explaining the required changes is required when returning a course"
        )

    new_status = CourseStatus.DRAFT

    # Update course status
    course.status = new_status
    course.updated_at = datetime.utcnow()

    # Create workflow history record
    workflow_history = WorkflowHistory(
        entity_type=EntityType.COURSE,
        entity_id=course.id,
        from_status=old_status.value,
        to_status=new_status.value,
        comment=request.comment.strip(),
        changed_by=current_user.id,
    )

    session.add(course)
    session.add(workflow_history)

    # Create notification for the course author
    course_title = f"{course.subject_code} {course.course_number} - {course.title}"
    if course.created_by and course.created_by != current_user.id:
        comment_preview = request.comment.strip()[:100] + "..." if len(request.comment.strip()) > 100 else request.comment.strip()
        notification = Notification(
            user_id=course.created_by,
            type=NotificationType.COURSE_RETURNED,
            title="Course Returned for Revision",
            message=f"Your course {course_title} has been returned for revision. Comment: {comment_preview}",
            entity_type="Course",
            entity_id=course.id,
            entity_title=course_title,
            actor_id=current_user.id,
        )
        session.add(notification)

    session.commit()
    session.refresh(workflow_history)

    return StatusTransitionResponse(
        id=workflow_history.id,
        old_status=old_status,
        new_status=new_status,
        comment=request.comment.strip(),
        changed_by=current_user.id,
        changed_at=workflow_history.created_at,
    )


# =============================================================================
# LMI (Labor Market Information) Endpoints - CUR-191
# =============================================================================

class LMIAttachRequest(BaseModel):
    """Request to attach LMI data to a course."""
    soc_code: str  # e.g., "29-1141"
    occupation_title: str  # e.g., "Registered Nurses"
    area: Optional[str] = None  # e.g., "Los Angeles County"
    wage_data: Optional[Dict[str, Any]] = None
    projection_data: Optional[Dict[str, Any]] = None


class LMIDataResponse(BaseModel):
    """Response with course LMI data."""
    soc_code: Optional[str] = None
    occupation_title: Optional[str] = None
    area: Optional[str] = None
    retrieved_at: Optional[datetime] = None
    is_valid: bool = True  # Based on age (< 24 months = valid)
    age_months: int = 0
    validity_status: str = "valid"  # valid, warning, invalid
    wage_data: Optional[Dict[str, Any]] = None
    projection_data: Optional[Dict[str, Any]] = None
    narrative: Optional[str] = None


class LMINarrativeUpdateRequest(BaseModel):
    """Request to update LMI narrative."""
    narrative: str


class LMIRefreshResponse(BaseModel):
    """Response from refreshing LMI data."""
    message: str
    previous_retrieved_at: Optional[datetime] = None
    new_retrieved_at: Optional[datetime] = None
    changes: Dict[str, Any]  # Shows what changed (wage_data, projection_data, etc.)


def calculate_lmi_validity(retrieved_at: Optional[datetime]) -> tuple[bool, int, str]:
    """
    Calculate LMI data validity based on age.

    Returns:
        Tuple of (is_valid, age_months, status)
        - is_valid: True if data is usable (< 24 months)
        - age_months: Age of the data in months
        - status: 'valid' (0-18), 'warning' (18-24), 'invalid' (>24)
    """
    if not retrieved_at:
        return False, 0, "invalid"

    from datetime import timezone
    now = datetime.now(timezone.utc) if retrieved_at.tzinfo else datetime.utcnow()
    age_delta = now - retrieved_at
    age_months = int(age_delta.days / 30)

    if age_months <= 18:
        return True, age_months, "valid"
    elif age_months <= 24:
        return True, age_months, "warning"
    else:
        return False, age_months, "invalid"


@router.post("/{course_id}/lmi", response_model=Dict[str, Any])
async def attach_lmi_to_course(
    course_id: uuid.UUID,
    lmi_data: LMIAttachRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Attach LMI (Labor Market Information) data to a course.

    This endpoint stores occupation data, wage statistics, and employment
    projections for Career Technical Education (CTE) courses.
    """
    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permission (creator or admin)
    if course.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course creator or admin can attach LMI data"
        )

    # Update LMI fields
    course.lmi_soc_code = lmi_data.soc_code
    course.lmi_occupation_title = lmi_data.occupation_title
    course.lmi_area = lmi_data.area
    course.lmi_wage_data = lmi_data.wage_data
    course.lmi_projection_data = lmi_data.projection_data
    course.lmi_retrieved_at = datetime.utcnow()
    course.updated_at = datetime.utcnow()

    session.add(course)
    session.commit()
    session.refresh(course)

    return {
        "message": "LMI data attached successfully",
        "retrieved_at": course.lmi_retrieved_at.isoformat() if course.lmi_retrieved_at else None,
    }


@router.get("/{course_id}/lmi", response_model=LMIDataResponse)
async def get_course_lmi(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get LMI (Labor Market Information) data for a course.

    Returns the attached occupation data with validity status based on data age.
    """
    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check if LMI data exists
    if not course.lmi_soc_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No LMI data attached to this course"
        )

    # Calculate validity
    is_valid, age_months, validity_status = calculate_lmi_validity(course.lmi_retrieved_at)

    return LMIDataResponse(
        soc_code=course.lmi_soc_code,
        occupation_title=course.lmi_occupation_title,
        area=course.lmi_area,
        retrieved_at=course.lmi_retrieved_at,
        is_valid=is_valid,
        age_months=age_months,
        validity_status=validity_status,
        wage_data=course.lmi_wage_data,
        projection_data=course.lmi_projection_data,
        narrative=course.lmi_narrative,
    )


@router.get("/{course_id}/lmi/export")
async def export_lmi_pdf(
    course_id: uuid.UUID,
    format: str = Query(default="pdf", description="Export format (currently only 'pdf' supported)"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Export LMI data as a PDF report.

    Generates a professional PDF report containing all Labor Market Information
    data attached to the course. Suitable for inclusion in CTE program proposals
    and Course Outline of Record documentation.

    The report includes:
    - Course information header
    - Target occupation (SOC code, title, geographic area)
    - Wage data table with all percentiles
    - Employment projections
    - Narrative text (if available)
    - Data source attribution

    Returns:
        PDF file as attachment download
    """
    # Validate format
    if format.lower() != "pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported export format: {format}. Only 'pdf' is currently supported."
        )

    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check if LMI data exists
    if not course.lmi_soc_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No LMI data attached to this course. Attach LMI data before exporting."
        )

    # Prepare LMI data for PDF generation
    lmi_data = {
        "soc_code": course.lmi_soc_code,
        "occupation_title": course.lmi_occupation_title,
        "area": course.lmi_area,
        "retrieved_at": course.lmi_retrieved_at.isoformat() if course.lmi_retrieved_at else None,
        "wage_data": course.lmi_wage_data,
        "projection_data": course.lmi_projection_data,
        "narrative": course.lmi_narrative,
    }

    # Generate course code
    course_code = f"{course.subject_code} {course.course_number}"

    try:
        # Generate PDF
        pdf_bytes = generate_lmi_pdf(
            course_code=course_code,
            course_title=course.title,
            lmi_data=lmi_data,
        )

        # Create filename
        safe_course_code = course_code.replace(" ", "_").replace("/", "_")
        filename = f"{safe_course_code}_LMI_Report.pdf"

        # Return PDF response
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate PDF report: {str(e)}"
        )


@router.put("/{course_id}/lmi/narrative", response_model=Dict[str, Any])
async def update_lmi_narrative(
    course_id: uuid.UUID,
    request: LMINarrativeUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update the LMI narrative for a course.

    The narrative is user-editable text describing the labor market
    outlook for the occupation.
    """
    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permission
    if course.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course creator or admin can update LMI narrative"
        )

    # Check if LMI data exists
    if not course.lmi_soc_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No LMI data attached to this course. Attach LMI data first."
        )

    # Update narrative
    course.lmi_narrative = request.narrative
    course.updated_at = datetime.utcnow()

    session.add(course)
    session.commit()

    return {
        "message": "LMI narrative updated successfully",
        "narrative_length": len(request.narrative),
    }


@router.delete("/{course_id}/lmi", response_model=Dict[str, Any])
async def remove_lmi_from_course(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Remove LMI data from a course.

    Clears all LMI fields including the narrative.
    """
    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permission
    if course.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course creator or admin can remove LMI data"
        )

    # Clear all LMI fields
    course.lmi_soc_code = None
    course.lmi_occupation_title = None
    course.lmi_area = None
    course.lmi_retrieved_at = None
    course.lmi_wage_data = None
    course.lmi_projection_data = None
    course.lmi_narrative = None
    course.updated_at = datetime.utcnow()

    session.add(course)
    session.commit()

    return {
        "message": "LMI data removed successfully",
    }


@router.post("/{course_id}/lmi/refresh", response_model=LMIRefreshResponse)
async def refresh_lmi_data(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Refresh LMI data for a course by re-fetching from CKAN API.

    Uses the stored SOC code to fetch the latest wage and projection data
    from the California EDD public datasets. Preserves the user-edited
    narrative and updates all other LMI fields with fresh data.

    Returns a comparison of what changed between the old and new data.
    """
    # Get course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check permission
    if course.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course creator or admin can refresh LMI data"
        )

    # Check if LMI data exists
    if not course.lmi_soc_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No LMI data attached to this course. Attach LMI data first."
        )

    # Store previous data for comparison
    previous_retrieved_at = course.lmi_retrieved_at
    previous_wage_data = course.lmi_wage_data
    previous_projection_data = course.lmi_projection_data

    try:
        # Fetch fresh data from CKAN using SOC code
        async with LMIClient() as lmi_client:
            # Search for wage data by SOC code
            wage_results = await lmi_client.search_wages_by_soc(
                soc_code=course.lmi_soc_code,
                area=course.lmi_area
            )

            if not wage_results:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Occupation with SOC code {course.lmi_soc_code} not found in CKAN data"
                )

            # Get the most recent wage data
            latest_wage = wage_results[0]

            # Search for projection data by SOC code
            projection_results = await lmi_client.search_projections_by_soc(
                soc_code=course.lmi_soc_code,
                area=course.lmi_area
            )

            # Get the most recent projection data (if available)
            latest_projection = projection_results[0] if projection_results else None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch data from CKAN API: {str(e)}"
        )

    # Prepare new data dictionaries
    new_wage_data = latest_wage.dict(exclude_none=True)
    new_projection_data = latest_projection.dict(exclude_none=True) if latest_projection else None

    # Update course with fresh data
    # Keep occupation title and area if they haven't changed
    if latest_wage.occupation_title:
        course.lmi_occupation_title = latest_wage.occupation_title
    if latest_wage.area:
        course.lmi_area = latest_wage.area

    course.lmi_wage_data = new_wage_data
    course.lmi_projection_data = new_projection_data
    course.lmi_retrieved_at = datetime.utcnow()
    course.updated_at = datetime.utcnow()
    # Note: lmi_narrative is preserved (user-edited content)

    session.add(course)
    session.commit()

    # Calculate what changed
    changes = {
        "wage_data": new_wage_data != previous_wage_data,
        "projection_data": new_projection_data != previous_projection_data,
        "retrieved_at_updated": True,  # Always true since we just refreshed
    }

    return LMIRefreshResponse(
        message="LMI data refreshed successfully",
        previous_retrieved_at=previous_retrieved_at,
        new_retrieved_at=course.lmi_retrieved_at,
        changes=changes,
    )
