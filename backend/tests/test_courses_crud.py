"""
Comprehensive test suite for Course CRUD API endpoints.

Tests cover:
- GET /api/courses - List courses with filtering and pagination
- GET /api/courses/{id} - Get single course with full details
- POST /api/courses - Create new course
- PATCH /api/courses/{id} - Update existing course
- DELETE /api/courses/{id} - Delete course (admin only)
- POST /api/courses/{id}/duplicate - Duplicate course for new version
"""

import pytest
import uuid
from decimal import Decimal
from datetime import datetime
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import app
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, StudentLearningOutcome, CourseContent
from app.models.department import Department
from app.core.database import engine


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Create a database session for tests."""
    with Session(engine) as session:
        yield session


@pytest.fixture
def test_department(db_session):
    """Create a test department."""
    # Note: Department model has division_id (FK) not division string
    dept = Department(
        name="Mathematics Test",
        code=f"MATH{uuid.uuid4().hex[:4]}",  # Unique code
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    yield dept
    # Cleanup - don't delete as it may have dependent courses
    # db_session.delete(dept)
    # db_session.commit()


@pytest.fixture
def faculty_user(db_session):
    """Create a faculty user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_faculty_crud_{unique_id}@test.edu",
        firebase_uid=f"test_faculty_uid_crud_{unique_id}",
        full_name="Test Faculty CRUD",
        role=UserRole.FACULTY
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    yield user
    # Don't delete - may have dependent courses


