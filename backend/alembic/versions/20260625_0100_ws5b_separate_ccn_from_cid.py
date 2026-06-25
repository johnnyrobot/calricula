"""WS-5b: model CCN (AB 1111) distinct from legacy C-ID

Revision ID: ws5b_ccn_vs_cid
Revises: add_lmi_data_jsonb
Create Date: 2026-06-25 01:00:00.000000

The columns previously named ``ccn_id`` (on ``courses``) and ``c_id`` (on
``ccn_standards``) actually hold AB 1111 Common Course Numbering (CCN) codes
(format ``SUBJ C####``), not legacy C-ID identifiers. This migration:

  * renames ``courses.ccn_id``        -> ``courses.ccn_code``   (CCN data)
  * renames ``ccn_standards.c_id``    -> ``ccn_standards.ccn_code`` (CCN data)
  * adds    ``courses.c_id`` (nullable) for the genuinely-distinct legacy C-ID
    (Course Identification Numbering System, format ``SUBJ ###``).

Renames use ``ALTER COLUMN ... RENAME`` (non-destructive; data is preserved).

Note: CI/conftest build the schema from SQLModel metadata via ``create_all``
(not Alembic), so the model field renames are what make the test schema correct;
this migration brings real deployed databases in line with that schema.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "ws5b_ccn_vs_cid"
down_revision = "add_lmi_data_jsonb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # courses.ccn_id -> courses.ccn_code (holds CCN codes)
    op.alter_column(
        "courses",
        "ccn_id",
        new_column_name="ccn_code",
        existing_type=sa.String(),
        existing_nullable=True,
    )

    # New, distinct legacy C-ID column on courses (nullable).
    op.add_column(
        "courses",
        sa.Column("c_id", sa.String(), nullable=True),
    )

    # ccn_standards.c_id -> ccn_standards.ccn_code (holds CCN codes)
    op.alter_column(
        "ccn_standards",
        "c_id",
        new_column_name="ccn_code",
        existing_type=sa.String(),
        existing_nullable=False,
    )


def downgrade() -> None:
    # Reverse of upgrade().
    op.alter_column(
        "ccn_standards",
        "ccn_code",
        new_column_name="c_id",
        existing_type=sa.String(),
        existing_nullable=False,
    )

    op.drop_column("courses", "c_id")

    op.alter_column(
        "courses",
        "ccn_code",
        new_column_name="ccn_id",
        existing_type=sa.String(),
        existing_nullable=True,
    )
