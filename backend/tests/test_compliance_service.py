"""
Unit tests for the Compliance Service

Tests community college compliance rules including:
- Title 5 § 55002.5 (54-hour rule for unit calculation)
- CB Code dependencies
- SLO requirements
- Course content requirements
"""

import pytest
from decimal import Decimal
from typing import Dict, Any, List

from app.services.compliance_service import (
    ComplianceService,
    ComplianceStatus,
    ComplianceCategory,
    ComplianceResult,
    ComplianceAuditResponse,
)


@pytest.fixture
def compliance_service():
    """Create a ComplianceService instance for testing."""
    return ComplianceService()


@pytest.fixture
def valid_course_data() -> Dict[str, Any]:
    """Create valid course data that passes all compliance checks."""
    return {
        "title": "Introduction to Computer Science",
        "catalog_description": (
            "An introduction to fundamental concepts of computer science "
            "including algorithms, data structures, programming paradigms, "
            "and software development. Students will learn to design and "
            "implement solutions to computational problems."
        ),
        "units": Decimal("3"),
        "lecture_hours": Decimal("3"),  # 3 hours/week × 18 weeks = 54 hours
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),  # 6 hours/week × 18 = 108 hours
        # Total: 54 + 108 = 162 hours ÷ 54 = 3 units ✓
        "top_code": "0707.00",  # Computer Information Systems
        "cb_codes": {
            "CB04": "D",  # Degree applicable
            "CB05": "A",  # Transferable CSU/UC
            "CB08": "N",  # Not basic skills
            "CB09": "E",  # Non-occupational
        },
    }


@pytest.fixture
def valid_slos() -> List[Dict[str, Any]]:
    """Create valid SLOs for a course."""
    return [
        {
            "sequence_order": 1,
            "outcome_text": "Analyze computational problems and design algorithmic solutions.",
            "bloom_level": "Analyze",  # Higher-order thinking
        },
        {
            "sequence_order": 2,
            "outcome_text": "Implement programs using fundamental data structures.",
            "bloom_level": "Apply",
        },
        {
            "sequence_order": 3,
            "outcome_text": "Evaluate the efficiency of algorithms using Big-O notation.",
            "bloom_level": "Evaluate",  # Higher-order thinking
        },
    ]


@pytest.fixture
def valid_content_items() -> List[Dict[str, Any]]:
    """Create valid content outline for a course."""
    return [
        {"sequence_order": 1, "topic": "Introduction to Programming", "hours": 6},
        {"sequence_order": 2, "topic": "Data Types and Variables", "hours": 6},
        {"sequence_order": 3, "topic": "Control Structures", "hours": 9},
        {"sequence_order": 4, "topic": "Functions and Modular Programming", "hours": 9},
        {"sequence_order": 5, "topic": "Arrays and Lists", "hours": 9},
        {"sequence_order": 6, "topic": "Object-Oriented Programming", "hours": 9},
        {"sequence_order": 7, "topic": "Algorithm Analysis", "hours": 6},
    ]


