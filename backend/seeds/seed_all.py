"""
Calricula - Master Seed Script
Runs all seed scripts in the correct order to populate the database with test data.

Usage: python -m seeds.seed_all
"""

import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from seeds.seed_departments import seed_departments
from seeds.seed_users import seed_users
from seeds.seed_top_codes import seed_top_codes
from seeds.seed_ccn_standards import seed_ccn_standards
from seeds.seed_courses import seed_courses
from seeds.seed_programs import seed_programs
from seeds.seed_demo_data import seed_demo_data


def seed_all():
    """Run all seed scripts in order."""
    print("=" * 60)
    print("  Calricula - Database Seeding")
    print("=" * 60)
    print()

    try:
        # 1. Departments and Divisions (no dependencies, needed by users)
        print("1. Seeding departments and divisions...")
        seed_departments()
        print("   Done: Departments seeded")
        print()

        # 2. Users (depends on: departments)
        print("2. Seeding users...")
        seed_users()
        print("   Done: Users seeded")
        print()

        # 3. TOP Codes (no dependencies)
        print("3. Seeding TOP codes...")
        seed_top_codes()
        print("   Done: TOP codes seeded")
        print()

        # 4. CCN/C-ID Standards (no dependencies)
        print("4. Seeding CCN standards...")
        seed_ccn_standards()
        print("   Done: CCN standards seeded")
        print()

        # 5. Courses (depends on: departments, users)
        print("5. Seeding courses...")
        seed_courses()
        print("   Done: Courses seeded")
        print()

        # 6. Programs (depends on: departments, users, courses)
        print("6. Seeding programs...")
        seed_programs()
        print("   Done: Programs seeded")
        print()

        # 7. Demo data (depends on: users, departments, courses)
        print("7. Seeding demo user data...")
        seed_demo_data()
        print("   Done: Demo data seeded")
        print()

        print("=" * 60)
        print("  Seeding Complete!")
        print("=" * 60)
        print()
        print("Test Users (password: Test123!):")
        print("  demo@calricula.com         - Demo User (7 courses, notifications)")
        print("  faculty@calricula.com      - Faculty (MATH dept)")
        print("  faculty2@calricula.com     - Faculty (ENGL dept)")
        print("  faculty3@calricula.com     - Faculty (CS dept)")
        print("  chair@calricula.com        - Curriculum Chair")
        print("  articulation@calricula.com - Articulation Officer")
        print("  admin@calricula.com        - Admin")
        print()

    except Exception as e:
        print(f"Error during seeding: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    seed_all()
