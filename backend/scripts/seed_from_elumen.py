"""
Calricula - Seed Database from eLumen API
==========================================

Seeds the database with real LACCD courses and programs from the eLumen public API.

Usage:
    # Import courses (default)
    python scripts/seed_from_elumen.py --college LAMC --limit 50
    python scripts/seed_from_elumen.py --query "calculus" --limit 20
    python scripts/seed_from_elumen.py --college LAMC --dry-run
    python scripts/seed_from_elumen.py --all-colleges --limit 100

    # Import programs
    python scripts/seed_from_elumen.py --type programs --college LAPC --limit 20
    python scripts/seed_from_elumen.py --type programs --all-colleges --limit 50
"""

import argparse
import re
import sys
from decimal import Decimal
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.course import (
    Course, CourseStatus, StudentLearningOutcome, BloomLevel,
    CourseContent, CourseRequisite, RequisiteType
)
from app.models.department import Department
from app.models.program import Program, ProgramType, ProgramStatus
from app.models.user import User
from app.services.elumen_client import SynceLumenClient, CourseResponse, ProgramResponse


def detect_bloom_level(text: str) -> BloomLevel:
    """
    Detect Bloom's Taxonomy level from outcome text.

    Uses keyword matching to identify cognitive level based on Bloom's verbs.
    """
    text_lower = text.lower()

    # Create level - highest order
    create_verbs = ["create", "design", "construct", "produce", "develop", "compose", "generate", "plan", "invent"]
    for verb in create_verbs:
        if verb in text_lower:
            return BloomLevel.CREATE

    # Evaluate level
    evaluate_verbs = ["evaluate", "judge", "assess", "justify", "critique", "defend", "argue", "support"]
    for verb in evaluate_verbs:
        if verb in text_lower:
            return BloomLevel.EVALUATE

    # Analyze level
    analyze_verbs = ["analyze", "compare", "contrast", "differentiate", "distinguish", "examine", "organize"]
    for verb in analyze_verbs:
        if verb in text_lower:
            return BloomLevel.ANALYZE

    # Apply level
    apply_verbs = ["apply", "use", "demonstrate", "solve", "implement", "perform", "calculate", "compute"]
    for verb in apply_verbs:
        if verb in text_lower:
            return BloomLevel.APPLY

    # Understand level
    understand_verbs = ["understand", "explain", "describe", "interpret", "summarize", "classify", "discuss"]
    for verb in understand_verbs:
        if verb in text_lower:
            return BloomLevel.UNDERSTAND

    # Remember level - lowest order
    remember_verbs = ["remember", "recall", "identify", "recognize", "list", "name", "define", "state"]
    for verb in remember_verbs:
        if verb in text_lower:
            return BloomLevel.REMEMBER

    # Default to Apply if no match
    return BloomLevel.APPLY


def map_requisite_type(elumen_type: str) -> RequisiteType:
    """Map eLumen requisite type to our model."""
    type_lower = elumen_type.lower() if elumen_type else ""
    if "corequisite" in type_lower:
        return RequisiteType.COREQUISITE
    elif "advisory" in type_lower:
        return RequisiteType.ADVISORY
    else:
        return RequisiteType.PREREQUISITE


def detect_program_type(name: str) -> ProgramType:
    """
    Detect program type from the program name.

    eLumen program names contain type indicators like:
    - "Associate in Arts in Anthropology (AA-T) for Transfer Degree" -> AAT
    - "Associate in Science in Biology (AS-T) for Transfer Degree" -> AST
    - "Associate in Arts in Psychology" -> AA
    - "Associate in Science in Computer Science" -> AS
    - "Certificate of Achievement in Web Development" -> Certificate
    - "Associate Degree for Transfer in Business" -> ADT
    """
    name_lower = name.lower()

    # Check for Transfer degree indicators first (more specific)
    if "(aa-t)" in name_lower or "aa-t" in name_lower:
        return ProgramType.AAT
    if "(as-t)" in name_lower or "as-t" in name_lower:
        return ProgramType.AST
    if "associate degree for transfer" in name_lower or "(adt)" in name_lower:
        return ProgramType.ADT
    if "for transfer" in name_lower:
        # Determine if AA-T or AS-T based on "arts" or "science"
        if "associate in arts" in name_lower:
            return ProgramType.AAT
        elif "associate in science" in name_lower:
            return ProgramType.AST
        else:
            return ProgramType.ADT

    # Check for certificate types
    if "certificate" in name_lower:
        return ProgramType.CERTIFICATE

    # Check for standard associate degrees
    if "associate in arts" in name_lower or "(aa)" in name_lower:
        return ProgramType.AA
    if "associate in science" in name_lower or "(as)" in name_lower:
        return ProgramType.AS

    # Default to Certificate for anything else
    return ProgramType.CERTIFICATE