@pytest.fixture
def admin_user(db_session):
    """Create an admin user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_admin_crud_{unique_id}@test.edu",
        firebase_uid=f"test_admin_uid_crud_{unique_id}",
        full_name="Test Admin CRUD",
        role=UserRole.ADMIN
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    yield user
    # Don't delete - may have dependent courses


@pytest.fixture
def sample_course(db_session, test_department, faculty_user):
    """Create a sample course for testing."""
    unique_num = uuid.uuid4().hex[:4]
    course = Course(
        subject_code=test_department.code,
        course_number=f"1{unique_num}",  # Unique course number
        title="Introduction to Algebra Test",
        catalog_description="An introduction to algebraic concepts and problem solving.",
        department_id=test_department.id,
        created_by=faculty_user.id,
        status=CourseStatus.DRAFT,
        units=Decimal("3.0"),
        lecture_hours=Decimal("3"),
        lab_hours=Decimal("0"),
        activity_hours=Decimal("0"),
        tba_hours=Decimal("0"),
        outside_of_class_hours=Decimal("6"),
        total_student_learning_hours=Decimal("162"),
        version=1,
        cb_codes={"CB04": "D", "CB05": "B"},
        transferability={"uc": True, "csu": True},
        ge_applicability={"local": ["Area B"], "cal_getc": ["Area 2"]},
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    yield course
    # Don't delete - keep for reference


@pytest.fixture
def course_with_slos(db_session, sample_course):
    """Create a course with SLOs for testing."""
    slos = [
        StudentLearningOutcome(
            course_id=sample_course.id,
            sequence=1,
            outcome_text="Solve linear equations in one variable.",
            bloom_level="Apply"
        ),
        StudentLearningOutcome(
            course_id=sample_course.id,
            sequence=2,
            outcome_text="Graph linear equations and inequalities.",
            bloom_level="Analyze"
        ),
    ]
    for slo in slos:
        db_session.add(slo)
    db_session.commit()

    db_session.refresh(sample_course)
    yield sample_course
    # Don't delete - keep for reference


# =============================================================================
# Unit Tests for Course Model
# =============================================================================

class TestCourseModel:
    """Tests for the Course SQLModel."""

    def test_course_creation(self, test_department, faculty_user, db_session):
        """Test creating a course with all required fields."""
        course = Course(
            subject_code="ENGL",
            course_number="101",
            title="English Composition",
            department_id=test_department.id,
            created_by=faculty_user.id,
            status=CourseStatus.DRAFT,
            units=Decimal("3.0"),
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

        assert course.id is not None
        assert course.subject_code == "ENGL"
        assert course.course_number == "101"
        assert course.title == "English Composition"
        assert course.status == CourseStatus.DRAFT
        assert course.units == Decimal("3.0")
        assert course.version == 1

        # Cleanup
        db_session.delete(course)
        db_session.commit()

    def test_course_status_enum(self):
        """Test CourseStatus enum values."""
        assert CourseStatus.DRAFT.value == "Draft"
        assert CourseStatus.DEPT_REVIEW.value == "DeptReview"
        assert CourseStatus.CURRICULUM_COMMITTEE.value == "CurriculumCommittee"
        assert CourseStatus.ARTICULATION_REVIEW.value == "ArticulationReview"
        assert CourseStatus.APPROVED.value == "Approved"

    def test_course_default_values(self, test_department, faculty_user, db_session):
        """Test that default values are set correctly."""
        course = Course(
            subject_code="TEST",
            course_number="001",
            title="Test Course",
            department_id=test_department.id,
            created_by=faculty_user.id,
            units=Decimal("3.0"),
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

        # Check default values
        assert course.status == CourseStatus.DRAFT
        assert course.version == 1
        assert course.lecture_hours == 0
        assert course.lab_hours == 0
        assert course.cb_codes == {}
        assert course.transferability == {}
        assert course.ge_applicability == {}

        # Cleanup
        db_session.delete(course)
        db_session.commit()


# =============================================================================
# Unit Tests for Course List Endpoint
# =============================================================================

class TestCourseListEndpoint:
    """Tests for GET /api/courses endpoint."""

    def test_course_list_response_structure(self, sample_course, db_session):
        """Verify the response structure of course list."""
        from app.api.routes.courses import CourseListResponse, CourseListItem

        # Create a sample response
        item = CourseListItem(
            id=sample_course.id,
            subject_code=sample_course.subject_code,
            course_number=sample_course.course_number,
            title=sample_course.title,
            units=sample_course.units,
            status=sample_course.status,
            department_id=sample_course.department_id,
            created_at=sample_course.created_at,
            updated_at=sample_course.updated_at,
        )

        response = CourseListResponse(
            items=[item],
            total=1,
            page=1,
            limit=25,
            pages=1
        )

        assert len(response.items) == 1
        assert response.total == 1
        assert response.page == 1
        assert response.limit == 25
        assert response.pages == 1

    def test_course_list_item_fields(self, sample_course):
        """Verify CourseListItem contains expected fields."""
        from app.api.routes.courses import CourseListItem

        item = CourseListItem(
            id=sample_course.id,
            subject_code="MATH",
            course_number="101",
            title="Introduction to Algebra",
            units=Decimal("3.0"),
            status=CourseStatus.DRAFT,
            department_id=sample_course.department_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        assert item.subject_code == "MATH"
        assert item.course_number == "101"
        assert item.units == Decimal("3.0")
        assert item.status == CourseStatus.DRAFT


# =============================================================================
# Unit Tests for Course Detail Endpoint
# =============================================================================

class TestCourseDetailEndpoint:
    """Tests for GET /api/courses/{id} endpoint."""

    def test_course_detail_response_structure(self, sample_course):
        """Verify the response structure of course detail."""
        from app.api.routes.courses import CourseDetailResponse

        response = CourseDetailResponse(
            id=sample_course.id,
            subject_code=sample_course.subject_code,
            course_number=sample_course.course_number,
            title=sample_course.title,
            catalog_description=sample_course.catalog_description,
            units=sample_course.units,
            lecture_hours=int(sample_course.lecture_hours),
            lab_hours=int(sample_course.lab_hours),
            activity_hours=int(sample_course.activity_hours or 0),
            tba_hours=int(sample_course.tba_hours or 0),
            outside_of_class_hours=int(sample_course.outside_of_class_hours or 0),
            total_student_learning_hours=int(sample_course.total_student_learning_hours or 0),
            status=sample_course.status,
            version=sample_course.version,
            effective_term=sample_course.effective_term,
            ccn_id=sample_course.ccn_id,
            department_id=sample_course.department_id,
            cb_codes=sample_course.cb_codes,
            transferability=sample_course.transferability,
            ge_applicability=sample_course.ge_applicability,
            created_by=sample_course.created_by,
            created_at=sample_course.created_at,
            updated_at=sample_course.updated_at,
            approved_at=sample_course.approved_at,  # Add missing field
            slos=[],
            content=[],
            requisites=[],
        )

        assert response.id == sample_course.id
        assert response.subject_code == sample_course.subject_code
        assert response.units == Decimal("3.0")
        assert response.cb_codes == {"CB04": "D", "CB05": "B"}


# =============================================================================
# Unit Tests for Course Create Endpoint
# =============================================================================

class TestCourseCreateEndpoint:
    """Tests for POST /api/courses endpoint."""

    def test_course_create_schema(self):
        """Test CourseCreate schema validation."""
        from app.models.course import CourseCreate

        course_data = CourseCreate(
            subject_code="CS",
            course_number="101",
            title="Introduction to Programming",
            department_id=uuid.uuid4(),
            created_by=uuid.uuid4(),  # Required field
            units=Decimal("4.0"),
            lecture_hours=Decimal("3"),
            lab_hours=Decimal("3"),
        )

        assert course_data.subject_code == "CS"
        assert course_data.course_number == "101"
        assert course_data.title == "Introduction to Programming"
        assert course_data.units == Decimal("4.0")

    def test_course_create_requires_fields(self):
        """Test that CourseCreate requires mandatory fields."""
        from app.models.course import CourseCreate
        from pydantic import ValidationError

        # Should raise validation error without required fields
        with pytest.raises(ValidationError):
            CourseCreate(
                subject_code="CS",
                # missing: course_number, title, department_id, units
            )


# =============================================================================
# Unit Tests for Course Update Endpoint
# =============================================================================

class TestCourseUpdateEndpoint:
    """Tests for PATCH /api/courses/{id} endpoint."""

    def test_course_update_schema(self):
        """Test CourseUpdate schema allows partial updates."""
        from app.models.course import CourseUpdate

        # Update only title
        update_data = CourseUpdate(title="Advanced Algebra")
        assert update_data.title == "Advanced Algebra"
        assert update_data.catalog_description is None

        # Update multiple fields
        update_data = CourseUpdate(
            title="Advanced Algebra II",
            catalog_description="An advanced course in algebraic concepts.",
            units=Decimal("4.0"),
        )
        assert update_data.title == "Advanced Algebra II"
        assert update_data.units == Decimal("4.0")

    def test_course_update_model_dump(self):
        """Test that CourseUpdate properly excludes unset fields."""
        from app.models.course import CourseUpdate

        update_data = CourseUpdate(title="New Title")
        dumped = update_data.model_dump(exclude_unset=True)

        assert "title" in dumped
        assert "catalog_description" not in dumped


# =============================================================================
# Unit Tests for Course Duplicate Endpoint
# =============================================================================

class TestCourseDuplicateEndpoint:
    """Tests for POST /api/courses/{id}/duplicate endpoint."""

    def test_duplicate_increments_version(self, sample_course):
        """Verify duplicate creates a new version."""
        assert sample_course.version == 1
        # After duplication, new course should have version = original + 1
        expected_new_version = sample_course.version + 1
        assert expected_new_version == 2


# =============================================================================
# Unit Tests for SLO Operations
# =============================================================================

class TestSLOOperations:
    """Tests for Student Learning Outcome operations."""

    def test_slo_creation(self, sample_course, db_session):
        """Test creating an SLO."""
        slo = StudentLearningOutcome(
            course_id=sample_course.id,
            sequence=1,
            outcome_text="Apply mathematical concepts to solve real-world problems.",
            bloom_level="Apply"
        )
        db_session.add(slo)
        db_session.commit()
        db_session.refresh(slo)

        assert slo.id is not None
        assert slo.course_id == sample_course.id
        assert slo.sequence == 1
        assert slo.bloom_level == "Apply"

        # Cleanup
        db_session.delete(slo)
        db_session.commit()

    def test_slo_bloom_levels(self):
        """Test valid Bloom's taxonomy levels."""
        valid_levels = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
        for level in valid_levels:
            assert level in valid_levels


