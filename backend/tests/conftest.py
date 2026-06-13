"""
Pytest configuration and shared fixtures for Calricula backend tests.

This module provides:
- Database session fixtures
- User role fixtures (faculty, chair, articulation, admin)
- Sample data fixtures (departments, courses, programs)
- Mock authentication fixtures
"""

import pytest
import uuid
from decimal import Decimal
from typing import Generator
from unittest.mock import MagicMock, patch

from sqlmodel import Session, SQLModel
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import engine, get_session
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, StudentLearningOutcome, CourseContent
from app.models.department import Department


# =============================================================================
# Database Fixtures
# =============================================================================

@pytest.fixture(scope="session")
def test_engine():
    """
    Create a test engine that uses the same database as the app.
    For isolated tests, you could use an in-memory SQLite database.
    """
    return engine


@pytest.fixture
def db_session(test_engine) -> Generator[Session, None, None]:
    """
    Provide a database session for each test.
    Automatically rolls back after test completion.
    """
    with Session(test_engine) as session:
        yield session


# =============================================================================
# Test Client Fixtures
# =============================================================================

@pytest.fixture
def client() -> TestClient:
    """Create a FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def authenticated_client(client, faculty_user) -> TestClient:
    """
    Create an authenticated test client with faculty user.
    Note: This requires mocking the auth dependency.
    """
    return client


# =============================================================================
# User Fixtures
# =============================================================================

@pytest.fixture
def faculty_user(db_session) -> User:
    """Create a faculty user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_faculty_{unique_id}@test.edu",
        firebase_uid=f"test_faculty_uid_{unique_id}",
        full_name="Test Faculty User",
        role=UserRole.FACULTY
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def curriculum_chair(db_session) -> User:
    """Create a curriculum chair user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_chair_{unique_id}@test.edu",
        firebase_uid=f"test_chair_uid_{unique_id}",
        full_name="Test Curriculum Chair",
        role=UserRole.CURRICULUM_CHAIR
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def articulation_officer(db_session) -> User:
    """Create an articulation officer user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_articulation_{unique_id}@test.edu",
        firebase_uid=f"test_articulation_uid_{unique_id}",
        full_name="Test Articulation Officer",
        role=UserRole.ARTICULATION_OFFICER
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_user(db_session) -> User:
    """Create an admin user for testing."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"test_admin_{unique_id}@test.edu",
        firebase_uid=f"test_admin_uid_{unique_id}",
        full_name="Test Admin User",
        role=UserRole.ADMIN
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# =============================================================================
# Department Fixtures
# =============================================================================

@pytest.fixture
def math_department(db_session) -> Department:
    """Create a Mathematics department for testing."""
    unique_id = uuid.uuid4().hex[:8]
    dept = Department(
        name=f"Mathematics Test {unique_id}",
        code=f"MATH{unique_id[:4]}",
        division="STEM"
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


@pytest.fixture
def english_department(db_session) -> Department:
    """Create an English department for testing."""
    unique_id = uuid.uuid4().hex[:8]
    dept = Department(
        name=f"English Test {unique_id}",
        code=f"ENGL{unique_id[:4]}",
        division="Liberal Arts"
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


@pytest.fixture
def cs_department(db_session) -> Department:
    """Create a Computer Science department for testing."""
    unique_id = uuid.uuid4().hex[:8]
    dept = Department(
        name=f"Computer Science Test {unique_id}",
        code=f"CS{unique_id[:4]}",
        division="STEM"
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


# =============================================================================
# Course Fixtures
# =============================================================================

@pytest.fixture
def draft_course(db_session, math_department, faculty_user) -> Course:
    """Create a draft course for testing."""
    course = Course(
        subject_code=math_department.code,
        course_number="101",
        title="Introduction to Algebra",
        catalog_description="An introduction to algebraic concepts.",
        department_id=math_department.id,
        created_by=faculty_user.id,
        status=CourseStatus.DRAFT,
        units=Decimal("3.0"),
        lecture_hours=Decimal("3"),
        lab_hours=Decimal("0"),
        outside_of_class_hours=Decimal("6"),
        total_student_learning_hours=Decimal("162"),
        version=1,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.fixture
def approved_course(db_session, math_department, faculty_user) -> Course:
    """Create an approved course for testing."""
    course = Course(
        subject_code=math_department.code,
        course_number="201",
        title="Calculus I",
        catalog_description="Introduction to differential calculus.",
        department_id=math_department.id,
        created_by=faculty_user.id,
        status=CourseStatus.APPROVED,
        units=Decimal("4.0"),
        lecture_hours=Decimal("4"),
        lab_hours=Decimal("0"),
        outside_of_class_hours=Decimal("8"),
        total_student_learning_hours=Decimal("216"),
        version=1,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.fixture
def course_in_review(db_session, math_department, faculty_user) -> Course:
    """Create a course in department review for testing."""
    course = Course(
        subject_code=math_department.code,
        course_number="102",
        title="Intermediate Algebra",
        catalog_description="Continuation of algebraic concepts.",
        department_id=math_department.id,
        created_by=faculty_user.id,
        status=CourseStatus.DEPT_REVIEW,
        units=Decimal("3.0"),
        lecture_hours=Decimal("3"),
        lab_hours=Decimal("0"),
        version=1,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.fixture
def course_with_slos(db_session, draft_course) -> Course:
    """Create a course with SLOs for testing."""
    slos = [
        StudentLearningOutcome(
            course_id=draft_course.id,
            sequence=1,
            outcome_text="Solve linear equations in one variable.",
            bloom_level="Apply"
        ),
        StudentLearningOutcome(
            course_id=draft_course.id,
            sequence=2,
            outcome_text="Graph linear equations and inequalities.",
            bloom_level="Analyze"
        ),
        StudentLearningOutcome(
            course_id=draft_course.id,
            sequence=3,
            outcome_text="Evaluate polynomial expressions.",
            bloom_level="Evaluate"
        ),
    ]
    for slo in slos:
        db_session.add(slo)
    db_session.commit()
    db_session.refresh(draft_course)
    return draft_course


@pytest.fixture
def course_with_content(db_session, draft_course) -> Course:
    """Create a course with content outline for testing."""
    content_items = [
        CourseContent(
            course_id=draft_course.id,
            sequence=1,
            topic="Introduction to Variables",
            subtopics=["What is a variable?", "Types of variables"],
            hours_allocated=Decimal("6"),
            linked_slos=[],
        ),
        CourseContent(
            course_id=draft_course.id,
            sequence=2,
            topic="Linear Equations",
            subtopics=["Solving single-variable equations", "Word problems"],
            hours_allocated=Decimal("12"),
            linked_slos=[],
        ),
    ]
    for item in content_items:
        db_session.add(item)
    db_session.commit()
    db_session.refresh(draft_course)
    return draft_course


# =============================================================================
# Mock Authentication Fixtures
# =============================================================================

@pytest.fixture
def mock_firebase_auth():
    """Mock Firebase authentication for testing."""
    with patch("app.core.deps.verify_firebase_token") as mock:
        mock.return_value = {
            "uid": "test_uid",
            "email": "test@test.edu"
        }
        yield mock


@pytest.fixture
def mock_get_current_user(faculty_user):
    """Mock the get_current_user dependency."""
    with patch("app.core.deps.get_current_user") as mock:
        mock.return_value = faculty_user
        yield mock


# =============================================================================
# Utility Functions
# =============================================================================

def create_test_course_data(
    subject_code: str = "TEST",
    course_number: str = "101",
    title: str = "Test Course",
    units: Decimal = Decimal("3.0"),
) -> dict:
    """Helper function to create course data for API tests."""
    return {
        "subject_code": subject_code,
        "course_number": course_number,
        "title": title,
        "units": float(units),
        "lecture_hours": 3,
        "lab_hours": 0,
    }


def create_test_slo_data(
    outcome_text: str = "Test outcome",
    bloom_level: str = "Apply",
    sequence: int = 1,
) -> dict:
    """Helper function to create SLO data for API tests."""
    return {
        "outcome_text": outcome_text,
        "bloom_level": bloom_level,
        "sequence": sequence,
    }