def extract_program_title(name: str, program_type: ProgramType) -> str:
    """
    Extract a clean program title from the eLumen program name.

    Removes type indicators and "for Transfer Degree" suffix.
    e.g., "Associate in Arts in Anthropology (AA-T) for Transfer Degree" -> "Anthropology"
    """
    # Remove common suffixes
    title = name
    suffixes_to_remove = [
        " for Transfer Degree",
        " for Transfer",
        " Transfer Degree",
        "(AA-T)",
        "(AS-T)",
        "(ADT)",
        "(AA)",
        "(AS)",
        "AA-T",
        "AS-T",
    ]
    for suffix in suffixes_to_remove:
        title = title.replace(suffix, "")

    # Remove "Associate in Arts in " or "Associate in Science in " prefix
    prefixes_to_remove = [
        "Associate in Arts in ",
        "Associate in Science in ",
        "Associate Degree for Transfer in ",
        "Associate in Arts ",
        "Associate in Science ",
        "Certificate of Achievement in ",
        "Certificate in ",
    ]
    for prefix in prefixes_to_remove:
        if title.startswith(prefix):
            title = title[len(prefix):]
            break

    # Clean up extra whitespace
    title = " ".join(title.split()).strip()

    # If we removed too much, use the original name
    if not title or len(title) < 3:
        title = name

    return title


def get_or_create_department(
    session: Session,
    subject_code: str,
    department_map: dict,
    dry_run: bool = False
):
    """
    Get department ID for a subject code, creating it if needed.

    Args:
        session: Database session
        subject_code: The subject code (e.g., "MATH", "ACCTG")
        department_map: Existing department map to update
        dry_run: If True, return None instead of creating

    Returns:
        Department ID or None
    """
    # Check if already in map
    if subject_code in department_map:
        return department_map[subject_code]

    # Check database
    existing = session.exec(
        select(Department).where(Department.code == subject_code)
    ).first()

    if existing:
        department_map[subject_code] = existing.id
        return existing.id

    if dry_run:
        return None

    # Create new department for this subject
    dept = Department(
        code=subject_code,
        name=f"{subject_code} Department",  # Placeholder name
        division_id=None
    )
    session.add(dept)
    session.flush()
    department_map[subject_code] = dept.id
    return dept.id


