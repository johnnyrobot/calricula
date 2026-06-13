"""
Programs API Routes

Provides endpoints for academic program (degrees and certificates) management:
- List programs with filtering and pagination
- Get single program with full details
- Create new program
- Update existing program
- Delete program (admin only)
"""

import uuid
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, func, or_
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user, require_admin
from app.models.user import User, UserRole
from app.models.program import (
    Program,
    ProgramCreate,
    ProgramRead,
    ProgramUpdate,
    ProgramType,
    ProgramStatus,
    ProgramCourse,
    RequirementType,
)
from app.models.department import Department
from app.models.course import Course

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

class DepartmentInfo(BaseModel):
    """Minimal department info for program list."""
    id: uuid.UUID
    name: str
    code: str


class ProgramListItem(BaseModel):
    """Program item for list view (minimal data for performance)."""
    id: uuid.UUID
    title: str
    type: ProgramType
    total_units: Decimal
    status: ProgramStatus
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProgramListResponse(BaseModel):
    """Paginated response for program list."""
    items: List[ProgramListItem]
    total: int
    page: int
    limit: int
    pages: int


class CourseInProgramItem(BaseModel):
    """Course item within a program."""
    id: uuid.UUID
    course_id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    requirement_type: RequirementType
    sequence: int
    units_applied: Decimal

    class Config:
        from_attributes = True


class ProgramDetailResponse(BaseModel):
    """Full program detail including courses."""
    id: uuid.UUID
    title: str
    type: ProgramType
    catalog_description: Optional[str]
    total_units: Decimal
    status: ProgramStatus
    top_code: Optional[str]
    cip_code: Optional[str]
    program_narrative: Optional[str]
    is_high_unit_major: bool = False
    department_id: uuid.UUID
    department: Optional[DepartmentInfo] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    courses: List[CourseInProgramItem] = []

    class Config:
        from_attributes = True


# =============================================================================
# Program List Endpoint
# =============================================================================

