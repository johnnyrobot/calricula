#!/usr/bin/env python3
"""
Calricula - eLumen Course Comparison Tool
==========================================

Compares local database courses with their eLumen counterparts to identify
differences and optionally sync updates.

Usage:
    # Compare a specific course
    python scripts/compare_elumen.py MATH 101 --college LAMC

    # Compare with JSON output
    python scripts/compare_elumen.py MATH 101 --college LAMC --json

    # Preview sync (dry run)
    python scripts/compare_elumen.py MATH 101 --college LAMC --sync --dry-run

    # Actually sync from eLumen
    python scripts/compare_elumen.py MATH 101 --college LAMC --sync

    # Compare all courses from a college
    python scripts/compare_elumen.py --college LAMC --all

    # Show detailed field comparison
    python scripts/compare_elumen.py MATH 101 --college LAMC --verbose
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.course import Course, StudentLearningOutcome, CourseContent
from app.models.department import Department
from app.services.elumen_client import SynceLumenClient, CourseResponse, ABBREV_TENANT_MAP


# ANSI colors for terminal output
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'


@dataclass
class FieldDiff:
    """Represents a difference in a single field."""
    field_name: str
    local_value: Any
    elumen_value: Any
    is_significant: bool = True

    def __str__(self) -> str:
        return f"{self.field_name}: local='{self.local_value}' | elumen='{self.elumen_value}'"


@dataclass
class ComparisonResult:
    """Results of comparing a local course with eLumen."""
    subject_code: str
    course_number: str
    local_id: Optional[str] = None
    elumen_id: Optional[int] = None
    local_found: bool = False
    elumen_found: bool = False
    is_match: bool = False
    differences: list[FieldDiff] = field(default_factory=list)
    local_title: Optional[str] = None
    elumen_title: Optional[str] = None

    @property
    def has_significant_differences(self) -> bool:
        return any(d.is_significant for d in self.differences)

    def to_dict(self) -> dict:
        return {
            "subject_code": self.subject_code,
            "course_number": self.course_number,
            "local_id": self.local_id,
            "elumen_id": self.elumen_id,
            "local_found": self.local_found,
            "elumen_found": self.elumen_found,
            "is_match": self.is_match,
            "local_title": self.local_title,
            "elumen_title": self.elumen_title,
            "differences": [
                {
                    "field": d.field_name,
                    "local": str(d.local_value),
                    "elumen": str(d.elumen_value),
                    "significant": d.is_significant,
                }
                for d in self.differences
            ],
        }


def normalize_value(value: Any) -> str:
    """Normalize a value for comparison."""
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(float(value))
    if isinstance(value, float):
        return str(value)
    return str(value).strip()


def get_elumen_lecture_hours(e: CourseResponse) -> Optional[float]:
    """Get lecture hours from eLumen course."""
    if e.full_course_info and e.full_course_info.credits_and_hours:
        ch = e.full_course_info.credits_and_hours[0]
        return ch.lecture_hours
    return None


def get_elumen_lab_hours(e: CourseResponse) -> Optional[float]:
    """Get lab hours from eLumen course."""
    if e.full_course_info and e.full_course_info.credits_and_hours:
        ch = e.full_course_info.credits_and_hours[0]
        return ch.lab_hours
    return None


def compare_fields(
    local_course: Course,
    elumen_course: CourseResponse,
    verbose: bool = False
) -> list[FieldDiff]:
    """Compare fields between local and eLumen course."""
    differences = []

    # Map eLumen fields to local fields
    field_mappings = [
        # (field_name, local_getter, elumen_getter, is_significant)
        ("title", lambda c: c.title, lambda e: e.name, True),
        ("catalog_description", lambda c: c.catalog_description, lambda e: e.description, True),
        ("units", lambda c: c.units, lambda e: e.units, True),
        ("lecture_hours", lambda c: c.lecture_hours, get_elumen_lecture_hours, False),
        ("lab_hours", lambda c: c.lab_hours, get_elumen_lab_hours, False),
        ("top_code", lambda c: c.top_code, lambda e: e.top_code, True),
    ]

    for field_name, local_getter, elumen_getter, is_significant in field_mappings:
        try:
            local_val = normalize_value(local_getter(local_course))
            elumen_val = normalize_value(elumen_getter(elumen_course))

            if local_val != elumen_val:
                differences.append(FieldDiff(
                    field_name=field_name,
                    local_value=local_val or "(empty)",
                    elumen_value=elumen_val or "(empty)",
                    is_significant=is_significant,
                ))
        except Exception as e:
            if verbose:
                print(f"  Warning: Could not compare {field_name}: {e}")

    # Compare SLO count
    local_slo_count = len(local_course.slos) if local_course.slos else 0
    elumen_outcomes = []
    if elumen_course.full_course_info:
        elumen_outcomes = elumen_course.full_course_info.outcomes or []
    elumen_slo_count = len(elumen_outcomes)
    if local_slo_count != elumen_slo_count:
        differences.append(FieldDiff(
            field_name="slo_count",
            local_value=local_slo_count,
            elumen_value=elumen_slo_count,
            is_significant=True,
        ))

    # Compare content count (objectives in eLumen map to content items)
    local_content_count = len(local_course.content_items) if local_course.content_items else 0
    elumen_objectives = []
    if elumen_course.full_course_info:
        elumen_objectives = elumen_course.full_course_info.objectives or []
    if local_content_count != len(elumen_objectives):
        differences.append(FieldDiff(
            field_name="content_count",
            local_value=local_content_count,
            elumen_value=len(elumen_objectives),
            is_significant=False,
        ))

    return differences


def get_local_course(session: Session, subject: str, number: str) -> Optional[Course]:
    """Find a course in the local database by subject and number."""
    statement = select(Course).where(
        Course.subject_code == subject.upper(),
        Course.course_number == number
    )
    result = session.exec(statement).first()
    return result


def get_elumen_course(client: SynceLumenClient, subject: str, number: str, tenant: str = "") -> Optional[CourseResponse]:
    """Find a course in eLumen by subject and number."""
    # Use the built-in method first
    course = client.get_course_by_code(subject, number, tenant)
    if course:
        return course

    # Fallback: search with different query patterns
    query = f"{subject} {number}"
    courses = client.get_courses(query=query, tenant=tenant, limit=20)

    # Find exact match
    for course in courses:
        if course.subject.upper() == subject.upper() and course.number == number:
            return course

    return None


def compare_course(
    subject: str,
    number: str,
    college: str = "",
    verbose: bool = False,
) -> ComparisonResult:
    """Compare a single course between local DB and eLumen."""
    result = ComparisonResult(
        subject_code=subject.upper(),
        course_number=number,
    )

    # Get tenant from college abbreviation
    tenant = ABBREV_TENANT_MAP.get(college.upper(), "") if college else ""

    # Create eLumen client
    client = SynceLumenClient()

    # Find in eLumen
    elumen_course = get_elumen_course(client, subject, number, tenant)
    if elumen_course:
        result.elumen_found = True
        result.elumen_id = elumen_course.id
        result.elumen_title = elumen_course.name

    # Find in local database
    with Session(engine) as session:
        local_course = get_local_course(session, subject, number)
        if local_course:
            result.local_found = True
            result.local_id = str(local_course.id)
            result.local_title = local_course.title

            # Compare if both found
            if elumen_course:
                result.differences = compare_fields(local_course, elumen_course, verbose)
                result.is_match = len(result.differences) == 0

    return result


def sync_from_elumen(
    subject: str,
    number: str,
    college: str = "",
    dry_run: bool = True,
) -> tuple[bool, list[str]]:
    """
    Sync a local course from eLumen.

    Returns:
        Tuple of (success, list of changes made/would be made)
    """
    changes = []
    tenant = ABBREV_TENANT_MAP.get(college.upper(), "") if college else ""

    client = SynceLumenClient()
    elumen_course = get_elumen_course(client, subject, number, tenant)

    if not elumen_course:
        return False, ["Course not found in eLumen"]

    with Session(engine) as session:
        local_course = get_local_course(session, subject, number)

        if not local_course:
            return False, ["Course not found in local database"]

        # Update fields
        if local_course.title != elumen_course.name:
            changes.append(f"title: '{local_course.title}' -> '{elumen_course.name}'")
            if not dry_run:
                local_course.title = elumen_course.name

        if normalize_value(local_course.catalog_description) != normalize_value(elumen_course.course_description):
            changes.append(f"catalog_description: updated from eLumen")
            if not dry_run:
                local_course.catalog_description = elumen_course.course_description

        elumen_units = Decimal(str(elumen_course.units)) if elumen_course.units else None
        if elumen_units and local_course.units != elumen_units:
            changes.append(f"units: {local_course.units} -> {elumen_units}")
            if not dry_run:
                local_course.units = elumen_units

        if elumen_course.top_code and local_course.top_code != elumen_course.top_code:
            changes.append(f"top_code: '{local_course.top_code}' -> '{elumen_course.top_code}'")
            if not dry_run:
                local_course.top_code = elumen_course.top_code

        if not dry_run and changes:
            session.add(local_course)
            session.commit()

    return True, changes


def print_comparison_result(result: ComparisonResult, verbose: bool = False) -> None:
    """Print comparison result to terminal."""
    course_code = f"{result.subject_code} {result.course_number}"

    print(f"\n{Colors.BOLD}Course: {course_code}{Colors.END}")
    print("-" * 50)

    # Status
    if not result.local_found and not result.elumen_found:
        print(f"  {Colors.RED}Not found in either system{Colors.END}")
        return

    if not result.local_found:
        print(f"  {Colors.YELLOW}Not in local database{Colors.END}")
        print(f"  eLumen: {result.elumen_title} (ID: {result.elumen_id})")
        return

    if not result.elumen_found:
        print(f"  {Colors.YELLOW}Not found in eLumen{Colors.END}")
        print(f"  Local: {result.local_title} (ID: {result.local_id})")
        return

    # Both found - show comparison
    print(f"  Local:  {result.local_title}")
    print(f"  eLumen: {result.elumen_title}")

    if result.is_match:
        print(f"\n  {Colors.GREEN}✓ Courses match!{Colors.END}")
    else:
        sig_diffs = [d for d in result.differences if d.is_significant]
        minor_diffs = [d for d in result.differences if not d.is_significant]

        if sig_diffs:
            print(f"\n  {Colors.RED}Significant differences ({len(sig_diffs)}):{Colors.END}")
            for diff in sig_diffs:
                print(f"    • {Colors.CYAN}{diff.field_name}{Colors.END}:")
                print(f"      Local:  {diff.local_value}")
                print(f"      eLumen: {diff.elumen_value}")

        if minor_diffs and verbose:
            print(f"\n  {Colors.YELLOW}Minor differences ({len(minor_diffs)}):{Colors.END}")
            for diff in minor_diffs:
                print(f"    • {diff.field_name}: {diff.local_value} -> {diff.elumen_value}")


def main():
    parser = argparse.ArgumentParser(
        description="Compare local courses with eLumen and optionally sync.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/compare_elumen.py MATH 101 --college LAMC
  python scripts/compare_elumen.py MATH 101 --college LAMC --sync --dry-run
  python scripts/compare_elumen.py MATH 101 --college LAMC --json
        """
    )

    parser.add_argument("subject", nargs="?", help="Subject code (e.g., MATH)")
    parser.add_argument("number", nargs="?", help="Course number (e.g., 101)")
    parser.add_argument("--college", "-c", default="", help="College abbreviation (e.g., LAMC)")
    parser.add_argument("--sync", action="store_true", help="Sync local course from eLumen")
    parser.add_argument("--dry-run", action="store_true", help="Preview sync without making changes")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show detailed comparison")
    parser.add_argument("--all", action="store_true", help="Compare all local courses")

    args = parser.parse_args()

    # Validate arguments
    if not args.all and (not args.subject or not args.number):
        parser.error("Please provide SUBJECT and NUMBER, or use --all")

    if args.all:
        # Compare all local courses
        results = []
        with Session(engine) as session:
            statement = select(Course)
            if args.college:
                # Filter by college via department
                tenant = ABBREV_TENANT_MAP.get(args.college.upper(), "")
                # This would need department filtering - simplified for now

            courses = session.exec(statement).all()

            print(f"Comparing {len(courses)} local courses...")

            for course in courses:
                result = compare_course(
                    course.subject_code,
                    course.course_number,
                    args.college,
                    args.verbose
                )
                results.append(result)

                if not args.json:
                    if result.has_significant_differences:
                        print(f"  {Colors.RED}✗{Colors.END} {course.subject_code} {course.course_number}")
                    elif result.elumen_found and result.is_match:
                        print(f"  {Colors.GREEN}✓{Colors.END} {course.subject_code} {course.course_number}")
                    elif not result.elumen_found:
                        print(f"  {Colors.YELLOW}?{Colors.END} {course.subject_code} {course.course_number} (not in eLumen)")

        if args.json:
            print(json.dumps([r.to_dict() for r in results], indent=2))
        else:
            # Summary
            matched = sum(1 for r in results if r.is_match)
            different = sum(1 for r in results if r.has_significant_differences)
            not_found = sum(1 for r in results if not r.elumen_found)

            print(f"\n{Colors.BOLD}Summary:{Colors.END}")
            print(f"  {Colors.GREEN}Matched:{Colors.END} {matched}")
            print(f"  {Colors.RED}Different:{Colors.END} {different}")
            print(f"  {Colors.YELLOW}Not in eLumen:{Colors.END} {not_found}")

        return

    # Single course comparison
    if args.sync:
        success, changes = sync_from_elumen(
            args.subject,
            args.number,
            args.college,
            args.dry_run
        )

        if args.json:
            print(json.dumps({
                "success": success,
                "dry_run": args.dry_run,
                "changes": changes
            }, indent=2))
        else:
            action = "Would sync" if args.dry_run else "Synced"
            if success:
                if changes:
                    print(f"\n{Colors.GREEN}{action} {args.subject} {args.number}:{Colors.END}")
                    for change in changes:
                        print(f"  • {change}")
                else:
                    print(f"\n{Colors.GREEN}No changes needed for {args.subject} {args.number}{Colors.END}")
            else:
                print(f"\n{Colors.RED}Sync failed: {changes[0] if changes else 'Unknown error'}{Colors.END}")
    else:
        result = compare_course(args.subject, args.number, args.college, args.verbose)

        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print_comparison_result(result, args.verbose)


if __name__ == "__main__":
    main()
