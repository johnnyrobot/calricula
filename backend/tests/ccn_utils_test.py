"""
Tests for CCN (Common Course Numbering) Utilities.

Tests the discipline-to-TOP-code mapping and CCN format validation
functions per AB 1111 requirements.
"""

import pytest
from app.utils.ccn_utils import (
    get_top_code_for_discipline,
    parse_ccn_code,
    validate_ccn_format,
    get_specialty_flags,
    get_discipline_from_ccn,
    get_implied_cb05_for_ccn,
    get_implied_cb03_for_ccn,
    format_ccn_code,
    DISCIPLINE_TOP_CODES,
    CCNCodeParts,
)


class TestGetTopCodeForDiscipline:
    """Tests for get_top_code_for_discipline function."""

    def test_math_discipline(self):
        """MATH should map to 1701.00."""
        assert get_top_code_for_discipline("MATH") == "1701.00"

    def test_stat_discipline(self):
        """STAT should map to 1701.00 (same as MATH)."""
        assert get_top_code_for_discipline("STAT") == "1701.00"

    def test_engl_discipline(self):
        """ENGL should map to 1501.00."""
        assert get_top_code_for_discipline("ENGL") == "1501.00"

    def test_psych_discipline(self):
        """PSYCH should map to 2001.00."""
        assert get_top_code_for_discipline("PSYCH") == "2001.00"

    def test_biol_discipline(self):
        """BIOL should map to 0401.00."""
        assert get_top_code_for_discipline("BIOL") == "0401.00"

    def test_chem_discipline(self):
        """CHEM should map to 1905.00."""
        assert get_top_code_for_discipline("CHEM") == "1905.00"

    def test_hist_discipline(self):
        """HIST should map to 2205.00."""
        assert get_top_code_for_discipline("HIST") == "2205.00"

    def test_anth_discipline(self):
        """ANTH should map to 2202.00."""
        assert get_top_code_for_discipline("ANTH") == "2202.00"

    def test_soc_discipline(self):
        """SOC should map to 2208.00."""
        assert get_top_code_for_discipline("SOC") == "2208.00"

    def test_econ_discipline(self):
        """ECON should map to 2204.00."""
        assert get_top_code_for_discipline("ECON") == "2204.00"

    def test_comm_discipline(self):
        """COMM should map to 0604.00."""
        assert get_top_code_for_discipline("COMM") == "0604.00"

    def test_geol_discipline(self):
        """GEOL should map to 1914.00."""
        assert get_top_code_for_discipline("GEOL") == "1914.00"

    def test_astr_discipline(self):
        """ASTR should map to 1911.00."""
        assert get_top_code_for_discipline("ASTR") == "1911.00"

    def test_arth_discipline(self):
        """ARTH should map to 1002.00."""
        assert get_top_code_for_discipline("ARTH") == "1002.00"

    def test_case_insensitive(self):
        """Should handle lowercase input."""
        assert get_top_code_for_discipline("math") == "1701.00"
        assert get_top_code_for_discipline("Math") == "1701.00"

    def test_invalid_discipline(self):
        """Should return None for unknown disciplines."""
        assert get_top_code_for_discipline("INVALID") is None
        assert get_top_code_for_discipline("XXXX") is None

    def test_empty_discipline(self):
        """Should return None for empty input."""
        assert get_top_code_for_discipline("") is None
        assert get_top_code_for_discipline(None) is None