@router.get("", response_model=ProgramListResponse)
async def list_programs(
    # Filters
    department: Optional[str] = Query(None, description="Filter by department code or ID"),
    type: Optional[ProgramType] = Query(None, description="Filter by program type"),
    status: Optional[ProgramStatus] = Query(None, description="Filter by program status"),
    search: Optional[str] = Query(None, description="Search in title"),
    created_by: Optional[uuid.UUID] = Query(None, description="Filter by creator"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    # Dependencies
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List programs with filtering, search, and pagination.

    **Filters:**
    - `department`: Filter by department code (e.g., "MATH") or department UUID
    - `type`: Filter by program type (AA, AS, Certificate, etc.)
    - `status`: Filter by workflow status (Draft, Review, Approved)
    - `search`: Search in program title
    - `created_by`: Filter by creator user ID

    **Pagination:**
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 20, max: 100)

    Returns paginated list with total count for pagination UI.
    """
    # Build base query
    query = select(Program)
    count_query = select(func.count(Program.id))

    # Apply department filter
    if department:
        # Try to parse as UUID first
        try:
            dept_uuid = uuid.UUID(department)
            query = query.where(Program.department_id == dept_uuid)
            count_query = count_query.where(Program.department_id == dept_uuid)
        except ValueError:
            # Not a UUID, treat as department code
            dept_subquery = select(Department.id).where(Department.code == department.upper())
            query = query.where(Program.department_id.in_(dept_subquery))
            count_query = count_query.where(Program.department_id.in_(dept_subquery))

    # Apply type filter
    if type:
        query = query.where(Program.type == type)
        count_query = count_query.where(Program.type == type)

    # Apply status filter
    if status:
        query = query.where(Program.status == status)
        count_query = count_query.where(Program.status == status)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(Program.title.ilike(search_term))
        count_query = count_query.where(Program.title.ilike(search_term))

    # Apply created_by filter
    if created_by:
        query = query.where(Program.created_by == created_by)
        count_query = count_query.where(Program.created_by == created_by)

    # Get total count
    total = session.exec(count_query).one()

    # Apply pagination and ordering
    offset = (page - 1) * limit
    query = query.order_by(Program.updated_at.desc()).offset(offset).limit(limit)

    # Execute query
    programs = session.exec(query).all()

    # Build response items with department info
    items = []
    for program in programs:
        dept = session.get(Department, program.department_id)
        dept_info = None
        if dept:
            dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

        items.append(ProgramListItem(
            id=program.id,
            title=program.title,
            type=program.type,
            total_units=program.total_units,
            status=program.status,
            department_id=program.department_id,
            department=dept_info,
            created_at=program.created_at,
            updated_at=program.updated_at,
        ))

    # Calculate total pages
    pages = (total + limit - 1) // limit if total > 0 else 1

    return ProgramListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# =============================================================================
# Program Detail Endpoint
# =============================================================================

@router.get("/{program_id}", response_model=ProgramDetailResponse)
async def get_program(
    program_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get a single program with full details including courses.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Get department info
    dept = session.get(Department, program.department_id)
    dept_info = None
    if dept:
        dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

    # Get program courses with course info
    program_courses_query = select(ProgramCourse).where(
        ProgramCourse.program_id == program_id
    ).order_by(ProgramCourse.requirement_type, ProgramCourse.sequence)
    program_courses = session.exec(program_courses_query).all()

    # Build course items
    course_items = []
    for pc in program_courses:
        course = session.get(Course, pc.course_id)
        if course:
            course_items.append(CourseInProgramItem(
                id=pc.id,
                course_id=pc.course_id,
                subject_code=course.subject_code,
                course_number=course.course_number,
                title=course.title,
                units=course.units,
                requirement_type=pc.requirement_type,
                sequence=pc.sequence,
                units_applied=pc.units_applied,
            ))

    return ProgramDetailResponse(
        id=program.id,
        title=program.title,
        type=program.type,
        catalog_description=program.catalog_description,
        total_units=program.total_units,
        status=program.status,
        top_code=program.top_code,
        cip_code=program.cip_code,
        program_narrative=program.program_narrative,
        is_high_unit_major=program.is_high_unit_major,
        department_id=program.department_id,
        department=dept_info,
        created_by=program.created_by,
        created_at=program.created_at,
        updated_at=program.updated_at,
        courses=course_items,
    )


# =============================================================================
# Program Create Endpoint
# =============================================================================

class ProgramCreateRequest(BaseModel):
    """Request schema for creating a program."""
    title: str
    type: ProgramType
    department_id: uuid.UUID
    catalog_description: Optional[str] = None
    total_units: Decimal = Decimal("60.0")
    top_code: Optional[str] = None
    cip_code: Optional[str] = None


@router.post("", response_model=ProgramDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_program(
    program_data: ProgramCreateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new program in Draft status.

    The program will be assigned to the current user as creator.
    Status is automatically set to Draft.
    """
    # Verify department exists
    dept = session.get(Department, program_data.department_id)
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department not found"
        )

    # Check for duplicate program
    existing = session.exec(
        select(Program).where(
            Program.title == program_data.title,
            Program.department_id == program_data.department_id,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Program '{program_data.title}' already exists in this department"
        )

    # Create program
    program = Program(
        title=program_data.title,
        type=program_data.type,
        catalog_description=program_data.catalog_description,
        total_units=program_data.total_units,
        top_code=program_data.top_code,
        cip_code=program_data.cip_code,
        status=ProgramStatus.DRAFT,
        department_id=program_data.department_id,
        created_by=current_user.id,
    )

    session.add(program)
    session.commit()
    session.refresh(program)

    # Return full program detail
    dept_info = DepartmentInfo(id=dept.id, name=dept.name, code=dept.code)

    return ProgramDetailResponse(
        id=program.id,
        title=program.title,
        type=program.type,
        catalog_description=program.catalog_description,
        total_units=program.total_units,
        status=program.status,
        top_code=program.top_code,
        cip_code=program.cip_code,
        program_narrative=program.program_narrative,
        is_high_unit_major=program.is_high_unit_major,
        department_id=program.department_id,
        department=dept_info,
        created_by=program.created_by,
        created_at=program.created_at,
        updated_at=program.updated_at,
        courses=[],
    )


# =============================================================================
# Program Update Endpoint
# =============================================================================

@router.put("/{program_id}", response_model=ProgramDetailResponse)
async def update_program(
    program_id: uuid.UUID,
    program_data: ProgramUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update an existing program.

    Only the creator or admins can update a program.
    Only Draft programs can be edited.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and program.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own programs"
        )

    # Only allow editing Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be edited"
        )

    # Update fields
    update_data = program_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(program, key, value)

    program.updated_at = datetime.utcnow()

    session.add(program)
    session.commit()
    session.refresh(program)

    # Return updated program
    return await get_program(program_id, current_user, session)


