"""Add performance indexes for common queries

Revision ID: add_perf_indexes
Revises: add_notifications_table
Create Date: 2025-12-15 15:00:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_perf_indexes'
down_revision: Union[str, None] = 'add_notifications_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add indexes to optimize common query patterns:

    1. Courses table:
       - status: Filtered frequently in course list
       - updated_at: Used for ordering (most recently updated first)
       - department_id: Foreign key lookups and joins
       - created_by: Filter by course author
       - Composite (status, updated_at): Common filter + sort combination

    2. SLOs table:
       - course_id: Foreign key for eager loading
       - (course_id, sequence): Ordered retrieval

    3. Course Content table:
       - course_id: Foreign key for eager loading
       - (course_id, sequence): Ordered retrieval

    4. Course Requisites table:
       - course_id: Foreign key for eager loading
       - requisite_course_id: Foreign key joins

    5. Programs table:
       - Similar indexes for program queries

    6. Workflow History table:
       - entity_type + entity_id: Lookup history by course/program
    """

    # Courses table indexes
    op.create_index(
        'ix_courses_status',
        'courses',
        ['status'],
        unique=False
    )
    op.create_index(
        'ix_courses_updated_at',
        'courses',
        ['updated_at'],
        unique=False
    )
    op.create_index(
        'ix_courses_department_id',
        'courses',
        ['department_id'],
        unique=False
    )
    op.create_index(
        'ix_courses_created_by',
        'courses',
        ['created_by'],
        unique=False
    )
    # Composite index for common query pattern: filter by status, order by updated_at
    op.create_index(
        'ix_courses_status_updated_at',
        'courses',
        ['status', 'updated_at'],
        unique=False
    )

    # SLO table indexes
    op.create_index(
        'ix_slos_course_id',
        'student_learning_outcomes',
        ['course_id'],
        unique=False
    )
    op.create_index(
        'ix_slos_course_id_sequence',
        'student_learning_outcomes',
        ['course_id', 'sequence'],
        unique=False
    )

    # Course Content table indexes
    op.create_index(
        'ix_course_content_course_id',
        'course_content',
        ['course_id'],
        unique=False
    )
    op.create_index(
        'ix_course_content_course_id_sequence',
        'course_content',
        ['course_id', 'sequence'],
        unique=False
    )

    # Course Requisites table indexes
    op.create_index(
        'ix_course_requisites_course_id',
        'course_requisites',
        ['course_id'],
        unique=False
    )
    op.create_index(
        'ix_course_requisites_requisite_course_id',
        'course_requisites',
        ['requisite_course_id'],
        unique=False
    )

    # Programs table indexes (if exists)
    try:
        op.create_index(
            'ix_programs_status',
            'programs',
            ['status'],
            unique=False
        )
        op.create_index(
            'ix_programs_updated_at',
            'programs',
            ['updated_at'],
            unique=False
        )
        op.create_index(
            'ix_programs_department_id',
            'programs',
            ['department_id'],
            unique=False
        )
        op.create_index(
            'ix_programs_created_by',
            'programs',
            ['created_by'],
            unique=False
        )
    except Exception:
        # Programs table might not exist yet
        pass

    # Workflow History table indexes
    try:
        op.create_index(
            'ix_workflow_history_entity',
            'workflow_history',
            ['entity_type', 'entity_id'],
            unique=False
        )
        op.create_index(
            'ix_workflow_history_created_at',
            'workflow_history',
            ['created_at'],
            unique=False
        )
    except Exception:
        # Workflow history table might not exist
        pass

    # Comments table indexes
    try:
        op.create_index(
            'ix_comments_entity',
            'comments',
            ['entity_type', 'entity_id'],
            unique=False
        )
    except Exception:
        pass


def downgrade() -> None:
    """Remove all performance indexes."""

    # Drop in reverse order
    try:
        op.drop_index('ix_comments_entity', 'comments')
    except Exception:
        pass

    try:
        op.drop_index('ix_workflow_history_created_at', 'workflow_history')
        op.drop_index('ix_workflow_history_entity', 'workflow_history')
    except Exception:
        pass

    try:
        op.drop_index('ix_programs_created_by', 'programs')
        op.drop_index('ix_programs_department_id', 'programs')
        op.drop_index('ix_programs_updated_at', 'programs')
        op.drop_index('ix_programs_status', 'programs')
    except Exception:
        pass

    op.drop_index('ix_course_requisites_requisite_course_id', 'course_requisites')
    op.drop_index('ix_course_requisites_course_id', 'course_requisites')

    op.drop_index('ix_course_content_course_id_sequence', 'course_content')
    op.drop_index('ix_course_content_course_id', 'course_content')

    op.drop_index('ix_slos_course_id_sequence', 'student_learning_outcomes')
    op.drop_index('ix_slos_course_id', 'student_learning_outcomes')

    op.drop_index('ix_courses_status_updated_at', 'courses')
    op.drop_index('ix_courses_created_by', 'courses')
    op.drop_index('ix_courses_department_id', 'courses')
    op.drop_index('ix_courses_updated_at', 'courses')
    op.drop_index('ix_courses_status', 'courses')
