"""
Calricula - CCN (AB 1111) Standards Seed Data
Seeds Common Course Numbering (CCN) standards for course alignment.

Loads data from extracted CCN template PDFs (ccn_templates_extracted.json)
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.reference import CCNStandard


# Discipline to TOP Code mapping (per CLAUDE.md)
DISCIPLINE_TOP_CODES = {
    "MATH": "1701.00",   # Mathematics, General
    "ENGL": "1501.00",   # English
    "PSYCH": "2001.00",  # Psychology, General
    "PSYC": "2001.00",   # Psychology (alternate code)
    "SOC": "2208.00",    # Sociology
    "SOCI": "2208.00",   # Sociology (alternate code)
    "BIOL": "0401.00",   # Biology, General
    "CHEM": "1905.00",   # Chemistry, General
    "HIST": "2205.00",   # History
    "ANTH": "2202.00",   # Anthropology
    "STAT": "1701.00",   # Statistics (under Math)
    "ECON": "2204.00",   # Economics
    "COMM": "0604.00",   # Speech Communication
    "GEOL": "1914.00",   # Geology
    "ASTR": "1911.00",   # Astronomy
    "ASTER": "1911.00",  # Astronomy (alternate code)
    "ARTH": "1002.00",   # Art History
    "POLS": "2207.00",   # Political Science
    "CDEV": "1305.00",   # Child Development
}

# Path to extracted JSON data
EXTRACTED_JSON_PATH = Path(__file__).parent / "data" / "ccn_templates_extracted.json"


def load_extracted_json() -> list:
    """Load the extracted CCN templates from JSON file."""
    if not EXTRACTED_JSON_PATH.exists():
        print(f"Warning: Extracted JSON file not found at {EXTRACTED_JSON_PATH}")
        print("Using hardcoded fallback data...")
        return []

    with open(EXTRACTED_JSON_PATH, 'r') as f:
        return json.load(f)


def parse_approved_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse approved date string to datetime."""
    if not date_str:
        return None

    try:
        # Try ISO format first (from extraction script)
        if '-' in date_str and len(date_str) == 10:
            return datetime.strptime(date_str, "%Y-%m-%d")
        # Try other formats
        for fmt in ["%Y-%m-%d", "%B %d, %Y", "%m/%d/%Y"]:
            try:
                return datetime.strptime(date_str.strip(), fmt)
            except ValueError:
                continue
    except Exception:
        pass

    return None


def transform_extracted_to_model(extracted: dict) -> dict:
    """Transform extracted JSON data to CCNStandard model fields."""
    discipline = extracted.get("discipline", "").upper()

    # Validate minimum_units: extraction emits None (or legacy 0.0) on parse
    # failure, so only accept a positive value and fall back to the safe
    # default of 3.0 otherwise.
    raw_minimum_units = extracted.get("minimum_units")
    minimum_units = raw_minimum_units if (raw_minimum_units and raw_minimum_units > 0) else 3.0

    return {
        # Core identification. The extracted source JSON uses the legacy key
        # "c_id", but it actually holds an AB 1111 CCN code (e.g. "MATH C2210"),
        # so it maps to the model's ccn_code field.
        "ccn_code": extracted.get("c_id", ""),
        "discipline": discipline,
        "title": extracted.get("title", ""),
        "descriptor": extracted.get("description", ""),
        "minimum_units": minimum_units,

        # Course identification (from extracted PDF data)
        "subject_code": extracted.get("subject_code", ""),
        "course_number": extracted.get("course_number", ""),

        # Requisites
        "prerequisites": extracted.get("prerequisites"),
        "corequisites": extracted.get("corequisites"),

        # Learning outcomes (use objectives for SLOs)
        "slo_requirements": extracted.get("objectives", []),
        "objectives": extracted.get("objectives", []),

        # Content
        "content_requirements": extracted.get("content_requirements", []),

        # Assessment
        "evaluation_methods": extracted.get("evaluation_methods"),

        # Resources
        "representative_texts": extracted.get("representative_texts", []),

        # Variant flags
        "is_honors": extracted.get("is_honors", False),
        "is_lab_only": extracted.get("is_lab_only", False),
        "is_support_course": extracted.get("is_support_course", False),
        "has_embedded_support": extracted.get("has_embedded_support", False),

        # CB code implications (all CCN = UC+CSU transferable)
        "implied_cb05": "A",
        "implied_top_code": DISCIPLINE_TOP_CODES.get(discipline),

        # Metadata
        "source_file": extracted.get("source_file"),
        "approved_date": parse_approved_date(extracted.get("approved_date")),
    }


def seed_ccn_standards():
    """
    Seed CCN (AB 1111) standards into the database from extracted JSON.
    Uses upsert logic: update existing records, create new ones.
    """
    # Load extracted data
    extracted_data = load_extracted_json()

    if not extracted_data:
        print("No extracted data found. Skipping seed.")
        return

    with Session(engine) as session:
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for extracted in extracted_data:
            # Source JSON key "c_id" actually holds the AB 1111 CCN code.
            ccn_code = extracted.get("c_id", "")

            # Skip entries without a valid CCN code
            if not ccn_code or not ccn_code.strip():
                print(f"  Skipping entry without CCN code: {extracted.get('source_file', 'unknown')}")
                skipped_count += 1
                continue

            # Transform to model data
            model_data = transform_extracted_to_model(extracted)

            # Check if CCN standard already exists
            existing = session.exec(
                select(CCNStandard).where(CCNStandard.ccn_code == ccn_code)
            ).first()

            if existing:
                # Update existing record
                for key, value in model_data.items():
                    if value is not None:  # Only update non-None values
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
                print(f"  Updated: {ccn_code} - {model_data.get('title', 'Unknown')}")
                updated_count += 1
            else:
                # Create new record
                ccn = CCNStandard(**model_data)
                session.add(ccn)
                print(f"  Created: {ccn_code} - {model_data.get('title', 'Unknown')}")
                created_count += 1

        # Fail fast if too many entries were skipped for invalid CCN codes, which
        # would otherwise ship partial CCN coverage without warning.
        total = len(extracted_data)
        skip_ratio = (skipped_count / total) if total else 0
        if total and skip_ratio > 0.10:
            session.rollback()
            raise ValueError(
                f"Aborting seed: {skipped_count}/{total} entries "
                f"({skip_ratio:.0%}) were skipped for missing/invalid CCN codes, "
                f"exceeding the 10% threshold."
            )

        session.commit()
        print(f"\nSeed Summary:")
        print(f"  Created: {created_count}")
        print(f"  Updated: {updated_count}")
        print(f"  Skipped: {skipped_count}")
        print(f"  Total processed: {len(extracted_data)}")


def list_disciplines():
    """List all disciplines in the extracted data."""
    extracted_data = load_extracted_json()
    disciplines = set()

    for item in extracted_data:
        disc = item.get("discipline", "").upper()
        if disc:
            disciplines.add(disc)

    print("Disciplines in extracted data:")
    for disc in sorted(disciplines):
        top_code = DISCIPLINE_TOP_CODES.get(disc, "NOT MAPPED")
        print(f"  {disc}: {top_code}")


if __name__ == "__main__":
    print("=" * 60)
    print("Seeding CCN (AB 1111) Standards from Extracted PDF Data")
    print("=" * 60)

    # Show discipline mapping first
    list_disciplines()
    print()

    # Run seed
    seed_ccn_standards()
    print("\nDone!")