def import_course(
    session: Session,
    elumen_course: CourseResponse,
    department_map: dict,
    default_user_id,
    dry_run: bool = False,
    auto_create_dept: bool = True
) -> tuple[bool, str]:
    """
    Import a single course from eLumen into our database.

    Args:
        session: Database session
        elumen_course: Course data from eLumen API
        department_map: Dict mapping subject codes to department IDs
        default_user_id: UUID of default user for created_by
        dry_run: If True, don't actually insert records
        auto_create_dept: If True, auto-create departments for unknown subjects

    Returns:
        Tuple of (success: bool, message: str)
    """
    subject = elumen_course.subject
    number = elumen_course.number

    # Handle merged subject+number codes (e.g., "ACCTG001" -> "ACCTG" + "001")
    if not number and len(subject) > 3:
        # Try to split - find where letters end and numbers begin
        for i, char in enumerate(subject):
            if char.isdigit():
                number = subject[i:]
                subject = subject[:i]
                break

    # Check if course already exists
    existing = session.exec(
        select(Course).where(
            Course.subject_code == subject,
            Course.course_number == number
        )
    ).first()

    if existing:
        return False, f"Course {subject} {number} already exists"

    # Find or create department
    dept_id = department_map.get(subject)
    if not dept_id:
        if auto_create_dept:
            dept_id = get_or_create_department(session, subject, department_map, dry_run)
        if not dept_id:
            return False, f"No department for subject {subject}"

    if dry_run:
        return True, f"Would import {subject} {number}: {elumen_course.name}"

    # Extract course data
    full_info = elumen_course.full_course_info

    # Get hours from credits_and_hours
    lecture_hours = Decimal("0")
    lab_hours = Decimal("0")
    activity_hours = Decimal("0")
    tba_hours = Decimal("0")
    minimum_units = None
    maximum_units = None

    if full_info and full_info.credits_and_hours:
        ch = full_info.credits_and_hours[0]
        lecture_hours = Decimal(str(ch.lecture_hours or 0))
        lab_hours = Decimal(str(ch.lab_hours or 0))
        activity_hours = Decimal(str(ch.activity_hours or 0))
        tba_hours = Decimal(str(ch.tba_hours or 0))
        if ch.minimum_credit:
            minimum_units = Decimal(str(ch.minimum_credit))
        if ch.maximum_credit:
            maximum_units = Decimal(str(ch.maximum_credit))

    # Calculate outside_of_class_hours (2x lecture) and total student learning hours
    # Per Title 5 § 55002.5 (54-hour rule): Total Student Learning Hours / 54 = Units
    outside_of_class_hours = lecture_hours * 2
    total_student_learning_hours = (
        lecture_hours + lab_hours + activity_hours + tba_hours + outside_of_class_hours
    )

    # Create course
    course = Course(
        subject_code=subject,
        course_number=number,
        title=elumen_course.name,
        catalog_description=elumen_course.description,
        units=Decimal(str(elumen_course.units or 0)),
        minimum_units=minimum_units,
        maximum_units=maximum_units,
        lecture_hours=lecture_hours,
        lab_hours=lab_hours,
        activity_hours=activity_hours,
        tba_hours=tba_hours,
        outside_of_class_hours=outside_of_class_hours,
        total_student_learning_hours=total_student_learning_hours,
        top_code=elumen_course.top_code,
        elumen_id=elumen_course.id,
        status=CourseStatus.APPROVED,  # Importing approved courses
        version=1,
        department_id=dept_id,
        created_by=default_user_id,
        cb_codes=elumen_course.cb_codes,
    )

    session.add(course)
    session.flush()  # Get course ID

    # Import SLOs
    if full_info and full_info.outcomes:
        for i, outcome in enumerate(full_info.outcomes, 1):
            outcome_text = outcome.text or ""  # Use .text property (name or title or description)
            if not outcome_text:
                continue

            slo = StudentLearningOutcome(
                course_id=course.id,
                sequence=outcome.sequence or i,
                outcome_text=outcome_text,
                bloom_level=detect_bloom_level(outcome_text),
                performance_criteria="; ".join(outcome.performance_criteria) if outcome.performance_criteria else None
            )
            session.add(slo)

    # Import objectives as content items
    if full_info and full_info.objectives:
        for i, obj in enumerate(full_info.objectives, 1):
            obj_text = obj.text or ""  # Use .text property (name or description)
            if not obj_text:
                continue

            content = CourseContent(
                course_id=course.id,
                sequence=obj.sequence if obj.sequence is not None else i,
                topic=obj_text[:200],  # Truncate if too long
                subtopics=[],
                hours_allocated=Decimal("0"),
                linked_slos=[]
            )
            session.add(content)

    return True, f"Imported {subject} {number}: {elumen_course.name}"


