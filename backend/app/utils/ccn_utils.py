"""
CCN (Common Course Numbering) Utilities

Provides utilities for working with community college
Common Course Numbering (CCN/C-ID) standards per AB 1111.

CCN Format: SUBJ C####&&
- SUBJ: 4-letter subject code (e.g., MATH, ENGL, PSYCH)
- C: Common Course Number identifier
- ####: 4-digit course number
- &&: Optional specialty identifiers (H=Honors, L=Lab, S=Support, E=Embedded)

Example CCN codes:
- MATH C2210 (Calculus I)
- ENGL C1000 (English Composition)
- BIOL C1001L (Biology Lab)
- MATH C2210H (Honors Calculus I)
"""

import re
from typing import Optional, Dict
from dataclasses import dataclass


# Discipline to TOP Code mapping
# TOP codes are from the Taxonomy of Programs
DISCIPLINE_TOP_CODES: Dict[str, str] = {
    # Mathematics & Statistics
    "MATH": "1701.00",  # Mathematics, General
    "STAT": "1701.00",  # Statistics (under Mathematics)

    # English & Communication
    "ENGL": "1501.00",  # English, General
    "COMM": "0604.00",  # Communications, General

    # Social Sciences
    "PSYCH": "2001.00",  # Psychology, General
    "PSYC": "2001.00",   # Psychology (CCN variant)
    "SOC": "2208.00",    # Sociology
    "SOCI": "2208.00",   # Sociology (CCN variant)
    "ANTH": "2202.00",   # Anthropology
    "HIST": "2205.00",   # History
    "ECON": "2204.00",   # Economics, General
    "POLI": "2207.00",   # Political Science
    "POLS": "2207.00",   # Political Science (CCN variant)
    "GEOG": "2206.00",   # Geography

    # Natural Sciences
    "BIOL": "0401.00",   # Biology, General
    "CHEM": "1905.00",   # Chemistry, General
    "PHYS": "1902.00",   # Physics, General
    "GEOL": "1914.00",   # Geology
    "ASTR": "1911.00",   # Astronomy

    # Arts & Humanities
    "ARTH": "1002.00",   # Art History
    "ARTS": "1001.00",   # Art, General
    "MUSI": "1004.00",   # Music
    "THEA": "1006.00",   # Drama/Theater Arts
    "PHIL": "1509.00",   # Philosophy

    # Foreign Languages
    "SPAN": "1105.00",   # Spanish
    "FREN": "1102.00",   # French
    "GERM": "1103.00",   # German
    "CHIN": "1106.00",   # Chinese
    "JAPN": "1107.00",   # Japanese
    "ASL": "1199.00",    # Sign Language

    # Business
    "BUS": "0501.00",    # Business, General
    "ACCT": "0502.00",   # Accounting

    # Computer Science
    "CS": "0707.00",     # Computer Science
    "CIS": "0702.00",    # Computer Information Systems

    # Health Sciences
    "NURS": "1230.00",   # Nursing
    "HLTH": "1200.00",   # Health, General

    # Education
    "EDUC": "0800.00",   # Education, General
    "ECE": "1305.00",    # Child Development/Early Care
    "CDEV": "1305.00",   # Child Development (CCN variant)

    # Physical Education
    "PE": "0835.00",     # Physical Education
    "KIN": "0835.00",    # Kinesiology

    # Engineering
    "ENGR": "0901.00",   # Engineering, General
}


@dataclass
class CCNCodeParts:
    """Parsed components of a CCN code."""
    subject: str           # 4-letter subject code (e.g., MATH)
    course_number: str     # 4-digit course number (e.g., 2210)
    specialty: str         # Specialty identifiers (e.g., H, L, HL)
    is_honors: bool        # Has H suffix
    is_lab_only: bool      # Has L suffix
    is_support: bool       # Has S suffix
    is_embedded: bool      # Has E suffix
    full_code: str         # Full CCN code


def get_top_code_for_discipline(discipline: str) -> Optional[str]:
    """
    Get the TOP code for a CCN discipline.

    Args:
        discipline: The CCN discipline code (e.g., "MATH", "ENGL", "PSYCH")

    Returns:
        The TOP code as a string (e.g., "1701.00") or None if not found.

    Example:
        >>> get_top_code_for_discipline("MATH")
        "1701.00"
        >>> get_top_code_for_discipline("INVALID")
        None
    """
    if not discipline:
        return None
    return DISCIPLINE_TOP_CODES.get(discipline.upper())


# CCN format regex pattern
# Format: SUBJ C#### or SUBJ C####& or SUBJ C####&&
# Where SUBJ is 2-6 letters, C is literal, #### is 4 digits, & is H/L/S/E
CCN_PATTERN = re.compile(
    r'^([A-Z]{2,6})\s+C(\d{4})([HLSE]{0,2})$',
    re.IGNORECASE
)


