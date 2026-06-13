"""
Calricula - User Seed Data
Seeds test users for each role in the system.
"""

import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.user import User, UserRole
from app.models.department import Department


# Test users data - firebase_uid is a placeholder since actual Firebase users
# must be created separately via Firebase Console
SEED_USERS = [
    {
        "email": "faculty@calricula.com",
        "full_name": "Dr. Maria Garcia",
        "role": UserRole.FACULTY,
        "department_code": "MATH",
        "firebase_uid": "test_faculty_001",
    },
    {
        "email": "faculty2@calricula.com",
        "full_name": "Prof. James Chen",
        "role": UserRole.FACULTY,
        "department_code": "ENGL",
        "firebase_uid": "test_faculty_002",
    },
    {
        "email": "faculty3@calricula.com",
        "full_name": "Dr. Sarah Johnson",
        "role": UserRole.FACULTY,
        "department_code": "CS",
        "firebase_uid": "test_faculty_003",
    },
    {
        "email": "chair@calricula.com",
        "full_name": "Dr. Robert Williams",
        "role": UserRole.CURRICULUM_CHAIR,
        "department_code": None,
        "firebase_uid": "test_chair_001",
    },
    {
        "email": "articulation@calricula.com",
        "full_name": "Ms. Lisa Thompson",
        "role": UserRole.ARTICULATION_OFFICER,
        "department_code": None,
        "firebase_uid": "test_articulation_001",
    },
    {
        "email": "admin@calricula.com",
        "full_name": "Mr. David Martinez",
        "role": UserRole.ADMIN,
        "department_code": None,
        "firebase_uid": "test_admin_001",
    },
    {
        "email": "demo@calricula.com",
        "full_name": "Demo User",
        "role": UserRole.FACULTY,
        "department_code": None,  # General faculty, no specific department
        "firebase_uid": "test_demo_001",
    },
]


def seed_users():
    """
    Seed test users into the database.

    Note: This creates user records in the database. The actual Firebase
    authentication users must be created separately via Firebase Console
    or the Firebase Admin SDK.

    Password for all test users: Test123!
    """
    with Session(engine) as session:
        # Build department lookup
        dept_map = {}
        departments = session.exec(select(Department)).all()
        for dept in departments:
            dept_map[dept.code] = dept.id

        for user_data in SEED_USERS:
            # Check if user already exists
            existing = session.exec(
                select(User).where(User.email == user_data["email"])
            ).first()

            if existing:
                print(f"  User '{user_data['email']}' already exists, skipping")
                continue

            # Get department ID if specified
            dept_code = user_data.pop("department_code")
            if dept_code and dept_code in dept_map:
                user_data["department_id"] = dept_map[dept_code]

            user = User(**user_data)
            session.add(user)
            print(f"  Created user: {user_data['email']} ({user_data['role'].value})")

        session.commit()
        print(f"\nSeeded {len(SEED_USERS)} users")


if __name__ == "__main__":
    print("Seeding users...")
    print("NOTE: Run seed_departments.py first to create department references")
    seed_users()
    print("Done!")