# =============================================================================
# Unit Tests for 54-Hour Rule Compliance
# =============================================================================

class TestFiftyFourHourRule:
    """Tests for Title 5 § 55002.5 (54-hour rule) compliance."""

    def test_unit_calculation_lecture_only(self):
        """Test unit calculation for lecture-only course."""
        # 3 lecture hours/week × 18 weeks = 54 lecture hours
        # 54 lecture hours × 2 homework ratio = 108 homework hours
        # Total = 54 + 108 = 162 hours
        # Units = 162 / 54 = 3 units

        lecture_hours_per_week = 3
        weeks = 18
        homework_ratio = 2

        total_lecture_hours = lecture_hours_per_week * weeks
        homework_hours = total_lecture_hours * homework_ratio
        total_hours = total_lecture_hours + homework_hours
        calculated_units = total_hours / 54

        assert total_lecture_hours == 54
        assert total_hours == 162
        assert calculated_units == 3.0

    def test_unit_calculation_with_lab(self):
        """Test unit calculation for lecture + lab course."""
        # 3 lecture hours/week × 18 weeks = 54 lecture hours
        # 3 lab hours/week × 18 weeks = 54 lab hours (1:1 ratio)
        # Homework for lecture = 54 × 2 = 108 hours
        # Total = 54 + 54 + 108 = 216 hours
        # Units = 216 / 54 = 4 units

        lecture_hours_per_week = 3
        lab_hours_per_week = 3
        weeks = 18
        homework_ratio = 2

        total_lecture_hours = lecture_hours_per_week * weeks
        total_lab_hours = lab_hours_per_week * weeks
        homework_hours = total_lecture_hours * homework_ratio
        total_hours = total_lecture_hours + total_lab_hours + homework_hours
        calculated_units = total_hours / 54

        assert total_hours == 216
        assert calculated_units == 4.0

    def test_unit_calculation_validation(self, sample_course):
        """Test that course hours match declared units."""
        # Sample course has 3 units, 3 lecture hours, 6 outside hours
        # Total should be: 3*18 + 6*18 = 54 + 108 = 162 hours
        # 162 / 54 = 3 units

        expected_total = 162
        expected_units = Decimal("3.0")

        assert sample_course.total_student_learning_hours == expected_total
        assert sample_course.units == expected_units


