"""
Calricula - Import Reference Data from eLumen API
===================================================

Imports reference/lookup data from eLumen to populate our reference tables
with real LACCD values.

This script imports:
- Colleges: All 9 LACCD colleges (ELAC, LACC, LAHC, LAMC, LAPC, LASC, LATTC, LAVC, WLAC)
- TOP Codes: Unique TOP codes extracted from courses
- Departments: Department codes and names per college

Usage:
    python scripts/import_reference_data.py
    python scripts/import_reference_data.py --dry-run
    python scripts/import_reference_data.py --colleges-only
    python scripts/import_reference_data.py --top-codes-only
    python scripts/import_reference_data.py --departments-only
    python scripts/import_reference_data.py --sample-size 200
"""

import argparse
import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.reference import College, TOPCode
from app.models.department import Department, Division
from app.services.elumen_client import SynceLumenClient, TENANT_ABBREV_MAP


# Full college names for LACCD institutions
COLLEGE_FULL_NAMES = {
    "ELAC": "East Los Angeles College",
    "LACC": "Los Angeles City College",
    "LAHC": "Los Angeles Harbor College",
    "LAMC": "Los Angeles Mission College",
    "LAPC": "Los Angeles Pierce College",
    "LASC": "Los Angeles Southwest College",
    "LATTC": "Los Angeles Trade-Technical College",
    "LAVC": "Los Angeles Valley College",
    "WLAC": "West Los Angeles College",
}


def import_colleges(
    session: Session,
    client: SynceLumenClient,
    dry_run: bool = False
) -> tuple[int, int]:
    """
    Import all 9 LACCD colleges from eLumen tenants endpoint.

    Returns:
        Tuple of (imported_count, skipped_count)
    """
    print("\n" + "=" * 60)
    print("  Importing Colleges")
    print("=" * 60)

    tenants = client.get_tenants()
    imported = 0
    skipped = 0

    # First collect all existing abbreviations
    existing_abbrevs = set()
    for college in session.exec(select(College)).all():
        existing_abbrevs.add(college.abbreviation)

    for tenant in tenants:
        abbrev = tenant.abbreviation
        full_name = COLLEGE_FULL_NAMES.get(abbrev, tenant.display_name)

        # Check if already exists
        if abbrev in existing_abbrevs:
            print(f"  [SKIP] {abbrev} - {full_name} (already exists)")
            skipped += 1
            continue

        if dry_run:
            print(f"  [DRY] Would import: {abbrev} - {full_name}")
            imported += 1
            continue

        # Create new college
        college = College(
            abbreviation=abbrev,
            name=full_name,
            domain=tenant.name,
            elumen_id=tenant.id,
        )
        session.add(college)
        existing_abbrevs.add(abbrev)  # Track newly added
        print(f"  [OK] Imported: {abbrev} - {full_name}")
        imported += 1

    if not dry_run:
        session.flush()

    return imported, skipped


def import_top_codes(
    session: Session,
    client: SynceLumenClient,
    sample_size: int = 500,
    dry_run: bool = False
) -> tuple[int, int]:
    """
    Extract unique TOP codes from eLumen courses and import them.

    Args:
        session: Database session
        client: eLumen API client
        sample_size: Number of courses to sample for TOP codes
        dry_run: If True, don't actually insert

    Returns:
        Tuple of (imported_count, skipped_count)
    """
    print("\n" + "=" * 60)
    print("  Importing TOP Codes")
    print("=" * 60)

    # Fetch courses to extract TOP codes
    print(f"  Fetching up to {sample_size} courses to extract TOP codes...")
    courses = client.get_courses(limit=sample_size)
    print(f"  Fetched {len(courses)} courses")

    # Extract unique TOP codes
    top_codes_seen = {}  # code -> title
    for course in courses:
        if course.full_course_info and course.full_course_info.system_taxonomy_code:
            tax = course.full_course_info.system_taxonomy_code
            if tax.code and tax.code not in top_codes_seen:
                top_codes_seen[tax.code] = tax.title or f"TOP Code {tax.code}"

    print(f"  Found {len(top_codes_seen)} unique TOP codes")

    # First collect all existing codes
    existing_codes = set()
    for top_code in session.exec(select(TOPCode)).all():
        existing_codes.add(top_code.code)

    imported = 0
    skipped = 0

    for code, title in sorted(top_codes_seen.items()):
        # Check if already exists
        if code in existing_codes:
            skipped += 1
            continue

        if dry_run:
            print(f"  [DRY] Would import: {code} - {title}")
            imported += 1
            continue

        # Determine if vocational based on TOP code range
        # TOP codes 0100.00 - 0999.99 are generally vocational/CTE
        is_vocational = False
        try:
            code_num = float(code.replace(".", ""))
            # Vocational codes are typically in CTE areas:
            # Agriculture (01), Architecture (02), Business (05-06), etc.
            if code_num < 1000000:  # Lower numbered codes tend to be vocational
                first_digit = int(code.split(".")[0][:2]) if "." in code else int(code[:2])
                # 49 (Interdisciplinary) and above are generally not vocational
                is_vocational = first_digit < 49
        except (ValueError, IndexError):
            pass

        # Create TOP code
        top_code = TOPCode(
            code=code,
            title=title,
            is_vocational=is_vocational,
            parent_code=None,  # Could extract parent from code pattern
        )
        session.add(top_code)
        print(f"  [OK] {code} - {title[:50]}{'...' if len(title) > 50 else ''}")
        imported += 1

    if not dry_run:
        session.flush()

    print(f"\n  TOP Codes: {imported} imported, {skipped} skipped")
    return imported, skipped


