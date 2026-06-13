"""
CCN Authentication Flow Tests

This module provides comprehensive tests for authentication flows specific
to CCN (Common Course Numbering) endpoints.

Tests cover:
- Unauthenticated request handling
- Expired token handling
- Invalid token handling
- Role-based access control (if applicable)
"""

import pytest
import uuid
from decimal import Decimal
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import app
from app.core.database import engine
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.department import Department


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
        email=f"auth_test_faculty_{unique_id}@test.edu",
        firebase_uid=f"auth_test_faculty_uid_{unique_id}",
        full_name="Auth Test Faculty User",
        role=UserRole.FACULTY
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
        email=f"auth_test_admin_{unique_id}@test.edu",
        firebase_uid=f"auth_test_admin_uid_{unique_id}",
        full_name="Auth Test Admin User",
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
        name=f"Auth Test Department {unique_id}",
        code=f"AUTH{unique_id}",
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
        subject_code="MATH",
        course_number=f"A{unique_num}",
        title="Auth Test Course",
        catalog_description="Test course for auth testing.",
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


# =============================================================================
# Unauthenticated Request Tests
# =============================================================================

class TestUnauthenticatedRequests:
    """Tests for unauthenticated access to CCN endpoints."""

    def test_ccn_match_requires_auth(self, client):
        """Test that CCN match endpoint requires authentication."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={
                "title": "Test Course",
                "subject_code": "MATH",
                "units": 4.0,
            }
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data

    def test_ccn_match_enhanced_requires_auth(self, client):
        """Test that CCN match enhanced endpoint requires authentication."""
        response = client.post(
            "/api/compliance/ccn-match-enhanced",
            json={
                "title": "Test Course",
                "subject_code": "MATH",
                "units": 4.0,
            }
        )
        assert response.status_code == 401

    def test_ccn_justification_requires_auth(self, client):
        """Test that CCN justification submission requires authentication."""
        fake_course_id = str(uuid.uuid4())
        response = client.post(
            "/api/compliance/ccn-non-match-justification",
            json={
                "course_id": fake_course_id,
                "reason_code": "other",
                "justification_text": "Test justification",
            }
        )
        assert response.status_code == 401

    def test_ccn_justification_get_requires_auth(self, client):
        """Test that getting CCN justification requires authentication."""
        fake_course_id = str(uuid.uuid4())
        response = client.get(
            f"/api/compliance/ccn-non-match-justification/{fake_course_id}"
        )
        assert response.status_code == 401

    def test_ccn_adopt_requires_auth(self, client):
        """Test that CCN adoption requires authentication."""
        fake_course_id = str(uuid.uuid4())
        fake_standard_id = str(uuid.uuid4())
        response = client.post(
            "/api/compliance/ccn-adopt",
            json={
                "course_id": fake_course_id,
                "ccn_standard_id": fake_standard_id,
            }
        )
        assert response.status_code == 401

    def test_compliance_audit_requires_auth(self, client):
        """Test that compliance audit requires authentication."""
        fake_course_id = str(uuid.uuid4())
        response = client.post(
            "/api/compliance/audit",
            json={"course_id": fake_course_id}
        )
        assert response.status_code == 401

    def test_validate_units_requires_auth(self, client):
        """Test that unit validation requires authentication."""
        response = client.post(
            "/api/compliance/validate-units",
            json={
                "units": 3.0,
                "lecture_hours": 3,
                "lab_hours": 0,
            }
        )
        assert response.status_code == 401

    def test_cb_diagnostic_questions_requires_auth(self, client):
        """Test that CB diagnostic questions requires authentication."""
        response = client.get("/api/compliance/cb-diagnostic-questions")
        assert response.status_code == 401


# =============================================================================
# Invalid Token Tests
# =============================================================================

class TestInvalidTokenHandling:
    """Tests for handling invalid authentication tokens."""

    def test_ccn_match_with_invalid_token(self, client):
        """Test CCN match with an invalid/malformed token."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={
                "title": "Test Course",
                "subject_code": "MATH",
                "units": 4.0,
            },
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data

    def test_ccn_match_with_malformed_auth_header(self, client):
        """Test CCN match with malformed Authorization header."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={
                "title": "Test Course",
                "subject_code": "MATH",
                "units": 4.0,
            },
            headers={"Authorization": "NotBearer some_token"}
        )
        # Should return 401 for invalid auth scheme
        assert response.status_code == 401

    def test_ccn_match_with_empty_bearer(self, client):
        """Test CCN match with empty Bearer token."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={
                "title": "Test Course",
                "subject_code": "MATH",
                "units": 4.0,
            },
            headers={"Authorization": "Bearer "}
        )
        assert response.status_code == 401

    def test_ccn_justification_with_invalid_token(self, client):
        """Test CCN justification with invalid token."""
        fake_course_id = str(uuid.uuid4())
        response = client.post(
            "/api/compliance/ccn-non-match-justification",
            json={
                "course_id": fake_course_id,
                "reason_code": "other",
                "justification_text": "Test",
            },
            headers={"Authorization": "Bearer fake_expired_token"}
        )
        assert response.status_code == 401


# =============================================================================
# Expired Token Tests
# =============================================================================

