"""
eLumen Browser API Routes
=========================

API endpoints for browsing and importing eLumen curriculum data.
This provides a proxy to the eLumen public API for the admin browser.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.elumen_client import (
    SynceLumenClient,
    CourseResponse,
    ProgramResponse,
    TenantResponse,
    TENANT_ABBREV_MAP,
)


router = APIRouter(prefix="/api/elumen", tags=["eLumen Browser"])


# =============================================================================
# Response Models
# =============================================================================


class TenantInfo(BaseModel):
    """College/tenant information."""
    abbreviation: str
    display_name: str
    domain: str


class CourseListItem(BaseModel):
    """Course summary for list view."""
    id: int
    code: str
    title: str
    college: str
    units: Optional[float] = None
    top_code: Optional[str] = None
    status: str
    authors: List[dict] = []
    start_term: Optional[str] = None
    description: Optional[str] = None
    lecture_hours: Optional[float] = None
    lab_hours: Optional[float] = None
    activity_hours: Optional[float] = None
    cb_codes: dict = {}
    objectives: List[str] = []
    outcomes: List[dict] = []


class CourseDetail(BaseModel):
    """Full course details including CB codes and SLOs."""
    id: int
    code: str
    title: str
    college: str
    subject: str
    number: str
    units: Optional[float] = None
    description: Optional[str] = None
    top_code: Optional[str] = None
    status: str
    lecture_hours: Optional[float] = None
    lab_hours: Optional[float] = None
    activity_hours: Optional[float] = None
    cb_codes: dict = {}
    objectives: List[str] = []
    outcomes: List[dict] = []
    authors: List[dict] = []
    start_term: Optional[str] = None

    class Config:
        populate_by_name = True


class ProgramListItem(BaseModel):
    """Program summary for list view."""
    id: int
    name: str
    college: str
    top_code: Optional[str] = None
    control_number: Optional[str] = None
    status: str


class ProgramDetail(BaseModel):
    """Full program details."""
    id: int
    name: str
    college: str
    description: Optional[str] = None
    top_code: Optional[str] = None
    control_number: Optional[str] = None
    curriculum_id: Optional[str] = None
    start_term: Optional[str] = None
    status: str


class SearchResponse(BaseModel):
    """Response for course/program searches."""
    items: List[CourseListItem | ProgramListItem]
    total: int
    page: int
    page_size: int


# =============================================================================
# Helper Functions
# =============================================================================


def course_to_list_item(course: CourseResponse) -> CourseListItem:
    """Convert eLumen CourseResponse to list item."""
    # Extract hours
    lecture_hours = None
    lab_hours = None
    activity_hours = None

    if course.full_course_info and course.full_course_info.credits_and_hours:
        ch = course.full_course_info.credits_and_hours[0]
        lecture_hours = ch.lecture_hours
        lab_hours = ch.lab_hours
        activity_hours = ch.activity_hours

    # Extract objectives
    objectives = []
    if course.full_course_info:
        for obj in course.full_course_info.objectives:
            if obj.text:
                objectives.append(obj.text)

    # Extract outcomes/SLOs
    outcomes = []
    if course.full_course_info:
        for outcome in course.full_course_info.outcomes:
            if outcome.text:
                outcomes.append({
                    "sequence": outcome.sequence,
                    "text": outcome.text,
                    "performance_criteria": outcome.performance_criteria,
                })

    return CourseListItem(
        id=course.id,
        code=course.code,
        title=course.name,
        college=course.college,
        units=course.units,
        top_code=course.top_code,
        status=course.status,
        authors=course.authors,
        start_term=course.start_term,
        description=course.description,
        lecture_hours=lecture_hours,
        lab_hours=lab_hours,
        activity_hours=activity_hours,
        cb_codes=course.cb_codes,
        objectives=objectives,
        outcomes=outcomes,
    )


def course_to_detail(course: CourseResponse) -> CourseDetail:
    """Convert eLumen CourseResponse to detailed view."""
    # Extract hours
    lecture_hours = None
    lab_hours = None
    activity_hours = None

    if course.full_course_info and course.full_course_info.credits_and_hours:
        ch = course.full_course_info.credits_and_hours[0]
        lecture_hours = ch.lecture_hours
        lab_hours = ch.lab_hours
        activity_hours = ch.activity_hours

    # Extract objectives
    objectives = []
    if course.full_course_info:
        for obj in course.full_course_info.objectives:
            if obj.text:
                objectives.append(obj.text)

    # Extract outcomes/SLOs
    outcomes = []
    if course.full_course_info:
        for outcome in course.full_course_info.outcomes:
            if outcome.text:
                outcomes.append({
                    "sequence": outcome.sequence,
                    "text": outcome.text,
                    "performance_criteria": outcome.performance_criteria,
                })

    return CourseDetail(
        id=course.id,
        code=course.code,
        title=course.name,
        college=course.college,
        subject=course.subject,
        number=course.number,
        units=course.units,
        description=course.description,
        top_code=course.top_code,
        status=course.status,
        lecture_hours=lecture_hours,
        lab_hours=lab_hours,
        activity_hours=activity_hours,
        cb_codes=course.cb_codes,
        objectives=objectives,
        outcomes=outcomes,
        authors=course.authors,
        start_term=course.start_term,
    )


def program_to_list_item(program: ProgramResponse) -> ProgramListItem:
    """Convert eLumen ProgramResponse to list item."""
    return ProgramListItem(
        id=program.id,
        name=program.name,
        college=program.college,
        top_code=program.top_code,
        control_number=program.control_number,
        status=program.status,
    )


def program_to_detail(program: ProgramResponse) -> ProgramDetail:
    """Convert eLumen ProgramResponse to detailed view."""
    return ProgramDetail(
        id=program.id,
        name=program.name,
        college=program.college,
        description=program.description,
        top_code=program.top_code,
        control_number=program.control_number,
        curriculum_id=program.curriculum_id,
        start_term=program.start_term_name,
        status=program.status,
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/tenants", response_model=List[TenantInfo])
async def get_tenants():
    """
    Get list of all LACCD colleges.

    Returns the 9 LACCD colleges with their abbreviations and domains.
    """
    try:
        client = SynceLumenClient()
        tenants = client.get_tenants()
        client.close()

        return [
            TenantInfo(
                abbreviation=t.abbreviation,
                display_name=t.display_name,
                domain=t.name,
            )
            for t in tenants
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tenants: {str(e)}")


@router.get("/courses", response_model=SearchResponse)
async def search_courses(
    college: Optional[str] = Query(None, description="College abbreviation (e.g., LAMC)"),
    query: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Results per page"),
):
    """
    Search courses from eLumen.

    Searches approved courses across LACCD colleges.
    """
    try:
        client = SynceLumenClient()
        # Fetch only the required page + a small buffer
        # We fetch (page * page_size) to check if there are more pages
        courses = client.get_courses(
            tenant=college or "",
            query=query or "",
            limit=page_size * page + page_size,  # Fetch one extra page to determine if hasNextPage
        )
        client.close()

        # Simple pagination (eLumen API doesn't return total count)
        start = (page - 1) * page_size
        end = start + page_size
        page_courses = courses[start:end] if start < len(courses) else []

        return SearchResponse(
            items=[course_to_list_item(c) for c in page_courses],
            total=len(courses),
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search courses: {str(e)}")


@router.get("/courses/{course_id}", response_model=CourseDetail)
async def get_course(
    course_id: int,
    college: Optional[str] = Query(None, description="College abbreviation"),
):
    """
    Get detailed course information from eLumen.

    Returns full course details including CB codes, objectives, and SLOs.
    """
    try:
        client = SynceLumenClient()
        # We need to search for the course by ID
        # The eLumen API doesn't have a direct get-by-id for public endpoint
        # So we fetch courses and find the matching one
        courses = client.get_courses(
            tenant=college or "",
            limit=500,  # Fetch enough to find the course
        )
        client.close()

        for course in courses:
            if course.id == course_id:
                return course_to_detail(course)

        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch course: {str(e)}")


@router.get("/courses/by-code/{subject}/{number}", response_model=CourseDetail)
async def get_course_by_code(
    subject: str,
    number: str,
    college: Optional[str] = Query(None, description="College abbreviation"),
):
    """
    Get course by subject and number.

    More efficient than searching by ID if you know the course code.
    """
    try:
        client = SynceLumenClient()
        course = client.get_course_by_code(
            subject=subject,
            number=number,
            tenant=college or "",
        )
        client.close()

        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {subject} {number} not found"
            )

        return course_to_detail(course)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch course: {str(e)}")


@router.get("/programs", response_model=SearchResponse)
async def search_programs(
    college: Optional[str] = Query(None, description="College abbreviation (e.g., LAPC)"),
    query: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Results per page"),
):
    """
    Search programs from eLumen.

    Searches approved programs (degrees/certificates) across LACCD colleges.
    Note: Currently only LAPC has programs in the public API.
    """
    try:
        client = SynceLumenClient()
        programs = client.get_programs(
            tenant=college or "",
            query=query or "",
            limit=page_size * page + page_size,  # Fetch one extra page to determine if hasNextPage
        )
        client.close()

        # Simple pagination
        start = (page - 1) * page_size
        end = start + page_size
        page_programs = programs[start:end] if start < len(programs) else []

        return SearchResponse(
            items=[program_to_list_item(p) for p in page_programs],
            total=len(programs),
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search programs: {str(e)}")


@router.get("/programs/{program_id}", response_model=ProgramDetail)
async def get_program(
    program_id: int,
    college: Optional[str] = Query(None, description="College abbreviation"),
):
    """
    Get detailed program information from eLumen.
    """
    try:
        client = SynceLumenClient()
        programs = client.get_programs(
            tenant=college or "",
            limit=500,
        )
        client.close()

        for program in programs:
            if program.id == program_id:
                return program_to_detail(program)

        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch program: {str(e)}")
