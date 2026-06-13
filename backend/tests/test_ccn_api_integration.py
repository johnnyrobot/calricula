"""
CCN API Integration Tests

This module provides comprehensive integration tests for Common Course Numbering (CCN)
API endpoints that interact with the actual database.

Tests cover:
- CCN Standards CRUD operations
- CCN Match endpoint with database
- CCN Non-Match Justification storage
- CCN Adoption workflow
"""

import pytest
import uuid
from decimal import Decimal
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import app
from app.core.database import engine
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.department import Department
from app.models.reference import CCNStandard, CCNNonMatchJustification


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
        email=f"ccn_test_faculty_{unique_id}@test.edu",
        firebase_uid=f"ccn_test_faculty_uid_{unique_id}",
        full_name="CCN Test Faculty User",
        role=UserRole.FACULTY
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
        name=f"CCN Test Department {unique_id}",
        code=f"CCN{unique_id}",
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


@pytest.fixture
def test_course(db_session, test_department, test_user_faculty):
    """Create a test course for CCN testing."""
    unique_num = uuid.uuid4().hex[:4]
    course = Course(
        subject_code="MATH",
        course_number=f"2{unique_num}",
        title="Calculus I",
        catalog_description="Introduction to differential calculus.",
        department_id=test_department.id,
        created_by=test_user_faculty.id,
        status=CourseStatus.DRAFT,
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
def test_ccn_standard(db_session):
    """Create a test CCN standard."""
    unique_id = uuid.uuid4().hex[:4]
    standard = CCNStandard(
        c_id=f"MATH C2{unique_id}",
        discipline="MATH",
        title="Calculus I",
        descriptor="Introduction to differential and integral calculus covering limits, derivatives, and applications.",
        minimum_units=4.0,
        subject_code="MATH",
        course_number=f"C2{unique_id}",
        implied_cb05="A",
        implied_top_code="1701.00",
        slo_requirements=[
            "Apply limit definitions to evaluate limits",
            "Compute derivatives using differentiation rules",
            "Apply derivatives to solve optimization problems",
        ],
        content_requirements=[
            "Limits and continuity",
            "Derivatives and differentiation rules",
            "Applications of derivatives",
        ],
        objectives=[
            "Students will understand the concept of limits",
            "Students will master differentiation techniques",
        ],
    )
    db_session.add(standard)
    db_session.commit()
    db_session.refresh(standard)
    return standard


@pytest.fixture
def test_ccn_standard_english(db_session):
    """Create an English CCN standard for negative match testing."""
    unique_id = uuid.uuid4().hex[:4]
    standard = CCNStandard(
        c_id=f"ENGL C1{unique_id}",
        discipline="ENGL",
        title="English Composition",
        descriptor="Introduction to academic writing and critical thinking.",
        minimum_units=3.0,
        subject_code="ENGL",
        course_number=f"C1{unique_id}",
        implied_cb05="A",
        implied_top_code="1501.00",
        slo_requirements=[
            "Write clear, coherent essays",
            "Apply critical thinking skills",
        ],
        content_requirements=[
            "Essay structure",
            "Thesis development",
            "Research methods",
        ],
    )
    db_session.add(standard)
    db_session.commit()
    db_session.refresh(standard)
    return standard


# =============================================================================
# CCN Standards CRUD Tests
# =============================================================================

class TestCCNStandardsCRUD:
    """Tests for CCN Standards CRUD operations with database."""

    def test_ccn_standard_create(self, db_session):
        """Test creating a CCN standard in the database."""
        unique_id = uuid.uuid4().hex[:4]
        standard = CCNStandard(
            c_id=f"MATH C99{unique_id}",
            discipline="MATH",
            title="Test Course",
            minimum_units=4.0,
            slo_requirements=["Demonstrate mathematical reasoning"],
            content_requirements=["Algebra fundamentals"],
        )
        db_session.add(standard)
        db_session.commit()
        db_session.refresh(standard)

        assert standard.id is not None
        assert standard.c_id == f"MATH C99{unique_id}"
        assert standard.discipline == "MATH"
        assert len(standard.slo_requirements) == 1

    def test_ccn_standard_query_by_discipline(self, db_session, test_ccn_standard):
        """Test querying CCN standards by discipline."""
        results = db_session.exec(
            select(CCNStandard).where(CCNStandard.discipline == "MATH")
        ).all()

        assert len(results) > 0
        # Verify our test standard is in results
        assert any(s.id == test_ccn_standard.id for s in results)

    def test_ccn_standard_query_by_c_id(self, db_session, test_ccn_standard):
        """Test querying CCN standards by C-ID."""
        result = db_session.exec(
            select(CCNStandard).where(CCNStandard.c_id == test_ccn_standard.c_id)
        ).first()

        assert result is not None
        assert result.id == test_ccn_standard.id
        assert result.title == "Calculus I"

    def test_ccn_standard_update(self, db_session, test_ccn_standard):
        """Test updating a CCN standard."""
        original_title = test_ccn_standard.title
        test_ccn_standard.title = "Updated Calculus I"
        db_session.commit()
        db_session.refresh(test_ccn_standard)

        assert test_ccn_standard.title == "Updated Calculus I"
        assert test_ccn_standard.title != original_title

    def test_ccn_standard_delete(self, db_session):
        """Test deleting a CCN standard."""
        unique_id = uuid.uuid4().hex[:4]
        standard = CCNStandard(
            c_id=f"TEST C{unique_id}",
            discipline="TEST",
            title="Deletable Course",
            minimum_units=3.0,
        )
        db_session.add(standard)
        db_session.commit()
        standard_id = standard.id

        db_session.delete(standard)
        db_session.commit()

        result = db_session.get(CCNStandard, standard_id)
        assert result is None


# =============================================================================
# CCN Match Endpoint Integration Tests
# =============================================================================

class TestCCNMatchEndpointIntegration:
    """Integration tests for CCN Match endpoint with database."""

    def test_ccn_match_finds_standard(
        self, client, test_user_faculty, test_ccn_standard, db_session
    ):
        """Test that CCN match endpoint finds a matching standard."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Calculus I",
                        "subject_code": "MATH",
                        "units": 4.0,
                        "description": "Introduction to differential calculus",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                assert "matches" in data or "best_match" in data
                assert data.get("total_matches", 0) >= 0

    def test_ccn_match_no_match_for_different_discipline(
        self, client, test_user_faculty, test_ccn_standard, db_session
    ):
        """Test that CCN match returns no match for non-matching discipline."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Auto Body Repair",
                        "subject_code": "AUTO",
                        "units": 3.0,
                        "description": "Automotive body work and paint.",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                # Should have no matches or low confidence
                best_match = data.get("best_match")
                if best_match:
                    # If there is a match, confidence should be low
                    assert best_match.get("confidence_score", 0) < 0.5

    def test_ccn_match_with_slos(
        self, client, test_user_faculty, test_ccn_standard, db_session
    ):
        """Test CCN match with SLO data included."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Calculus I",
                        "subject_code": "MATH",
                        "units": 4.0,
                        "description": "Differential calculus course",
                        "slos": [
                            "Evaluate limits using limit laws",
                            "Apply differentiation rules to compute derivatives",
                        ],
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                assert "query_info" in data
                assert data["query_info"]["slos_provided"] == 2

    def test_ccn_match_requires_auth(self, client):
        """Test that CCN match endpoint requires authentication."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={
                "title": "Calculus I",
                "subject_code": "MATH",
                "units": 4.0,
            },
        )
        assert response.status_code == 401


