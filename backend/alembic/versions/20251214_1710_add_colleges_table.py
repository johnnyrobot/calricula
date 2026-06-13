"""Add colleges table

Revision ID: 5e72af981337
Revises: 4d54fe970226
Create Date: 2025-12-14 17:10:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '5e72af981337'
down_revision: Union[str, None] = '4d54fe970226'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create colleges table for LACCD institutions
    op.create_table('colleges',
        sa.Column('abbreviation', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('domain', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('elumen_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_colleges_abbreviation'), 'colleges', ['abbreviation'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_colleges_abbreviation'), table_name='colleges')
    op.drop_table('colleges')
