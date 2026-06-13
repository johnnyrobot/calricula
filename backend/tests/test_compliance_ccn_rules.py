"""
Unit tests for CCN (Common Course Numbering) compliance rules.

Tests the CCN-related rules in the compliance service per AB 1111 requirements:
- CCN-001: Transfer Status Validation (CB05 = 'A' for CCN courses)
- CCN-002: Minimum Units Check (course units >= CCN minimum)
- CCN-003: Non-Match Justification (non-CCN courses need justification)
"""

import pytest
from decimal import Decimal
from typing import Dict, Any, List

from app.services.compliance_service import (
    ComplianceService,
    ComplianceStatus,
    ComplianceCategory,
    ComplianceResult,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def compliance_service():
    """Create a ComplianceService instance for testing."""
    return ComplianceService()


@pytest.fixture
def ccn_aligned_course_data() -> Dict[str, Any]:
    """Create CCN-aligned course data (MATH C2210 - Calculus I)."""
    return {
        "title": "Calculus I",
        "catalog_description": (
            "An introduction to differential and integral calculus. Topics include "
            "limits, derivatives, integrals, and applications. Students will develop "
            "skills in mathematical reasoning and problem solving."
        ),
        "ccn_id": "MATH C2210",
        "units": Decimal("4"),
        "ccn_minimum_units": Decimal("4"),
        "lecture_hours": Decimal("4"),
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("8"),
        "top_code": "1701.00",
        "cb_codes": {
            "CB04": "D",
            "CB05": "A",  # UC+CSU Transferable
            "CB08": "N",
            "CB09": "E",
        },
    }


@pytest.fixture
def non_ccn_course_data() -> Dict[str, Any]:
    """Create non-CCN-aligned course data."""
    return {
        "title": "Special Topics in Technology",
        "catalog_description": (
            "Exploration of current topics and emerging trends in technology. "
            "Topics vary each semester based on industry developments and student interest."
        ),
        "ccn_id": None,  # Not CCN-aligned
        "units": Decimal("3"),
        "lecture_hours": Decimal("3"),
        "lab_hours": Decimal("0"),
        "outside_of_class_hours": Decimal("6"),
        "top_code": "0702.00",
        "cb_codes": {
            "CB04": "D",
            "CB05": "B",  # CSU only
            "CB08": "N",
            "CB09": "E",
        },
    }


@pytest.fixture
def valid_slos() -> List[Dict[str, Any]]:
    """Create valid SLOs for testing."""
    return [
        {
            "sequence_order": 1,
            "outcome_text": "Evaluate limits of functions using analytical and graphical methods.",
            "bloom_level": "Evaluate",
        },
        {
            "sequence_order": 2,
            "outcome_text": "Apply derivative rules to calculate rates of change.",
            "bloom_level": "Apply",
        },
        {
            "sequence_order": 3,
            "outcome_text": "Analyze function behavior using first and second derivative tests.",
            "bloom_level": "Analyze",
        },
    ]


@pytest.fixture
def valid_content_items() -> List[Dict[str, Any]]:
    """Create valid content outline for testing."""
    return [
        {"sequence_order": 1, "topic": "Limits and Continuity", "hours_allocated": 12},
        {"sequence_order": 2, "topic": "Derivatives", "hours_allocated": 18},
        {"sequence_order": 3, "topic": "Applications of Derivatives", "hours_allocated": 14},
        {"sequence_order": 4, "topic": "Integrals", "hours_allocated": 16},
        {"sequence_order": 5, "topic": "Applications of Integrals", "hours_allocated": 12},
    ]


# =============================================================================
# CCN-001: Transfer Status Validation
# =============================================================================

class TestCCN001TransferStatus:
    """Tests for CCN-001: CCN-aligned courses must have CB05='A'."""

    def test_ccn_001_transferable_course_passes(self, compliance_service, ccn_aligned_course_data):
        """
        CCN-aligned course with CB05='A' should pass CCN-001.

        Per AB 1111, all CCN-aligned courses are transferable to both UC and CSU.
        """
        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(
            (r for r in results if r.rule_id == "CCN-001"),
            None
        )

        assert ccn_001_result is not None, "CCN-001 rule should be checked"
        assert ccn_001_result.status == ComplianceStatus.PASS
        assert "MATH C2210" in ccn_001_result.message

    def test_ccn_001_non_transferable_fails(self, compliance_service, ccn_aligned_course_data):
        """
        CCN-aligned course with CB05 != 'A' should fail CCN-001.

        Per AB 1111, CCN alignment implies UC+CSU transferability.
        """
        # Set CB05 to 'B' (CSU only) - invalid for CCN course
        ccn_aligned_course_data["cb_codes"]["CB05"] = "B"

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(
            (r for r in results if r.rule_id == "CCN-001"),
            None
        )

        assert ccn_001_result is not None
        assert ccn_001_result.status == ComplianceStatus.FAIL
        assert "AB 1111" in ccn_001_result.citation

    def test_ccn_001_csu_only_fails(self, compliance_service, ccn_aligned_course_data):
        """CCN course with CB05='B' (CSU only) should fail."""
        ccn_aligned_course_data["cb_codes"]["CB05"] = "B"

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
        assert ccn_001_result.status == ComplianceStatus.FAIL
        assert "CB05='B'" in ccn_001_result.message

    def test_ccn_001_not_transferable_fails(self, compliance_service, ccn_aligned_course_data):
        """CCN course with CB05='C' (not transferable) should fail."""
        ccn_aligned_course_data["cb_codes"]["CB05"] = "C"

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
        assert ccn_001_result.status == ComplianceStatus.FAIL

    def test_ccn_001_missing_cb05_warns(self, compliance_service, ccn_aligned_course_data):
        """CCN course without CB05 set should warn."""
        ccn_aligned_course_data["cb_codes"]["CB05"] = None

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
        assert ccn_001_result.status == ComplianceStatus.WARN
        assert "should have CB05='A'" in ccn_001_result.message

    def test_ccn_001_case_insensitive_cb05(self, compliance_service, ccn_aligned_course_data):
        """CB05 check should use correct case."""
        # Lowercase 'cb05' key (the service handles both cases)
        ccn_aligned_course_data["cb_codes"] = {"cb05": "A"}

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
        assert ccn_001_result.status == ComplianceStatus.PASS


# =============================================================================
# CCN-002: Minimum Units Check
# =============================================================================

class TestCCN002MinimumUnits:
    """Tests for CCN-002: Course units must meet CCN standard minimum."""

    def test_ccn_002_sufficient_units_passes(self, compliance_service, ccn_aligned_course_data):
        """
        Course with units >= CCN minimum should pass CCN-002.

        MATH C2210 requires 4 units minimum.
        """
        # Course has 4 units, CCN requires 4 - should pass
        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_002_result = next(
            (r for r in results if r.rule_id == "CCN-002"),
            None
        )

        assert ccn_002_result is not None, "CCN-002 rule should be checked"
        assert ccn_002_result.status == ComplianceStatus.PASS
        assert "meet or exceed" in ccn_002_result.message

    def test_ccn_002_insufficient_units_warns(self, compliance_service, ccn_aligned_course_data):
        """
        Course with units < CCN minimum should warn.

        This is a WARN because the course may have pedagogical reasons
        for fewer units, but it should be reviewed.
        """
        # Set course to 3 units when CCN requires 4
        ccn_aligned_course_data["units"] = Decimal("3")
        ccn_aligned_course_data["ccn_minimum_units"] = Decimal("4")

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_002_result = next(r for r in results if r.rule_id == "CCN-002")
        assert ccn_002_result.status == ComplianceStatus.WARN
        assert "below" in ccn_002_result.message

    def test_ccn_002_exceeds_minimum_passes(self, compliance_service, ccn_aligned_course_data):
        """Course with units > CCN minimum should pass."""
        # Set course to 5 units when CCN requires 4
        ccn_aligned_course_data["units"] = Decimal("5")
        ccn_aligned_course_data["ccn_minimum_units"] = Decimal("4")

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_002_result = next(r for r in results if r.rule_id == "CCN-002")
        assert ccn_002_result.status == ComplianceStatus.PASS

    def test_ccn_002_fractional_units_comparison(self, compliance_service, ccn_aligned_course_data):
        """Should handle fractional unit comparisons correctly."""
        # 2.5 units when CCN requires 3 - should warn
        ccn_aligned_course_data["units"] = Decimal("2.5")
        ccn_aligned_course_data["ccn_minimum_units"] = Decimal("3")

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        ccn_002_result = next(r for r in results if r.rule_id == "CCN-002")
        assert ccn_002_result.status == ComplianceStatus.WARN

    def test_ccn_002_skipped_without_ccn_minimum(self, compliance_service, ccn_aligned_course_data):
        """CCN-002 should not produce a result if ccn_minimum_units is not provided."""
        # Remove ccn_minimum_units
        del ccn_aligned_course_data["ccn_minimum_units"]

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        # Should only have CCN-001 result, not CCN-002
        ccn_002_result = next(
            (r for r in results if r.rule_id == "CCN-002"),
            None
        )
        assert ccn_002_result is None


# =============================================================================
# CCN-003: Non-Match Justification
# =============================================================================

class TestCCN003NonMatchJustification:
    """Tests for CCN-003: Non-CCN courses must have justification."""

    def test_ccn_003_no_ccn_no_justification_warns(self, compliance_service, non_ccn_course_data):
        """
        Course without CCN and without justification should warn.

        Per AB 1111, courses that don't align to a CCN standard should
        document why.
        """
        results = compliance_service._check_ccn_alignment(non_ccn_course_data)

        ccn_003_result = next(
            (r for r in results if r.rule_id == "CCN-003"),
            None
        )

        assert ccn_003_result is not None
        assert ccn_003_result.status == ComplianceStatus.WARN
        assert "justification" in ccn_003_result.message.lower()
        assert "AB 1111" in ccn_003_result.citation

    def test_ccn_003_no_ccn_with_justification_passes(self, compliance_service, non_ccn_course_data):
        """
        Non-CCN course with documented justification should pass.

        The has_ccn_justification flag indicates a justification exists.
        """
        non_ccn_course_data["has_ccn_justification"] = True

        results = compliance_service._check_ccn_alignment(non_ccn_course_data)

        ccn_003_result = next(r for r in results if r.rule_id == "CCN-003")
        assert ccn_003_result.status == ComplianceStatus.PASS
        assert "justification on file" in ccn_003_result.message.lower()

    def test_ccn_003_ccn_aligned_skips_justification_check(
        self, compliance_service, ccn_aligned_course_data
    ):
        """CCN-aligned courses should not trigger CCN-003 justification check."""
        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        # Should have CCN-001 and CCN-002, but NOT CCN-003
        rule_ids = [r.rule_id for r in results]
        assert "CCN-001" in rule_ids
        assert "CCN-003" not in rule_ids

    def test_ccn_003_recommendation_present(self, compliance_service, non_ccn_course_data):
        """CCN-003 warning should include actionable recommendation."""
        results = compliance_service._check_ccn_alignment(non_ccn_course_data)

        ccn_003_result = next(r for r in results if r.rule_id == "CCN-003")
        assert ccn_003_result.recommendation is not None
        assert "justification" in ccn_003_result.recommendation.lower()


# =============================================================================
# Integration: Full Audit with CCN
# =============================================================================

class TestFullAuditWithCCN:
    """Tests for full compliance audits including CCN rules."""

    def test_full_audit_includes_ccn_category(
        self,
        compliance_service,
        ccn_aligned_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Full audit should include CCN/AB 1111 category in results."""
        result = compliance_service.audit_course(
            course_data=ccn_aligned_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        # CCN category should be in results
        assert ComplianceCategory.CCN.value in result.results_by_category

    def test_full_audit_includes_ccn_rules(
        self,
        compliance_service,
        ccn_aligned_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Full audit of CCN course should include CCN-001 and CCN-002 rules."""
        result = compliance_service.audit_course(
            course_data=ccn_aligned_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        ccn_results = result.results_by_category.get(ComplianceCategory.CCN.value, [])
        ccn_rule_ids = [r.rule_id for r in ccn_results]

        assert "CCN-001" in ccn_rule_ids, "Should include CCN-001 (Transfer Status)"
        assert "CCN-002" in ccn_rule_ids, "Should include CCN-002 (Minimum Units)"

    def test_full_audit_non_ccn_includes_ccn003(
        self,
        compliance_service,
        non_ccn_course_data,
        valid_slos,
        valid_content_items,
    ):
        """Full audit of non-CCN course should include CCN-003."""
        result = compliance_service.audit_course(
            course_data=non_ccn_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        ccn_results = result.results_by_category.get(ComplianceCategory.CCN.value, [])
        ccn_rule_ids = [r.rule_id for r in ccn_results]

        assert "CCN-003" in ccn_rule_ids, "Should include CCN-003 (Justification Required)"

    def test_full_audit_ccn_violations_affect_score(
        self,
        compliance_service,
        ccn_aligned_course_data,
        valid_slos,
        valid_content_items,
    ):
        """CCN violations should affect overall compliance score."""
        # First, get score with valid CCN data
        valid_result = compliance_service.audit_course(
            course_data=ccn_aligned_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        # Now violate CCN-001 (wrong CB05)
        ccn_aligned_course_data["cb_codes"]["CB05"] = "C"
        invalid_result = compliance_service.audit_course(
            course_data=ccn_aligned_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        # Invalid course should have lower score
        assert invalid_result.compliance_score < valid_result.compliance_score
        assert invalid_result.failed > valid_result.failed

    def test_full_audit_ccn_rules_have_citations(
        self,
        compliance_service,
        ccn_aligned_course_data,
        valid_slos,
        valid_content_items,
    ):
        """CCN rule results should include AB 1111 citation."""
        # Create a failing scenario to ensure citation is present
        ccn_aligned_course_data["cb_codes"]["CB05"] = "B"

        result = compliance_service.audit_course(
            course_data=ccn_aligned_course_data,
            slos=valid_slos,
            content_items=valid_content_items,
            requisites=[],
        )

        ccn_results = result.results_by_category.get(ComplianceCategory.CCN.value, [])
        ccn_001_result = next(r for r in ccn_results if r.rule_id == "CCN-001")

        assert ccn_001_result.citation is not None
        assert "AB 1111" in ccn_001_result.citation


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================

class TestCCNEdgeCases:
    """Tests for edge cases in CCN compliance checking."""

    def test_empty_cb_codes_dict(self, compliance_service, ccn_aligned_course_data):
        """Should handle empty cb_codes dictionary gracefully."""
        ccn_aligned_course_data["cb_codes"] = {}

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        # Should still produce CCN-001 result (warn about missing CB05)
        ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
        assert ccn_001_result.status == ComplianceStatus.WARN

    def test_none_cb_codes(self, compliance_service, ccn_aligned_course_data):
        """Should handle None cb_codes gracefully."""
        ccn_aligned_course_data["cb_codes"] = None

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        # Should still produce a result without crashing
        assert len(results) > 0

    def test_empty_ccn_id_treated_as_non_ccn(self, compliance_service, ccn_aligned_course_data):
        """Empty string ccn_id should be treated as non-CCN."""
        ccn_aligned_course_data["ccn_id"] = ""

        results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

        # Should trigger CCN-003 (justification check) since empty = no CCN
        rule_ids = [r.rule_id for r in results]
        assert "CCN-003" in rule_ids

    def test_ccn_category_enum_value(self, compliance_service):
        """CCN compliance category should have correct value."""
        assert ComplianceCategory.CCN.value == "CCN/AB 1111"

    def test_various_ccn_id_formats(self, compliance_service, ccn_aligned_course_data):
        """Should handle various valid CCN ID formats."""
        valid_ccn_ids = [
            "MATH C2210",
            "ENGL C1000",
            "BIOL C1001L",
            "MATH C2210H",
            "STAT C1000E",
        ]

        for ccn_id in valid_ccn_ids:
            ccn_aligned_course_data["ccn_id"] = ccn_id
            results = compliance_service._check_ccn_alignment(ccn_aligned_course_data)

            ccn_001_result = next(r for r in results if r.rule_id == "CCN-001")
            # With CB05='A', all should pass
            assert ccn_001_result.status == ComplianceStatus.PASS, f"Failed for {ccn_id}"