def parse_ccn_code(ccn_code: str) -> Optional[CCNCodeParts]:
    """
    Parse a CCN code into its components.

    Args:
        ccn_code: The CCN code string (e.g., "MATH C2210", "ENGL C1000H")

    Returns:
        CCNCodeParts with parsed components, or None if invalid format.

    Example:
        >>> parts = parse_ccn_code("MATH C2210H")
        >>> parts.subject
        'MATH'
        >>> parts.course_number
        '2210'
        >>> parts.is_honors
        True
    """
    if not ccn_code:
        return None

    # Normalize whitespace
    ccn_code = ' '.join(ccn_code.strip().split())

    match = CCN_PATTERN.match(ccn_code)
    if not match:
        return None

    subject = match.group(1).upper()
    course_number = match.group(2)
    specialty = match.group(3).upper() if match.group(3) else ""

    return CCNCodeParts(
        subject=subject,
        course_number=course_number,
        specialty=specialty,
        is_honors='H' in specialty,
        is_lab_only='L' in specialty,
        is_support='S' in specialty,
        is_embedded='E' in specialty,
        full_code=f"{subject} C{course_number}{specialty}"
    )


def validate_ccn_format(ccn_code: str) -> bool:
    """
    Validate that a CCN code follows the proper AB 1111 format.

    Format: SUBJ C#### or SUBJ C####& or SUBJ C####&&

    Args:
        ccn_code: The CCN code string to validate

    Returns:
        True if the format is valid, False otherwise.

    Example:
        >>> validate_ccn_format("MATH C2210")
        True
        >>> validate_ccn_format("MATH 2210")  # Missing C
        False
        >>> validate_ccn_format("MATH C221")  # Only 3 digits
        False
    """
    if not ccn_code:
        return False

    # Normalize whitespace
    ccn_code = ' '.join(ccn_code.strip().split())

    return CCN_PATTERN.match(ccn_code) is not None


def get_specialty_flags(ccn_code: str) -> Dict[str, bool]:
    """
    Extract specialty flags from a CCN code.

    Specialty identifiers (appear after the course number):
    - H: Honors course
    - L: Lab-only course
    - S: Support course
    - E: Embedded support

    Args:
        ccn_code: The CCN code string

    Returns:
        Dictionary with boolean flags for each specialty type.
        Returns all False if the code is invalid.

    Example:
        >>> get_specialty_flags("MATH C2210H")
        {'is_honors': True, 'is_lab_only': False, 'is_support': False, 'is_embedded': False}
        >>> get_specialty_flags("BIOL C1001HL")
        {'is_honors': True, 'is_lab_only': True, 'is_support': False, 'is_embedded': False}
    """
    parts = parse_ccn_code(ccn_code)

    if not parts:
        return {
            'is_honors': False,
            'is_lab_only': False,
            'is_support': False,
            'is_embedded': False
        }

    return {
        'is_honors': parts.is_honors,
        'is_lab_only': parts.is_lab_only,
        'is_support': parts.is_support,
        'is_embedded': parts.is_embedded
    }


def get_discipline_from_ccn(ccn_code: str) -> Optional[str]:
    """
    Extract the discipline (subject) from a CCN code.

    Args:
        ccn_code: The CCN code string

    Returns:
        The discipline code or None if invalid.

    Example:
        >>> get_discipline_from_ccn("MATH C2210")
        'MATH'
    """
    parts = parse_ccn_code(ccn_code)
    return parts.subject if parts else None


def get_implied_cb05_for_ccn(ccn_code: str) -> str:
    """
    Get the implied CB05 (Transfer Status) for a valid CCN course.

    Per AB 1111, CCN-aligned courses are transferable to both UC and CSU.

    Args:
        ccn_code: The CCN code string

    Returns:
        "A" (UC+CSU Transferable) for valid CCN codes, empty string otherwise.

    Example:
        >>> get_implied_cb05_for_ccn("MATH C2210")
        'A'
    """
    if validate_ccn_format(ccn_code):
        return "A"  # Transferable to both UC and CSU
    return ""


def get_implied_cb03_for_ccn(ccn_code: str) -> Optional[str]:
    """
    Get the implied CB03 (TOP Code) for a CCN course based on its discipline.

    Args:
        ccn_code: The CCN code string

    Returns:
        The TOP code or None if discipline is not mapped.

    Example:
        >>> get_implied_cb03_for_ccn("MATH C2210")
        '1701.00'
    """
    discipline = get_discipline_from_ccn(ccn_code)
    if discipline:
        return get_top_code_for_discipline(discipline)
    return None


def format_ccn_code(subject: str, course_number: str, specialty: str = "") -> str:
    """
    Format components into a standard CCN code string.

    Args:
        subject: The subject/discipline code
        course_number: The 4-digit course number
        specialty: Optional specialty identifiers (H, L, S, E)

    Returns:
        Formatted CCN code string.

    Example:
        >>> format_ccn_code("MATH", "2210", "H")
        'MATH C2210H'
    """
    subject = subject.upper().strip()
    specialty = specialty.upper().strip()

    # Ensure course number is 4 digits
    course_number = course_number.zfill(4)[:4]

    return f"{subject} C{course_number}{specialty}"
