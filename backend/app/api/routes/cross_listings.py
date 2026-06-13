"""
Cross-Listing API Routes

Provides endpoints for managing cross-listed courses:
- List cross-listings for a course
- Create cross-listing relationship
- Validate cross-listing requirements
- Remove cross-listing
"""

import uuid
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.course import (
    Course,
    CourseStatus,
    StudentLearningOutcome,
    CourseContent,
)
from app.models.reference import CrossListing, CrossListingCreate, CrossListingRead
from app.models.department import Department

router = APIRouter()


# =============================================================================
# Response Schemas
# =============================================================================

class CrossListedCourseInfo(BaseModel):
    """Info about a cross-listed course."""
    id: uuid.UUID
    subject_code: str
    course_number: str
    title: str
    units: Decimal
    status: CourseStatus
    department_id: uuid.UUID
    department_name: Optional[str] = None
    department_code: Optional[str] = None


class CrossListingResponse(BaseModel):
    """Cross-listing response with course details."""
    id: uuid.UUID
    primary_course_id: uuid.UUID
    cross_listed_course_id: uuid.UUID
    primary_course: CrossListedCourseInfo
    cross_listed_course: CrossListedCourseInfo
    created_at: datetime


class ValidationIssue(BaseModel):
    """A validation issue for cross-listing."""
    field: str
    severity: str  # "error" or "warning"
    message: str
    primary_value: Optional[str] = None
    cross_listed_value: Optional[str] = None


class CrossListingValidationResponse(BaseModel):
    """Result of cross-listing validation."""
    is_valid: bool
    issues: List[ValidationIssue]
    summary: str


class SLOComparisonItem(BaseModel):
    """SLO comparison for cross-listing validation."""
    sequence: int
    primary_text: str
    cross_listed_text: Optional[str] = None
    primary_bloom: str
    cross_listed_bloom: Optional[str] = None
    matches: bool


class ContentComparisonItem(BaseModel):
    """Content comparison for cross-listing validation."""
    sequence: int
    primary_topic: str
    cross_listed_topic: Optional[str] = None
    primary_hours: Decimal
    cross_listed_hours: Optional[Decimal] = None
    matches: bool


class DetailedComparisonResponse(BaseModel):
    """Detailed comparison between courses for cross-listing."""
    units_match: bool
    primary_units: Decimal
    cross_listed_units: Decimal
    slo_comparison: List[SLOComparisonItem]
    slos_match: bool
    content_comparison: List[ContentComparisonItem]
    content_matches: bool
    overall_valid: bool


# =============================================================================
# Helper Functions
# =============================================================================

def get_course_info(course: Course, session: Session) -> CrossListedCourseInfo:
    """Build CrossListedCourseInfo from a Course model."""
    dept = session.get(Department, course.department_id)
    return CrossListedCourseInfo(
        id=course.id,
        subject_code=course.subject_code,
        course_number=course.course_number,
        title=course.title,
        units=course.units,
        status=course.status,
        department_id=course.department_id,
        department_name=dept.name if dept else None,
        department_code=dept.code if dept else None,
    )