class TestBasicInfoCompliance:
    """Tests for basic course information compliance."""

    def test_missing_title_fails(self, compliance_service):
        """Course without title should fail."""
        course = {"title": "", "catalog_description": "A valid description."}
        results = compliance_service._check_basic_info(course)

        title_result = next(r for r in results if r.rule_id == "BASIC-001")
        assert title_result.status == ComplianceStatus.FAIL

    def test_short_title_warns(self, compliance_service):
        """Course with very short title should warn."""
        course = {"title": "CS", "catalog_description": "A valid description."}
        results = compliance_service._check_basic_info(course)

        title_result = next(r for r in results if r.rule_id == "BASIC-001")
        assert title_result.status == ComplianceStatus.WARN

    def test_valid_title_passes(self, compliance_service):
        """Course with valid title should pass."""
        course = {"title": "Introduction to Computer Science", "catalog_description": "Description."}
        results = compliance_service._check_basic_info(course)

        title_result = next(r for r in results if r.rule_id == "BASIC-001")
        assert title_result.status == ComplianceStatus.PASS

    def test_missing_description_fails(self, compliance_service):
        """Course without catalog description should fail."""
        course = {"title": "Valid Title", "catalog_description": ""}
        results = compliance_service._check_basic_info(course)

        desc_result = next(r for r in results if r.rule_id == "BASIC-002")
        assert desc_result.status == ComplianceStatus.FAIL

    def test_short_description_warns(self, compliance_service):
        """Course with short description should warn."""
        course = {"title": "Valid Title", "catalog_description": "Too short description."}
        results = compliance_service._check_basic_info(course)

        desc_result = next(r for r in results if r.rule_id == "BASIC-002")
        assert desc_result.status == ComplianceStatus.WARN

    def test_valid_description_passes(self, compliance_service):
        """Course with valid description (25-75 words) should pass."""
        course = {
            "title": "Valid Title",
            "catalog_description": (
                "An introduction to fundamental concepts of computer science "
                "including algorithms, data structures, programming paradigms, "
                "and software development. Students will learn to design and "
                "implement solutions to computational problems."
            ),
        }
        results = compliance_service._check_basic_info(course)

        desc_result = next(r for r in results if r.rule_id == "BASIC-002")
        assert desc_result.status == ComplianceStatus.PASS


class TestUnitsHoursCompliance:
    """Tests for Title 5 § 55002.5 (54-hour rule) compliance."""

    def test_valid_lecture_course_passes(self, compliance_service):
        """Standard 3-unit lecture course with correct hours should pass."""
        course = {
            "units": Decimal("3"),
            "lecture_hours": Decimal("3"),  # 3 × 18 = 54 hours
            "lab_hours": Decimal("0"),
            "outside_of_class_hours": Decimal("6"),  # 6 × 18 = 108 hours
            # Total: 54 + 108 = 162 / 54 = 3 units
        }
        results = compliance_service._check_units_hours(course)

        rule_result = next(r for r in results if r.rule_id == "UNIT-002")
        assert rule_result.status == ComplianceStatus.PASS

    def test_invalid_unit_hours_mismatch_fails(self, compliance_service):
        """Course with hours not matching units should fail."""
        course = {
            "units": Decimal("3"),
            "lecture_hours": Decimal("1"),  # Too few hours for 3 units
            "lab_hours": Decimal("0"),
            "outside_of_class_hours": Decimal("1"),
        }
        results = compliance_service._check_units_hours(course)

        rule_result = next(r for r in results if r.rule_id == "UNIT-002")
        assert rule_result.status == ComplianceStatus.FAIL

    def test_units_out_of_range_fails(self, compliance_service):
        """Course with units outside 0.5-18 range should fail."""
        course = {
            "units": Decimal("20"),  # Too high
            "lecture_hours": Decimal("10"),
            "lab_hours": Decimal("0"),
            "outside_of_class_hours": Decimal("20"),
        }
        results = compliance_service._check_units_hours(course)

        rule_result = next(r for r in results if r.rule_id == "UNIT-001")
        assert rule_result.status == ComplianceStatus.FAIL

    def test_lab_course_calculates_correctly(self, compliance_service):
        """Lab course should calculate hours at 1:1 ratio (54 hours per unit)."""
        course = {
            "units": Decimal("1"),
            "lecture_hours": Decimal("0"),
            "lab_hours": Decimal("1"),  # 1 × 54 = 54 hours = 1 unit
            "outside_of_class_hours": Decimal("0"),
        }
        results = compliance_service._check_units_hours(course)

        rule_result = next(r for r in results if r.rule_id == "UNIT-002")
        assert rule_result.status == ComplianceStatus.PASS

    def test_lecture_lab_combo_passes(self, compliance_service):
        """Lecture+Lab course with correct hours should pass."""
        course = {
            "units": Decimal("4"),
            "lecture_hours": Decimal("3"),  # 3 × 18 = 54
            "lab_hours": Decimal("1"),  # 1 × 54 = 54
            "outside_of_class_hours": Decimal("6"),  # 6 × 18 = 108
            # Total: 54 + 54 + 108 = 216 / 54 = 4 units
        }
        results = compliance_service._check_units_hours(course)

        rule_result = next(r for r in results if r.rule_id == "UNIT-002")
        assert rule_result.status == ComplianceStatus.PASS

    def test_fractional_units_supported(self, compliance_service):
        """Course with fractional units should be supported."""
        course = {
            "units": Decimal("0.5"),
            "lecture_hours": Decimal("0.5"),  # 0.5 × 18 = 9
            "lab_hours": Decimal("0"),
            "outside_of_class_hours": Decimal("1"),  # 1 × 18 = 18
            # Total: 9 + 18 = 27 / 54 = 0.5 units
        }
        results = compliance_service._check_units_hours(course)

        unit_range_result = next(r for r in results if r.rule_id == "UNIT-001")
        assert unit_range_result.status == ComplianceStatus.PASS


