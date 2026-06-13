"""
Compliance API Routes

Provides endpoints for compliance checking and auditing Course Outlines of Record
against community college regulations (Title 5, PCAH).
"""

import uuid
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.course import (
    Course,
    StudentLearningOutcome,
    CourseContent,
    CourseRequisite,
)
from app.models.reference import CCNStandard
from app.services.compliance_service import (
    compliance_service,
    ComplianceAuditResponse,
    ComplianceResult,
    ComplianceStatus,
    ComplianceCategory,
)

router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================

class CourseAuditRequest(BaseModel):
    """
    Request body for auditing a course by ID.
    Optionally include inline course data to audit without database lookup.
    """
    course_id: Optional[uuid.UUID] = None

    # OR provide course data directly (for preview before saving)
    course_data: Optional[Dict[str, Any]] = None
    slos: Optional[List[Dict[str, Any]]] = None
    content_items: Optional[List[Dict[str, Any]]] = None
    requisites: Optional[List[Dict[str, Any]]] = None


class QuickCheckRequest(BaseModel):
    """Request for quick compliance check on specific fields."""
    units: Optional[float] = None
    lecture_hours: Optional[float] = None
    lab_hours: Optional[float] = None
    outside_of_class_hours: Optional[float] = None
    cb_codes: Optional[Dict[str, Any]] = None
    top_code: Optional[str] = None


class QuickCheckResponse(BaseModel):
    """Response for quick compliance check."""
    status: ComplianceStatus
    checks: List[ComplianceResult]


class ValidateUnitsRequest(BaseModel):
    """Request for validating unit calculation against the 54-hour rule."""
    units: float
    lecture_hours: float = 0.0
    lab_hours: float = 0.0
    outside_of_class_hours: Optional[float] = None  # If None, will calculate standard 2:1 ratio
    activity_hours: float = 0.0
    tba_hours: float = 0.0


class ValidateUnitsResponse(BaseModel):
    """Response for unit calculation validation."""
    valid: bool
    errors: List[str]
    warnings: List[str]

    # Calculated values for display
    calculated_values: Dict[str, Any]

    # Unit calculation breakdown
    total_student_learning_hours: float
    expected_units: float
    unit_difference: float

    # Contact hours summary
    total_contact_hours: float
    semester_lecture_hours: float
    semester_lab_hours: float
    semester_outside_hours: float

    # Recommendation if invalid
    recommendation: Optional[str] = None


# =============================================================================
# CCN/C-ID Matching Schemas
# =============================================================================

class CCNMatchRequest(BaseModel):
    """Request for finding CCN/C-ID matches for a course."""
    title: str
    description: Optional[str] = None
    subject_code: Optional[str] = None  # e.g., "PSYC", "MATH"
    units: Optional[float] = None
    slos: Optional[List[str]] = None  # List of SLO texts for alignment check


class CCNMatchResult(BaseModel):
    """Individual CCN match result with confidence score."""
    c_id: str
    discipline: str
    title: str
    descriptor: Optional[str]
    minimum_units: float
    confidence_score: float  # 0.0 to 1.0
    match_reasons: List[str]  # Explain why it matched
    slo_requirements: List[str]
    content_requirements: List[str]
    alignment_status: str  # "aligned", "potential", "review_needed"
    units_sufficient: bool  # True if course units >= minimum


class CCNMatchResponse(BaseModel):
    """Response containing CCN match results."""
    matches: List[CCNMatchResult]
    total_matches: int
    best_match: Optional[CCNMatchResult] = None  # Highest confidence match
    query_info: Dict[str, Any]  # Info about the query parameters used


# =============================================================================
# Enhanced CCN/C-ID Matching Schemas (for CB Wizard Integration)
# =============================================================================

class CCNMatchRequestEnhanced(BaseModel):
    """
    Enhanced request for CCN matching with CB wizard integration support.

    Provides more detailed matching with content/objectives coverage scoring.
    """
    title: str
    description: Optional[str] = None
    subject_code: Optional[str] = None  # e.g., "MATH", "ENGL"
    units: Optional[float] = None
    slos: Optional[List[str]] = None  # List of SLO texts
    content_topics: Optional[List[str]] = None  # List of content topics
    in_cb_wizard: bool = False  # Flag for wizard integration mode
    course_id: Optional[uuid.UUID] = None  # Reference to course being edited


class CCNMatchResultEnhanced(BaseModel):
    """Enhanced CCN match result with implied CB codes and coverage scores."""
    c_id: str
    title: str
    discipline: str
    confidence_score: float  # 0.0 to 1.0
    implied_cb_codes: Dict[str, str]  # e.g., {"CB05": "A", "CB03": "1701.00"}
    minimum_units: float
    prerequisites: Optional[str] = None
    content_coverage_score: float  # 0-100 percentage
    objectives_coverage_score: float  # 0-100 percentage
    match_reasons: List[str]  # Explain why it matched
    slo_requirements: List[str]
    content_requirements: List[str]


class CCNMatchResponseEnhanced(BaseModel):
    """Enhanced response for CCN matching."""
    matches: List[CCNMatchResultEnhanced]
    total_matches: int
    best_match: Optional[CCNMatchResultEnhanced] = None
    query_info: Dict[str, Any]


# =============================================================================
# CB Code Recommendation Schemas
# =============================================================================

class CBCodeRecommendRequest(BaseModel):
    """Request for CB code recommendations based on course data."""
    title: str
    description: Optional[str] = None
    top_code: Optional[str] = None  # e.g., "1701.00" for Mathematics
    is_credit_course: bool = True
    is_degree_applicable: bool = True
    is_transferable_csu: bool = False
    is_transferable_uc: bool = False
    is_basic_skills: bool = False
    is_vocational: Optional[bool] = None  # If None, inferred from TOP code
    existing_cb_codes: Optional[Dict[str, str]] = None  # For conflict detection


class CBCodeRecommendation(BaseModel):
    """Individual CB code recommendation."""
    code: str  # e.g., "CB04"
    name: str  # e.g., "Credit Status"
    recommended_value: str  # e.g., "D"
    value_description: str  # e.g., "Credit - Degree Applicable"
    confidence: float  # 0.0 to 1.0
    reasoning: str  # Why this value is recommended
    alternatives: List[Dict[str, str]]  # Other valid options
    depends_on: List[str]  # CB codes this depends on
    conflicts: List[str]  # Conflicts with existing values


class CBCodeRecommendResponse(BaseModel):
    """Response containing CB code recommendations."""
    recommendations: List[CBCodeRecommendation]
    conflicts: List[str]  # Overall conflicts detected
    completeness_score: float  # 0-100 percentage of required codes covered
    dependency_warnings: List[str]  # Dependency issues
    summary: str  # Human-readable summary


# =============================================================================
# Content Hours Validation Schemas
# =============================================================================

class ContentHoursValidateRequest(BaseModel):
    """Request for validating content hours against contact hours."""
    course_id: Optional[uuid.UUID] = None  # If provided, loads course data from DB
    # OR provide hours directly
    lecture_hours: Optional[float] = None  # Weekly lecture hours
    lab_hours: Optional[float] = None  # Weekly lab hours
    content_topics: Optional[List[Dict[str, Any]]] = None  # [{topic, hours_allocated}]


class ContentHoursTopic(BaseModel):
    """Individual topic with hours allocation."""
    topic: str
    hours_allocated: float
    percentage_of_total: float


class ContentHoursValidateResponse(BaseModel):
    """Response for content hours validation."""
    valid: bool
    status: str  # "complete", "under_allocated", "over_allocated"

    # Hours breakdown
    total_contact_hours: float  # Expected total (lecture + lab hours * 18 weeks)
    total_allocated_hours: float  # Sum of content topic hours
    hours_remaining: float  # Can be negative if over-allocated
    allocation_percentage: float  # 0-100+

    # Validation results
    errors: List[str]
    warnings: List[str]

    # Topic breakdown
    topics: List[ContentHoursTopic]
    topic_count: int

    # Suggestions
    suggested_hours_per_topic: float  # If adding new topics
    recommendation: Optional[str] = None


# =============================================================================
# CB Code Diagnostic Questions Schemas
# =============================================================================

class CBQuestionOption(BaseModel):
    """Single option for a diagnostic question."""
    value: str  # The answer value (e.g., "yes", "csu_only")
    label: str  # Display label
    description: Optional[str] = None  # Help text
    cb_value: str  # The CB code value this maps to
    cb_value_description: str  # Human-readable CB code value


class CBDiagnosticQuestion(BaseModel):
    """A single diagnostic question for CB code determination."""
    id: str  # Question identifier
    cb_code: str  # Which CB code this determines (e.g., "CB04")
    cb_code_name: str  # Human-readable name (e.g., "Credit Status")
    question: str  # The natural language question
    help_text: Optional[str] = None  # Additional context
    options: List[CBQuestionOption]
    depends_on: Optional[str] = None  # Question ID this depends on
    depends_on_values: Optional[List[str]] = None  # Values that enable this question
    required: bool = True
    sequence: int  # Display order


class CBDiagnosticQuestionsResponse(BaseModel):
    """Response containing all diagnostic questions."""
    questions: List[CBDiagnosticQuestion]
    total_questions: int
    cb_codes_covered: List[str]


class CBAnswersRequest(BaseModel):
    """Request to process CB code diagnostic answers."""
    answers: Dict[str, str]  # Question ID -> answer value
    top_code: Optional[str] = None  # For CB09 auto-detection


class CBAnswerResult(BaseModel):
    """Result for a single CB code from answers."""
    cb_code: str
    cb_code_name: str
    value: str
    value_description: str
    source: str  # "answered", "inferred", "auto_detected"
    confidence: float


class CBAnswersResponse(BaseModel):
    """Response from processing CB code answers."""
    cb_codes: List[CBAnswerResult]
    warnings: List[str]
    dependencies_applied: List[str]
    completeness_percentage: float


# =============================================================================
# CB09 SAM Code Auto-Detection Schemas
# =============================================================================

class SAMCodeOption(BaseModel):
    """SAM code option with description."""
    code: str
    name: str
    description: str
    is_vocational: bool


class CB09AutoDetectRequest(BaseModel):
    """Request for CB09 SAM code auto-detection."""
    top_code: str  # Required TOP code (e.g., "1701.00")
    current_cb09: Optional[str] = None  # Current CB09 value for conflict detection