def validate_cross_listing(
    primary_course: Course,
    cross_listed_course: Course,
    session: Session,
) -> CrossListingValidationResponse:
    """
    Validate that two courses can be cross-listed.

    Cross-listed courses must have:
    - Identical units
    - Identical SLOs (text and Bloom's level)
    - Identical content outline (topics and hours)
    """
    issues = []

    # Check units
    if primary_course.units != cross_listed_course.units:
        issues.append(ValidationIssue(
            field="units",
            severity="error",
            message="Cross-listed courses must have identical units",
            primary_value=str(primary_course.units),
            cross_listed_value=str(cross_listed_course.units),
        ))

    # Check SLOs
    primary_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == primary_course.id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    cross_listed_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == cross_listed_course.id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    if len(primary_slos) != len(cross_listed_slos):
        issues.append(ValidationIssue(
            field="slos",
            severity="error",
            message=f"SLO count mismatch: {len(primary_slos)} vs {len(cross_listed_slos)}",
            primary_value=str(len(primary_slos)),
            cross_listed_value=str(len(cross_listed_slos)),
        ))
    else:
        for i, (p_slo, c_slo) in enumerate(zip(primary_slos, cross_listed_slos)):
            if p_slo.outcome_text.strip().lower() != c_slo.outcome_text.strip().lower():
                issues.append(ValidationIssue(
                    field=f"slo_{i+1}_text",
                    severity="error",
                    message=f"SLO {i+1} text does not match",
                    primary_value=p_slo.outcome_text[:100],
                    cross_listed_value=c_slo.outcome_text[:100],
                ))
            if p_slo.bloom_level != c_slo.bloom_level:
                issues.append(ValidationIssue(
                    field=f"slo_{i+1}_bloom",
                    severity="warning",
                    message=f"SLO {i+1} Bloom's level differs",
                    primary_value=p_slo.bloom_level,
                    cross_listed_value=c_slo.bloom_level,
                ))

    # Check content outline
    primary_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == primary_course.id)
        .order_by(CourseContent.sequence)
    ).all()

    cross_listed_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == cross_listed_course.id)
        .order_by(CourseContent.sequence)
    ).all()

    if len(primary_content) != len(cross_listed_content):
        issues.append(ValidationIssue(
            field="content",
            severity="error",
            message=f"Content topic count mismatch: {len(primary_content)} vs {len(cross_listed_content)}",
            primary_value=str(len(primary_content)),
            cross_listed_value=str(len(cross_listed_content)),
        ))
    else:
        for i, (p_content, c_content) in enumerate(zip(primary_content, cross_listed_content)):
            if p_content.topic.strip().lower() != c_content.topic.strip().lower():
                issues.append(ValidationIssue(
                    field=f"content_{i+1}_topic",
                    severity="error",
                    message=f"Content topic {i+1} does not match",
                    primary_value=p_content.topic[:100],
                    cross_listed_value=c_content.topic[:100],
                ))
            if p_content.hours_allocated != c_content.hours_allocated:
                issues.append(ValidationIssue(
                    field=f"content_{i+1}_hours",
                    severity="warning",
                    message=f"Content topic {i+1} hours differ",
                    primary_value=str(p_content.hours_allocated),
                    cross_listed_value=str(c_content.hours_allocated),
                ))

    # Check for same department (warning only)
    if primary_course.department_id == cross_listed_course.department_id:
        issues.append(ValidationIssue(
            field="department",
            severity="warning",
            message="Cross-listed courses are typically in different departments",
        ))

    # Determine overall validity (only errors block, warnings are allowed)
    error_count = sum(1 for i in issues if i.severity == "error")
    warning_count = sum(1 for i in issues if i.severity == "warning")
    is_valid = error_count == 0

    if is_valid:
        if warning_count > 0:
            summary = f"Valid with {warning_count} warning(s)"
        else:
            summary = "Courses can be cross-listed"
    else:
        summary = f"{error_count} error(s) must be resolved before cross-listing"

    return CrossListingValidationResponse(
        is_valid=is_valid,
        issues=issues,
        summary=summary,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/{course_id}/cross-listings", response_model=List[CrossListingResponse])
async def list_course_cross_listings(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List all cross-listings for a course.

    Returns cross-listings where this course is either the primary
    or the cross-listed course.
    """
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Get cross-listings where this course is primary
    primary_query = select(CrossListing).where(
        CrossListing.primary_course_id == course_id
    )
    primary_listings = session.exec(primary_query).all()

    # Get cross-listings where this course is cross-listed
    cross_listed_query = select(CrossListing).where(
        CrossListing.cross_listed_course_id == course_id
    )
    cross_listed_listings = session.exec(cross_listed_query).all()

    # Build response
    results = []

    for listing in primary_listings:
        primary_course = session.get(Course, listing.primary_course_id)
        cross_listed_course = session.get(Course, listing.cross_listed_course_id)
        if primary_course and cross_listed_course:
            results.append(CrossListingResponse(
                id=listing.id,
                primary_course_id=listing.primary_course_id,
                cross_listed_course_id=listing.cross_listed_course_id,
                primary_course=get_course_info(primary_course, session),
                cross_listed_course=get_course_info(cross_listed_course, session),
                created_at=listing.created_at,
            ))

    for listing in cross_listed_listings:
        primary_course = session.get(Course, listing.primary_course_id)
        cross_listed_course = session.get(Course, listing.cross_listed_course_id)
        if primary_course and cross_listed_course:
            results.append(CrossListingResponse(
                id=listing.id,
                primary_course_id=listing.primary_course_id,
                cross_listed_course_id=listing.cross_listed_course_id,
                primary_course=get_course_info(primary_course, session),
                cross_listed_course=get_course_info(cross_listed_course, session),
                created_at=listing.created_at,
            ))

    return results


@router.post("/{course_id}/cross-listings", response_model=CrossListingResponse)
async def create_cross_listing(
    course_id: uuid.UUID,
    cross_listed_course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a cross-listing relationship between two courses.

    The course_id becomes the primary course, and cross_listed_course_id
    becomes the cross-listed course.

    Validation is performed to ensure:
    - Both courses exist
    - Courses are not already cross-listed
    - Courses have identical units, SLOs, and content
    """
    # Get primary course
    primary_course = session.get(Course, course_id)
    if not primary_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary course not found"
        )

    # Get cross-listed course
    cross_listed_course = session.get(Course, cross_listed_course_id)
    if not cross_listed_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cross-listed course not found"
        )

    # Check not the same course
    if course_id == cross_listed_course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cross-list a course with itself"
        )

    # Check if already cross-listed
    existing_query = select(CrossListing).where(
        ((CrossListing.primary_course_id == course_id) &
         (CrossListing.cross_listed_course_id == cross_listed_course_id)) |
        ((CrossListing.primary_course_id == cross_listed_course_id) &
         (CrossListing.cross_listed_course_id == course_id))
    )
    existing = session.exec(existing_query).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="These courses are already cross-listed"
        )

    # Validate cross-listing requirements
    validation = validate_cross_listing(primary_course, cross_listed_course, session)
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cross-listing validation failed: {validation.summary}. Issues: {[i.message for i in validation.issues if i.severity == 'error']}"
        )

    # Create cross-listing
    cross_listing = CrossListing(
        primary_course_id=course_id,
        cross_listed_course_id=cross_listed_course_id,
    )
    session.add(cross_listing)
    session.commit()
    session.refresh(cross_listing)

    return CrossListingResponse(
        id=cross_listing.id,
        primary_course_id=cross_listing.primary_course_id,
        cross_listed_course_id=cross_listing.cross_listed_course_id,
        primary_course=get_course_info(primary_course, session),
        cross_listed_course=get_course_info(cross_listed_course, session),
        created_at=cross_listing.created_at,
    )