# =============================================================================
# Program Delete Endpoint
# =============================================================================

@router.delete("/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(
    program_id: uuid.UUID,
    current_user: User = Depends(require_admin()),
    session: Session = Depends(get_session),
):
    """
    Delete a program (admin only).

    Only Draft programs can be deleted.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Only allow deleting Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be deleted"
        )

    session.delete(program)
    session.commit()

    return None


# =============================================================================
# Add Course to Program Endpoint
# =============================================================================

class AddCourseRequest(BaseModel):
    """Request schema for adding a course to a program."""
    course_id: uuid.UUID
    requirement_type: RequirementType = RequirementType.REQUIRED_CORE
    units_applied: Optional[Decimal] = None


@router.post("/{program_id}/courses", response_model=CourseInProgramItem, status_code=status.HTTP_201_CREATED)
async def add_course_to_program(
    program_id: uuid.UUID,
    course_data: AddCourseRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Add a course to a program.

    Only the creator or admins can modify a program.
    Only Draft programs can be modified.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and program.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own programs"
        )

    # Only allow editing Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be modified"
        )

    # Verify course exists
    course = session.get(Course, course_data.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course not found"
        )

    # Check if course is already in program
    existing = session.exec(
        select(ProgramCourse).where(
            ProgramCourse.program_id == program_id,
            ProgramCourse.course_id == course_data.course_id,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course is already in this program"
        )

    # Get next sequence number
    max_seq_result = session.exec(
        select(func.max(ProgramCourse.sequence)).where(
            ProgramCourse.program_id == program_id,
            ProgramCourse.requirement_type == course_data.requirement_type,
        )
    ).one()
    next_seq = (max_seq_result or 0) + 1

    # Create program-course relationship
    units = course_data.units_applied if course_data.units_applied else course.units
    program_course = ProgramCourse(
        program_id=program_id,
        course_id=course_data.course_id,
        requirement_type=course_data.requirement_type,
        sequence=next_seq,
        units_applied=units,
    )

    session.add(program_course)
    session.commit()
    session.refresh(program_course)

    # Recalculate total_units
    await _recalculate_program_units(program_id, session)

    return CourseInProgramItem(
        id=program_course.id,
        course_id=course.id,
        subject_code=course.subject_code,
        course_number=course.course_number,
        title=course.title,
        units=course.units,
        requirement_type=program_course.requirement_type,
        sequence=program_course.sequence,
        units_applied=program_course.units_applied,
    )


# =============================================================================
# Remove Course from Program Endpoint
# =============================================================================

@router.delete("/{program_id}/courses/{program_course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_course_from_program(
    program_id: uuid.UUID,
    program_course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Remove a course from a program.

    Only the creator or admins can modify a program.
    Only Draft programs can be modified.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and program.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own programs"
        )

    # Only allow editing Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be modified"
        )

    # Find and delete the program-course relationship
    program_course = session.get(ProgramCourse, program_course_id)
    if not program_course or program_course.program_id != program_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found in program"
        )

    session.delete(program_course)
    session.commit()

    # Recalculate total_units
    await _recalculate_program_units(program_id, session)

    return None


# =============================================================================
# Update Course in Program Endpoint
# =============================================================================

class UpdateCourseInProgramRequest(BaseModel):
    """Request schema for updating a course within a program."""
    requirement_type: Optional[RequirementType] = None
    units_applied: Optional[Decimal] = None
    sequence: Optional[int] = None


@router.patch("/{program_id}/courses/{program_course_id}", response_model=CourseInProgramItem)
async def update_course_in_program(
    program_id: uuid.UUID,
    program_course_id: uuid.UUID,
    update_data: UpdateCourseInProgramRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update a course's requirement_type, units_applied, or sequence within a program.

    Only the creator or admins can modify a program.
    Only Draft programs can be modified.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and program.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own programs"
        )

    # Only allow editing Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be modified"
        )

    # Find the program-course relationship
    program_course = session.get(ProgramCourse, program_course_id)
    if not program_course or program_course.program_id != program_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found in program"
        )

    # Update fields
    if update_data.requirement_type is not None:
        program_course.requirement_type = update_data.requirement_type
    if update_data.units_applied is not None:
        program_course.units_applied = update_data.units_applied
    if update_data.sequence is not None:
        program_course.sequence = update_data.sequence

    session.add(program_course)
    session.commit()
    session.refresh(program_course)

    # Recalculate total_units
    await _recalculate_program_units(program_id, session)

    # Get course info for response
    course = session.get(Course, program_course.course_id)

    return CourseInProgramItem(
        id=program_course.id,
        course_id=program_course.course_id,
        subject_code=course.subject_code if course else "",
        course_number=course.course_number if course else "",
        title=course.title if course else "",
        units=course.units if course else Decimal("0"),
        requirement_type=program_course.requirement_type,
        sequence=program_course.sequence,
        units_applied=program_course.units_applied,
    )


# =============================================================================
# Reorder Courses in Program Endpoint
# =============================================================================

class ReorderCourseItem(BaseModel):
    """Single course reorder item."""
    program_course_id: uuid.UUID
    sequence: int


class ReorderCoursesRequest(BaseModel):
    """Request schema for reordering courses within a program section."""
    requirement_type: RequirementType
    courses: List[ReorderCourseItem]


@router.put("/{program_id}/courses/reorder", response_model=List[CourseInProgramItem])
async def reorder_courses_in_program(
    program_id: uuid.UUID,
    reorder_data: ReorderCoursesRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Reorder courses within a program section.

    Provide the requirement_type and a list of course IDs with their new sequence numbers.
    Only the creator or admins can modify a program.
    Only Draft programs can be modified.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Check permissions
    if current_user.role != UserRole.ADMIN and program.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own programs"
        )

    # Only allow editing Draft programs
    if program.status != ProgramStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Draft programs can be modified"
        )

    # Update sequence for each course
    updated_courses = []
    for item in reorder_data.courses:
        program_course = session.get(ProgramCourse, item.program_course_id)
        if not program_course or program_course.program_id != program_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course {item.program_course_id} not found in program"
            )

        # Optionally update requirement_type if different
        if program_course.requirement_type != reorder_data.requirement_type:
            program_course.requirement_type = reorder_data.requirement_type

        program_course.sequence = item.sequence
        session.add(program_course)
        updated_courses.append(program_course)

    session.commit()

    # Build response with course info
    result = []
    for pc in updated_courses:
        session.refresh(pc)
        course = session.get(Course, pc.course_id)
        result.append(CourseInProgramItem(
            id=pc.id,
            course_id=pc.course_id,
            subject_code=course.subject_code if course else "",
            course_number=course.course_number if course else "",
            title=course.title if course else "",
            units=course.units if course else Decimal("0"),
            requirement_type=pc.requirement_type,
            sequence=pc.sequence,
            units_applied=pc.units_applied,
        ))

    return result


# =============================================================================
# Get Courses in Program Endpoint
# =============================================================================

@router.get("/{program_id}/courses", response_model=List[CourseInProgramItem])
async def get_program_courses(
    program_id: uuid.UUID,
    requirement_type: Optional[RequirementType] = Query(None, description="Filter by requirement type"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get all courses in a program, optionally filtered by requirement type.
    """
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Build query
    query = select(ProgramCourse).where(ProgramCourse.program_id == program_id)

    if requirement_type:
        query = query.where(ProgramCourse.requirement_type == requirement_type)

    query = query.order_by(ProgramCourse.requirement_type, ProgramCourse.sequence)

    program_courses = session.exec(query).all()

    # Build response with course info
    result = []
    for pc in program_courses:
        course = session.get(Course, pc.course_id)
        if course:
            result.append(CourseInProgramItem(
                id=pc.id,
                course_id=pc.course_id,
                subject_code=course.subject_code,
                course_number=course.course_number,
                title=course.title,
                units=course.units,
                requirement_type=pc.requirement_type,
                sequence=pc.sequence,
                units_applied=pc.units_applied,
            ))

    return result


# =============================================================================
# Helper Functions
# =============================================================================

async def _recalculate_program_units(program_id: uuid.UUID, session: Session) -> Decimal:
    """
    Recalculate and update the total_units for a program based on its courses.

    Returns the new total_units value.
    """
    program = session.get(Program, program_id)
    if not program:
        return Decimal("0")

    # Get all program courses
    program_courses = session.exec(
        select(ProgramCourse).where(ProgramCourse.program_id == program_id)
    ).all()

    # Sum units_applied for all courses
    total = Decimal("0")
    for pc in program_courses:
        total += pc.units_applied

    # Update program total_units
    program.total_units = total
    program.updated_at = datetime.utcnow()
    session.add(program)
    session.commit()

    return total