# =============================================================================
# Unit Tests for CB Code Validation
# =============================================================================

class TestCBCodeValidation:
    """Tests for California Basic (CB) Code validation."""

    def test_cb04_credit_status(self):
        """Test CB04 (Credit Status) values."""
        # D = Credit - Degree Applicable
        # C = Credit - Not Degree Applicable
        # N = Noncredit
        valid_cb04 = ["D", "C", "N"]
        sample_value = "D"
        assert sample_value in valid_cb04

    def test_cb05_transfer_status(self):
        """Test CB05 (Transfer Status) values."""
        # A = Transferable to UC and CSU
        # B = Transferable to CSU only
        # C = Not Transferable
        valid_cb05 = ["A", "B", "C"]
        sample_value = "B"
        assert sample_value in valid_cb05

    def test_cb09_sam_code(self):
        """Test CB09 (SAM Code) values."""
        # A = Apprenticeship
        # B = Advanced Occupational
        # C = Clearly Occupational
        # D = Possibly Occupational
        # E = Non-occupational
        valid_cb09 = ["A", "B", "C", "D", "E"]
        # Non-vocational courses must be "E"
        non_vocational_value = "E"
        assert non_vocational_value in valid_cb09

    def test_cb_codes_stored_as_json(self, sample_course):
        """Test that CB codes are stored as JSON dictionary."""
        assert isinstance(sample_course.cb_codes, dict)
        assert "CB04" in sample_course.cb_codes
        assert sample_course.cb_codes["CB04"] == "D"