@router.delete("/{course_id}/cross-listings/{cross_listing_id}")
async def delete_cross_listing(
    course_id: uuid.UUID,
    cross_listing_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Remove a cross-listing relationship.
    """
    # Verify course exists
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Get cross-listing
    cross_listing = session.get(CrossListing, cross_listing_id)
    if not cross_listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cross-listing not found"
        )

    # Verify this course is part of the cross-listing
    if cross_listing.primary_course_id != course_id and cross_listing.cross_listed_course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This course is not part of the specified cross-listing"
        )

    session.delete(cross_listing)
    session.commit()

    return {"message": "Cross-listing removed successfully"}


@router.get("/{course_id}/cross-listings/validate/{target_course_id}", response_model=CrossListingValidationResponse)
async def validate_cross_listing_endpoint(
    course_id: uuid.UUID,
    target_course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Validate if two courses can be cross-listed.

    Returns detailed validation results without creating the cross-listing.
    Use this to check compatibility before creating a cross-listing.
    """
    # Get primary course
    primary_course = session.get(Course, course_id)
    if not primary_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary course not found"
        )

    # Get target course
    target_course = session.get(Course, target_course_id)
    if not target_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target course not found"
        )

    # Check not the same course
    if course_id == target_course_id:
        return CrossListingValidationResponse(
            is_valid=False,
            issues=[ValidationIssue(
                field="course",
                severity="error",
                message="Cannot cross-list a course with itself",
            )],
            summary="Cannot cross-list a course with itself",
        )

    # Check if already cross-listed
    existing_query = select(CrossListing).where(
        ((CrossListing.primary_course_id == course_id) &
         (CrossListing.cross_listed_course_id == target_course_id)) |
        ((CrossListing.primary_course_id == target_course_id) &
         (CrossListing.cross_listed_course_id == course_id))
    )
    existing = session.exec(existing_query).first()
    if existing:
        return CrossListingValidationResponse(
            is_valid=False,
            issues=[ValidationIssue(
                field="cross_listing",
                severity="error",
                message="These courses are already cross-listed",
            )],
            summary="These courses are already cross-listed",
        )

    return validate_cross_listing(primary_course, target_course, session)


