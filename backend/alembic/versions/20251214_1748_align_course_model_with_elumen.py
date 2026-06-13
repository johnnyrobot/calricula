"""Align Course model with eLumen COR structure

Revision ID: a1b2c3d4e5f6
Revises: 5e72af981337
Create Date: 2025-12-14 17:48:00.000000+00:00

This migration aligns our Course model with the eLumen COR data structure:
- Adds variable unit support (minimum_units, maximum_units)
- Changes hours fields from Integer to Numeric for decimal precision
- Renames total_student_hours to total_student_learning_hours
- Adds outside_of_class_hours for separate homework/study tracking
- Adds top_code direct field (in addition to cb_codes JSON)
- Adds elumen_id for tracking source records
- Adds validation_type to course_requisites for Title 5 compliance
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5e72af981337'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum for requisite validation type
    requisite_validation_type = sa.Enum(
        'ContentReview', 'Statutory', 'Sequential', 'HealthSafety', 'Recency', 'Other',
        name='requisitevalidationtype'
    )
    requisite_validation_type.create(op.get_bind(), checkfirst=True)

    # Add new columns to courses table
    op.add_column('courses', sa.Column('minimum_units', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('courses', sa.Column('maximum_units', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('courses', sa.Column('outside_of_class_hours', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0'))
    op.add_column('courses', sa.Column('total_student_learning_hours', sa.Numeric(precision=6, scale=2), nullable=False, server_default='0'))
    op.add_column('courses', sa.Column('top_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('courses', sa.Column('elumen_id', sa.Integer(), nullable=True))

    # Create indexes for new columns
    op.create_index(op.f('ix_courses_top_code'), 'courses', ['top_code'], unique=False)
    op.create_index(op.f('ix_courses_elumen_id'), 'courses', ['elumen_id'], unique=False)

    # Migrate data: copy total_student_hours to total_student_learning_hours
    op.execute('UPDATE courses SET total_student_learning_hours = total_student_hours')

    # Change hours columns from Integer to Numeric (PostgreSQL allows this directly)
    # Note: Using ALTER COLUMN ... TYPE with USING for safe conversion
    op.execute('ALTER TABLE courses ALTER COLUMN lecture_hours TYPE NUMERIC(5,2) USING lecture_hours::numeric')
    op.execute('ALTER TABLE courses ALTER COLUMN lab_hours TYPE NUMERIC(5,2) USING lab_hours::numeric')
    op.execute('ALTER TABLE courses ALTER COLUMN activity_hours TYPE NUMERIC(5,2) USING activity_hours::numeric')
    op.execute('ALTER TABLE courses ALTER COLUMN tba_hours TYPE NUMERIC(5,2) USING tba_hours::numeric')

    # Drop old columns that are being replaced
    op.drop_column('courses', 'homework_hours')
    op.drop_column('courses', 'total_student_hours')

    # Add validation_type to course_requisites
    op.add_column('course_requisites', sa.Column(
        'validation_type',
        requisite_validation_type,
        nullable=True
    ))


def downgrade() -> None:
    # Remove validation_type from course_requisites
    op.drop_column('course_requisites', 'validation_type')

    # Re-add old columns
    op.add_column('courses', sa.Column('homework_hours', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('courses', sa.Column('total_student_hours', sa.Integer(), nullable=False, server_default='0'))

    # Migrate data back
    op.execute('UPDATE courses SET total_student_hours = total_student_learning_hours::integer')

    # Change hours columns back to Integer
    op.execute('ALTER TABLE courses ALTER COLUMN lecture_hours TYPE INTEGER USING lecture_hours::integer')
    op.execute('ALTER TABLE courses ALTER COLUMN lab_hours TYPE INTEGER USING lab_hours::integer')
    op.execute('ALTER TABLE courses ALTER COLUMN activity_hours TYPE INTEGER USING activity_hours::integer')
    op.execute('ALTER TABLE courses ALTER COLUMN tba_hours TYPE INTEGER USING tba_hours::integer')

    # Drop new indexes
    op.drop_index(op.f('ix_courses_elumen_id'), table_name='courses')
    op.drop_index(op.f('ix_courses_top_code'), table_name='courses')

    # Drop new columns
    op.drop_column('courses', 'elumen_id')
    op.drop_column('courses', 'top_code')
    op.drop_column('courses', 'total_student_learning_hours')
    op.drop_column('courses', 'outside_of_class_hours')
    op.drop_column('courses', 'maximum_units')
    op.drop_column('courses', 'minimum_units')

    # Drop the enum type
    sa.Enum(name='requisitevalidationtype').drop(op.get_bind(), checkfirst=True)