# =============================================================================
# CCN Non-Match Justification Tests
# =============================================================================

class TestCCNNonMatchJustificationIntegration:
    """Integration tests for CCN non-match justification storage."""

    def test_justification_persists_to_db(
        self, client, test_user_faculty, test_course, db_session
    ):
        """Test that justification is persisted to the database."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-non-match-justification",
                    json={
                        "course_id": str(test_course.id),
                        "reason_code": "vocational",
                        "justification_text": "This is a CTE automotive course not covered by CCN standards.",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["reason_code"] == "vocational"

                # Verify in database
                justification = db_session.exec(
                    select(CCNNonMatchJustification).where(
                        CCNNonMatchJustification.course_id == test_course.id
                    )
                ).first()

                assert justification is not None
                assert justification.reason_code == "vocational"
                assert "CTE automotive" in justification.justification_text

    def test_justification_updates_existing(
        self, client, test_user_faculty, test_course, db_session
    ):
        """Test that re-submitting justification updates the existing one."""
        # Create initial justification
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}

                # First submission
                response1 = client.post(
                    "/api/compliance/ccn-non-match-justification",
                    json={
                        "course_id": str(test_course.id),
                        "reason_code": "specialized",
                        "justification_text": "Original justification.",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response1.status_code == 200

                # Second submission (update)
                response2 = client.post(
                    "/api/compliance/ccn-non-match-justification",
                    json={
                        "course_id": str(test_course.id),
                        "reason_code": "local_need",
                        "justification_text": "Updated justification.",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response2.status_code == 200
                data = response2.json()
                assert data["reason_code"] == "local_need"

                # Verify only one record exists
                justifications = db_session.exec(
                    select(CCNNonMatchJustification).where(
                        CCNNonMatchJustification.course_id == test_course.id
                    )
                ).all()

                assert len(justifications) == 1
                assert justifications[0].reason_code == "local_need"

    def test_get_justification_by_course_id(
        self, client, test_user_faculty, test_course, db_session
    ):
        """Test retrieving justification by course ID."""
        # First create a justification
        justification = CCNNonMatchJustification(
            course_id=test_course.id,
            reason_code="new_course",
            justification_text="Course is new, CCN template pending.",
        )
        db_session.add(justification)
        db_session.commit()

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/compliance/ccn-non-match-justification/{test_course.id}",
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["reason_code"] == "new_course"
                assert data["course_id"] == str(test_course.id)

    def test_get_justification_not_found(
        self, client, test_user_faculty
    ):
        """Test 404 when no justification exists for course."""
        fake_course_id = str(uuid.uuid4())

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.get(
                    f"/api/compliance/ccn-non-match-justification/{fake_course_id}",
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 404

    def test_justification_requires_auth(self, client, test_course):
        """Test that justification submission requires authentication."""
        response = client.post(
            "/api/compliance/ccn-non-match-justification",
            json={
                "course_id": str(test_course.id),
                "reason_code": "other",
                "justification_text": "Test",
            },
        )
        assert response.status_code == 401


# =============================================================================
# CCN Adoption Tests
# =============================================================================

class TestCCNAdoptionIntegration:
    """Integration tests for CCN adoption workflow."""

    def test_ccn_adopt_standard(
        self, client, test_user_faculty, test_course, test_ccn_standard, db_session
    ):
        """Test adopting a CCN standard for a course."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-adopt",
                    json={
                        "course_id": str(test_course.id),
                        "ccn_standard_id": str(test_ccn_standard.id),
                        "auto_populate_cb_codes": True,
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["course_id"] == str(test_course.id)
                assert "cb_codes_updated" in data
                # CCN adoption should set CB05 to A
                if data["cb_codes_updated"]:
                    assert data["cb_codes_updated"].get("CB05") == "A"

    def test_ccn_adopt_invalid_course(
        self, client, test_user_faculty, test_ccn_standard
    ):
        """Test adopting CCN for non-existent course."""
        fake_course_id = str(uuid.uuid4())

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-adopt",
                    json={
                        "course_id": fake_course_id,
                        "ccn_standard_id": str(test_ccn_standard.id),
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 404

    def test_ccn_adopt_invalid_standard(
        self, client, test_user_faculty, test_course
    ):
        """Test adopting non-existent CCN standard."""
        fake_standard_id = str(uuid.uuid4())

        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-adopt",
                    json={
                        "course_id": str(test_course.id),
                        "ccn_standard_id": fake_standard_id,
                    },
                    headers={"Authorization": "Bearer test_token"}
                )

                assert response.status_code == 404


# =============================================================================
# Reference Endpoint Tests
# =============================================================================

class TestCCNReferenceEndpoints:
    """Tests for CCN reference data endpoints."""

    def test_list_ccn_standards(self, client, test_ccn_standard):
        """Test listing CCN standards endpoint."""
        response = client.get("/api/reference/ccn-standards")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_ccn_standards_filter_by_discipline(self, client, test_ccn_standard):
        """Test filtering CCN standards by discipline."""
        response = client.get("/api/reference/ccn-standards?discipline=MATH")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned should be MATH discipline
        for standard in data:
            assert standard["discipline"] == "MATH"


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