def import_program(
    session: Session,
    elumen_program: ProgramResponse,
    department_map: dict,
    default_user_id,
    dry_run: bool = False,
    auto_create_dept: bool = True
) -> tuple[bool, str]:
    """
    Import a single program from eLumen into our database.

    Args:
        session: Database session
        elumen_program: Program data from eLumen API
        department_map: Dict mapping TOP codes to department IDs
        default_user_id: UUID of default user for created_by
        dry_run: If True, don't actually insert records
        auto_create_dept: If True, auto-create departments for unknown TOP codes

    Returns:
        Tuple of (success: bool, message: str)
    """
    # Detect program type from name
    program_type = detect_program_type(elumen_program.name)
    title = extract_program_title(elumen_program.name, program_type)

    # Check if program already exists by title and type
    existing = session.exec(
        select(Program).where(
            Program.title == title,
            Program.type == program_type
        )
    ).first()

    if existing:
        return False, f"Program '{title}' ({program_type.value}) already exists"

    # Find or create department based on TOP code
    # Extract subject from TOP code (first 2-4 digits often map to discipline)
    top_code = elumen_program.top_code
    dept_code = None
    dept_id = None

    if top_code:
        # Try to find a department with matching TOP code
        for code, did in department_map.items():
            dept_id = did
            dept_code = code
            break  # Use first available department as fallback

        # Try to map TOP code to a known discipline
        # TOP codes follow patterns: XXXX.XX where first 2-4 digits indicate discipline
        top_prefix = top_code.split(".")[0] if top_code else ""
        top_discipline_map = {
            "01": "AGRI",  # Agriculture
            "02": "ARCH",  # Architecture
            "03": "ENV",   # Environmental Sciences
            "04": "BIO",   # Biological Sciences
            "05": "BUS",   # Business
            "06": "COMM",  # Media & Communications
            "07": "IT",    # Information Technology
            "08": "EDUC",  # Education
            "09": "ENGR",  # Engineering
            "10": "ART",   # Fine Arts
            "11": "FSRV",  # Food Services
            "12": "PE",    # Health & Physical Education
            "13": "FCS",   # Family & Consumer Sciences
            "14": "LAW",   # Law
            "15": "HUM",   # Humanities
            "16": "LIB",   # Library Science
            "17": "MATH",  # Mathematics
            "18": "MIL",   # Military Studies
            "19": "PHYS",  # Physical Sciences
            "20": "PSYC",  # Psychology
            "21": "FIRE",  # Public Safety
            "22": "SOC",   # Social Sciences
            "30": "COMM",  # Commercial Services
            "34": "INDL",  # Industrial Technology
            "49": "INTD",  # Interdisciplinary Studies
            "12": "PE",    # Kinesiology
        }

        # Try 2-digit and 4-digit prefixes
        for prefix_len in [2, 4]:
            prefix = top_prefix[:prefix_len] if len(top_prefix) >= prefix_len else top_prefix
            if prefix in top_discipline_map:
                suggested_code = top_discipline_map[prefix]
                if suggested_code in department_map:
                    dept_id = department_map[suggested_code]
                    dept_code = suggested_code
                    break

    # If no department found, create one based on the program
    if not dept_id:
        # Create a generic department based on program title
        dept_code = "PROG"  # Generic program department
        if dept_code in department_map:
            dept_id = department_map[dept_code]
        elif auto_create_dept:
            dept_id = get_or_create_department(session, dept_code, department_map, dry_run)

    if not dept_id:
        return False, f"No department found for program '{title}' (TOP: {top_code})"

    if dry_run:
        return True, f"Would import {program_type.value}: {title}"

    # Calculate default total units based on program type
    default_units = Decimal("60.0")  # Standard for AA/AS
    if program_type == ProgramType.CERTIFICATE:
        default_units = Decimal("18.0")  # Typical certificate minimum

    # Create program
    program = Program(
        title=title,
        type=program_type,
        catalog_description=elumen_program.description,
        total_units=default_units,
        status=ProgramStatus.APPROVED,  # Importing approved programs
        top_code=top_code,
        department_id=dept_id,
        created_by=default_user_id,
    )

    session.add(program)
    session.flush()  # Get program ID

    return True, f"Imported {program_type.value}: {title}"


def seed_programs_from_elumen(
    college: str = "",
    query: str = "",
    limit: int = 50,
    dry_run: bool = False,
    all_colleges: bool = False
):
    """
    Seed programs from eLumen API.

    Args:
        college: College abbreviation (e.g., "LAPC")
        query: Search query
        limit: Maximum programs to import
        dry_run: If True, preview without importing
        all_colleges: If True, import from all colleges
    """
    print("=" * 60)
    print("  Calricula - Import Programs from eLumen")
    print("=" * 60)
    print()

    if dry_run:
        print("  ** DRY RUN MODE - No changes will be made **")
        print()

    # Initialize eLumen client
    client = SynceLumenClient()

    with Session(engine) as session:
        # Build department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id
        print(f"Found {len(dept_map)} departments in database")

        # Get default user
        default_user = session.exec(select(User)).first()
        if not default_user:
            print("ERROR: No users found. Run seed_users.py first.")
            return
        print(f"Using default user: {default_user.email}")
        print()

        # Determine which colleges to query
        if all_colleges:
            tenants = client.get_tenants()
            colleges_to_query = [t.abbreviation for t in tenants]
            per_college_limit = limit // len(colleges_to_query) if limit else None
        else:
            colleges_to_query = [college] if college else [""]
            per_college_limit = limit

        # Import programs
        imported = 0
        skipped = 0
        errors = 0
        total_fetched = 0

        for coll in colleges_to_query:
            print(f"Fetching programs from {coll or 'all colleges'}...")

            try:
                programs = client.get_programs(
                    tenant=coll,
                    query=query,
                    limit=per_college_limit
                )
                total_fetched += len(programs)

                if not programs:
                    print(f"  No programs found for {coll or 'all colleges'}")
                    continue

                for program in programs:
                    success, message = import_program(
                        session=session,
                        elumen_program=program,
                        department_map=dept_map,
                        default_user_id=default_user.id,
                        dry_run=dry_run
                    )

                    if success:
                        imported += 1
                        print(f"  [OK] {message}")
                    else:
                        if "already exists" in message:
                            skipped += 1
                            print(f"  [SKIP] {message}")
                        else:
                            errors += 1
                            print(f"  [ERR] {message}")

                    if limit and imported >= limit:
                        break

            except Exception as e:
                print(f"  [ERROR] Failed to fetch from {coll}: {e}")
                errors += 1

            if limit and imported >= limit:
                break

        # Commit changes
        if not dry_run:
            session.commit()

        # Summary
        print()
        print("=" * 60)
        print("  Summary")
        print("=" * 60)
        print(f"  Total fetched from API: {total_fetched}")
        print(f"  Imported: {imported}")
        print(f"  Skipped (duplicates): {skipped}")
        print(f"  Errors: {errors}")
        if dry_run:
            print()
            print("  ** DRY RUN - No changes were made **")

    client.close()


