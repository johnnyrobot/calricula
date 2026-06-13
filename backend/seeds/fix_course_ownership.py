"""
Calricula - Fix Course Ownership

This script updates the created_by field of existing courses to match
the seeded faculty users based on department. This fixes the 403
"You can only edit your own courses" error when logging in as seeded users.

Run with:
    python seeds/fix_course_ownership.py
"""

import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.course import Course
from app.models.department import Department
from app.models.user import User


def fix_course_ownership():
    """
    Update course ownership to match department faculty.

    This ensures that courses in each department are owned by the
    seeded faculty member in that department, allowing them to be
    edited when logged in as that faculty user.
    """
    with Session(engine) as session:
        # Build department lookup (dept_id -> dept_code)
        dept_id_to_code = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_id_to_code[dept.id] = dept.code

        # Build user lookup by department code
        user_by_dept = {}
        users = session.exec(select(User)).all()
        for user in users:
            if user.department_id and user.department_id in dept_id_to_code:
                dept_code = dept_id_to_code[user.department_id]
                user_by_dept[dept_code] = user

        # Get default user (MATH faculty or first user)
        default_user = user_by_dept.get("MATH") or (users[0] if users else None)
        if not default_user:
            print("ERROR: No users found. Run seed_users.py first.")
            return

        print(f"Found {len(user_by_dept)} department-specific faculty users:")
        for dept_code, user in user_by_dept.items():
            print(f"  {dept_code}: {user.full_name} ({user.email})")
        print(f"\nDefault user: {default_user.full_name} ({default_user.email})")

        # Update all courses
        courses = session.exec(select(Course)).all()
        updated_count = 0

        for course in courses:
            # Determine the appropriate owner
            dept_code = course.subject_code  # Subject code matches department code
            new_owner = user_by_dept.get(dept_code, default_user)

            if course.created_by != new_owner.id:
                old_owner_id = course.created_by
                course.created_by = new_owner.id
                updated_count += 1
                print(f"  Updated {course.subject_code} {course.course_number}: "
                      f"owner -> {new_owner.email}")

        session.commit()
        print(f"\nUpdated ownership for {updated_count} courses")


if __name__ == "__main__":
    print("Fixing course ownership...")
    print("=" * 50)
    fix_course_ownership()
    print("=" * 50)
    print("Done!")
