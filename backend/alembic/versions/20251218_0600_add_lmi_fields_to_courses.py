"""Add LMI data fields to courses table

Revision ID: add_lmi_fields
Revises: add_perf_indexes
Create Date: 2025-12-18 06:00:00.000000

CUR-190: Add Labor Market Information fields to the Course model
for storing occupation data, wage statistics, and employment projections.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_lmi_fields'
down_revision = 'add_perf_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add LMI (Labor Market Information) fields to courses table
    op.add_column('courses', sa.Column('lmi_soc_code', sa.String(length=10), nullable=True))
    op.add_column('courses', sa.Column('lmi_occupation_title', sa.String(length=255), nullable=True))
    op.add_column('courses', sa.Column('lmi_area', sa.String(length=100), nullable=True))
    op.add_column('courses', sa.Column('lmi_retrieved_at', sa.DateTime(), nullable=True))
    op.add_column('courses', sa.Column('lmi_wage_data', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('courses', sa.Column('lmi_projection_data', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('courses', sa.Column('lmi_narrative', sa.Text(), nullable=True))

    # Add index on lmi_soc_code for faster lookups
    op.create_index('ix_courses_lmi_soc_code', 'courses', ['lmi_soc_code'], unique=False)


def downgrade() -> None:
    # Remove index first
    op.drop_index('ix_courses_lmi_soc_code', table_name='courses')

    # Remove LMI columns
    op.drop_column('courses', 'lmi_narrative')
    op.drop_column('courses', 'lmi_projection_data')
    op.drop_column('courses', 'lmi_wage_data')
    op.drop_column('courses', 'lmi_retrieved_at')
    op.drop_column('courses', 'lmi_area')
    op.drop_column('courses', 'lmi_occupation_title')
    op.drop_column('courses', 'lmi_soc_code')