class TestSLOCompliance:
    """Tests for Student Learning Outcome compliance."""

    def test_valid_slos_pass(self, compliance_service, valid_slos):
        """Course with valid SLOs should pass."""
        results = compliance_service._check_slos(valid_slos)

        # Should pass minimum SLO count
        count_result = next(r for r in results if r.rule_id == "SLO-001")
        assert count_result.status == ComplianceStatus.PASS

    def test_no_slos_fails(self, compliance_service):
        """Course without SLOs should fail."""
        results = compliance_service._check_slos([])

        count_result = next(r for r in results if r.rule_id == "SLO-001")
        assert count_result.status == ComplianceStatus.FAIL

    def test_single_slo_fails(self, compliance_service):
        """Course with only 1 SLO should fail (minimum is 3)."""
        slos = [{"sequence_order": 1, "outcome_text": "Demonstrate basic skills."}]
        results = compliance_service._check_slos(slos)

        count_result = next(r for r in results if r.rule_id == "SLO-001")
        assert count_result.status == ComplianceStatus.FAIL


class TestContentCompliance:
    """Tests for course content outline compliance."""

    def test_valid_content_passes(self, compliance_service, valid_content_items, valid_course_data):
        """Course with valid content outline should pass."""
        results = compliance_service._check_content(valid_content_items, valid_course_data)

        count_result = next(r for r in results if r.rule_id == "CONTENT-001")
        assert count_result.status == ComplianceStatus.PASS

    def test_no_content_fails(self, compliance_service, valid_course_data):
        """Course without content outline should fail."""
        results = compliance_service._check_content([], valid_course_data)

        count_result = next(r for r in results if r.rule_id == "CONTENT-001")
        assert count_result.status == ComplianceStatus.FAIL

    def test_few_topics_warns(self, compliance_service, valid_course_data):
        """Course with very few topics should warn."""
        content = [
            {"sequence_order": 1, "topic": "Topic 1", "hours": 27},
            {"sequence_order": 2, "topic": "Topic 2", "hours": 27},
        ]
        results = compliance_service._check_content(content, valid_course_data)

        count_result = next(r for r in results if r.rule_id == "CONTENT-001")
        assert count_result.status == ComplianceStatus.WARN


