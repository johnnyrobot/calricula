"""add_ccn_extended_fields

Revision ID: a174c3ff1e19
Revises: add_lmi_fields
Create Date: 2025-12-19 18:33:24.030952+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a174c3ff1e19'
down_revision: Union[str, None] = 'add_lmi_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create CCN Non-Match Justifications table (CUR-212)
    op.create_table('ccn_non_match_justifications',
        sa.Column('reason_code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('justification_text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('id', sqlmodel.sql.sqltypes.GUID(), nullable=False),
        sa.Column('course_id', sqlmodel.sql.sqltypes.GUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id')
    )
    op.create_index('ix_ccn_non_match_justifications_reason_code', 'ccn_non_match_justifications', ['reason_code'])

    # Add new columns to ccn_standards table (CUR-211)
    op.add_column('ccn_standards', sa.Column('subject_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('course_number', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('prerequisites', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('corequisites', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('evaluation_methods', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('is_honors', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('ccn_standards', sa.Column('is_lab_only', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('ccn_standards', sa.Column('is_support_course', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('ccn_standards', sa.Column('has_embedded_support', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('ccn_standards', sa.Column('implied_cb05', sqlmodel.sql.sqltypes.AutoString(), nullable=True, server_default='A'))
    op.add_column('ccn_standards', sa.Column('implied_top_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('source_file', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ccn_standards', sa.Column('approved_date', sa.DateTime(), nullable=True))
    op.add_column('ccn_standards', sa.Column('objectives', sa.JSON(), nullable=True, server_default='[]'))
    op.add_column('ccn_standards', sa.Column('representative_texts', sa.JSON(), nullable=True, server_default='[]'))
    op.add_column('ccn_standards', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Drop new ccn_standards columns
    op.drop_column('ccn_standards', 'updated_at')
    op.drop_column('ccn_standards', 'representative_texts')
    op.drop_column('ccn_standards', 'objectives')
    op.drop_column('ccn_standards', 'approved_date')
    op.drop_column('ccn_standards', 'source_file')
    op.drop_column('ccn_standards', 'implied_top_code')
    op.drop_column('ccn_standards', 'implied_cb05')
    op.drop_column('ccn_standards', 'has_embedded_support')
    op.drop_column('ccn_standards', 'is_support_course')
    op.drop_column('ccn_standards', 'is_lab_only')
    op.drop_column('ccn_standards', 'is_honors')
    op.drop_column('ccn_standards', 'evaluation_methods')
    op.drop_column('ccn_standards', 'corequisites')
    op.drop_column('ccn_standards', 'prerequisites')
    op.drop_column('ccn_standards', 'course_number')
    op.drop_column('ccn_standards', 'subject_code')

    # Drop ccn_non_match_justifications table
    op.drop_index('ix_ccn_non_match_justifications_reason_code', 'ccn_non_match_justifications')
    op.drop_table('ccn_non_match_justifications')