class TestValidateCCNFormat:
    """Tests for validate_ccn_format function."""

    def test_valid_basic_ccn(self):
        """Standard CCN codes should be valid."""
        assert validate_ccn_format("MATH C2210") is True
        assert validate_ccn_format("ENGL C1000") is True
        assert validate_ccn_format("STAT C1000") is True

    def test_valid_honors_ccn(self):
        """CCN codes with Honors suffix should be valid."""
        assert validate_ccn_format("MATH C2210H") is True
        assert validate_ccn_format("STAT C1000H") is True

    def test_valid_lab_ccn(self):
        """CCN codes with Lab suffix should be valid."""
        assert validate_ccn_format("BIOL C1001L") is True

    def test_valid_support_ccn(self):
        """CCN codes with Support suffix should be valid."""
        assert validate_ccn_format("ENGL C1000S") is True

    def test_valid_embedded_ccn(self):
        """CCN codes with Embedded suffix should be valid."""
        assert validate_ccn_format("STAT C1000E") is True

    def test_valid_combined_specialty(self):
        """CCN codes with multiple specialty flags should be valid."""
        assert validate_ccn_format("MATH C2210HL") is True
        assert validate_ccn_format("BIOL C1001HL") is True

    def test_invalid_missing_c(self):
        """Should reject CCN codes missing the C identifier."""
        assert validate_ccn_format("MATH 2210") is False

    def test_invalid_short_subject(self):
        """Should reject subject codes with less than 2 characters."""
        # Note: Our regex requires 2-6 chars for subject
        assert validate_ccn_format("M C2210") is False

    def test_invalid_short_course_number(self):
        """Should reject course numbers with less than 4 digits."""
        assert validate_ccn_format("MATH C221") is False
        assert validate_ccn_format("MATH C21") is False

    def test_invalid_long_course_number(self):
        """Should reject course numbers with more than 4 digits."""
        assert validate_ccn_format("MATH C22100") is False

    def test_invalid_specialty(self):
        """Should reject invalid specialty identifiers."""
        assert validate_ccn_format("MATH C2210X") is False
        assert validate_ccn_format("MATH C2210Z") is False

    def test_invalid_empty(self):
        """Should reject empty input."""
        assert validate_ccn_format("") is False
        assert validate_ccn_format(None) is False

    def test_case_insensitive(self):
        """Should handle different cases."""
        assert validate_ccn_format("math c2210") is True
        assert validate_ccn_format("MATH c2210") is True


class TestParseCCNCode:
    """Tests for parse_ccn_code function."""

    def test_parse_basic_ccn(self):
        """Should parse a basic CCN code."""
        parts = parse_ccn_code("MATH C2210")
        assert parts is not None
        assert parts.subject == "MATH"
        assert parts.course_number == "2210"
        assert parts.specialty == ""
        assert parts.is_honors is False
        assert parts.is_lab_only is False
        assert parts.is_support is False
        assert parts.is_embedded is False
        assert parts.full_code == "MATH C2210"

    def test_parse_honors_ccn(self):
        """Should parse CCN code with Honors suffix."""
        parts = parse_ccn_code("MATH C2210H")
        assert parts is not None
        assert parts.subject == "MATH"
        assert parts.course_number == "2210"
        assert parts.specialty == "H"
        assert parts.is_honors is True
        assert parts.is_lab_only is False

    def test_parse_lab_ccn(self):
        """Should parse CCN code with Lab suffix."""
        parts = parse_ccn_code("BIOL C1001L")
        assert parts is not None
        assert parts.subject == "BIOL"
        assert parts.course_number == "1001"
        assert parts.is_lab_only is True
        assert parts.is_honors is False

    def test_parse_combined_specialty(self):
        """Should parse CCN code with multiple specialties."""
        parts = parse_ccn_code("MATH C2210HL")
        assert parts is not None
        assert parts.is_honors is True
        assert parts.is_lab_only is True
        assert parts.specialty == "HL"

    def test_parse_invalid_returns_none(self):
        """Should return None for invalid CCN codes."""
        assert parse_ccn_code("MATH 2210") is None
        assert parse_ccn_code("") is None
        assert parse_ccn_code(None) is None

    def test_parse_normalizes_whitespace(self):
        """Should handle extra whitespace."""
        parts = parse_ccn_code("  MATH   C2210  ")
        assert parts is not None
        assert parts.subject == "MATH"
        assert parts.course_number == "2210"


class TestGetSpecialtyFlags:
    """Tests for get_specialty_flags function."""

    def test_no_specialty(self):
        """Should return all False for basic CCN."""
        flags = get_specialty_flags("MATH C2210")
        assert flags == {
            'is_honors': False,
            'is_lab_only': False,
            'is_support': False,
            'is_embedded': False
        }

    def test_honors_only(self):
        """Should detect Honors flag."""
        flags = get_specialty_flags("MATH C2210H")
        assert flags['is_honors'] is True
        assert flags['is_lab_only'] is False
        assert flags['is_support'] is False
        assert flags['is_embedded'] is False

    def test_lab_only(self):
        """Should detect Lab flag."""
        flags = get_specialty_flags("BIOL C1001L")
        assert flags['is_honors'] is False
        assert flags['is_lab_only'] is True

    def test_support_only(self):
        """Should detect Support flag."""
        flags = get_specialty_flags("ENGL C1000S")
        assert flags['is_support'] is True

    def test_embedded_only(self):
        """Should detect Embedded flag."""
        flags = get_specialty_flags("STAT C1000E")
        assert flags['is_embedded'] is True

    def test_combined_flags(self):
        """Should detect multiple flags."""
        flags = get_specialty_flags("MATH C2210HL")
        assert flags['is_honors'] is True
        assert flags['is_lab_only'] is True

    def test_invalid_returns_all_false(self):
        """Should return all False for invalid input."""
        flags = get_specialty_flags("INVALID")
        assert all(v is False for v in flags.values())


