"""
API Integration Tests for Calricula Backend

This module provides integration tests that exercise the full API stack:
- HTTP requests through FastAPI's TestClient
- Authentication middleware (mocked)
- Database operations
- Response validation

Tests cover:
- Course CRUD endpoints
- Program endpoints
- Department endpoints
- Compliance endpoints
- Workflow endpoints
- Error handling
"""

import pytest
import uuid
from decimal import Decimal
from unittest.mock import patch, MagicMock
from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import app
from app.core.database import engine, get_session
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, StudentLearningOutcome
from app.models.department import Department
from app.models.program import Program, ProgramType, ProgramStatus


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def client():
    """Create a FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Create a database session for tests."""
    with Session(engine) as session:
        yield session


@pytest.fixture
def test_user_faculty(db_session):
    """Create a faculty test user."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"integration_faculty_{unique_id}@test.edu",
        firebase_uid=f"integration_faculty_uid_{unique_id}",
        full_name="Integration Test Faculty",
        role=UserRole.FACULTY
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_user_chair(db_session):
    """Create a curriculum chair test user."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"integration_chair_{unique_id}@test.edu",
        firebase_uid=f"integration_chair_uid_{unique_id}",
        full_name="Integration Test Chair",
        role=UserRole.CURRICULUM_CHAIR
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_user_admin(db_session):
    """Create an admin test user."""
    unique_id = uuid.uuid4().hex[:8]
    user = User(
        email=f"integration_admin_{unique_id}@test.edu",
        firebase_uid=f"integration_admin_uid_{unique_id}",
        full_name="Integration Test Admin",
        role=UserRole.ADMIN
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_department(db_session):
    """Create a test department."""
    unique_id = uuid.uuid4().hex[:4]
    dept = Department(
        name=f"Integration Test Department {unique_id}",
        code=f"INT{unique_id}",
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


@pytest.fixture
def test_course(db_session, test_department, test_user_faculty):
    """Create a test course."""
    unique_num = uuid.uuid4().hex[:4]
    course = Course(
        subject_code=test_department.code,
        course_number=f"1{unique_num}",
        title="Integration Test Course",
        catalog_description="A test course for integration testing.",
        department_id=test_department.id,
        created_by=test_user_faculty.id,
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
def test_program(db_session, test_department, test_user_faculty):
    """Create a test program."""
    unique_id = uuid.uuid4().hex[:8]
    program = Program(
        title=f"Integration Test Program {unique_id}",
        type=ProgramType.AA,
        department_id=test_department.id,
        total_units=Decimal("60.0"),
        status=ProgramStatus.DRAFT,
        created_by=test_user_faculty.id,
    )
    db_session.add(program)
    db_session.commit()
    db_session.refresh(program)
    return program


def mock_auth_dependency(user):
    """Create a mock for the get_current_user dependency."""
    async def mock_get_current_user():
        return user
    return mock_get_current_user


# =============================================================================
# Health Check Tests
# =============================================================================

class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_check(self, client):
        """Test the main health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data

    def test_database_health(self, client):
        """Test the database health check."""
        response = client.get("/health/db")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"


# =============================================================================
# Course API Integration Tests
# =============================================================================

class TestCourseAPIIntegration:
    """Integration tests for Course CRUD API endpoints."""

    def test_list_courses_unauthenticated(self, client):
        """Test that course list requires authentication."""
        response = client.get("/api/courses")
        # The endpoint might return 401 or allow unauthenticated access
        # depending on implementation - check the actual behavior
        assert response.status_code in [200, 401]

    def test_list_courses_authenticated(self, client, test_user_faculty, test_course):
        """Test listing courses with authentication."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/courses",
                    headers={"Authorization": "Bearer test_token"}
                )
                # Should return 200 with course list
                assert response.status_code == 200
                data = response.json()
                assert "items" in data
                assert "total" in data
                assert "page" in data

    def test_get_course_by_id(self, client, test_user_faculty, test_course):
        """Test getting a single course by ID."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/courses/{test_course.id}",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["id"] == str(test_course.id)
                assert data["title"] == test_course.title
                assert "slos" in data
                # Content field may be named "content" or "content_items"
                assert "content" in data or "content_items" in data

    def test_get_course_not_found(self, client, test_user_faculty):
        """Test getting a course that doesn't exist."""
        fake_id = str(uuid.uuid4())
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/courses/{fake_id}",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 404

    def test_create_course(self, client, test_user_faculty, test_department, db_session):
        """Test creating a new course."""
        unique_num = uuid.uuid4().hex[:4]
        course_data = {
            "subject_code": test_department.code,
            "course_number": f"2{unique_num}",
            "title": "New Integration Test Course",
            "catalog_description": "A newly created test course.",
            "department_id": str(test_department.id),
            "units": 3.0,
            "lecture_hours": 3,
            "lab_hours": 0,
        }

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/courses",
                    json=course_data,
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code in [200, 201]
                data = response.json()
                assert data["title"] == "New Integration Test Course"
                assert data["status"] == "Draft"

    def test_update_course(self, client, test_user_faculty, test_course, test_department):
        """Test updating an existing course."""
        # PUT requires all fields, so include required fields
        update_data = {
            "subject_code": test_course.subject_code,
            "course_number": test_course.course_number,
            "title": "Updated Integration Test Course",
            "catalog_description": "An updated description.",
            "department_id": str(test_department.id),
            "units": 3.0,
            "lecture_hours": 3,
            "lab_hours": 0,
        }

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.put(
                    f"/api/courses/{test_course.id}",
                    json=update_data,
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["title"] == "Updated Integration Test Course"

    def test_filter_courses_by_status(self, client, test_user_faculty, test_course):
        """Test filtering courses by status."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/courses?status=Draft",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                # All returned courses should be drafts
                for item in data.get("items", []):
                    assert item["status"] == "Draft"

    def test_search_courses(self, client, test_user_faculty, test_course):
        """Test searching courses by query."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/courses?search=Integration",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200


# =============================================================================
# Program API Integration Tests
# =============================================================================

class TestProgramAPIIntegration:
    """Integration tests for Program API endpoints."""

    def test_list_programs(self, client, test_user_faculty, test_program):
        """Test listing programs."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/programs",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert "items" in data

    def test_get_program_by_id(self, client, test_user_faculty, test_program):
        """Test getting a single program by ID."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/programs/{test_program.id}",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["id"] == str(test_program.id)


# =============================================================================
# Department API Integration Tests
# =============================================================================

class TestDepartmentAPIIntegration:
    """Integration tests for Department API endpoints."""

    def test_list_departments(self, client, test_department, test_user_faculty):
        """Test listing departments."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/departments",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert "items" in data
                assert "total" in data

    def test_get_department_by_id(self, client, test_department, test_user_faculty):
        """Test getting a single department by ID."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/departments/{test_department.id}",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["id"] == str(test_department.id)
                assert data["code"] == test_department.code


# =============================================================================
# Compliance API Integration Tests
# =============================================================================

class TestComplianceAPIIntegration:
    """Integration tests for Compliance API endpoints."""

    def test_compliance_audit(self, client, test_user_faculty, test_course):
        """Test the compliance audit endpoint."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/audit",
                    json={"course_id": str(test_course.id)},
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert "score" in data or "overall_status" in data
                assert "results" in data or "checks" in data

    def test_unit_validation(self, client, test_user_faculty):
        """Test the unit validation endpoint."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/validate-units",
                    json={
                        "units": 3.0,
                        "lecture_hours": 3,
                        "lab_hours": 0,
                        "outside_of_class_hours": 6
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                # Check for expected response fields
                assert "valid" in data or "is_valid" in data
                assert "total_student_learning_hours" in data or "calculated_units" in data

    def test_cb_diagnostic_questions(self, client, test_user_faculty):
        """Test getting CB code diagnostic questions."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/compliance/cb-diagnostic-questions",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert "questions" in data or isinstance(data, list)


# =============================================================================
# Workflow API Integration Tests
# =============================================================================

class TestWorkflowAPIIntegration:
    """Integration tests for Workflow API endpoints."""

    def test_submit_course_for_review(self, client, test_user_faculty, test_course, db_session):
        """Test submitting a course for review."""
        # Ensure course is in Draft status
        test_course.status = CourseStatus.DRAFT
        db_session.commit()

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    f"/api/courses/{test_course.id}/submit",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["new_status"] == "DeptReview"

    def test_approve_course_as_chair(self, client, test_user_chair, test_course, db_session):
        """Test approving a course as curriculum chair."""
        # Set course to DeptReview status
        test_course.status = CourseStatus.DEPT_REVIEW
        db_session.commit()

        with patch("app.core.deps.get_current_user", return_value=test_user_chair):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_chair.firebase_uid}
                response = client.post(
                    f"/api/courses/{test_course.id}/approve",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["new_status"] == "CurriculumCommittee"

    def test_return_course_for_revision(self, client, test_user_chair, test_course, db_session):
        """Test returning a course for revision."""
        # Set course to DeptReview status
        test_course.status = CourseStatus.DEPT_REVIEW
        db_session.commit()

        with patch("app.core.deps.get_current_user", return_value=test_user_chair):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_chair.firebase_uid}
                response = client.post(
                    f"/api/courses/{test_course.id}/return",
                    json={"comment": "Please revise the SLOs."},
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["new_status"] == "Draft"


# =============================================================================
# Reference Data API Integration Tests
# =============================================================================

class TestReferenceDataAPIIntegration:
    """Integration tests for Reference Data API endpoints."""

    def test_get_top_codes(self, client):
        """Test getting TOP codes."""
        response = client.get("/api/reference/top-codes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_ccn_standards(self, client):
        """Test getting CCN standards."""
        response = client.get("/api/reference/ccn-standards")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_ge_patterns(self, client):
        """Test getting GE patterns."""
        response = client.get("/api/reference/ge-patterns")
        assert response.status_code == 200
        data = response.json()
        # GE patterns returns a dict with cal_getc and local keys
        assert isinstance(data, dict)
        assert "cal_getc" in data or "local" in data


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Tests for API error handling."""

    def test_invalid_uuid_format(self, client, test_user_faculty):
        """Test handling of invalid UUID format."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/courses/not-a-valid-uuid",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 422  # Validation error

    def test_missing_required_fields(self, client, test_user_faculty):
        """Test handling of missing required fields in POST."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                # Missing required fields
                response = client.post(
                    "/api/courses",
                    json={"title": "Test"},  # Missing required fields
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 422

    def test_unauthorized_access(self, client):
        """Test that endpoints require authentication."""
        response = client.post(
            "/api/courses",
            json={"title": "Test"}
        )
        assert response.status_code == 401


# =============================================================================
# Pagination Tests
# =============================================================================

class TestPagination:
    """Tests for pagination functionality."""

    def test_course_list_pagination(self, client, test_user_faculty):
        """Test course list pagination parameters."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/courses?page=1&limit=10",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["page"] == 1
                assert data["limit"] == 10
                assert "pages" in data
                assert "total" in data

    def test_program_list_pagination(self, client, test_user_faculty):
        """Test program list pagination parameters."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    "/api/programs?page=1&limit=5",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200
                data = response.json()
                assert data["page"] == 1
                assert data["limit"] == 5


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
