"""Add is_high_unit_major to programs table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2025-12-14 22:10:00.000000+00:00

Adds is_high_unit_major boolean field to programs table.
This allows programs that exceed the 60-unit limit (like nursing, engineering)
to be marked as "High Unit Majors" to dismiss the warning.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_high_unit_major column to programs table
    op.add_column('programs', sa.Column(
        'is_high_unit_major',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))


def downgrade() -> None:
    # Remove is_high_unit_major column
    op.drop_column('programs', 'is_high_unit_major')