class CB09AutoDetectResponse(BaseModel):
    """Response for CB09 SAM code auto-detection."""
    top_code: str
    top_code_title: Optional[str] = None
    is_vocational: bool
    recommended_cb09: str
    recommended_cb09_name: str
    recommended_cb09_description: str
    allowed_options: List[SAMCodeOption]
    conflict_detected: bool
    conflict_message: Optional[str] = None
    explanation: str


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/audit", response_model=ComplianceAuditResponse)
async def audit_course(
    request: CourseAuditRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Run a comprehensive compliance audit on a course.

    **Two modes of operation:**

    1. **By course_id**: Pass `course_id` to audit an existing course from the database.
       All course data, SLOs, content items, and requisites will be loaded.

    2. **By inline data**: Pass `course_data`, `slos`, `content_items`, and `requisites`
       directly to audit course data before saving (preview mode).

    **Returns:**
    - `overall_status`: pass, fail, or warn
    - `compliance_score`: Percentage (0-100) indicating compliance level
    - `total_checks`: Number of rules checked
    - `passed`, `failed`, `warnings`: Count of each status
    - `results`: Array of individual check results with:
      - rule_id, rule_name, category, status, message
      - section: Which COR section this applies to
      - citation: Legal/regulatory reference (when applicable)
      - recommendation: How to fix issues (when applicable)
    - `results_by_category`: Results grouped by compliance category

    **Compliance Categories:**
    - Title 5: California Code of Regulations requirements
    - PCAH: Program and Course Approval Handbook requirements
    - CB Codes: community college state reporting codes
    - Units & Hours: 54-hour rule and related validations
    - Student Learning Outcomes: SLO requirements and quality checks
    - Course Content: Content outline requirements
    - Requisites: Prerequisite validation requirements
    - General: Basic course information requirements
    """
    course_data: Dict[str, Any] = {}
    slos: List[Dict[str, Any]] = []
    content_items: List[Dict[str, Any]] = []
    requisites: List[Dict[str, Any]] = []

    # Mode 1: Load from database by course_id
    if request.course_id:
        course = session.get(Course, request.course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        # Convert course to dict
        course_data = {
            "title": course.title,
            "catalog_description": course.catalog_description,
            "units": course.units,
            "lecture_hours": course.lecture_hours,
            "lab_hours": course.lab_hours,
            "outside_of_class_hours": course.outside_of_class_hours,
            "activity_hours": course.activity_hours,
            "tba_hours": course.tba_hours,
            "top_code": course.top_code,
            "cb_codes": course.cb_codes or {},
            "transferability": course.transferability or {},
            "ge_applicability": course.ge_applicability or {},
            "ccn_id": course.ccn_id,  # CCN alignment
        }

        # Check for CCN justification and minimum units (for CCN compliance checks)
        from app.models.reference import CCNNonMatchJustification
        if course.ccn_id:
            # Look up CCN standard to get minimum units
            ccn_standard = session.exec(
                select(CCNStandard).where(CCNStandard.c_id == course.ccn_id)
            ).first()
            if ccn_standard:
                course_data["ccn_minimum_units"] = ccn_standard.minimum_units
        else:
            # Check for CCN non-match justification
            justification = session.exec(
                select(CCNNonMatchJustification).where(
                    CCNNonMatchJustification.course_id == request.course_id
                )
            ).first()
            course_data["has_ccn_justification"] = justification is not None

        # Load SLOs
        slos_query = select(StudentLearningOutcome).where(
            StudentLearningOutcome.course_id == request.course_id
        ).order_by(StudentLearningOutcome.sequence)
        slos_db = session.exec(slos_query).all()
        slos = [
            {
                "id": str(slo.id),
                "sequence": slo.sequence,
                "outcome_text": slo.outcome_text,
                "bloom_level": slo.bloom_level.value,
                "performance_criteria": slo.performance_criteria,
            }
            for slo in slos_db
        ]

        # Load content items
        content_query = select(CourseContent).where(
            CourseContent.course_id == request.course_id
        ).order_by(CourseContent.sequence)
        content_db = session.exec(content_query).all()
        content_items = [
            {
                "id": str(item.id),
                "sequence": item.sequence,
                "topic": item.topic,
                "subtopics": item.subtopics,
                "hours_allocated": item.hours_allocated,
                "linked_slos": item.linked_slos,
            }
            for item in content_db
        ]

        # Load requisites
        requisites_query = select(CourseRequisite).where(
            CourseRequisite.course_id == request.course_id
        )
        requisites_db = session.exec(requisites_query).all()
        requisites = [
            {
                "id": str(req.id),
                "type": req.type.value,
                "requisite_course_id": str(req.requisite_course_id) if req.requisite_course_id else None,
                "requisite_text": req.requisite_text,
                "content_review": req.content_review,
            }
            for req in requisites_db
        ]

    # Mode 2: Use inline data
    elif request.course_data:
        course_data = request.course_data
        slos = request.slos or []
        content_items = request.content_items or []
        requisites = request.requisites or []
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either course_id or course_data"
        )

    # Run the audit
    audit_result = compliance_service.audit_course(
        course_data=course_data,
        slos=slos,
        content_items=content_items,
        requisites=requisites,
    )

    return audit_result


@router.post("/quick-check", response_model=QuickCheckResponse)
async def quick_compliance_check(
    request: QuickCheckRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Run a quick compliance check on specific fields.

    Useful for real-time validation in the course editor UI
    without running a full audit. Returns only relevant checks
    based on the fields provided.

    **Example use cases:**
    - Validate unit/hours combination as user types
    - Check CB code dependencies when codes change
    - Verify TOP code alignment with CB09
    """
    results: List[ComplianceResult] = []

    # Build partial course data
    course_data: Dict[str, Any] = {}

    if request.units is not None:
        course_data["units"] = request.units
    if request.lecture_hours is not None:
        course_data["lecture_hours"] = request.lecture_hours
    if request.lab_hours is not None:
        course_data["lab_hours"] = request.lab_hours
    if request.outside_of_class_hours is not None:
        course_data["outside_of_class_hours"] = request.outside_of_class_hours
    if request.cb_codes:
        course_data["cb_codes"] = request.cb_codes
    if request.top_code:
        course_data["top_code"] = request.top_code

    # Run relevant checks based on provided fields
    if any(k in course_data for k in ["units", "lecture_hours", "lab_hours", "outside_of_class_hours"]):
        results.extend(compliance_service._check_units_hours(course_data))

    if "cb_codes" in course_data or "top_code" in course_data:
        results.extend(compliance_service._check_cb_codes(course_data))

    # Determine overall status
    if any(r.status == ComplianceStatus.FAIL for r in results):
        overall_status = ComplianceStatus.FAIL
    elif any(r.status == ComplianceStatus.WARN for r in results):
        overall_status = ComplianceStatus.WARN
    else:
        overall_status = ComplianceStatus.PASS

    return QuickCheckResponse(
        status=overall_status,
        checks=results,
    )


@router.post("/validate-units", response_model=ValidateUnitsResponse)
async def validate_units(
    request: ValidateUnitsRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Validate unit calculation against the California 54-hour rule (Title 5 § 55002.5).

    This endpoint is designed for real-time validation in the course editor's
    Unit Calculator component. It provides detailed feedback about whether
    the hours configuration correctly matches the specified unit value.

    **The 54-Hour Rule:**
    Total Student Learning Hours = (Lecture Hours × 18) + (Lab Hours × 54) + (Outside Hours × 18)
    Units = Total Student Learning Hours ÷ 54

    **Standard Ratios:**
    - Lecture: 1 weekly hour = 18 semester hours (assumes 18-week semester)
    - Lab: 1 weekly hour = 54 semester hours (3:1 ratio, labs count as 3x contact)
    - Outside-of-class: Standard is 2 hours per lecture hour (2:1 ratio)

    **Request Parameters:**
    - `units`: The target unit value (0.5 to 18)
    - `lecture_hours`: Weekly lecture hours
    - `lab_hours`: Weekly lab hours
    - `outside_of_class_hours`: Weekly outside study hours (optional, auto-calculated if not provided)
    - `activity_hours`: Weekly activity hours (optional)
    - `tba_hours`: To-be-arranged hours (optional)

    **Response:**
    - `valid`: Whether the calculation passes the 54-hour rule
    - `errors`: List of validation errors (if any)
    - `warnings`: List of warnings (e.g., unusual ratios)
    - `calculated_values`: Breakdown of all calculated hours
    - `recommendation`: Suggested fix if invalid
    """
    from decimal import Decimal, ROUND_HALF_UP

    errors: List[str] = []
    warnings: List[str] = []

    # Convert to Decimal for precision
    units = Decimal(str(request.units))
    lecture_hours = Decimal(str(request.lecture_hours))
    lab_hours = Decimal(str(request.lab_hours))
    activity_hours = Decimal(str(request.activity_hours))
    tba_hours = Decimal(str(request.tba_hours))

    # Calculate outside hours if not provided (standard 2:1 ratio)
    if request.outside_of_class_hours is None:
        outside_hours = lecture_hours * 2  # Standard 2:1 ratio
        auto_calculated_outside = True
    else:
        outside_hours = Decimal(str(request.outside_of_class_hours))
        auto_calculated_outside = False

    # Validate unit range (Title 5 § 55002.5)
    if units < Decimal("0.5"):
        errors.append("Units must be at least 0.5.")
    if units > Decimal("18"):
        errors.append("Units cannot exceed 18.")

    # Validate hours are non-negative
    if lecture_hours < 0:
        errors.append("Lecture hours cannot be negative.")
    if lab_hours < 0:
        errors.append("Lab hours cannot be negative.")
    if outside_hours < 0:
        errors.append("Outside-of-class hours cannot be negative.")

    # Must have some contact hours
    total_contact_hours = lecture_hours + lab_hours + activity_hours + tba_hours
    if total_contact_hours == 0:
        errors.append("Course must have contact hours (lecture, lab, activity, or TBA).")

    # Calculate semester hours (18-week semester)
    SEMESTER_WEEKS = Decimal("18")
    LAB_MULTIPLIER = Decimal("54")  # Labs are 54 semester hours per weekly hour

    semester_lecture_hours = lecture_hours * SEMESTER_WEEKS
    semester_lab_hours = lab_hours * LAB_MULTIPLIER  # Lab hours already account for 3:1 ratio
    semester_outside_hours = outside_hours * SEMESTER_WEEKS
    semester_activity_hours = activity_hours * SEMESTER_WEEKS
    semester_tba_hours = tba_hours * SEMESTER_WEEKS

    # Total Student Learning Hours
    total_student_learning_hours = (
        semester_lecture_hours +
        semester_lab_hours +
        semester_outside_hours +
        semester_activity_hours +
        semester_tba_hours
    )

    # Expected units based on 54-hour rule
    HOURS_PER_UNIT = Decimal("54")
    expected_units = (total_student_learning_hours / HOURS_PER_UNIT).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Calculate difference
    unit_difference = float(expected_units - units)

    # Check 54-hour rule compliance (allow tolerance for rounding)
    tolerance = Decimal("0.25")
    is_valid_calculation = abs(expected_units - units) <= tolerance

    if not is_valid_calculation:
        errors.append(
            f"Hours do not match units. "
            f"Total Student Learning Hours ({float(total_student_learning_hours)}) ÷ 54 = {float(expected_units)} units, "
            f"but {float(units)} units specified."
        )

    # Check for unusual ratios (warnings, not errors)
    if lecture_hours > 0 and outside_hours > 0:
        homework_ratio = outside_hours / lecture_hours
        if homework_ratio < 1:
            warnings.append(
                f"Outside-of-class hours ratio ({float(homework_ratio):.1f}:1) is below standard. "
                "Standard is 2:1 for lecture courses."
            )
        elif homework_ratio > 3:
            warnings.append(
                f"Outside-of-class hours ratio ({float(homework_ratio):.1f}:1) is unusually high. "
                "Standard is 2:1 for lecture courses."
            )

    # Generate recommendation if invalid
    recommendation = None
    if errors and not is_valid_calculation:
        required_total_hours = units * HOURS_PER_UNIT
        recommendation = (
            f"To achieve {float(units)} units, you need {float(required_total_hours)} total student learning hours. "
            f"Current total: {float(total_student_learning_hours)} hours. "
        )
        if unit_difference > 0:
            recommendation += f"You have {abs(unit_difference):.2f} units worth of extra hours. Consider reducing hours or increasing units."
        else:
            recommendation += f"You need {abs(unit_difference):.2f} more units worth of hours. Consider adding hours or reducing units."

    # Build calculated values dict for frontend display
    calculated_values = {
        "weekly_lecture_hours": float(lecture_hours),
        "weekly_lab_hours": float(lab_hours),
        "weekly_outside_hours": float(outside_hours),
        "weekly_activity_hours": float(activity_hours),
        "weekly_tba_hours": float(tba_hours),
        "outside_hours_auto_calculated": auto_calculated_outside,
        "semester_weeks": int(SEMESTER_WEEKS),
        "hours_per_unit": int(HOURS_PER_UNIT),
        "lab_multiplier": int(LAB_MULTIPLIER),
        "semester_lecture_hours": float(semester_lecture_hours),
        "semester_lab_hours": float(semester_lab_hours),
        "semester_outside_hours": float(semester_outside_hours),
        "semester_activity_hours": float(semester_activity_hours),
        "semester_tba_hours": float(semester_tba_hours),
        "required_hours_for_units": float(units * HOURS_PER_UNIT),
    }

    # Determine overall validity
    is_valid = len(errors) == 0

    return ValidateUnitsResponse(
        valid=is_valid,
        errors=errors,
        warnings=warnings,
        calculated_values=calculated_values,
        total_student_learning_hours=float(total_student_learning_hours),
        expected_units=float(expected_units),
        unit_difference=unit_difference,
        total_contact_hours=float(total_contact_hours),
        semester_lecture_hours=float(semester_lecture_hours),
        semester_lab_hours=float(semester_lab_hours),
        semester_outside_hours=float(semester_outside_hours),
        recommendation=recommendation,
    )


@router.post("/ccn-match", response_model=CCNMatchResponse)
async def find_ccn_matches(
    request: CCNMatchRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Find Common Course Numbering (C-ID) matches for a course.

    This endpoint searches for C-ID standards that match the provided course
    information. It uses text matching on titles and descriptions, and considers
    discipline/subject alignment.

    **AB 1111 Compliance:**
    California's Common Course Numbering Act (AB 1111) requires community colleges
    to align courses with C-ID standards where applicable. This endpoint helps
    identify potential C-ID alignments for course development.

    **Request Parameters:**
    - `title`: Course title (required) - used for primary matching
    - `description`: Catalog description (optional) - improves match accuracy
    - `subject_code`: Subject prefix like "PSYC", "MATH" (optional) - filters by discipline
    - `units`: Course units (optional) - checks against minimum unit requirements
    - `slos`: List of SLO texts (optional) - for alignment checking

    **Response:**
    - `matches`: Array of matching C-ID standards with confidence scores
    - `best_match`: The highest confidence match (if any)
    - `total_matches`: Number of standards that matched

    **Confidence Scoring:**
    - 0.8-1.0: Strong match (title + discipline match)
    - 0.5-0.79: Moderate match (partial title or discipline match)
    - 0.3-0.49: Weak match (keyword overlap)
    - Below 0.3: Not returned
    """
    import re
    from difflib import SequenceMatcher

    def normalize_text(text: str) -> str:
        """Normalize text for comparison."""
        return re.sub(r'[^\w\s]', '', text.lower().strip())

    def get_keywords(text: str) -> set:
        """Extract meaningful keywords from text."""
        stop_words = {
            'a', 'an', 'the', 'to', 'of', 'in', 'for', 'and', 'or', 'with',
            'introduction', 'intro', 'i', 'ii', 'iii', 'basic', 'advanced',
            'course', 'class', 'survey', 'principles', 'fundamentals'
        }
        words = normalize_text(text).split()
        return {w for w in words if w not in stop_words and len(w) > 2}

    def calculate_similarity(text1: str, text2: str) -> float:
        """Calculate similarity between two texts."""
        return SequenceMatcher(None, normalize_text(text1), normalize_text(text2)).ratio()

    def calculate_keyword_overlap(text1: str, text2: str) -> float:
        """Calculate keyword overlap between two texts."""
        keywords1 = get_keywords(text1)
        keywords2 = get_keywords(text2)
        if not keywords1 or not keywords2:
            return 0.0
        intersection = keywords1 & keywords2
        union = keywords1 | keywords2
        return len(intersection) / len(union) if union else 0.0

    # Map common subject codes to C-ID disciplines
    discipline_map = {
        'PSYC': ['PSYCH', 'PSY'],
        'PSYCH': ['PSYC', 'PSY'],
        'SOC': ['SOCI', 'SOC'],
        'SOCI': ['SOC', 'SOCI'],
        'ENGL': ['ENGL', 'ENG'],
        'ENG': ['ENGL', 'ENG'],
        'MATH': ['MATH', 'MTH'],
        'MTH': ['MATH', 'MTH'],
        'BIOL': ['BIOL', 'BIO'],
        'BIO': ['BIOL', 'BIO'],
        'CHEM': ['CHEM', 'CHE'],
        'CHE': ['CHEM', 'CHE'],
        'HIST': ['HIST', 'HIS'],
        'HIS': ['HIST', 'HIS'],
        'PHYS': ['PHYS', 'PHY'],
        'PHY': ['PHYS', 'PHY'],
    }

    # Get all CCN standards
    query = select(CCNStandard)
    standards = session.exec(query).all()

    matches: List[CCNMatchResult] = []

    for standard in standards:
        confidence = 0.0
        match_reasons = []

        # 1. Title similarity (40% weight)
        title_similarity = calculate_similarity(request.title, standard.title)
        confidence += title_similarity * 0.4
        if title_similarity > 0.5:
            match_reasons.append(f"Title match: '{standard.title}' ({title_similarity:.0%} similar)")

        # 2. Keyword overlap in title (20% weight)
        title_keyword_overlap = calculate_keyword_overlap(request.title, standard.title)
        confidence += title_keyword_overlap * 0.2
        if title_keyword_overlap > 0.3:
            match_reasons.append(f"Title keywords match ({title_keyword_overlap:.0%} overlap)")

        # 3. Discipline/subject match (25% weight)
        if request.subject_code:
            subject_upper = request.subject_code.upper()
            discipline_variants = discipline_map.get(subject_upper, [subject_upper])
            if standard.discipline in discipline_variants or subject_upper == standard.discipline:
                confidence += 0.25
                match_reasons.append(f"Discipline match: {standard.discipline}")

        # 4. Description similarity (15% weight) - if both provided
        if request.description and standard.descriptor:
            desc_similarity = calculate_similarity(request.description, standard.descriptor)
            confidence += desc_similarity * 0.15
            if desc_similarity > 0.3:
                match_reasons.append(f"Description similarity ({desc_similarity:.0%})")

            # Bonus for keyword overlap in descriptions
            desc_keyword_overlap = calculate_keyword_overlap(request.description, standard.descriptor)
            if desc_keyword_overlap > 0.2:
                confidence += desc_keyword_overlap * 0.1
                match_reasons.append(f"Description keywords match ({desc_keyword_overlap:.0%} overlap)")

        # Only include if confidence >= 0.3 (threshold for relevance)
        if confidence >= 0.3:
            # Check units sufficiency
            units_sufficient = True
            if request.units is not None:
                units_sufficient = request.units >= standard.minimum_units
                if not units_sufficient:
                    match_reasons.append(f"⚠️ Units ({request.units}) below minimum ({standard.minimum_units})")

            # Determine alignment status
            if confidence >= 0.7 and units_sufficient:
                alignment_status = "aligned"
            elif confidence >= 0.5:
                alignment_status = "potential"
            else:
                alignment_status = "review_needed"

            matches.append(CCNMatchResult(
                c_id=standard.c_id,
                discipline=standard.discipline,
                title=standard.title,
                descriptor=standard.descriptor,
                minimum_units=float(standard.minimum_units),
                confidence_score=round(confidence, 3),
                match_reasons=match_reasons,
                slo_requirements=standard.slo_requirements or [],
                content_requirements=standard.content_requirements or [],
                alignment_status=alignment_status,
                units_sufficient=units_sufficient,
            ))

    # Sort by confidence (highest first)
    matches.sort(key=lambda x: x.confidence_score, reverse=True)

    # Get best match
    best_match = matches[0] if matches else None

    return CCNMatchResponse(
        matches=matches,
        total_matches=len(matches),
        best_match=best_match,
        query_info={
            "title": request.title,
            "description": request.description,
            "subject_code": request.subject_code,
            "units": request.units,
            "slos_provided": len(request.slos) if request.slos else 0,
            "standards_searched": len(standards),
        }
    )


@router.post("/ccn-match-enhanced", response_model=CCNMatchResponseEnhanced)
async def find_ccn_matches_enhanced(
    request: CCNMatchRequestEnhanced,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Enhanced CCN/C-ID matching endpoint with CB wizard integration support.

    This endpoint provides more detailed matching than /ccn-match, including:
    - Implied CB codes for each match (CB05, CB03)
    - Content coverage scoring (how well course topics align with CCN requirements)
    - Objectives coverage scoring (how well SLOs align with CCN requirements)
    - Support for CB Codes wizard integration

    **Request Parameters:**
    - `title`: Course title (required) - used for primary matching
    - `description`: Catalog description (optional) - improves match accuracy
    - `subject_code`: Subject prefix like "MATH", "ENGL" (optional) - filters by discipline
    - `units`: Course units (optional) - checks against minimum unit requirements
    - `slos`: List of SLO texts (optional) - for objectives coverage scoring
    - `content_topics`: List of content topics (optional) - for content coverage scoring
    - `in_cb_wizard`: Flag for wizard integration mode (optional)
    - `course_id`: Reference to course being edited (optional)

    **Response:**
    - `matches`: Array of matching C-ID standards with enhanced data
    - `best_match`: The highest confidence match (if any)
    - `total_matches`: Number of standards that matched

    **Confidence Scoring:**
    - 0.8-1.0: Strong match (exact subject code + high title similarity)
    - 0.5-0.79: Moderate match (partial title or discipline match)
    - 0.3-0.49: Weak match (keyword overlap)
    - Below 0.3: Not returned

    **AB 1111 Compliance:**
    Courses that adopt a CCN standard will have CB05 automatically set to 'A'
    (UC+CSU Transferable) and CB03 set to the implied TOP code for the discipline.
    """
    import re
    from difflib import SequenceMatcher

    # Discipline to TOP code mapping
    discipline_top_code_map = {
        'MATH': '1701.00',
        'ENGL': '1501.00',
        'PSYCH': '2001.00',
        'PSYC': '2001.00',
        'SOC': '2208.00',
        'SOCI': '2208.00',
        'BIOL': '0401.00',
        'CHEM': '1905.00',
        'HIST': '2205.00',
        'ANTH': '2202.00',
        'STAT': '1701.00',
        'ECON': '2204.00',
        'COMM': '0604.00',
        'ASTR': '1911.00',
        'ARTH': '1002.00',
        'POLS': '2207.00',
        'CDEV': '1305.00',
        'PHYS': '1902.00',
        'GEOL': '1914.00',
        'GEOG': '2206.00',
        'PHIL': '1509.00',
    }

    def normalize_text(text: str) -> str:
        """Normalize text for comparison."""
        return re.sub(r'[^\w\s]', '', text.lower().strip())

    def get_keywords(text: str) -> set:
        """Extract meaningful keywords from text."""
        stop_words = {
            'a', 'an', 'the', 'to', 'of', 'in', 'for', 'and', 'or', 'with',
            'introduction', 'intro', 'i', 'ii', 'iii', 'basic', 'advanced',
            'course', 'class', 'survey', 'principles', 'fundamentals', 'will',
            'be', 'able', 'student', 'students', 'demonstrate', 'understand'
        }
        words = normalize_text(text).split()
        return {w for w in words if w not in stop_words and len(w) > 2}

    def calculate_similarity(text1: str, text2: str) -> float:
        """Calculate similarity between two texts."""
        return SequenceMatcher(None, normalize_text(text1), normalize_text(text2)).ratio()

    def calculate_keyword_overlap(text1: str, text2: str) -> float:
        """Calculate keyword overlap between two texts."""
        keywords1 = get_keywords(text1)
        keywords2 = get_keywords(text2)
        if not keywords1 or not keywords2:
            return 0.0
        intersection = keywords1 & keywords2
        union = keywords1 | keywords2
        return len(intersection) / len(union) if union else 0.0

    def calculate_list_coverage(course_items: List[str], ccn_requirements: List[str]) -> float:
        """
        Calculate how well course items cover CCN requirements.
        Returns percentage 0-100.
        """
        if not ccn_requirements:
            return 100.0  # No requirements means full coverage
        if not course_items:
            return 0.0

        # Combine all course items into one text for matching
        course_text = ' '.join(course_items)
        course_keywords = get_keywords(course_text)

        # Count how many CCN requirements have keyword overlap
        covered_count = 0
        for req in ccn_requirements:
            req_keywords = get_keywords(req)
            if req_keywords:
                overlap = course_keywords & req_keywords
                if len(overlap) >= len(req_keywords) * 0.3:  # 30% keyword match threshold
                    covered_count += 1

        return (covered_count / len(ccn_requirements)) * 100

    # Map common subject codes to C-ID disciplines
    discipline_map = {
        'PSYC': ['PSYCH', 'PSY'],
        'PSYCH': ['PSYC', 'PSY'],
        'SOC': ['SOCI', 'SOC'],
        'SOCI': ['SOC', 'SOCI'],
        'ENGL': ['ENGL', 'ENG'],
        'ENG': ['ENGL', 'ENG'],
        'MATH': ['MATH', 'MTH'],
        'MTH': ['MATH', 'MTH'],
        'BIOL': ['BIOL', 'BIO'],
        'BIO': ['BIOL', 'BIO'],
        'CHEM': ['CHEM', 'CHE'],
        'CHE': ['CHEM', 'CHE'],
        'HIST': ['HIST', 'HIS'],
        'HIS': ['HIST', 'HIS'],
        'PHYS': ['PHYS', 'PHY'],
        'PHY': ['PHYS', 'PHY'],
    }

    # Get all CCN standards
    query = select(CCNStandard)
    standards = session.exec(query).all()

    matches: List[CCNMatchResultEnhanced] = []

    for standard in standards:
        confidence = 0.0
        match_reasons = []

        # 1. Exact subject code match (highest priority - 35% weight)
        subject_match = False
        if request.subject_code:
            subject_upper = request.subject_code.upper()
            discipline_variants = discipline_map.get(subject_upper, [subject_upper])
            if standard.discipline in discipline_variants or subject_upper == standard.discipline:
                confidence += 0.35
                subject_match = True
                match_reasons.append(f"Discipline match: {standard.discipline}")

        # 2. Title similarity (30% weight)
        title_similarity = calculate_similarity(request.title, standard.title)
        confidence += title_similarity * 0.30
        if title_similarity > 0.5:
            match_reasons.append(f"Title match: '{standard.title}' ({title_similarity:.0%} similar)")

        # 3. Keyword overlap in title (15% weight)
        title_keyword_overlap = calculate_keyword_overlap(request.title, standard.title)
        confidence += title_keyword_overlap * 0.15
        if title_keyword_overlap > 0.3:
            match_reasons.append(f"Title keywords match ({title_keyword_overlap:.0%} overlap)")

        # 4. Description similarity (20% weight) - if both provided
        if request.description and standard.descriptor:
            desc_similarity = calculate_similarity(request.description, standard.descriptor)
            confidence += desc_similarity * 0.20
            if desc_similarity > 0.3:
                match_reasons.append(f"Description similarity ({desc_similarity:.0%})")

        # Only include if confidence >= 0.3 (threshold for relevance)
        if confidence >= 0.3:
            # Calculate content coverage score
            content_coverage = 0.0
            if request.content_topics and standard.content_requirements:
                content_coverage = calculate_list_coverage(
                    request.content_topics,
                    standard.content_requirements
                )
            elif not standard.content_requirements:
                content_coverage = 100.0

            # Calculate objectives coverage score
            objectives_coverage = 0.0
            if request.slos and standard.objectives:
                objectives_coverage = calculate_list_coverage(
                    request.slos,
                    standard.objectives
                )
            elif request.slos and standard.slo_requirements:
                objectives_coverage = calculate_list_coverage(
                    request.slos,
                    standard.slo_requirements
                )
            elif not standard.objectives and not standard.slo_requirements:
                objectives_coverage = 100.0

            # Get implied TOP code from discipline
            implied_top_code = standard.implied_top_code
            if not implied_top_code:
                implied_top_code = discipline_top_code_map.get(
                    standard.discipline,
                    discipline_top_code_map.get(standard.subject_code or '', None)
                )

            # Build implied CB codes
            implied_cb_codes = {
                "CB05": "A",  # All CCN courses are UC+CSU transferable
            }
            if implied_top_code:
                implied_cb_codes["CB03"] = implied_top_code

            # Check units and add warning if insufficient
            if request.units is not None and request.units < standard.minimum_units:
                match_reasons.append(
                    f"⚠️ Units ({request.units}) below minimum ({standard.minimum_units})"
                )

            matches.append(CCNMatchResultEnhanced(
                c_id=standard.c_id,
                title=standard.title,
                discipline=standard.discipline,
                confidence_score=round(min(confidence, 1.0), 3),  # Cap at 1.0
                implied_cb_codes=implied_cb_codes,
                minimum_units=float(standard.minimum_units),
                prerequisites=standard.prerequisites,
                content_coverage_score=round(content_coverage, 1),
                objectives_coverage_score=round(objectives_coverage, 1),
                match_reasons=match_reasons,
                slo_requirements=standard.slo_requirements or [],
                content_requirements=standard.content_requirements or [],
            ))

    # Sort by confidence (highest first), limit to top 5
    matches.sort(key=lambda x: x.confidence_score, reverse=True)
    matches = matches[:5]

    # Get best match
    best_match = matches[0] if matches else None

    return CCNMatchResponseEnhanced(
        matches=matches,
        total_matches=len(matches),
        best_match=best_match,
        query_info={
            "title": request.title,
            "description": request.description,
            "subject_code": request.subject_code,
            "units": request.units,
            "slos_provided": len(request.slos) if request.slos else 0,
            "content_topics_provided": len(request.content_topics) if request.content_topics else 0,
            "in_cb_wizard": request.in_cb_wizard,
            "course_id": str(request.course_id) if request.course_id else None,
            "standards_searched": len(standards),
        }
    )


@router.post("/cb-codes", response_model=CBCodeRecommendResponse)
async def recommend_cb_codes(
    request: CBCodeRecommendRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Get CB code recommendations based on course data.

    This endpoint analyzes course characteristics and recommends appropriate
    CB (Course Basic) codes for community college state reporting.

    **CB Codes Overview:**
    CB codes are 27+ standardized codes required for MIS (Management Information System)
    reporting to the community colleges Chancellor's Office.

    **Key CB Codes Handled:**
    - **CB03**: TOP Code (Taxonomy of Programs) - classification code
    - **CB04**: Credit Status (Credit/Non-Credit/Degree-Applicable)
    - **CB05**: Transfer Status (UC+CSU/CSU Only/Not Transferable)
    - **CB08**: Basic Skills Status
    - **CB09**: SAM Priority Code (vocational classification)
    - **CB21**: Prior to College Level

    **Dependencies:**
    - CB09 depends on CB03 (TOP Code): Non-vocational TOP codes require CB09 = 'E'
    - CB05 depends on CB04: Only credit courses can be transferable
    - CB21 depends on CB08: Basic skills courses affect CB21

    **Request Parameters:**
    - `title`: Course title (for context)
    - `description`: Catalog description (for context)
    - `top_code`: TOP code if known (e.g., "1701.00")
    - `is_credit_course`: Whether the course is for credit
    - `is_degree_applicable`: Whether the course applies to a degree
    - `is_transferable_csu`: Whether the course transfers to CSU
    - `is_transferable_uc`: Whether the course transfers to UC
    - `is_basic_skills`: Whether this is a basic skills course
    - `is_vocational`: Whether this is a vocational course (inferred from TOP if not set)
    - `existing_cb_codes`: Current CB code values for conflict detection
    """
    recommendations: List[CBCodeRecommendation] = []
    conflicts: List[str] = []
    dependency_warnings: List[str] = []
    existing = request.existing_cb_codes or {}

    # Determine if course is vocational from TOP code if not explicitly set
    is_vocational = request.is_vocational
    if is_vocational is None and request.top_code:
        # Non-vocational TOP code prefixes (general education)
        non_vocational_prefixes = ["15", "17", "19", "20", "22", "49"]
        is_vocational = not any(request.top_code.startswith(p) for p in non_vocational_prefixes)

    # CB04 - Credit Status
    cb04_value = "D"  # Default to Credit - Degree Applicable
    cb04_desc = "Credit - Degree Applicable"
    cb04_reasoning = "Standard for most college-level courses"
    cb04_confidence = 0.9

    if not request.is_credit_course:
        cb04_value = "N"
        cb04_desc = "Noncredit"
        cb04_reasoning = "Course is marked as non-credit"
        cb04_confidence = 1.0
    elif request.is_degree_applicable:
        cb04_value = "D"
        cb04_desc = "Credit - Degree Applicable"
        cb04_reasoning = "Course is degree applicable"
        cb04_confidence = 1.0
    else:
        cb04_value = "C"
        cb04_desc = "Credit - Not Degree Applicable"
        cb04_reasoning = "Course is credit but not degree applicable"
        cb04_confidence = 0.95

    # Check for conflicts
    cb04_conflicts = []
    if "CB04" in existing and existing["CB04"] != cb04_value:
        cb04_conflicts.append(f"Existing CB04 value '{existing['CB04']}' differs from recommendation '{cb04_value}'")
        conflicts.append(f"CB04: {cb04_conflicts[0]}")

    recommendations.append(CBCodeRecommendation(
        code="CB04",
        name="Credit Status",
        recommended_value=cb04_value,
        value_description=cb04_desc,
        confidence=cb04_confidence,
        reasoning=cb04_reasoning,
        alternatives=[
            {"value": "D", "description": "Credit - Degree Applicable"},
            {"value": "C", "description": "Credit - Not Degree Applicable"},
            {"value": "N", "description": "Noncredit"},
        ],
        depends_on=[],
        conflicts=cb04_conflicts,
    ))

    # CB05 - Transfer Status
    cb05_value = "C"  # Default to Not Transferable
    cb05_desc = "Not Transferable"
    cb05_reasoning = "Default for courses without specified transferability"
    cb05_confidence = 0.7

    if request.is_transferable_uc and request.is_transferable_csu:
        cb05_value = "A"
        cb05_desc = "Transferable to both UC and CSU"
        cb05_reasoning = "Course transfers to both UC and CSU systems"
        cb05_confidence = 1.0
    elif request.is_transferable_csu:
        cb05_value = "B"
        cb05_desc = "Transferable to CSU only"
        cb05_reasoning = "Course transfers to CSU but not UC"
        cb05_confidence = 1.0
    elif not request.is_credit_course:
        cb05_value = "C"
        cb05_desc = "Not Transferable"
        cb05_reasoning = "Non-credit courses are not transferable"
        cb05_confidence = 1.0

    # Dependency: CB05 depends on CB04
    if cb04_value == "N" and cb05_value in ["A", "B"]:
        dependency_warnings.append("CB05 conflict: Non-credit courses (CB04=N) cannot be transferable")
        cb05_value = "C"
        cb05_desc = "Not Transferable"
        cb05_confidence = 1.0

    cb05_conflicts = []
    if "CB05" in existing and existing["CB05"] != cb05_value:
        cb05_conflicts.append(f"Existing CB05 value '{existing['CB05']}' differs from recommendation '{cb05_value}'")
        conflicts.append(f"CB05: {cb05_conflicts[0]}")

    recommendations.append(CBCodeRecommendation(
        code="CB05",
        name="Transfer Status",
        recommended_value=cb05_value,
        value_description=cb05_desc,
        confidence=cb05_confidence,
        reasoning=cb05_reasoning,
        alternatives=[
            {"value": "A", "description": "Transferable to both UC and CSU"},
            {"value": "B", "description": "Transferable to CSU only"},
            {"value": "C", "description": "Not Transferable"},
        ],
        depends_on=["CB04"],
        conflicts=cb05_conflicts,
    ))

    # CB08 - Basic Skills Status
    cb08_value = "N"  # Default to Not Basic Skills
    cb08_desc = "Course is not a basic skills course"
    cb08_reasoning = "Most courses are not basic skills"
    cb08_confidence = 0.8

    if request.is_basic_skills:
        cb08_value = "B"
        cb08_desc = "Basic skills course"
        cb08_reasoning = "Course is marked as basic skills"
        cb08_confidence = 1.0

    cb08_conflicts = []
    if "CB08" in existing and existing["CB08"] != cb08_value:
        cb08_conflicts.append(f"Existing CB08 value '{existing['CB08']}' differs from recommendation '{cb08_value}'")
        conflicts.append(f"CB08: {cb08_conflicts[0]}")

    recommendations.append(CBCodeRecommendation(
        code="CB08",
        name="Basic Skills Status",
        recommended_value=cb08_value,
        value_description=cb08_desc,
        confidence=cb08_confidence,
        reasoning=cb08_reasoning,
        alternatives=[
            {"value": "B", "description": "Basic skills course"},
            {"value": "N", "description": "Not a basic skills course"},
        ],
        depends_on=[],
        conflicts=cb08_conflicts,
    ))

    # CB09 - SAM Priority Code
    cb09_value = "E"  # Default to Non-Occupational
    cb09_desc = "Non-Occupational"
    cb09_reasoning = "Default for non-vocational courses"
    cb09_confidence = 0.8

    if is_vocational:
        cb09_value = "C"  # Clearly Occupational
        cb09_desc = "Clearly Occupational"
        cb09_reasoning = "Course is vocational/occupational based on TOP code or explicit flag"
        cb09_confidence = 0.85
    else:
        cb09_value = "E"
        cb09_desc = "Non-Occupational"
        cb09_reasoning = "Course is not vocational (general education, transfer, or liberal arts)"
        cb09_confidence = 0.9

    # Dependency: CB09 depends on TOP code (CB03)
    if request.top_code:
        non_vocational_prefixes = ["15", "17", "19", "20", "22", "49"]
        is_non_voc_top = any(request.top_code.startswith(p) for p in non_vocational_prefixes)
        if is_non_voc_top and cb09_value != "E":
            dependency_warnings.append(f"CB09 dependency: TOP code {request.top_code} is non-vocational, CB09 should be 'E'")
            cb09_value = "E"
            cb09_desc = "Non-Occupational"
            cb09_confidence = 1.0

    cb09_conflicts = []
    if "CB09" in existing and existing["CB09"] != cb09_value:
        cb09_conflicts.append(f"Existing CB09 value '{existing['CB09']}' differs from recommendation '{cb09_value}'")
        conflicts.append(f"CB09: {cb09_conflicts[0]}")

    recommendations.append(CBCodeRecommendation(
        code="CB09",
        name="SAM Priority Code",
        recommended_value=cb09_value,
        value_description=cb09_desc,
        confidence=cb09_confidence,
        reasoning=cb09_reasoning,
        alternatives=[
            {"value": "A", "description": "Apprenticeship"},
            {"value": "B", "description": "Advanced Occupational"},
            {"value": "C", "description": "Clearly Occupational"},
            {"value": "D", "description": "Possibly Occupational"},
            {"value": "E", "description": "Non-Occupational"},
        ],
        depends_on=["CB03 (TOP Code)"],
        conflicts=cb09_conflicts,
    ))

    # CB21 - Prior to College Level
    cb21_value = "Y"  # Default to College Level
    cb21_desc = "Not prior to college level (College Level)"
    cb21_reasoning = "Most degree-applicable courses are college level"
    cb21_confidence = 0.85

    if request.is_basic_skills:
        cb21_value = "A"  # One level below
        cb21_desc = "One level below transfer"
        cb21_reasoning = "Basic skills courses are typically below college level"
        cb21_confidence = 0.8
    elif not request.is_degree_applicable:
        cb21_value = "B"  # Two levels below
        cb21_desc = "Two levels below transfer"
        cb21_reasoning = "Non-degree applicable courses may be below college level"
        cb21_confidence = 0.7

    # Dependency: CB21 depends on CB08
    if cb08_value == "B" and cb21_value == "Y":
        dependency_warnings.append("CB21 dependency: Basic skills courses (CB08=B) are typically prior to college level")

    cb21_conflicts = []
    if "CB21" in existing and existing["CB21"] != cb21_value:
        cb21_conflicts.append(f"Existing CB21 value '{existing['CB21']}' differs from recommendation '{cb21_value}'")
        conflicts.append(f"CB21: {cb21_conflicts[0]}")

    recommendations.append(CBCodeRecommendation(
        code="CB21",
        name="Prior to College Level",
        recommended_value=cb21_value,
        value_description=cb21_desc,
        confidence=cb21_confidence,
        reasoning=cb21_reasoning,
        alternatives=[
            {"value": "Y", "description": "Not prior to college level (College Level)"},
            {"value": "A", "description": "One level below transfer"},
            {"value": "B", "description": "Two levels below transfer"},
            {"value": "C", "description": "Three levels below transfer"},
            {"value": "D", "description": "Four levels below transfer"},
        ],
        depends_on=["CB08"],
        conflicts=cb21_conflicts,
    ))

    # CB03 - TOP Code (if provided)
    if request.top_code:
        cb03_conflicts = []
        if "CB03" in existing and existing["CB03"] != request.top_code:
            cb03_conflicts.append(f"Existing CB03 value '{existing['CB03']}' differs from provided '{request.top_code}'")
            conflicts.append(f"CB03: {cb03_conflicts[0]}")

        recommendations.append(CBCodeRecommendation(
            code="CB03",
            name="TOP Code",
            recommended_value=request.top_code,
            value_description=f"Taxonomy of Programs code: {request.top_code}",
            confidence=1.0,
            reasoning="TOP code provided in request",
            alternatives=[],
            depends_on=[],
            conflicts=cb03_conflicts,
        ))

    # Calculate completeness score
    required_codes = {"CB03", "CB04", "CB05", "CB08", "CB09", "CB21"}
    provided_codes = {r.code for r in recommendations}
    completeness = len(provided_codes & required_codes) / len(required_codes) * 100

    # Generate summary
    summary_parts = []
    if request.is_credit_course:
        summary_parts.append("Credit course")
    else:
        summary_parts.append("Non-credit course")

    if request.is_degree_applicable:
        summary_parts.append("degree applicable")

    if request.is_transferable_uc and request.is_transferable_csu:
        summary_parts.append("transferable to UC and CSU")
    elif request.is_transferable_csu:
        summary_parts.append("transferable to CSU")
    else:
        summary_parts.append("not transferable")

    if is_vocational:
        summary_parts.append("vocational/occupational")
    else:
        summary_parts.append("non-vocational")

    summary = f"{', '.join(summary_parts)}. {len(recommendations)} CB codes recommended with {len(conflicts)} conflicts detected."

    return CBCodeRecommendResponse(
        recommendations=recommendations,
        conflicts=conflicts,
        completeness_score=completeness,
        dependency_warnings=dependency_warnings,
        summary=summary,
    )


@router.post("/validate-content-hours", response_model=ContentHoursValidateResponse)
async def validate_content_hours(
    request: ContentHoursValidateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Validate that content topic hours match course contact hours.

    This endpoint checks that the total hours allocated to content topics
    matches the total contact hours for the course (lecture + lab hours
    multiplied by semester weeks).

    **Use Cases:**
    - Real-time validation in the content outline editor
    - Ensuring all instructional time is accounted for
    - Identifying over/under-allocated content

    **Two modes of operation:**

    1. **By course_id**: Pass `course_id` to load course hours and content
       topics from the database.

    2. **By inline data**: Pass `lecture_hours`, `lab_hours`, and
       `content_topics` directly for preview/validation.

    **Contact Hours Calculation:**
    - Total Contact Hours = (Weekly Lecture Hours + Weekly Lab Hours) × 18 weeks
    - For a 3-unit lecture course: 3 hours/week × 18 weeks = 54 contact hours

    **Response:**
    - `valid`: True if allocation is within acceptable range (95-100%)
    - `status`: "complete", "under_allocated", or "over_allocated"
    - `hours_remaining`: Hours still to be allocated (negative if over)
    - `allocation_percentage`: Current allocation as percentage of total
    - `suggested_hours_per_topic`: Recommended hours if adding new topics
    """
    from decimal import Decimal

    errors: List[str] = []
    warnings: List[str] = []
    topics: List[ContentHoursTopic] = []

    lecture_hours = Decimal("0")
    lab_hours = Decimal("0")
    content_items: List[Dict[str, Any]] = []

    # Mode 1: Load from database
    if request.course_id:
        course = session.get(Course, request.course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        lecture_hours = Decimal(str(course.lecture_hours or 0))
        lab_hours = Decimal(str(course.lab_hours or 0))

        # Load content topics
        content_query = select(CourseContent).where(
            CourseContent.course_id == request.course_id
        ).order_by(CourseContent.sequence)
        content_db = session.exec(content_query).all()

        content_items = [
            {
                "topic": item.topic,
                "hours_allocated": float(item.hours_allocated or 0),
            }
            for item in content_db
        ]

    # Mode 2: Use inline data
    elif request.lecture_hours is not None or request.lab_hours is not None:
        lecture_hours = Decimal(str(request.lecture_hours or 0))
        lab_hours = Decimal(str(request.lab_hours or 0))
        content_items = request.content_topics or []
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either course_id or lecture_hours/lab_hours"
        )

    # Calculate total contact hours (18-week semester)
    SEMESTER_WEEKS = Decimal("18")
    total_contact_hours = (lecture_hours + lab_hours) * SEMESTER_WEEKS

    # Calculate total allocated hours from content topics
    total_allocated = Decimal("0")
    for item in content_items:
        hours = Decimal(str(item.get("hours_allocated", 0)))
        total_allocated += hours
        topic_name = item.get("topic", "Unnamed Topic")

        # Calculate percentage for this topic
        if total_contact_hours > 0:
            percentage = float((hours / total_contact_hours) * 100)
        else:
            percentage = 0.0

        topics.append(ContentHoursTopic(
            topic=topic_name,
            hours_allocated=float(hours),
            percentage_of_total=round(percentage, 1),
        ))

    # Calculate hours remaining and allocation percentage
    hours_remaining = total_contact_hours - total_allocated

    if total_contact_hours > 0:
        allocation_percentage = float((total_allocated / total_contact_hours) * 100)
    else:
        allocation_percentage = 0.0 if total_allocated == 0 else 100.0

    # Determine status and validity
    # Allow 5% tolerance for "complete" status
    tolerance = Decimal("0.05")  # 5%

    if total_contact_hours == 0:
        status_str = "no_contact_hours"
        is_valid = False
        errors.append("Course has no contact hours defined. Please set lecture and/or lab hours first.")
    elif total_allocated > total_contact_hours:
        status_str = "over_allocated"
        is_valid = False
        over_hours = float(total_allocated - total_contact_hours)
        errors.append(f"Content hours exceed contact hours by {over_hours:.1f} hours.")
    elif allocation_percentage >= 95:
        status_str = "complete"
        is_valid = True
        if allocation_percentage < 100:
            warnings.append(f"Content allocation is {allocation_percentage:.1f}% complete. Consider allocating remaining {float(hours_remaining):.1f} hours.")
    elif allocation_percentage >= 80:
        status_str = "under_allocated"
        is_valid = False
        warnings.append(f"Content allocation is {allocation_percentage:.1f}%. {float(hours_remaining):.1f} hours remain unallocated.")
    else:
        status_str = "under_allocated"
        is_valid = False
        errors.append(f"Content allocation is only {allocation_percentage:.1f}%. {float(hours_remaining):.1f} hours remain unallocated.")

    # Calculate suggested hours per topic
    # Assume 8-12 topics is ideal for a course
    IDEAL_TOPIC_COUNT = 10
    if total_contact_hours > 0:
        suggested_hours = float(total_contact_hours / IDEAL_TOPIC_COUNT)
    else:
        suggested_hours = 0.0

    # Generate recommendation
    recommendation = None
    if status_str == "over_allocated":
        recommendation = f"Reduce hours on existing topics or combine related topics. You need to remove {float(-hours_remaining):.1f} hours."
    elif status_str == "under_allocated" and len(topics) > 0:
        avg_remaining = float(hours_remaining / max(1, IDEAL_TOPIC_COUNT - len(topics)))
        recommendation = f"Add more topics or increase hours on existing topics. Suggested: add {max(1, IDEAL_TOPIC_COUNT - len(topics))} topics at ~{avg_remaining:.1f} hours each."
    elif status_str == "under_allocated" and len(topics) == 0:
        recommendation = f"Add content topics to cover {float(total_contact_hours):.1f} contact hours. Suggested: ~{IDEAL_TOPIC_COUNT} topics at {suggested_hours:.1f} hours each."

    return ContentHoursValidateResponse(
        valid=is_valid,
        status=status_str,
        total_contact_hours=float(total_contact_hours),
        total_allocated_hours=float(total_allocated),
        hours_remaining=float(hours_remaining),
        allocation_percentage=round(allocation_percentage, 1),
        errors=errors,
        warnings=warnings,
        topics=topics,
        topic_count=len(topics),
        suggested_hours_per_topic=round(suggested_hours, 1),
        recommendation=recommendation,
    )


@router.get("/cb-diagnostic-questions", response_model=CBDiagnosticQuestionsResponse)
async def get_cb_diagnostic_questions(
    current_user: User = Depends(get_current_user),
):
    """
    Get diagnostic questions for determining CB codes.

    Returns a list of natural language questions that map to CB code values.
    Questions are designed to be understood by faculty without requiring
    knowledge of MIS reporting codes.

    **Question Flow:**
    1. Credit Status (CB04) - Is this course for credit?
    2. Degree Applicability (CB04) - Is it degree applicable?
    3. Transfer Status (CB05) - Is it transferable?
    4. Basic Skills (CB08) - Is this a basic skills course?
    5. Vocational Status (CB09) - Is this occupational/vocational?
    6. College Level (CB21) - What level is this course?
    7. Grading Method (CB24) - How is this course graded?
    8. Repeatable (CB07) - Can students repeat this course?
    9. Special Class (CB13) - Is this a special class?
    10. Support Course (CB25) - Is this a support course?

    **Dependencies:**
    - Transfer questions only appear if course is credit
    - Degree applicability affects other questions
    - CB09 auto-detects from TOP code for non-vocational subjects
    """
    questions = [
        # Q1: Credit Status (CB04)
        CBDiagnosticQuestion(
            id="q_credit",
            cb_code="CB04",
            cb_code_name="Credit Status",
            question="Is this course offered for credit?",
            help_text="Credit courses count toward degree requirements and transfer. Non-credit courses are typically community education or workforce training.",
            sequence=1,
            options=[
                CBQuestionOption(
                    value="credit_degree",
                    label="Yes, for credit (degree applicable)",
                    description="Standard college-level course that counts toward degrees",
                    cb_value="D",
                    cb_value_description="Credit - Degree Applicable"
                ),
                CBQuestionOption(
                    value="credit_not_degree",
                    label="Yes, for credit (not degree applicable)",
                    description="Credit course that doesn't count toward a degree",
                    cb_value="C",
                    cb_value_description="Credit - Not Degree Applicable"
                ),
                CBQuestionOption(
                    value="noncredit",
                    label="No, this is a non-credit course",
                    description="Community education, workforce prep, or ESL",
                    cb_value="N",
                    cb_value_description="Noncredit"
                ),
            ],
        ),

        # Q2: Transfer Status (CB05)
        CBDiagnosticQuestion(
            id="q_transfer",
            cb_code="CB05",
            cb_code_name="Transfer Status",
            question="Is this course transferable?",
            help_text="Transferable courses have been approved for transfer to UC and/or CSU systems.",
            sequence=2,
            depends_on="q_credit",
            depends_on_values=["credit_degree", "credit_not_degree"],
            options=[
                CBQuestionOption(
                    value="uc_csu",
                    label="Yes, to both UC and CSU",
                    description="Course transfers to University of California and California State University",
                    cb_value="A",
                    cb_value_description="Transferable to both UC and CSU"
                ),
                CBQuestionOption(
                    value="csu_only",
                    label="Yes, to CSU only",
                    description="Course transfers to CSU but not UC",
                    cb_value="B",
                    cb_value_description="Transferable to CSU only"
                ),
                CBQuestionOption(
                    value="not_transferable",
                    label="No, not transferable",
                    description="Course does not transfer to four-year institutions",
                    cb_value="C",
                    cb_value_description="Not Transferable"
                ),
            ],
        ),

        # Q3: Basic Skills (CB08)
        CBDiagnosticQuestion(
            id="q_basic_skills",
            cb_code="CB08",
            cb_code_name="Basic Skills Status",
            question="Is this a basic skills course?",
            help_text="Basic skills courses are pre-collegiate courses in reading, writing, math, or ESL that prepare students for college-level work.",
            sequence=3,
            options=[
                CBQuestionOption(
                    value="yes",
                    label="Yes, this is a basic skills course",
                    description="Pre-collegiate reading, writing, math, or ESL",
                    cb_value="B",
                    cb_value_description="Basic Skills Course"
                ),
                CBQuestionOption(
                    value="no",
                    label="No, this is not a basic skills course",
                    description="Standard college-level or vocational course",
                    cb_value="N",
                    cb_value_description="Not a Basic Skills Course"
                ),
            ],
        ),

        # Q4: Vocational/Occupational (CB09) - SAM Code
        CBDiagnosticQuestion(
            id="q_vocational",
            cb_code="CB09",
            cb_code_name="SAM Priority Code",
            question="Is this an occupational or vocational course?",
            help_text="Occupational courses prepare students for specific careers or job skills. Non-occupational courses are general education or transfer courses. Note: This may be auto-set based on your TOP code.",
            sequence=4,
            options=[
                CBQuestionOption(
                    value="apprenticeship",
                    label="Yes, apprenticeship program",
                    description="Formal apprenticeship training",
                    cb_value="A",
                    cb_value_description="Apprenticeship"
                ),
                CBQuestionOption(
                    value="advanced_occupational",
                    label="Yes, advanced occupational",
                    description="Advanced courses for students with prior training",
                    cb_value="B",
                    cb_value_description="Advanced Occupational"
                ),
                CBQuestionOption(
                    value="clearly_occupational",
                    label="Yes, clearly occupational",
                    description="Entry-level job skills training",
                    cb_value="C",
                    cb_value_description="Clearly Occupational"
                ),
                CBQuestionOption(
                    value="possibly_occupational",
                    label="Possibly occupational",
                    description="May be useful for employment but not primary purpose",
                    cb_value="D",
                    cb_value_description="Possibly Occupational"
                ),
                CBQuestionOption(
                    value="non_occupational",
                    label="No, non-occupational",
                    description="General education, transfer, or liberal arts",
                    cb_value="E",
                    cb_value_description="Non-Occupational"
                ),
            ],
        ),

        # Q5: Prior to College Level (CB21)
        CBDiagnosticQuestion(
            id="q_college_level",
            cb_code="CB21",
            cb_code_name="Prior to College Level",
            question="What level is this course?",
            help_text="Indicates if the course is at college/transfer level or below.",
            sequence=5,
            options=[
                CBQuestionOption(
                    value="college_level",
                    label="College/transfer level",
                    description="Standard college-level course",
                    cb_value="Y",
                    cb_value_description="Not Prior to College Level"
                ),
                CBQuestionOption(
                    value="one_below",
                    label="One level below transfer",
                    description="Immediately preparatory to transfer-level",
                    cb_value="A",
                    cb_value_description="One Level Below Transfer"
                ),
                CBQuestionOption(
                    value="two_below",
                    label="Two levels below transfer",
                    description="Two courses away from transfer-level",
                    cb_value="B",
                    cb_value_description="Two Levels Below Transfer"
                ),
                CBQuestionOption(
                    value="three_below",
                    label="Three levels below transfer",
                    description="Three courses away from transfer-level",
                    cb_value="C",
                    cb_value_description="Three Levels Below Transfer"
                ),
                CBQuestionOption(
                    value="four_below",
                    label="Four or more levels below transfer",
                    description="Four+ courses away from transfer-level",
                    cb_value="D",
                    cb_value_description="Four Levels Below Transfer"
                ),
            ],
        ),

        # Q6: Grading Method (CB24)
        CBDiagnosticQuestion(
            id="q_grading",
            cb_code="CB24",
            cb_code_name="Grading Method",
            question="How is this course graded?",
            help_text="Select the grading option(s) available to students.",
            sequence=6,
            options=[
                CBQuestionOption(
                    value="letter_only",
                    label="Letter grade only",
                    description="A, B, C, D, F grades only",
                    cb_value="L",
                    cb_value_description="Letter Grade Only"
                ),
                CBQuestionOption(
                    value="pass_no_pass_only",
                    label="Pass/No Pass only",
                    description="P/NP grading only",
                    cb_value="P",
                    cb_value_description="Pass/No Pass Only"
                ),
                CBQuestionOption(
                    value="student_choice",
                    label="Student choice (letter or P/NP)",
                    description="Students can choose their grading option",
                    cb_value="S",
                    cb_value_description="Student Choice"
                ),
                CBQuestionOption(
                    value="noncredit",
                    label="Non-credit (no grade)",
                    description="Non-credit courses with no letter grade",
                    cb_value="N",
                    cb_value_description="Non-Credit"
                ),
            ],
        ),

        # Q7: Repeatable (CB07)
        CBDiagnosticQuestion(
            id="q_repeatable",
            cb_code="CB07",
            cb_code_name="Repeatability",
            question="Can students repeat this course for credit?",
            help_text="Most courses cannot be repeated for credit. Exceptions include courses with variable topics or required for program progression.",
            sequence=7,
            options=[
                CBQuestionOption(
                    value="not_repeatable",
                    label="No, not repeatable",
                    description="Standard course, cannot be repeated for credit",
                    cb_value="N",
                    cb_value_description="Not Repeatable"
                ),
                CBQuestionOption(
                    value="repeatable",
                    label="Yes, repeatable",
                    description="Can be repeated (with justification)",
                    cb_value="Y",
                    cb_value_description="Repeatable"
                ),
            ],
        ),

        # Q8: Special Class (CB13)
        CBDiagnosticQuestion(
            id="q_special_class",
            cb_code="CB13",
            cb_code_name="Special Class Status",
            question="Is this a special class for students with disabilities?",
            help_text="Special classes are designed specifically to meet the educational needs of students with disabilities.",
            sequence=8,
            options=[
                CBQuestionOption(
                    value="not_special",
                    label="No, this is not a special class",
                    description="Standard course open to all students",
                    cb_value="N",
                    cb_value_description="Not a Special Class"
                ),
                CBQuestionOption(
                    value="special_class",
                    label="Yes, this is a special class",
                    description="Designed for students with disabilities",
                    cb_value="Y",
                    cb_value_description="Special Class"
                ),
            ],
        ),

        # Q9: Course Classification (CB11)
        CBDiagnosticQuestion(
            id="q_classification",
            cb_code="CB11",
            cb_code_name="Course Classification",
            question="How should this course be classified?",
            help_text="Indicates the primary instructional category of the course.",
            sequence=9,
            options=[
                CBQuestionOption(
                    value="credit_course",
                    label="Credit course",
                    description="Standard credit course",
                    cb_value="A",
                    cb_value_description="Credit Course"
                ),
                CBQuestionOption(
                    value="noncredit_enhanced",
                    label="Noncredit - Enhanced funding",
                    description="Noncredit course eligible for enhanced funding",
                    cb_value="B",
                    cb_value_description="Noncredit - Enhanced"
                ),
                CBQuestionOption(
                    value="noncredit_other",
                    label="Noncredit - Other",
                    description="Other noncredit course",
                    cb_value="C",
                    cb_value_description="Noncredit - Other"
                ),
            ],
        ),

        # Q10: Support Course (CB25)
        CBDiagnosticQuestion(
            id="q_support",
            cb_code="CB25",
            cb_code_name="Support Course Status",
            question="Is this a support course (linked to another course)?",
            help_text="Support courses are corequisite courses designed to help students succeed in a transfer-level course.",
            sequence=10,
            options=[
                CBQuestionOption(
                    value="not_support",
                    label="No, this is a standalone course",
                    description="Not linked to another course as support",
                    cb_value="N",
                    cb_value_description="Not a Support Course"
                ),
                CBQuestionOption(
                    value="support_course",
                    label="Yes, this is a support course",
                    description="Corequisite support for a transfer-level course",
                    cb_value="S",
                    cb_value_description="Support Course"
                ),
            ],
        ),
    ]

    cb_codes_covered = list(set(q.cb_code for q in questions))

    return CBDiagnosticQuestionsResponse(
        questions=questions,
        total_questions=len(questions),
        cb_codes_covered=sorted(cb_codes_covered),
    )


@router.post("/cb-diagnostic-answers", response_model=CBAnswersResponse)
async def process_cb_diagnostic_answers(
    request: CBAnswersRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Process diagnostic question answers and return CB code values.

    Takes the answers from the diagnostic questions and maps them to
    CB code values. Also applies dependency rules and auto-detection
    logic (e.g., CB09 from TOP code).

    **Request:**
    - `answers`: Dictionary mapping question IDs to answer values
    - `top_code`: Optional TOP code for CB09 auto-detection

    **Processing:**
    1. Maps each answer to its corresponding CB code value
    2. Applies dependencies (e.g., non-credit courses can't be transferable)
    3. Auto-detects CB09 from TOP code for non-vocational subjects
    4. Flags any conflicts or missing required codes
    """
    # Question ID to CB code mapping
    question_to_cb = {
        "q_credit": "CB04",
        "q_transfer": "CB05",
        "q_basic_skills": "CB08",
        "q_vocational": "CB09",
        "q_college_level": "CB21",
        "q_grading": "CB24",
        "q_repeatable": "CB07",
        "q_special_class": "CB13",
        "q_classification": "CB11",
        "q_support": "CB25",
    }

    # Answer to CB value mapping
    answer_to_cb_value = {
        # CB04 - Credit Status
        "credit_degree": ("D", "Credit - Degree Applicable"),
        "credit_not_degree": ("C", "Credit - Not Degree Applicable"),
        "noncredit": ("N", "Noncredit"),
        # CB05 - Transfer Status
        "uc_csu": ("A", "Transferable to both UC and CSU"),
        "csu_only": ("B", "Transferable to CSU only"),
        "not_transferable": ("C", "Not Transferable"),
        # CB08 - Basic Skills
        "yes": ("B", "Basic Skills Course"),
        "no": ("N", "Not a Basic Skills Course"),
        # CB09 - SAM Code
        "apprenticeship": ("A", "Apprenticeship"),
        "advanced_occupational": ("B", "Advanced Occupational"),
        "clearly_occupational": ("C", "Clearly Occupational"),
        "possibly_occupational": ("D", "Possibly Occupational"),
        "non_occupational": ("E", "Non-Occupational"),
        # CB21 - Prior to College Level
        "college_level": ("Y", "Not Prior to College Level"),
        "one_below": ("A", "One Level Below Transfer"),
        "two_below": ("B", "Two Levels Below Transfer"),
        "three_below": ("C", "Three Levels Below Transfer"),
        "four_below": ("D", "Four Levels Below Transfer"),
        # CB24 - Grading Method
        "letter_only": ("L", "Letter Grade Only"),
        "pass_no_pass_only": ("P", "Pass/No Pass Only"),
        "student_choice": ("S", "Student Choice"),
        # CB07 - Repeatable
        "not_repeatable": ("N", "Not Repeatable"),
        "repeatable": ("Y", "Repeatable"),
        # CB13 - Special Class
        "not_special": ("N", "Not a Special Class"),
        "special_class": ("Y", "Special Class"),
        # CB11 - Course Classification
        "credit_course": ("A", "Credit Course"),
        "noncredit_enhanced": ("B", "Noncredit - Enhanced"),
        "noncredit_other": ("C", "Noncredit - Other"),
        # CB25 - Support Course
        "not_support": ("N", "Not a Support Course"),
        "support_course": ("S", "Support Course"),
    }

    cb_code_names = {
        "CB04": "Credit Status",
        "CB05": "Transfer Status",
        "CB07": "Repeatability",
        "CB08": "Basic Skills Status",
        "CB09": "SAM Priority Code",
        "CB11": "Course Classification",
        "CB13": "Special Class Status",
        "CB21": "Prior to College Level",
        "CB24": "Grading Method",
        "CB25": "Support Course Status",
    }

    results: List[CBAnswerResult] = []
    warnings: List[str] = []
    dependencies_applied: List[str] = []

    # Process each answer
    for question_id, answer_value in request.answers.items():
        if question_id not in question_to_cb:
            continue

        cb_code = question_to_cb[question_id]
        cb_name = cb_code_names.get(cb_code, cb_code)

        if answer_value in answer_to_cb_value:
            cb_value, cb_desc = answer_to_cb_value[answer_value]
            results.append(CBAnswerResult(
                cb_code=cb_code,
                cb_code_name=cb_name,
                value=cb_value,
                value_description=cb_desc,
                source="answered",
                confidence=1.0,
            ))

    # Apply dependencies
    cb_values = {r.cb_code: r.value for r in results}

    # Dependency: Non-credit (CB04=N) cannot be transferable
    if cb_values.get("CB04") == "N" and cb_values.get("CB05") in ["A", "B"]:
        # Override CB05 to Not Transferable
        for i, r in enumerate(results):
            if r.cb_code == "CB05":
                results[i] = CBAnswerResult(
                    cb_code="CB05",
                    cb_code_name="Transfer Status",
                    value="C",
                    value_description="Not Transferable",
                    source="inferred",
                    confidence=1.0,
                )
                dependencies_applied.append("CB05 set to 'Not Transferable' because course is non-credit")
                break

    # CB09 auto-detection from TOP code
    if request.top_code:
        non_vocational_prefixes = ["15", "17", "19", "20", "22", "49"]
        is_non_voc = any(request.top_code.startswith(p) for p in non_vocational_prefixes)

        if is_non_voc:
            # Check if user selected a vocational option
            cb09_result = next((r for r in results if r.cb_code == "CB09"), None)
            if cb09_result and cb09_result.value != "E":
                warnings.append(
                    f"TOP code {request.top_code} is non-vocational, but CB09 was set to '{cb09_result.value}'. "
                    "Auto-correcting to 'E' (Non-Occupational)."
                )
                # Update the result
                for i, r in enumerate(results):
                    if r.cb_code == "CB09":
                        results[i] = CBAnswerResult(
                            cb_code="CB09",
                            cb_code_name="SAM Priority Code",
                            value="E",
                            value_description="Non-Occupational",
                            source="auto_detected",
                            confidence=1.0,
                        )
                        dependencies_applied.append(f"CB09 auto-set to 'E' based on non-vocational TOP code {request.top_code}")
                        break
            elif not cb09_result:
                # Auto-add CB09 if not answered
                results.append(CBAnswerResult(
                    cb_code="CB09",
                    cb_code_name="SAM Priority Code",
                    value="E",
                    value_description="Non-Occupational",
                    source="auto_detected",
                    confidence=0.9,
                ))
                dependencies_applied.append(f"CB09 auto-detected as 'E' from non-vocational TOP code {request.top_code}")

    # Calculate completeness
    required_codes = {"CB04", "CB05", "CB08", "CB09", "CB21"}
    answered_codes = {r.cb_code for r in results}
    completeness = len(answered_codes & required_codes) / len(required_codes) * 100

    return CBAnswersResponse(
        cb_codes=results,
        warnings=warnings,
        dependencies_applied=dependencies_applied,
        completeness_percentage=round(completeness, 1),
    )


@router.post("/cb09-auto-detect", response_model=CB09AutoDetectResponse)
async def detect_cb09_from_top_code(
    request: CB09AutoDetectRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Auto-detect CB09 (SAM Priority Code) based on TOP code vocational status.

    CB09 indicates whether a course is occupational/vocational or non-occupational.
    This is determined by the course's TOP (Taxonomy of Programs) code.

    **SAM Priority Codes:**
    - **A - Apprenticeship**: Formal apprenticeship program
    - **B - Advanced Occupational**: Advanced courses requiring prior training
    - **C - Clearly Occupational**: Entry-level job skills training
    - **D - Possibly Occupational**: May have occupational applications
    - **E - Non-Occupational**: General education, transfer, liberal arts

    **Rules:**
    - Non-vocational TOP codes (15xx, 17xx, 19xx, 20xx, 22xx, 49xx) → CB09 must be 'E'
    - Vocational TOP codes → CB09 can be A, B, C, D, or E
    - Conflict if non-vocational TOP but vocational CB09 selected

    **Non-Vocational TOP Code Prefixes:**
    - 15xx: Humanities
    - 17xx: Mathematics
    - 19xx: Physical Sciences
    - 20xx: Psychology
    - 22xx: Social Sciences
    - 49xx: Interdisciplinary Studies
    """
    from app.models.reference import TOPCode

    # Define SAM code options
    all_sam_codes = [
        SAMCodeOption(
            code="A",
            name="Apprenticeship",
            description="Formal apprenticeship program registered with the Division of Apprenticeship Standards",
            is_vocational=True,
        ),
        SAMCodeOption(
            code="B",
            name="Advanced Occupational",
            description="Advanced courses for students with prior occupational training or experience",
            is_vocational=True,
        ),
        SAMCodeOption(
            code="C",
            name="Clearly Occupational",
            description="Entry-level job skills training that prepares students for employment",
            is_vocational=True,
        ),
        SAMCodeOption(
            code="D",
            name="Possibly Occupational",
            description="Courses that could support career goals but aren't primarily vocational",
            is_vocational=True,
        ),
        SAMCodeOption(
            code="E",
            name="Non-Occupational",
            description="General education, transfer courses, or liberal arts with no specific occupational objective",
            is_vocational=False,
        ),
    ]

    # Determine if TOP code is vocational
    non_vocational_prefixes = ["15", "17", "19", "20", "22", "49"]
    is_non_vocational = any(request.top_code.startswith(p) for p in non_vocational_prefixes)
    is_vocational = not is_non_vocational

    # Try to get TOP code title from database
    top_code_title = None
    top_code_record = session.exec(
        select(TOPCode).where(TOPCode.code == request.top_code)
    ).first()
    if top_code_record:
        top_code_title = top_code_record.title

    # Determine recommended CB09 and allowed options
    if is_non_vocational:
        recommended_cb09 = "E"
        recommended_name = "Non-Occupational"
        recommended_desc = "General education, transfer courses, or liberal arts with no specific occupational objective"
        allowed_options = [all_sam_codes[4]]  # Only E allowed
        explanation = (
            f"TOP code {request.top_code} is classified as non-vocational "
            f"(prefix indicates general education/transfer subject). "
            f"Non-vocational courses must have CB09 = 'E' (Non-Occupational)."
        )
    else:
        recommended_cb09 = "C"  # Default to Clearly Occupational for vocational
        recommended_name = "Clearly Occupational"
        recommended_desc = "Entry-level job skills training that prepares students for employment"
        allowed_options = all_sam_codes  # All options allowed
        explanation = (
            f"TOP code {request.top_code} is classified as vocational/occupational. "
            f"You may select any SAM code (A-E) based on the course's occupational focus. "
            f"Default recommendation is 'C - Clearly Occupational' for entry-level job training."
        )

    # Check for conflicts with current CB09
    conflict_detected = False
    conflict_message = None

    if request.current_cb09:
        if is_non_vocational and request.current_cb09 != "E":
            conflict_detected = True
            conflict_message = (
                f"Conflict: TOP code {request.top_code} is non-vocational, "
                f"but CB09 is set to '{request.current_cb09}'. "
                f"Non-vocational courses must have CB09 = 'E'. "
                f"Please update CB09 to 'E - Non-Occupational' or change the TOP code."
            )

    return CB09AutoDetectResponse(
        top_code=request.top_code,
        top_code_title=top_code_title,
        is_vocational=is_vocational,
        recommended_cb09=recommended_cb09,
        recommended_cb09_name=recommended_name,
        recommended_cb09_description=recommended_desc,
        allowed_options=allowed_options,
        conflict_detected=conflict_detected,
        conflict_message=conflict_message,
        explanation=explanation,
    )


@router.get("/rules", response_model=Dict[str, Any])
async def list_compliance_rules(
    current_user: User = Depends(get_current_user),
):
    """
    List all compliance rules and their categories.

    Returns information about what compliance checks are performed,
    organized by category. Useful for documentation and UI display.
    """
    return {
        "categories": [
            {
                "id": cat.value,
                "name": cat.value,
                "description": _get_category_description(cat),
            }
            for cat in ComplianceCategory
        ],
        "rules": [
            # Basic Info Rules
            {
                "rule_id": "BASIC-001",
                "rule_name": "Course Title Required",
                "category": ComplianceCategory.GENERAL.value,
                "section": "Basic Info",
                "description": "Course must have a descriptive title.",
            },
            {
                "rule_id": "BASIC-002",
                "rule_name": "Catalog Description Required",
                "category": ComplianceCategory.GENERAL.value,
                "section": "Basic Info",
                "description": "Course must have a catalog description (25-75 words recommended).",
            },
            # Units & Hours Rules
            {
                "rule_id": "UNIT-001",
                "rule_name": "Valid Unit Range",
                "category": ComplianceCategory.UNITS_HOURS.value,
                "section": "Units & Hours",
                "description": "Units must be between 0.5 and 18.",
                "citation": "Title 5 § 55002.5",
            },
            {
                "rule_id": "UNIT-002",
                "rule_name": "54-Hour Rule Compliance",
                "category": ComplianceCategory.TITLE_5.value,
                "section": "Units & Hours",
                "description": "Total Student Learning Hours / 54 must equal unit value.",
                "citation": "Title 5 § 55002.5",
            },
            {
                "rule_id": "UNIT-003",
                "rule_name": "Outside-of-Class Hours Ratio",
                "category": ComplianceCategory.PCAH.value,
                "section": "Units & Hours",
                "description": "Standard ratio is 2:1 outside-of-class to lecture hours.",
            },
            {
                "rule_id": "UNIT-004",
                "rule_name": "Contact Hours Required",
                "category": ComplianceCategory.GENERAL.value,
                "section": "Units & Hours",
                "description": "Course must have lecture and/or lab hours.",
            },
            # CB Code Rules
            {
                "rule_id": "CB-CB04",
                "rule_name": "CB04 Required",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "Credit status (CB04) is required for state reporting.",
            },
            {
                "rule_id": "CB-CB05",
                "rule_name": "CB05 Required",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "Transfer status (CB05) is required for state reporting.",
            },
            {
                "rule_id": "CB-CB08",
                "rule_name": "CB08 Required",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "Basic skills status (CB08) is required for state reporting.",
            },
            {
                "rule_id": "CB-CB09",
                "rule_name": "CB09 Required",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "SAM priority code (CB09) is required for state reporting.",
            },
            {
                "rule_id": "CB-DEP-001",
                "rule_name": "CB09 SAM Code Dependency",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "Non-vocational courses must have CB09 = 'E'.",
            },
            {
                "rule_id": "CB-DEP-002",
                "rule_name": "CB05 Transfer Status Required",
                "category": ComplianceCategory.CB_CODES.value,
                "section": "CB Codes",
                "description": "Credit courses should specify transfer status.",
            },
            # SLO Rules
            {
                "rule_id": "SLO-001",
                "rule_name": "Minimum SLOs Required",
                "category": ComplianceCategory.SLO.value,
                "section": "Student Learning Outcomes",
                "description": "Course must have at least 3 Student Learning Outcomes.",
                "citation": "PCAH 8th Ed., Section 3.2",
            },
            {
                "rule_id": "SLO-002",
                "rule_name": "Higher-Order Thinking Skills",
                "category": ComplianceCategory.SLO.value,
                "section": "Student Learning Outcomes",
                "description": "At least one SLO should require Analyze, Evaluate, or Create skills.",
            },
            {
                "rule_id": "SLO-003",
                "rule_name": "Measurable SLO Verbs",
                "category": ComplianceCategory.SLO.value,
                "section": "Student Learning Outcomes",
                "description": "SLOs should use measurable action verbs (avoid 'understand', 'know').",
            },
            # Content Rules
            {
                "rule_id": "CONTENT-001",
                "rule_name": "Minimum Content Topics",
                "category": ComplianceCategory.CONTENT.value,
                "section": "Course Content",
                "description": "Course should have at least 5 content topics.",
            },
            {
                "rule_id": "CONTENT-002",
                "rule_name": "Content Hours Allocation",
                "category": ComplianceCategory.CONTENT.value,
                "section": "Course Content",
                "description": "Hours allocated to content should match total lecture hours.",
            },
            # Requisite Rules
            {
                "rule_id": "REQ-001",
                "rule_name": "Prerequisite Content Review",
                "category": ComplianceCategory.REQUISITES.value,
                "section": "Requisites",
                "description": "Prerequisites must have Content Review documentation.",
                "citation": "Title 5 § 55003",
            },
        ],
    }


def _get_category_description(category: ComplianceCategory) -> str:
    """Get description for a compliance category."""
    descriptions = {
        ComplianceCategory.TITLE_5: "California Code of Regulations - Education",
        ComplianceCategory.PCAH: "Program and Course Approval Handbook (8th Edition)",
        ComplianceCategory.CB_CODES: "community college state reporting codes",
        ComplianceCategory.UNITS_HOURS: "Unit calculation and hours requirements",
        ComplianceCategory.SLO: "Student Learning Outcome requirements",
        ComplianceCategory.CONTENT: "Course content outline requirements",
        ComplianceCategory.REQUISITES: "Prerequisite and corequisite requirements",
        ComplianceCategory.GENERAL: "General course information requirements",
    }
    return descriptions.get(category, "")


# =============================================================================
# CCN Adoption Schemas and Endpoints
# =============================================================================

class CCNAdoptRequest(BaseModel):
    """Request for adopting a CCN standard for a course."""
    course_id: uuid.UUID
    ccn_standard_id: uuid.UUID
    auto_populate_cb_codes: bool = True  # Auto-set CB05 and CB03


class CCNAdoptResponse(BaseModel):
    """Response for CCN adoption."""
    success: bool
    course_id: uuid.UUID
    ccn_id: str  # e.g., "MATH C2210"
    cb_codes_updated: Dict[str, str]  # e.g., {"CB05": "A", "CB03": "1701.00"}
    warnings: List[str]  # e.g., "Units below CCN minimum"


@router.post("/ccn-adopt", response_model=CCNAdoptResponse)
async def adopt_ccn_standard(
    request: CCNAdoptRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Adopt a CCN standard for a course, optionally auto-populating CB codes.

    This endpoint links a course to a C-ID/CCN standard per AB 1111 requirements.
    When `auto_populate_cb_codes` is True (default), it will:
    - Set CB05 to "A" (UC+CSU Transferable) - all CCN courses are transferable
    - Set CB03 to the implied TOP code for the CCN discipline

    **Request Parameters:**
    - `course_id`: UUID of the course to update
    - `ccn_standard_id`: UUID of the CCN standard to adopt
    - `auto_populate_cb_codes`: Whether to auto-set CB05 and CB03 (default: True)

    **Response:**
    - `success`: Whether the adoption was successful
    - `course_id`: The course that was updated
    - `ccn_id`: The C-ID code adopted (e.g., "MATH C2210")
    - `cb_codes_updated`: Dict of CB codes that were updated
    - `warnings`: List of warnings (e.g., unit discrepancies)

    **Warnings:**
    - If course units < CCN minimum units
    - If existing CB05 conflicts with CCN requirement (CB05 must be "A")

    **Audit Trail:**
    - Logs adoption with user, course, and CCN standard info
    """
    import logging
    from datetime import datetime

    logger = logging.getLogger(__name__)

    # Load course from database
    course = session.get(Course, request.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Load CCN standard from database
    ccn_standard = session.get(CCNStandard, request.ccn_standard_id)
    if not ccn_standard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CCN standard not found"
        )

    warnings = []
    cb_codes_updated = {}

    # Check for unit discrepancy
    if course.units and course.units < ccn_standard.minimum_units:
        warnings.append(
            f"Course units ({course.units}) below CCN minimum ({ccn_standard.minimum_units})"
        )

    # Check for existing CB05 conflict
    existing_cb_codes = course.cb_codes or {}
    if existing_cb_codes.get("CB05") and existing_cb_codes.get("CB05") != "A":
        warnings.append(
            f"Existing CB05 value '{existing_cb_codes.get('CB05')}' conflicts with "
            f"CCN requirement (CB05 must be 'A' for UC+CSU transferable)"
        )

    # Set course.ccn_id to the C-ID code
    course.ccn_id = ccn_standard.c_id

    # Auto-populate CB codes if requested
    if request.auto_populate_cb_codes:
        # Initialize cb_codes if None
        if course.cb_codes is None:
            course.cb_codes = {}

        # Set CB05 = "A" (all CCN courses are UC+CSU transferable)
        course.cb_codes["CB05"] = "A"
        cb_codes_updated["CB05"] = "A"

        # Set CB03 to implied TOP code if available
        implied_top_code = ccn_standard.implied_top_code
        if not implied_top_code:
            # Try to derive from discipline
            discipline_top_code_map = {
                'MATH': '1701.00',
                'ENGL': '1501.00',
                'PSYCH': '2001.00',
                'PSYC': '2001.00',
                'SOC': '2208.00',
                'SOCI': '2208.00',
                'BIOL': '0401.00',
                'CHEM': '1905.00',
                'HIST': '2205.00',
                'ANTH': '2202.00',
                'STAT': '1701.00',
                'ECON': '2204.00',
                'COMM': '0604.00',
                'ASTR': '1911.00',
                'ARTH': '1002.00',
                'POLS': '2207.00',
                'CDEV': '1305.00',
                'PHYS': '1902.00',
                'GEOL': '1914.00',
                'GEOG': '2206.00',
                'PHIL': '1509.00',
            }
            implied_top_code = discipline_top_code_map.get(ccn_standard.discipline)

        if implied_top_code:
            course.cb_codes["CB03"] = implied_top_code
            cb_codes_updated["CB03"] = implied_top_code

    # Save the course
    session.add(course)
    session.commit()
    session.refresh(course)

    # Log adoption for audit trail
    logger.info(
        f"CCN adoption: user={current_user.email}, course_id={course.id}, "
        f"ccn_id={ccn_standard.c_id}, cb_codes_updated={cb_codes_updated}, "
        f"warnings={warnings}"
    )

    return CCNAdoptResponse(
        success=True,
        course_id=course.id,
        ccn_id=ccn_standard.c_id,
        cb_codes_updated=cb_codes_updated,
        warnings=warnings,
    )


# =============================================================================
# CCN Non-Match Justification Schemas and Endpoints
# =============================================================================

class CCNNonMatchJustificationRequest(BaseModel):
    """Request for submitting CCN non-match justification."""
    course_id: uuid.UUID
    reason_code: str  # specialized, vocational, local_need, new_course, other
    justification_text: str


class CCNNonMatchJustificationResponse(BaseModel):
    """Response for CCN non-match justification submission."""
    id: uuid.UUID
    course_id: uuid.UUID
    reason_code: str
    justification_text: str
    created_at: str
    updated_at: str


@router.post("/ccn-non-match-justification", response_model=CCNNonMatchJustificationResponse)
async def submit_ccn_non_match_justification(
    request: CCNNonMatchJustificationRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Submit a justification for not aligning with a CCN standard.

    Per AB 1111 (Common Course Numbering), courses that do not align with
    a C-ID standard should provide a documented justification.

    **Reason Codes:**
    - `specialized`: Course covers specialized content not in CCN templates
    - `vocational`: Career technical education course outside CCN scope
    - `local_need`: Course addresses specific local workforce or community needs
    - `new_course`: Course is new and CCN template may not yet exist
    - `other`: Other reason (requires detailed explanation)

    **Validation:**
    - `justification_text` must be at least 20 characters
    - `reason_code` must be one of the valid options

    If a justification already exists for this course, it will be updated.
    """
    from app.models.reference import CCNNonMatchJustification
    from datetime import datetime

    # Validate reason code
    valid_reason_codes = {'specialized', 'vocational', 'local_need', 'new_course', 'other'}
    if request.reason_code not in valid_reason_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid reason_code. Must be one of: {', '.join(valid_reason_codes)}"
        )

    # Validate justification text length
    if len(request.justification_text.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Justification text must be at least 20 characters"
        )

    # Check if course exists
    course = session.get(Course, request.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Check if justification already exists for this course
    existing = session.exec(
        select(CCNNonMatchJustification).where(
            CCNNonMatchJustification.course_id == request.course_id
        )
    ).first()

    if existing:
        # Update existing justification
        existing.reason_code = request.reason_code
        existing.justification_text = request.justification_text.strip()
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        justification = existing
    else:
        # Create new justification
        justification = CCNNonMatchJustification(
            course_id=request.course_id,
            reason_code=request.reason_code,
            justification_text=request.justification_text.strip(),
        )
        session.add(justification)
        session.commit()
        session.refresh(justification)

    return CCNNonMatchJustificationResponse(
        id=justification.id,
        course_id=justification.course_id,
        reason_code=justification.reason_code,
        justification_text=justification.justification_text,
        created_at=justification.created_at.isoformat(),
        updated_at=justification.updated_at.isoformat(),
    )


@router.get("/ccn-non-match-justification/{course_id}", response_model=CCNNonMatchJustificationResponse)
async def get_ccn_non_match_justification(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get the CCN non-match justification for a course.

    Returns 404 if no justification exists for this course.
    """
    from app.models.reference import CCNNonMatchJustification

    justification = session.exec(
        select(CCNNonMatchJustification).where(
            CCNNonMatchJustification.course_id == course_id
        )
    ).first()

    if not justification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No CCN non-match justification found for this course"
        )

    return CCNNonMatchJustificationResponse(
        id=justification.id,
        course_id=justification.course_id,
        reason_code=justification.reason_code,
        justification_text=justification.justification_text,
        created_at=justification.created_at.isoformat(),
        updated_at=justification.updated_at.isoformat(),
    )
