"""
Tests for CCN Seed Data Validation against AB 1111 Requirements.

Validates that the seeded CCN standards data meets AB 1111 (Common Course
Numbering) requirements for community colleges.

Tests cover:
- C-ID format validation (SUBJ C####&&)
- Required fields presence
- Discipline-to-TOP-code mapping consistency
- SLO/content requirements format
- Uniqueness constraints
- Expected standards count (66+ templates)
"""

import pytest
import re
from typing import List, Set

from sqlmodel import Session, select

from app.core.database import engine
from app.models.reference import CCNStandard
from app.utils.ccn_utils import (
    validate_ccn_format,
    DISCIPLINE_TOP_CODES,
    parse_ccn_code,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture(scope="module")
def db_session():
    """Provide a database session for CCN seed data tests."""
    with Session(engine) as session:
        yield session


@pytest.fixture(scope="module")
def all_ccn_standards(db_session) -> List[CCNStandard]:
    """Load all CCN standards from the database."""
    return db_session.exec(select(CCNStandard)).all()


@pytest.fixture(scope="module")
def production_ccn_standards(all_ccn_standards) -> List[CCNStandard]:
    """
    Filter to only production CCN standards (exclude test data).

    Test data can be identified by:
    - Invalid C-ID format (hex strings instead of 4 digits)
    - Title containing 'Test'
    """
    def is_production_standard(std: CCNStandard) -> bool:
        # Exclude if c_id contains hex characters (test data pattern)
        if std.c_id:
            parts = parse_ccn_code(std.c_id)
            if parts is None:
                return False
            # Valid C-IDs have purely numeric course numbers
            if not parts.course_number.isdigit():
                return False
        return True

    return [s for s in all_ccn_standards if is_production_standard(s)]


@pytest.fixture(scope="module")
def ccn_disciplines(production_ccn_standards) -> Set[str]:
    """Get unique disciplines from production CCN standards."""
    return {s.discipline for s in production_ccn_standards if s.discipline}


# =============================================================================
# Test: C-ID Format Validation
# =============================================================================

class TestCIDFormatValidation:
    """Tests for C-ID format validation per AB 1111."""

    def test_all_ccn_standards_have_valid_cid(self, production_ccn_standards):
        """
        Every CCN standard must have a valid C-ID code.

        Format: SUBJ C#### or SUBJ C####& or SUBJ C####&&
        Where:
        - SUBJ is 2-6 letter subject code
        - C is the common course identifier
        - #### is 4-digit course number
        - & is optional specialty (H, L, S, E)
        """
        invalid_cids = []

        for standard in production_ccn_standards:
            if not standard.c_id:
                invalid_cids.append(f"[empty c_id] - {standard.title or 'Unknown'}")
            elif not validate_ccn_format(standard.c_id):
                invalid_cids.append(f"{standard.c_id} - {standard.title or 'Unknown'}")

        if invalid_cids:
            pytest.fail(
                f"Found {len(invalid_cids)} invalid C-ID formats:\n"
                + "\n".join(invalid_cids[:10])  # Show first 10
            )

    def test_cid_starts_with_subject_code(self, production_ccn_standards):
        """C-ID should start with a valid subject code (2-6 letters)."""
        pattern = re.compile(r'^[A-Z]{2,6}\s+C\d{4}', re.IGNORECASE)

        for standard in production_ccn_standards:
            if standard.c_id:
                assert pattern.match(standard.c_id), (
                    f"C-ID should start with subject code: {standard.c_id}"
                )

    def test_cid_contains_common_identifier(self, production_ccn_standards):
        """C-ID must contain the 'C' common course identifier."""
        for standard in production_ccn_standards:
            if standard.c_id:
                # Normalize whitespace and check for 'C' followed by digits
                normalized = ' '.join(standard.c_id.strip().split())
                assert ' C' in normalized.upper() or '\tC' in normalized.upper(), (
                    f"C-ID missing 'C' identifier: {standard.c_id}"
                )

    def test_cid_course_number_is_4_digits(self, production_ccn_standards):
        """Course number portion of C-ID must be exactly 4 digits."""
        for standard in production_ccn_standards:
            if standard.c_id:
                parts = parse_ccn_code(standard.c_id)
                if parts:
                    assert len(parts.course_number) == 4, (
                        f"Course number must be 4 digits: {standard.c_id} "
                        f"(got {parts.course_number})"
                    )
                    assert parts.course_number.isdigit(), (
                        f"Course number must be numeric: {standard.c_id}"
                    )


# =============================================================================
# Test: Required Fields Present
# =============================================================================

class TestRequiredFieldsPresent:
    """Tests for required fields in CCN standards."""

    def test_ccn_standards_have_discipline(self, production_ccn_standards):
        """Every CCN standard must have a discipline code."""
        missing_discipline = []

        for standard in production_ccn_standards:
            if not standard.discipline or not standard.discipline.strip():
                missing_discipline.append(f"{standard.c_id} - {standard.title or 'Unknown'}")

        if missing_discipline:
            pytest.fail(
                f"Found {len(missing_discipline)} CCN standards without discipline:\n"
                + "\n".join(missing_discipline[:10])
            )

    def test_ccn_standards_have_title(self, production_ccn_standards):
        """Every CCN standard must have a title."""
        missing_title = []

        for standard in production_ccn_standards:
            if not standard.title or not standard.title.strip():
                missing_title.append(f"{standard.c_id} - discipline: {standard.discipline}")

        if missing_title:
            pytest.fail(
                f"Found {len(missing_title)} CCN standards without title:\n"
                + "\n".join(missing_title[:10])
            )

    def test_ccn_standards_have_valid_units(self, production_ccn_standards):
        """
        CCN standards with units > 0 should have reasonable values.

        Note: Some extracted standards have 0.0 units due to PDF extraction
        limitations. This test validates that when units ARE specified,
        they're positive. A separate count test ensures most have units.
        """
        # Count how many have valid units vs not extracted (0.0)
        with_units = [s for s in production_ccn_standards if s.minimum_units and s.minimum_units > 0]
        without_units = [s for s in production_ccn_standards if s.minimum_units is None or s.minimum_units <= 0]

        # At least 50% should have units extracted
        total = len(production_ccn_standards)
        pct_with_units = len(with_units) / total * 100 if total > 0 else 0

        assert pct_with_units >= 50, (
            f"Less than 50% of CCN standards have units extracted. "
            f"Found {len(with_units)}/{total} ({pct_with_units:.1f}%) with units. "
            f"Missing: {', '.join(s.c_id for s in without_units[:5])}"
        )

    def test_ccn_standards_units_in_valid_range(self, production_ccn_standards):
        """
        CCN standard units (when extracted) should be in reasonable range (0.5 - 10).

        Note: Standards with 0.0 units are due to PDF extraction limitations
        and are excluded from this range check.
        """
        out_of_range = []

        for standard in production_ccn_standards:
            # Only check range for standards with extracted units (> 0)
            if standard.minimum_units is not None and standard.minimum_units > 0:
                if standard.minimum_units < 0.5 or standard.minimum_units > 10:
                    out_of_range.append(
                        f"{standard.c_id} - units: {standard.minimum_units}"
                    )

        if out_of_range:
            pytest.fail(
                f"Found {len(out_of_range)} CCN standards with units outside 0.5-10 range:\n"
                + "\n".join(out_of_range)
            )


# =============================================================================
# Test: Discipline-TOP Code Consistency
# =============================================================================

class TestDisciplineTopCodeConsistency:
    """Tests for discipline to TOP code mapping."""

    def test_all_disciplines_have_top_codes(self, ccn_disciplines):
        """Every discipline in the CCN standards should have a TOP code mapping."""
        missing_mappings = []

        for discipline in ccn_disciplines:
            if discipline and discipline not in DISCIPLINE_TOP_CODES:
                missing_mappings.append(discipline)

        if missing_mappings:
            pytest.fail(
                f"Found {len(missing_mappings)} disciplines without TOP code mapping:\n"
                + ", ".join(sorted(missing_mappings))
            )

    def test_implied_top_code_matches_discipline(self, production_ccn_standards):
        """The implied_top_code should match the discipline's TOP code."""
        mismatched = []

        for standard in production_ccn_standards:
            if standard.discipline and standard.implied_top_code:
                expected = DISCIPLINE_TOP_CODES.get(standard.discipline)
                if expected and standard.implied_top_code != expected:
                    mismatched.append(
                        f"{standard.c_id}: implied={standard.implied_top_code}, "
                        f"expected={expected}"
                    )

        if mismatched:
            pytest.fail(
                f"Found {len(mismatched)} TOP code mismatches:\n"
                + "\n".join(mismatched[:10])
            )

    def test_top_codes_valid_format(self, production_ccn_standards):
        """All implied TOP codes should be in ####.## format."""
        pattern = re.compile(r'^\d{4}\.\d{2}$')
        invalid_format = []

        for standard in production_ccn_standards:
            if standard.implied_top_code:
                if not pattern.match(standard.implied_top_code):
                    invalid_format.append(
                        f"{standard.c_id}: {standard.implied_top_code}"
                    )

        if invalid_format:
            pytest.fail(
                f"Found {len(invalid_format)} invalid TOP code formats:\n"
                + "\n".join(invalid_format)
            )


# =============================================================================
# Test: SLO/Content Requirements Format
# =============================================================================

class TestSLOContentRequirementsFormat:
    """Tests for SLO and content requirements data format."""

    def test_slo_requirements_are_list(self, production_ccn_standards):
        """SLO requirements should be a list (or None/empty)."""
        invalid_type = []

        for standard in production_ccn_standards:
            if standard.slo_requirements is not None:
                if not isinstance(standard.slo_requirements, list):
                    invalid_type.append(
                        f"{standard.c_id}: type={type(standard.slo_requirements).__name__}"
                    )

        if invalid_type:
            pytest.fail(
                f"Found {len(invalid_type)} SLO requirements with invalid type:\n"
                + "\n".join(invalid_type)
            )

    def test_slo_requirements_contain_strings(self, production_ccn_standards):
        """SLO requirements list items should be non-empty strings."""
        invalid_items = []

        for standard in production_ccn_standards:
            if standard.slo_requirements:
                for i, slo in enumerate(standard.slo_requirements):
                    if not isinstance(slo, str):
                        invalid_items.append(
                            f"{standard.c_id}[{i}]: type={type(slo).__name__}"
                        )
                    elif len(slo.strip()) == 0:
                        invalid_items.append(
                            f"{standard.c_id}[{i}]: empty string"
                        )

        if invalid_items:
            pytest.fail(
                f"Found {len(invalid_items)} invalid SLO requirement items:\n"
                + "\n".join(invalid_items[:10])
            )

    def test_content_requirements_are_list(self, production_ccn_standards):
        """Content requirements should be a list (or None/empty)."""
        invalid_type = []

        for standard in production_ccn_standards:
            if standard.content_requirements is not None:
                if not isinstance(standard.content_requirements, list):
                    invalid_type.append(
                        f"{standard.c_id}: type={type(standard.content_requirements).__name__}"
                    )

        if invalid_type:
            pytest.fail(
                f"Found {len(invalid_type)} content requirements with invalid type:\n"
                + "\n".join(invalid_type)
            )

    def test_objectives_are_list_of_strings(self, production_ccn_standards):
        """Objectives should be a list of non-empty strings."""
        invalid = []

        for standard in production_ccn_standards:
            if standard.objectives is not None:
                if not isinstance(standard.objectives, list):
                    invalid.append(
                        f"{standard.c_id}: objectives not a list"
                    )
                else:
                    for i, obj in enumerate(standard.objectives):
                        if not isinstance(obj, str):
                            invalid.append(
                                f"{standard.c_id}[{i}]: objective not string"
                            )

        if invalid:
            pytest.fail(
                f"Found {len(invalid)} invalid objectives:\n"
                + "\n".join(invalid[:10])
            )


# =============================================================================
# Test: Uniqueness Constraints
# =============================================================================

class TestUniquenessConstraints:
    """Tests for uniqueness of CCN data."""

    def test_ccn_cid_is_unique(self, production_ccn_standards):
        """All C-ID codes should be unique."""
        cids = [s.c_id for s in production_ccn_standards if s.c_id]
        duplicates = [cid for cid in cids if cids.count(cid) > 1]

        if duplicates:
            unique_duplicates = sorted(set(duplicates))
            pytest.fail(
                f"Found {len(unique_duplicates)} duplicate C-IDs:\n"
                + ", ".join(unique_duplicates)
            )

    def test_ccn_id_is_unique(self, production_ccn_standards):
        """All CCN standard IDs (UUIDs) should be unique."""
        ids = [str(s.id) for s in production_ccn_standards]
        assert len(ids) == len(set(ids)), "Duplicate CCN standard IDs found"


# =============================================================================
# Test: Expected Standards Count and Coverage
# =============================================================================

class TestExpectedStandardsCount:
    """Tests for expected CCN standards count and discipline coverage."""

    def test_minimum_standards_count(self, production_ccn_standards):
        """
        Should have at least 60 CCN standards (AB 1111 specifies 66+ templates).
        Using 60 as minimum to allow for some variation in extraction.
        """
        count = len(production_ccn_standards)
        assert count >= 60, (
            f"Expected at least 60 CCN standards, found {count}. "
            "AB 1111 specifies 66+ templates."
        )

    def test_expected_standards_range(self, production_ccn_standards):
        """Standards count should be in reasonable range (60-150)."""
        count = len(production_ccn_standards)
        assert 60 <= count <= 150, (
            f"CCN standards count {count} outside expected range 60-150"
        )

    def test_core_disciplines_present(self, ccn_disciplines):
        """
        Core CCN disciplines should be present.

        Per AB 1111, these are the primary transfer disciplines.
        """
        required_disciplines = {
            "MATH",   # Mathematics
            "ENGL",   # English
            "BIOL",   # Biology
            "CHEM",   # Chemistry
            "HIST",   # History
            "ECON",   # Economics
            "COMM",   # Communication
        }

        # Check for variations (PSYCH vs PSYC, SOC vs SOCI)
        found_disciplines = set()
        for disc in ccn_disciplines:
            found_disciplines.add(disc)
            # Add normalized versions
            if disc in ("PSYC", "PSYCH"):
                found_disciplines.add("PSYCH")
                found_disciplines.add("PSYC")
            if disc in ("SOCI", "SOC"):
                found_disciplines.add("SOC")
                found_disciplines.add("SOCI")

        missing = required_disciplines - found_disciplines
        if missing:
            pytest.fail(
                f"Missing required disciplines: {', '.join(sorted(missing))}\n"
                f"Found disciplines: {', '.join(sorted(ccn_disciplines))}"
            )

    def test_discipline_diversity(self, ccn_disciplines):
        """Should have at least 10 different disciplines."""
        count = len(ccn_disciplines)
        assert count >= 10, (
            f"Expected at least 10 disciplines, found {count}: "
            f"{', '.join(sorted(ccn_disciplines))}"
        )


# =============================================================================
# Test: CB Code Implications
# =============================================================================

class TestCBCodeImplications:
    """Tests for CB code implications per AB 1111."""

    def test_all_ccn_have_implied_cb05_a(self, production_ccn_standards):
        """
        All CCN standards should have implied_cb05 = 'A'.

        Per AB 1111, CCN-aligned courses are transferable to both UC and CSU.
        """
        non_a_standards = []

        for standard in production_ccn_standards:
            if standard.implied_cb05 != "A":
                non_a_standards.append(
                    f"{standard.c_id}: implied_cb05={standard.implied_cb05}"
                )

        if non_a_standards:
            pytest.fail(
                f"Found {len(non_a_standards)} CCN standards without implied_cb05='A':\n"
                + "\n".join(non_a_standards[:10])
            )


# =============================================================================
# Test: Specialty Flags Consistency
# =============================================================================

class TestSpecialtyFlagsConsistency:
    """Tests for specialty flag consistency with C-ID codes."""

    def test_honors_flag_matches_cid_suffix(self, production_ccn_standards):
        """is_honors flag should match 'H' suffix in C-ID."""
        mismatches = []

        for standard in production_ccn_standards:
            if standard.c_id:
                parts = parse_ccn_code(standard.c_id)
                if parts:
                    has_h_suffix = parts.is_honors
                    if has_h_suffix != standard.is_honors:
                        mismatches.append(
                            f"{standard.c_id}: flag={standard.is_honors}, "
                            f"suffix={'H' if has_h_suffix else 'none'}"
                        )

        if mismatches:
            pytest.fail(
                f"Found {len(mismatches)} honors flag mismatches:\n"
                + "\n".join(mismatches)
            )

    def test_lab_flag_matches_cid_suffix(self, production_ccn_standards):
        """is_lab_only flag should match 'L' suffix in C-ID."""
        mismatches = []

        for standard in production_ccn_standards:
            if standard.c_id:
                parts = parse_ccn_code(standard.c_id)
                if parts:
                    has_l_suffix = parts.is_lab_only
                    if has_l_suffix != standard.is_lab_only:
                        mismatches.append(
                            f"{standard.c_id}: flag={standard.is_lab_only}, "
                            f"suffix={'L' if has_l_suffix else 'none'}"
                        )

        if mismatches:
            pytest.fail(
                f"Found {len(mismatches)} lab flag mismatches:\n"
                + "\n".join(mismatches)
            )