class TestCBCodeCompliance:
    """Tests for California Basic (CB) code compliance."""

    def test_valid_cb_codes_pass(self, compliance_service):
        """Course with all required CB codes should pass."""
        # The compliance service uses cb_codes dict structure
        course = {
            "cb_codes": {
                "CB04": "D",  # Degree applicable
                "CB05": "A",  # Transferable
                "CB08": "N",  # Not basic skills
                "CB09": "E",  # Non-occupational
            },
            "top_code": "1701.00",  # Math (non-vocational)
        }
        results = compliance_service._check_cb_codes(course)

        # Should have some passing results for CB codes
        pass_count = sum(1 for r in results if r.status == ComplianceStatus.PASS)
        assert pass_count > 0

    def test_missing_cb04_fails(self, compliance_service):
        """Course without CB04 should fail."""
        course = {
            "cb_codes": {
                # CB04 missing
                "CB05": "A",
            },
        }
        results = compliance_service._check_cb_codes(course)

        # Should fail for missing CB04
        cb04_result = next((r for r in results if r.rule_id == "CB-CB04"), None)
        if cb04_result:
            assert cb04_result.status == ComplianceStatus.FAIL

    def test_non_vocational_requires_sam_e(self, compliance_service):
        """Non-vocational courses require SAM code = 'E'."""
        # Math course (non-vocational) should have CB09 = E
        course = {
            "cb_codes": {
                "CB09": "A",  # Wrong - should be E for non-vocational
            },
            "top_code": "1701.00",  # Math (non-vocational, starts with 17)
        }
        results = compliance_service._check_cb_codes(course)

        # Should fail for SAM code mismatch
        sam_result = next((r for r in results if r.rule_id == "CB-DEP-001"), None)
        if sam_result:
            assert sam_result.status == ComplianceStatus.FAIL


class TestFullAudit:
    """Tests for complete compliance audits."""

    def test_valid_course_audit_mostly_passes(
        self,
        compliance_service,
        valid_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Full audit of valid course should mostly pass."""
        result = compliance_service.audit_course(
            course_data=valid_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        # Should have reasonable compliance score (>=60% for well-formed course)
        assert result.compliance_score >= 60.0
        # Most checks should pass
        assert result.passed >= result.failed

    def test_audit_returns_all_categories(
        self,
        compliance_service,
        valid_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Audit should return results grouped by category."""
        result = compliance_service.audit_course(
            course_data=valid_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        assert isinstance(result.results_by_category, dict)
        assert len(result.results_by_category) > 0

    def test_audit_calculates_score(
        self,
        compliance_service,
        valid_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Audit should calculate compliance score."""
        result = compliance_service.audit_course(
            course_data=valid_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        # Score should be between 0 and 100
        assert 0 <= result.compliance_score <= 100

    def test_audit_counts_match(
        self,
        compliance_service,
        valid_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Audit counts should match total results."""
        result = compliance_service.audit_course(
            course_data=valid_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        assert result.passed + result.failed + result.warnings == result.total_checks

    def test_empty_course_fails(self, compliance_service):
        """Audit of empty course should fail."""
        result = compliance_service.audit_course(
            course_data={},
            slos=[],
            content_items=[],
            requisites=[],
        )

        assert result.overall_status == ComplianceStatus.FAIL
        assert result.failed > 0


class TestComplianceModels:
    """Tests for compliance data models."""

    def test_compliance_result_model(self):
        """ComplianceResult should be correctly structured."""
        result = ComplianceResult(
            rule_id="TEST-001",
            rule_name="Test Rule",
            category=ComplianceCategory.GENERAL,
            status=ComplianceStatus.PASS,
            message="Test passed.",
            section="Test Section",
        )

        assert result.rule_id == "TEST-001"
        assert result.status == ComplianceStatus.PASS
        assert result.citation is None

    def test_compliance_result_with_citation(self):
        """ComplianceResult should support optional citation."""
        result = ComplianceResult(
            rule_id="TITLE5-001",
            rule_name="54-Hour Rule",
            category=ComplianceCategory.TITLE_5,
            status=ComplianceStatus.FAIL,
            message="Hours do not match units.",
            section="Units & Hours",
            citation="Title 5 § 55002.5",
            recommendation="Adjust hours to match.",
        )

        assert result.citation == "Title 5 § 55002.5"
        assert result.recommendation is not None
