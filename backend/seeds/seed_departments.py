"""
Calricula - Department and Division Seed Data
Seeds LAMC departments and their divisions.
"""

import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.department import Division, Department


# Division data
SEED_DIVISIONS = [
    {"name": "STEM"},
    {"name": "Liberal Arts"},
    {"name": "Social Sciences"},
    {"name": "Career Technical Education"},
    {"name": "Fine Arts"},
    {"name": "Health Sciences"},
]

# Department data with division mappings
SEED_DEPARTMENTS = [
    {"code": "MATH", "name": "Mathematics", "division_name": "STEM"},
    {"code": "ENGL", "name": "English", "division_name": "Liberal Arts"},
    {"code": "CS", "name": "Computer Science & Information Technology", "division_name": "STEM"},
    {"code": "BIOL", "name": "Biology", "division_name": "STEM"},
    {"code": "PSYCH", "name": "Psychology", "division_name": "Social Sciences"},
    {"code": "BUS", "name": "Business", "division_name": "Career Technical Education"},
    {"code": "ART", "name": "Art", "division_name": "Fine Arts"},
    {"code": "HIST", "name": "History", "division_name": "Social Sciences"},
    {"code": "CHEM", "name": "Chemistry", "division_name": "STEM"},
    {"code": "NURS", "name": "Nursing", "division_name": "Health Sciences"},
]


def seed_departments():
    """
    Seed divisions and departments into the database.
    """
    with Session(engine) as session:
        # First, seed divisions
        division_map = {}
        for div_data in SEED_DIVISIONS:
            # Check if division already exists
            existing = session.exec(
                select(Division).where(Division.name == div_data["name"])
            ).first()

            if existing:
                print(f"  Division '{div_data['name']}' already exists, skipping")
                division_map[div_data["name"]] = existing
            else:
                division = Division(**div_data)
                session.add(division)
                session.flush()  # Get the ID
                division_map[div_data["name"]] = division
                print(f"  Created division: {div_data['name']}")

        # Then, seed departments with division references
        for dept_data in SEED_DEPARTMENTS:
            # Check if department already exists
            existing = session.exec(
                select(Department).where(Department.code == dept_data["code"])
            ).first()

            if existing:
                print(f"  Department '{dept_data['code']}' already exists, skipping")
                continue

            # Get division ID
            division_name = dept_data.pop("division_name")
            division = division_map.get(division_name)

            if division:
                dept_data["division_id"] = division.id

            department = Department(**dept_data)
            session.add(department)
            print(f"  Created department: {dept_data['code']} - {dept_data['name']}")

        session.commit()
        print(f"\nSeeded {len(SEED_DIVISIONS)} divisions and {len(SEED_DEPARTMENTS)} departments")


if __name__ == "__main__":
    print("Seeding divisions and departments...")
    seed_departments()
    print("Done!")