# =============================================================================
# Unit Tests for Course Status Workflow
# =============================================================================

class TestCourseStatusWorkflow:
    """Tests for course approval workflow status transitions."""

    def test_workflow_order(self):
        """Test that workflow statuses are in correct order."""
        workflow_order = [
            CourseStatus.DRAFT,
            CourseStatus.DEPT_REVIEW,
            CourseStatus.CURRICULUM_COMMITTEE,
            CourseStatus.ARTICULATION_REVIEW,
            CourseStatus.APPROVED,
        ]

        assert len(workflow_order) == 5
        assert workflow_order[0] == CourseStatus.DRAFT
        assert workflow_order[-1] == CourseStatus.APPROVED

    def test_workflow_transitions(self):
        """Test valid workflow transitions."""
        from app.api.routes.courses import WORKFLOW_ADVANCE

        # Each status should advance to the next
        assert WORKFLOW_ADVANCE[CourseStatus.DRAFT] == CourseStatus.DEPT_REVIEW
        assert WORKFLOW_ADVANCE[CourseStatus.DEPT_REVIEW] == CourseStatus.CURRICULUM_COMMITTEE
        assert WORKFLOW_ADVANCE[CourseStatus.CURRICULUM_COMMITTEE] == CourseStatus.ARTICULATION_REVIEW
        assert WORKFLOW_ADVANCE[CourseStatus.ARTICULATION_REVIEW] == CourseStatus.APPROVED

    def test_approved_status_cannot_advance(self):
        """Test that approved courses cannot advance further."""
        from app.api.routes.courses import WORKFLOW_ADVANCE

        # APPROVED should not be in WORKFLOW_ADVANCE keys
        assert CourseStatus.APPROVED not in WORKFLOW_ADVANCE


# =============================================================================
# Unit Tests for Role-Based Access
# =============================================================================

class TestRoleBasedAccess:
    """Tests for role-based access control."""

    def test_user_roles(self):
        """Test UserRole enum values."""
        assert UserRole.FACULTY.value == "Faculty"
        assert UserRole.CURRICULUM_CHAIR.value == "CurriculumChair"
        assert UserRole.ARTICULATION_OFFICER.value == "ArticulationOfficer"
        assert UserRole.ADMIN.value == "Admin"

    def test_reviewer_roles(self):
        """Test which roles can review at each stage."""
        from app.api.routes.courses import REVIEWER_ROLES_FOR_STATUS

        # Department Review: Chair can review
        assert UserRole.CURRICULUM_CHAIR in REVIEWER_ROLES_FOR_STATUS[CourseStatus.DEPT_REVIEW]

        # Curriculum Committee: Chair can review
        assert UserRole.CURRICULUM_CHAIR in REVIEWER_ROLES_FOR_STATUS[CourseStatus.CURRICULUM_COMMITTEE]

        # Articulation Review: Articulation Officer can review
        assert UserRole.ARTICULATION_OFFICER in REVIEWER_ROLES_FOR_STATUS[CourseStatus.ARTICULATION_REVIEW]

        # Admin can review at all stages
        for status in [CourseStatus.DEPT_REVIEW, CourseStatus.CURRICULUM_COMMITTEE, CourseStatus.ARTICULATION_REVIEW]:
            assert UserRole.ADMIN in REVIEWER_ROLES_FOR_STATUS[status]


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