@router.get("/{course_id}/cross-listings/compare/{target_course_id}", response_model=DetailedComparisonResponse)
async def compare_courses_for_cross_listing(
    course_id: uuid.UUID,
    target_course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get a detailed side-by-side comparison of two courses for cross-listing.

    Returns detailed comparison of units, SLOs, and content to help
    identify what needs to be aligned before cross-listing.
    """
    # Get primary course
    primary_course = session.get(Course, course_id)
    if not primary_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary course not found"
        )

    # Get target course
    target_course = session.get(Course, target_course_id)
    if not target_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target course not found"
        )

    # Compare units
    units_match = primary_course.units == target_course.units

    # Compare SLOs
    primary_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == course_id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    target_slos = session.exec(
        select(StudentLearningOutcome)
        .where(StudentLearningOutcome.course_id == target_course_id)
        .order_by(StudentLearningOutcome.sequence)
    ).all()

    slo_comparison = []
    slos_match = True
    max_slos = max(len(primary_slos), len(target_slos))

    for i in range(max_slos):
        p_slo = primary_slos[i] if i < len(primary_slos) else None
        t_slo = target_slos[i] if i < len(target_slos) else None

        text_matches = (
            p_slo and t_slo and
            p_slo.outcome_text.strip().lower() == t_slo.outcome_text.strip().lower()
        )
        bloom_matches = p_slo and t_slo and p_slo.bloom_level == t_slo.bloom_level
        matches = text_matches and bloom_matches

        if not matches:
            slos_match = False

        slo_comparison.append(SLOComparisonItem(
            sequence=i + 1,
            primary_text=p_slo.outcome_text if p_slo else "",
            cross_listed_text=t_slo.outcome_text if t_slo else None,
            primary_bloom=p_slo.bloom_level if p_slo else "",
            cross_listed_bloom=t_slo.bloom_level if t_slo else None,
            matches=matches,
        ))

    # Compare content
    primary_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == course_id)
        .order_by(CourseContent.sequence)
    ).all()

    target_content = session.exec(
        select(CourseContent)
        .where(CourseContent.course_id == target_course_id)
        .order_by(CourseContent.sequence)
    ).all()

    content_comparison = []
    content_matches = True
    max_content = max(len(primary_content), len(target_content))

    for i in range(max_content):
        p_content = primary_content[i] if i < len(primary_content) else None
        t_content = target_content[i] if i < len(target_content) else None

        topic_matches = (
            p_content and t_content and
            p_content.topic.strip().lower() == t_content.topic.strip().lower()
        )
        hours_match = p_content and t_content and p_content.hours_allocated == t_content.hours_allocated
        matches = topic_matches and hours_match

        if not matches:
            content_matches = False

        content_comparison.append(ContentComparisonItem(
            sequence=i + 1,
            primary_topic=p_content.topic if p_content else "",
            cross_listed_topic=t_content.topic if t_content else None,
            primary_hours=p_content.hours_allocated if p_content else Decimal("0"),
            cross_listed_hours=t_content.hours_allocated if t_content else None,
            matches=matches,
        ))

    overall_valid = units_match and slos_match and content_matches

    return DetailedComparisonResponse(
        units_match=units_match,
        primary_units=primary_course.units,
        cross_listed_units=target_course.units,
        slo_comparison=slo_comparison,
        slos_match=slos_match,
        content_comparison=content_comparison,
        content_matches=content_matches,
        overall_valid=overall_valid,
    )


@router.get("/cross-listings/search")
async def search_courses_for_cross_listing(
    query: str = Query(..., min_length=2, description="Search query (course code or title)"),
    exclude_course_id: Optional[uuid.UUID] = Query(None, description="Course ID to exclude from results"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Search for courses that could be cross-listed.

    Returns courses matching the search query, excluding the specified course.
    """
    search_term = f"%{query}%"

    courses_query = select(Course).where(
        (Course.title.ilike(search_term)) |
        (Course.subject_code.ilike(search_term)) |
        (Course.course_number.ilike(search_term)) |
        ((Course.subject_code + " " + Course.course_number).ilike(search_term))
    )

    if exclude_course_id:
        courses_query = courses_query.where(Course.id != exclude_course_id)

    courses_query = courses_query.limit(limit)

    courses = session.exec(courses_query).all()

    return [
        get_course_info(course, session)
        for course in courses
    ]


# =============================================================================
# Sync Endpoint - Copy from Primary Course
# =============================================================================

class SyncRequest(BaseModel):
    """Request to sync from primary course."""
    sync_slos: bool = True
    sync_content: bool = True
    sync_units: bool = True


class SyncResponse(BaseModel):
    """Response after syncing from primary course."""
    success: bool
    message: str
    slos_synced: int
    content_topics_synced: int
    units_updated: bool


@router.post("/{course_id}/cross-listings/{cross_listing_id}/sync", response_model=SyncResponse)
async def sync_from_primary_course(
    course_id: uuid.UUID,
    cross_listing_id: uuid.UUID,
    request: SyncRequest = SyncRequest(),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Sync cross-listed course data from the primary course.

    This endpoint copies SLOs, content outline, and/or units from the primary
    course to the cross-listed course. This ensures cross-listed courses meet
    California regulations requiring identical course content.

    The course_id must be the cross-listed course (not the primary).
    """
    # Get the cross-listing
    cross_listing = session.get(CrossListing, cross_listing_id)
    if not cross_listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cross-listing not found"
        )

    # Verify the course_id matches either side of the cross-listing
    if course_id not in [cross_listing.primary_course_id, cross_listing.cross_listed_course_id]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course ID does not match this cross-listing"
        )

    # Determine which course is the source (primary) and target
    primary_course = session.get(Course, cross_listing.primary_course_id)
    target_course = session.get(Course, cross_listing.cross_listed_course_id)

    if not primary_course or not target_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both courses not found"
        )

    # If the course_id is the primary, we sync TO the cross-listed course
    # If the course_id is the cross-listed, we sync TO that course from primary
    # In both cases, primary is the source
    if course_id == cross_listing.primary_course_id:
        # User is viewing primary course, sync TO cross-listed
        source_course = primary_course
        dest_course = target_course
    else:
        # User is viewing cross-listed course, sync FROM primary TO this course
        source_course = primary_course
        dest_course = target_course

    slos_synced = 0
    content_synced = 0
    units_updated = False

    # Sync units
    if request.sync_units and source_course.units != dest_course.units:
        dest_course.units = source_course.units
        dest_course.lecture_hours = source_course.lecture_hours
        dest_course.lab_hours = source_course.lab_hours
        dest_course.outside_of_class_hours = source_course.outside_of_class_hours
        units_updated = True

    # Sync SLOs
    if request.sync_slos:
        # Delete existing SLOs from destination
        existing_slos = session.exec(
            select(StudentLearningOutcome)
            .where(StudentLearningOutcome.course_id == dest_course.id)
        ).all()
        for slo in existing_slos:
            session.delete(slo)

        # Copy SLOs from source
        source_slos = session.exec(
            select(StudentLearningOutcome)
            .where(StudentLearningOutcome.course_id == source_course.id)
            .order_by(StudentLearningOutcome.sequence)
        ).all()

        for slo in source_slos:
            new_slo = StudentLearningOutcome(
                course_id=dest_course.id,
                sequence=slo.sequence,
                outcome_text=slo.outcome_text,
                bloom_level=slo.bloom_level,
                bloom_verb=slo.bloom_verb,
                assessment_methods=slo.assessment_methods,
            )
            session.add(new_slo)
            slos_synced += 1

    # Sync content outline
    if request.sync_content:
        # Delete existing content from destination
        existing_content = session.exec(
            select(CourseContent)
            .where(CourseContent.course_id == dest_course.id)
        ).all()
        for content in existing_content:
            session.delete(content)

        # Copy content from source
        source_content = session.exec(
            select(CourseContent)
            .where(CourseContent.course_id == source_course.id)
            .order_by(CourseContent.sequence)
        ).all()

        for content in source_content:
            new_content = CourseContent(
                course_id=dest_course.id,
                sequence=content.sequence,
                topic=content.topic,
                hours_allocated=content.hours_allocated,
                slo_mappings=content.slo_mappings,
            )
            session.add(new_content)
            content_synced += 1

    # Update destination course timestamp
    dest_course.updated_at = datetime.utcnow()

    session.add(dest_course)
    session.commit()

    dest_code = f"{dest_course.subject_code} {dest_course.course_number}"
    source_code = f"{source_course.subject_code} {source_course.course_number}"

    return SyncResponse(
        success=True,
        message=f"Successfully synced {dest_code} from {source_code}",
        slos_synced=slos_synced,
        content_topics_synced=content_synced,
        units_updated=units_updated,
    )