def seed_from_elumen(
    college: str = "",
    query: str = "",
    limit: int = 50,
    dry_run: bool = False,
    all_colleges: bool = False
):
    """
    Seed courses from eLumen API.

    Args:
        college: College abbreviation (e.g., "LAMC")
        query: Search query
        limit: Maximum courses to import
        dry_run: If True, preview without importing
        all_colleges: If True, import from all colleges
    """
    print("=" * 60)
    print("  Calricula - Import from eLumen")
    print("=" * 60)
    print()

    if dry_run:
        print("  ** DRY RUN MODE - No changes will be made **")
        print()

    # Initialize eLumen client
    client = SynceLumenClient()

    with Session(engine) as session:
        # Build department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id
        print(f"Found {len(dept_map)} departments in database")

        # Get default user
        default_user = session.exec(select(User)).first()
        if not default_user:
            print("ERROR: No users found. Run seed_users.py first.")
            return
        print(f"Using default user: {default_user.email}")
        print()

        # Determine which colleges to query
        if all_colleges:
            tenants = client.get_tenants()
            colleges_to_query = [t.abbreviation for t in tenants]
            per_college_limit = limit // len(colleges_to_query) if limit else None
        else:
            colleges_to_query = [college] if college else [""]
            per_college_limit = limit

        # Import courses
        imported = 0
        skipped = 0
        errors = 0
        total_fetched = 0

        for coll in colleges_to_query:
            print(f"Fetching courses from {coll or 'all colleges'}...")

            try:
                courses = client.get_courses(
                    tenant=coll,
                    query=query,
                    limit=per_college_limit
                )
                total_fetched += len(courses)

                for course in courses:
                    success, message = import_course(
                        session=session,
                        elumen_course=course,
                        department_map=dept_map,
                        default_user_id=default_user.id,
                        dry_run=dry_run
                    )

                    if success:
                        imported += 1
                        print(f"  [OK] {message}")
                    else:
                        if "already exists" in message:
                            skipped += 1
                            print(f"  [SKIP] {message}")
                        else:
                            errors += 1
                            print(f"  [ERR] {message}")

                    if limit and imported >= limit:
                        break

            except Exception as e:
                print(f"  [ERROR] Failed to fetch from {coll}: {e}")
                errors += 1

            if limit and imported >= limit:
                break

        # Commit changes
        if not dry_run:
            session.commit()

        # Summary
        print()
        print("=" * 60)
        print("  Summary")
        print("=" * 60)
        print(f"  Total fetched from API: {total_fetched}")
        print(f"  Imported: {imported}")
        print(f"  Skipped (duplicates): {skipped}")
        print(f"  Errors: {errors}")
        if dry_run:
            print()
            print("  ** DRY RUN - No changes were made **")

    client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Import courses and programs from eLumen API into Calricula database"
    )
    parser.add_argument(
        "--type", "-t",
        choices=["courses", "programs"],
        default="courses",
        help="Type of data to import: courses (default) or programs"
    )
    parser.add_argument(
        "--college", "-c",
        help="College abbreviation (e.g., LAMC, ELAC, LAPC)",
        default=""
    )
    parser.add_argument(
        "--query", "-q",
        help="Search query",
        default=""
    )
    parser.add_argument(
        "--limit", "-l",
        type=int,
        help="Maximum number of items to import",
        default=50
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Preview import without making changes"
    )
    parser.add_argument(
        "--all-colleges", "-a",
        action="store_true",
        help="Import from all LACCD colleges"
    )

    args = parser.parse_args()

    if args.type == "programs":
        seed_programs_from_elumen(
            college=args.college,
            query=args.query,
            limit=args.limit,
            dry_run=args.dry_run,
            all_colleges=args.all_colleges
        )
    else:
        seed_from_elumen(
            college=args.college,
            query=args.query,
            limit=args.limit,
            dry_run=args.dry_run,
            all_colleges=args.all_colleges
        )


if __name__ == "__main__":
    main()
