"""Initial schema with all models

Revision ID: 4d54fe970226
Revises:
Create Date: 2025-12-14 03:13:58.357095+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '4d54fe970226'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create tables without foreign keys first, then add FKs later

    # 1. Reference tables (no FKs)
    op.create_table('ccn_standards',
    sa.Column('c_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('discipline', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('descriptor', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('minimum_units', sa.Float(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('slo_requirements', sa.JSON(), nullable=True),
    sa.Column('content_requirements', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ccn_standards_c_id'), 'ccn_standards', ['c_id'], unique=False)
    op.create_index(op.f('ix_ccn_standards_discipline'), 'ccn_standards', ['discipline'], unique=False)

    op.create_table('top_codes',
    sa.Column('code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('is_vocational', sa.Boolean(), nullable=False),
    sa.Column('parent_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_top_codes_code'), 'top_codes', ['code'], unique=False)

    op.create_table('documents',
    sa.Column('entity_type', sa.Enum('COURSE', 'PROGRAM', name='entitytype'), nullable=False),
    sa.Column('entity_id', sa.Uuid(), nullable=False),
    sa.Column('filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('file_path', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('document_type', sa.Enum('CONTENT_REVIEW', 'SUPPORTING_DOC', 'EXPORT', name='documenttype'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )

    # 2. Divisions (first, no FK yet for dean_id)
    op.create_table('divisions',
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('dean_id', sa.Uuid(), nullable=True),  # FK added later
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_divisions_name'), 'divisions', ['name'], unique=False)

    # 3. Departments (references divisions)
    op.create_table('departments',
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('division_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['division_id'], ['divisions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_departments_code'), 'departments', ['code'], unique=False)
    op.create_index(op.f('ix_departments_name'), 'departments', ['name'], unique=False)

    # 4. Users (references departments)
    op.create_table('users',
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('role', sa.Enum('FACULTY', 'CURRICULUM_CHAIR', 'ARTICULATION_OFFICER', 'ADMIN', name='userrole'), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('firebase_uid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=False)
    op.create_index(op.f('ix_users_firebase_uid'), 'users', ['firebase_uid'], unique=True)

    # 5. Now add the FK from divisions.dean_id -> users.id
    op.create_foreign_key('fk_divisions_dean_id', 'divisions', 'users', ['dean_id'], ['id'])

    # 6. Comments (references users)
    op.create_table('comments',
    sa.Column('entity_type', sa.Enum('COURSE', 'PROGRAM', name='entitytype'), nullable=False),
    sa.Column('entity_id', sa.Uuid(), nullable=False),
    sa.Column('section', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('content', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('resolved', sa.Boolean(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # 7. Courses (references users and departments)
    op.create_table('courses',
    sa.Column('subject_code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('course_number', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('catalog_description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('units', sa.Numeric(precision=4, scale=2), nullable=False),
    sa.Column('lecture_hours', sa.Integer(), nullable=False),
    sa.Column('lab_hours', sa.Integer(), nullable=False),
    sa.Column('activity_hours', sa.Integer(), nullable=False),
    sa.Column('tba_hours', sa.Integer(), nullable=False),
    sa.Column('homework_hours', sa.Integer(), nullable=False),
    sa.Column('total_student_hours', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'DEPT_REVIEW', 'CURRICULUM_COMMITTEE', 'ARTICULATION_REVIEW', 'APPROVED', name='coursestatus'), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('effective_term', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('ccn_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=False),
    sa.Column('cb_codes', sa.JSON(), nullable=True),
    sa.Column('transferability', sa.JSON(), nullable=True),
    sa.Column('ge_applicability', sa.JSON(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_courses_course_number'), 'courses', ['course_number'], unique=False)
    op.create_index(op.f('ix_courses_subject_code'), 'courses', ['subject_code'], unique=False)

    # 8. Programs (references users and departments)
    op.create_table('programs',
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('type', sa.Enum('AA', 'AS', 'AAT', 'AST', 'CERTIFICATE', 'ADT', name='programtype'), nullable=False),
    sa.Column('catalog_description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('total_units', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'REVIEW', 'APPROVED', name='programstatus'), nullable=False),
    sa.Column('top_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('cip_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('program_narrative', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_programs_title'), 'programs', ['title'], unique=False)

    # 9. Workflow history
    op.create_table('workflow_history',
    sa.Column('entity_type', sa.Enum('COURSE', 'PROGRAM', name='entitytype'), nullable=False),
    sa.Column('entity_id', sa.Uuid(), nullable=False),
    sa.Column('from_status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('to_status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('comment', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('changed_by', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # 10. Tables depending on courses
    op.create_table('ai_chat_history',
    sa.Column('course_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('messages', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('course_content',
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('topic', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('subtopics', sa.JSON(), nullable=True),
    sa.Column('hours_allocated', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('linked_slos', sa.JSON(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('course_requisites',
    sa.Column('type', sa.Enum('PREREQUISITE', 'COREQUISITE', 'ADVISORY', name='requisitetype'), nullable=False),
    sa.Column('content_review', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('requisite_course_id', sa.Uuid(), nullable=True),
    sa.Column('requisite_text', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.ForeignKeyConstraint(['requisite_course_id'], ['courses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('cross_listings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('primary_course_id', sa.Uuid(), nullable=False),
    sa.Column('cross_listed_course_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['cross_listed_course_id'], ['courses.id'], ),
    sa.ForeignKeyConstraint(['primary_course_id'], ['courses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('program_courses',
    sa.Column('requirement_type', sa.Enum('REQUIRED_CORE', 'LIST_A', 'LIST_B', 'GE', name='requirementtype'), nullable=False),
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('units_applied', sa.Numeric(precision=4, scale=2), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('program_id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('rag_documents',
    sa.Column('filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('document_type', sa.Enum('SYLLABUS', 'TEXTBOOK', 'STANDARD', 'REGULATION', 'ADVISORY_NOTES', 'OTHER', name='ragdocumenttype'), nullable=False),
    sa.Column('file_size_bytes', sa.Integer(), nullable=False),
    sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('indexing_status', sa.Enum('PENDING', 'INDEXING', 'COMPLETED', 'FAILED', name='indexingstatus'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('file_search_document_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('file_search_store_name', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('department_id', sa.Uuid(), nullable=True),
    sa.Column('course_id', sa.Uuid(), nullable=True),
    sa.Column('uploaded_by', sa.Uuid(), nullable=False),
    sa.Column('custom_metadata', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('indexed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('student_learning_outcomes',
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('outcome_text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('bloom_level', sa.Enum('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', name='bloomlevel'), nullable=False),
    sa.Column('performance_criteria', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('course_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('student_learning_outcomes')
    op.drop_table('rag_documents')
    op.drop_table('program_courses')
    op.drop_table('cross_listings')
    op.drop_table('course_requisites')
    op.drop_table('course_content')
    op.drop_table('ai_chat_history')
    op.drop_table('workflow_history')
    op.drop_index(op.f('ix_programs_title'), table_name='programs')
    op.drop_table('programs')
    op.drop_index(op.f('ix_courses_subject_code'), table_name='courses')
    op.drop_index(op.f('ix_courses_course_number'), table_name='courses')
    op.drop_table('courses')
    op.drop_table('comments')
    op.drop_constraint('fk_divisions_dean_id', 'divisions', type_='foreignkey')
    op.drop_index(op.f('ix_users_firebase_uid'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_departments_name'), table_name='departments')
    op.drop_index(op.f('ix_departments_code'), table_name='departments')
    op.drop_table('departments')
    op.drop_index(op.f('ix_divisions_name'), table_name='divisions')
    op.drop_table('divisions')
    op.drop_table('documents')
    op.drop_index(op.f('ix_top_codes_code'), table_name='top_codes')
    op.drop_table('top_codes')
    op.drop_index(op.f('ix_ccn_standards_discipline'), table_name='ccn_standards')
    op.drop_index(op.f('ix_ccn_standards_c_id'), table_name='ccn_standards')
    op.drop_table('ccn_standards')
    # Drop enums
    sa.Enum(name='entitytype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='documenttype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='userrole').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='coursestatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='programtype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='programstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='requisitetype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='requirementtype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='ragdocumenttype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='indexingstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='bloomlevel').drop(op.get_bind(), checkfirst=True)