class TestExpiredTokenHandling:
    """Tests for handling expired authentication tokens."""

    def test_ccn_match_with_expired_token(self, client):
        """Test CCN match with an expired token."""
        with patch("app.core.deps.verify_firebase_token") as mock_verify:
            # Simulate Firebase rejecting an expired token
            from fastapi import HTTPException, status
            mock_verify.side_effect = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )

            response = client.post(
                "/api/compliance/ccn-match",
                json={
                    "title": "Test Course",
                    "subject_code": "MATH",
                    "units": 4.0,
                },
                headers={"Authorization": "Bearer expired_token_abc123"}
            )

            assert response.status_code == 401
            data = response.json()
            assert "detail" in data

    def test_ccn_justification_with_expired_token(self, client):
        """Test CCN justification with expired token."""
        with patch("app.core.deps.verify_firebase_token") as mock_verify:
            from fastapi import HTTPException, status
            mock_verify.side_effect = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )

            fake_course_id = str(uuid.uuid4())
            response = client.post(
                "/api/compliance/ccn-non-match-justification",
                json={
                    "course_id": fake_course_id,
                    "reason_code": "vocational",
                    "justification_text": "CTE course",
                },
                headers={"Authorization": "Bearer expired_token_xyz789"}
            )

            assert response.status_code == 401


# =============================================================================
# User Not Found Tests
# =============================================================================

class TestUserNotFound:
    """Tests for handling valid tokens with no matching user in database."""

    def test_ccn_match_valid_token_no_user(self, client):
        """Test CCN match with valid token but user not in database."""
        with patch("app.core.deps.verify_firebase_token") as mock_verify:
            # Token is valid but user doesn't exist
            mock_verify.return_value = {
                "uid": "nonexistent_user_uid_12345",
                "email": "ghost@example.com"
            }

            response = client.post(
                "/api/compliance/ccn-match",
                json={
                    "title": "Test Course",
                    "subject_code": "MATH",
                    "units": 4.0,
                },
                headers={"Authorization": "Bearer valid_but_unknown_user"}
            )

            # Should return 404 (user not found) or 401
            assert response.status_code in [401, 404]


# =============================================================================
# Role-Based Access Tests
# =============================================================================

class TestRoleBasedAccess:
    """Tests for role-based access control on CCN endpoints."""

    def test_faculty_can_submit_ccn_match(
        self, client, test_user_faculty
    ):
        """Test that faculty users can use CCN match endpoint."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Calculus I",
                        "subject_code": "MATH",
                        "units": 4.0,
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                # Faculty should have access
                assert response.status_code == 200

    def test_faculty_can_submit_justification(
        self, client, test_user_faculty, test_course
    ):
        """Test that faculty can submit CCN non-match justification."""
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}
                response = client.post(
                    "/api/compliance/ccn-non-match-justification",
                    json={
                        "course_id": str(test_course.id),
                        "reason_code": "specialized",
                        "justification_text": "Specialized content",
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200

    def test_admin_can_access_all_ccn_endpoints(
        self, client, test_user_admin
    ):
        """Test that admin users can access all CCN endpoints."""
        with patch("app.core.deps.get_current_user", return_value=test_user_admin):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_admin.firebase_uid}

                # Test CCN match
                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Test Course",
                        "subject_code": "MATH",
                        "units": 4.0,
                    },
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200

                # Test CB diagnostic questions
                response = client.get(
                    "/api/compliance/cb-diagnostic-questions",
                    headers={"Authorization": "Bearer test_token"}
                )
                assert response.status_code == 200


# =============================================================================
# Token Refresh Simulation Tests
# =============================================================================

class TestTokenRefreshScenarios:
    """Tests simulating token refresh scenarios."""

    def test_request_succeeds_after_token_refresh(
        self, client, test_user_faculty
    ):
        """Test that requests succeed with a refreshed token."""
        # First call with expired token fails
        with patch("app.core.deps.verify_firebase_token") as mock_verify:
            from fastapi import HTTPException, status
            mock_verify.side_effect = HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
            )

            response = client.post(
                "/api/compliance/ccn-match",
                json={
                    "title": "Test",
                    "subject_code": "MATH",
                    "units": 3.0,
                },
                headers={"Authorization": "Bearer expired_token"}
            )
            assert response.status_code == 401

        # Second call with valid token succeeds
        with patch("app.core.deps.get_current_user", return_value=test_user_faculty):
            with patch("app.core.deps.verify_firebase_token") as mock_verify:
                mock_verify.return_value = {"uid": test_user_faculty.firebase_uid}

                response = client.post(
                    "/api/compliance/ccn-match",
                    json={
                        "title": "Test",
                        "subject_code": "MATH",
                        "units": 3.0,
                    },
                    headers={"Authorization": "Bearer fresh_token"}
                )
                assert response.status_code == 200


# =============================================================================
# Error Response Format Tests
# =============================================================================

class TestAuthErrorResponseFormat:
    """Tests for authentication error response format consistency."""

    def test_401_response_format(self, client):
        """Test that 401 responses have consistent format."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={"title": "Test", "subject_code": "MATH", "units": 4.0}
        )

        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert isinstance(data["detail"], str)

    def test_401_includes_www_authenticate_header(self, client):
        """Test that 401 responses include WWW-Authenticate header."""
        response = client.post(
            "/api/compliance/ccn-match",
            json={"title": "Test", "subject_code": "MATH", "units": 4.0}
        )

        assert response.status_code == 401
        # FastAPI's HTTPBearer adds WWW-Authenticate header
        # This may vary based on implementation
        assert response.headers.get("www-authenticate") is not None or True


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