class TestGetDisciplineFromCCN:
    """Tests for get_discipline_from_ccn function."""

    def test_extract_discipline(self):
        """Should extract discipline from CCN code."""
        assert get_discipline_from_ccn("MATH C2210") == "MATH"
        assert get_discipline_from_ccn("ENGL C1000") == "ENGL"
        assert get_discipline_from_ccn("PSYCH C1000") == "PSYCH"

    def test_invalid_returns_none(self):
        """Should return None for invalid input."""
        assert get_discipline_from_ccn("INVALID") is None
        assert get_discipline_from_ccn("") is None


class TestGetImpliedCB05ForCCN:
    """Tests for get_implied_cb05_for_ccn function."""

    def test_valid_ccn_returns_a(self):
        """Valid CCN should imply CB05='A' (UC+CSU transferable)."""
        assert get_implied_cb05_for_ccn("MATH C2210") == "A"
        assert get_implied_cb05_for_ccn("ENGL C1000") == "A"

    def test_invalid_returns_empty(self):
        """Invalid CCN should return empty string."""
        assert get_implied_cb05_for_ccn("MATH 2210") == ""
        assert get_implied_cb05_for_ccn("") == ""


class TestGetImpliedCB03ForCCN:
    """Tests for get_implied_cb03_for_ccn function."""

    def test_math_ccn(self):
        """MATH CCN should imply TOP code 1701.00."""
        assert get_implied_cb03_for_ccn("MATH C2210") == "1701.00"

    def test_engl_ccn(self):
        """ENGL CCN should imply TOP code 1501.00."""
        assert get_implied_cb03_for_ccn("ENGL C1000") == "1501.00"

    def test_psych_ccn(self):
        """PSYCH CCN should imply TOP code 2001.00."""
        assert get_implied_cb03_for_ccn("PSYCH C1000") == "2001.00"

    def test_invalid_returns_none(self):
        """Invalid CCN should return None."""
        assert get_implied_cb03_for_ccn("MATH 2210") is None
        assert get_implied_cb03_for_ccn("") is None


class TestFormatCCNCode:
    """Tests for format_ccn_code function."""

    def test_basic_format(self):
        """Should format basic CCN code."""
        assert format_ccn_code("MATH", "2210") == "MATH C2210"

    def test_with_specialty(self):
        """Should format CCN code with specialty."""
        assert format_ccn_code("MATH", "2210", "H") == "MATH C2210H"
        assert format_ccn_code("BIOL", "1001", "L") == "BIOL C1001L"

    def test_normalizes_case(self):
        """Should normalize to uppercase."""
        assert format_ccn_code("math", "2210", "h") == "MATH C2210H"

    def test_pads_course_number(self):
        """Should pad short course numbers."""
        assert format_ccn_code("MATH", "210") == "MATH C0210"


class TestDisciplineTopCodeMapping:
    """Tests for DISCIPLINE_TOP_CODES constant."""

    def test_all_top_codes_valid_format(self):
        """All TOP codes should be in ####.## format."""
        import re
        pattern = re.compile(r'^\d{4}\.\d{2}$')
        for discipline, top_code in DISCIPLINE_TOP_CODES.items():
            assert pattern.match(top_code), f"Invalid TOP code format for {discipline}: {top_code}"

    def test_required_disciplines_present(self):
        """Core CCN disciplines should be present."""
        required = ["MATH", "ENGL", "PSYCH", "BIOL", "CHEM", "HIST", "SOC", "ECON"]
        for discipline in required:
            assert discipline in DISCIPLINE_TOP_CODES, f"Missing required discipline: {discipline}"