def import_departments(
    session: Session,
    client: SynceLumenClient,
    sample_size: int = 500,
    dry_run: bool = False
) -> tuple[int, int]:
    """
    Extract unique departments from eLumen courses.

    Args:
        session: Database session
        client: eLumen API client
        sample_size: Number of courses to sample
        dry_run: If True, don't actually insert

    Returns:
        Tuple of (imported_count, skipped_count)
    """
    print("\n" + "=" * 60)
    print("  Importing Departments")
    print("=" * 60)

    # Fetch courses to extract departments
    print(f"  Fetching up to {sample_size} courses to extract departments...")
    courses = client.get_courses(limit=sample_size)
    print(f"  Fetched {len(courses)} courses")

    # Extract unique subject codes (departments)
    departments_seen = set()
    for course in courses:
        # Use the parsed subject from the course code
        subject = course.subject

        # Handle merged codes like "ACCTG001" -> "ACCTG"
        if subject:
            # Strip any digits from the end
            clean_subject = ""
            for char in subject:
                if char.isalpha() or char == '-':
                    clean_subject += char
                elif char.isdigit() and not clean_subject:
                    # Skip leading digits
                    continue
                else:
                    # Stop at first digit after letters
                    break

            # Only add if it looks like a valid subject code (2+ chars)
            if clean_subject and len(clean_subject) >= 2:
                departments_seen.add(clean_subject.upper())

    print(f"  Found {len(departments_seen)} unique subject codes")

    # Get or create a default division for imported departments
    default_division = session.exec(select(Division)).first()
    if not default_division and not dry_run:
        default_division = Division(name="Imported Departments")
        session.add(default_division)
        session.flush()
        print(f"  Created default division: 'Imported Departments'")

    # First collect all existing codes
    existing_dept_codes = set()
    for dept in session.exec(select(Department)).all():
        existing_dept_codes.add(dept.code)

    imported = 0
    skipped = 0

    for dept_code in sorted(departments_seen):
        # Check if already exists
        if dept_code in existing_dept_codes:
            skipped += 1
            continue

        if dry_run:
            print(f"  [DRY] Would import: {dept_code}")
            imported += 1
            continue

        # Create department
        dept = Department(
            code=dept_code,
            name=f"{dept_code} Department",  # Placeholder name
            division_id=default_division.id if default_division else None,
        )
        session.add(dept)
        print(f"  [OK] {dept_code}")
        imported += 1

    if not dry_run:
        session.flush()

    print(f"\n  Departments: {imported} imported, {skipped} skipped")
    return imported, skipped


def import_reference_data(
    colleges_only: bool = False,
    top_codes_only: bool = False,
    departments_only: bool = False,
    sample_size: int = 500,
    dry_run: bool = False
):
    """
    Import all reference data from eLumen API.

    Args:
        colleges_only: Only import colleges
        top_codes_only: Only import TOP codes
        departments_only: Only import departments
        sample_size: Number of courses to sample for extracting data
        dry_run: If True, preview without making changes
    """
    print("=" * 60)
    print("  Calricula - Import Reference Data from eLumen")
    print("=" * 60)

    if dry_run:
        print("\n  ** DRY RUN MODE - No changes will be made **")

    # Determine what to import
    import_all = not (colleges_only or top_codes_only or departments_only)

    # Initialize eLumen client
    client = SynceLumenClient()

    try:
        with Session(engine) as session:
            total_imported = 0
            total_skipped = 0

            # Import colleges
            if import_all or colleges_only:
                imported, skipped = import_colleges(session, client, dry_run)
                total_imported += imported
                total_skipped += skipped

            # Import TOP codes
            if import_all or top_codes_only:
                imported, skipped = import_top_codes(
                    session, client, sample_size, dry_run
                )
                total_imported += imported
                total_skipped += skipped

            # Import departments
            if import_all or departments_only:
                imported, skipped = import_departments(
                    session, client, sample_size, dry_run
                )
                total_imported += imported
                total_skipped += skipped

            # Commit all changes
            if not dry_run:
                session.commit()

            # Summary
            print("\n" + "=" * 60)
            print("  Summary")
            print("=" * 60)
            print(f"  Total imported: {total_imported}")
            print(f"  Total skipped (duplicates): {total_skipped}")

            if dry_run:
                print("\n  ** DRY RUN - No changes were made **")
            else:
                print("\n  All changes committed to database.")

    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Import reference data from eLumen API into Calricula database"
    )
    parser.add_argument(
        "--colleges-only",
        action="store_true",
        help="Only import colleges"
    )
    parser.add_argument(
        "--top-codes-only",
        action="store_true",
        help="Only import TOP codes"
    )
    parser.add_argument(
        "--departments-only",
        action="store_true",
        help="Only import departments"
    )
    parser.add_argument(
        "--sample-size", "-s",
        type=int,
        default=500,
        help="Number of courses to sample for extracting TOP codes and departments (default: 500)"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Preview import without making changes"
    )

    args = parser.parse_args()

    import_reference_data(
        colleges_only=args.colleges_only,
        top_codes_only=args.top_codes_only,
        departments_only=args.departments_only,
        sample_size=args.sample_size,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
