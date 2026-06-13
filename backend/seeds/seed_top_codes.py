"""
Calricula - TOP Code Seed Data
Seeds official Taxonomy of Programs (TOP) codes from community colleges.
"""

import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.reference import TOPCode


# Official TOP codes from community colleges
SEED_TOP_CODES = [
    {
        "code": "1701.00",
        "title": "Mathematics, General",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "1501.00",
        "title": "English",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "0707.00",
        "title": "Computer Information Systems",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "0401.00",
        "title": "Biological Sciences",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "2001.00",
        "title": "Psychology, General",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "0505.00",
        "title": "Business Administration",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "1002.00",
        "title": "Art",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "2205.00",
        "title": "History",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "1905.00",
        "title": "Chemistry, General",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "1230.00",
        "title": "Nursing",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "1012.00",
        "title": "Applied Photography",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "0956.00",
        "title": "Manufacturing Technology",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "2101.00",
        "title": "Sociology",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "0835.00",
        "title": "Child Development/Early Care and Education",
        "is_vocational": True,
        "parent_code": None,
    },
    {
        "code": "1301.00",
        "title": "Communication Studies",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "1901.00",
        "title": "Physical Sciences, General",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "2202.00",
        "title": "Political Science",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "2203.00",
        "title": "Economics",
        "is_vocational": False,
        "parent_code": None,
    },
    {
        "code": "0502.00",
        "title": "Accounting",
        "is_vocational": True,
        "parent_code": "0505.00",
    },
    {
        "code": "0701.00",
        "title": "Information Technology, General",
        "is_vocational": True,
        "parent_code": None,
    },
]


def seed_top_codes():
    """
    Seed TOP codes into the database.
    """
    with Session(engine) as session:
        created_count = 0
        skipped_count = 0

        for top_data in SEED_TOP_CODES:
            # Check if TOP code already exists
            existing = session.exec(
                select(TOPCode).where(TOPCode.code == top_data["code"])
            ).first()

            if existing:
                print(f"  TOP code '{top_data['code']}' already exists, skipping")
                skipped_count += 1
                continue

            top_code = TOPCode(**top_data)
            session.add(top_code)
            voc = " (Vocational)" if top_data["is_vocational"] else ""
            print(f"  Created TOP code: {top_data['code']} - {top_data['title']}{voc}")
            created_count += 1

        session.commit()
        print(f"\nSeeded {created_count} TOP codes ({skipped_count} already existed)")


if __name__ == "__main__":
    print("Seeding TOP codes...")
    seed_top_codes()
    print("Done!")
