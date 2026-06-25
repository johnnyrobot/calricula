"""Add lmi_data JSONB columns to courses and programs

Revision ID: add_lmi_data_jsonb
Revises: a174c3ff1e19
Create Date: 2026-06-25 00:00:00.000000

WS-4 (backend hygiene): folds the runtime ``ALTER TABLE ... ADD COLUMN IF NOT
EXISTS lmi_data`` that used to run on every app startup
(``update_schema_for_lmi`` in app/core/database.py) into a proper Alembic
migration. Alembic is now the source of truth for this column.

The statements use ``IF NOT EXISTS`` so the migration is idempotent and safe to
apply to databases where the column was already created at runtime or by
``SQLModel.metadata.create_all`` (the Course/Program models declare ``lmi_data``).
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "add_lmi_data_jsonb"
down_revision = "a174c3ff1e19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS lmi_data JSONB DEFAULT '{}'"
    )
    op.execute(
        "ALTER TABLE programs ADD COLUMN IF NOT EXISTS lmi_data JSONB DEFAULT '{}'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE programs DROP COLUMN IF EXISTS lmi_data")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS lmi_data")
