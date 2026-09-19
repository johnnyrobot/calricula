"""Key users by OIDC subject: users.firebase_uid -> users.auth_subject, add auth_issuer

ADR-0001 replaces Firebase Authentication with Logto (generic OIDC). The
identity column is renamed rather than dropped and recreated so every existing
row keeps its subject: a pre-migration row is left with auth_issuer NULL, which
POST /api/auth/login treats as "adoptable once, on a verified email match".

Revision ID: auth_subject_oidc
Revises: ws5b_ccn_vs_cid
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "auth_subject_oidc"
down_revision = "ws5b_ccn_vs_cid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Data-preserving rename. The unique index created for the old column keeps
    # its data but not its name, so rename it too -- otherwise a later
    # autogenerate would see ix_users_firebase_uid on an auth_subject column.
    op.alter_column("users", "firebase_uid", new_column_name="auth_subject")
    op.execute("ALTER INDEX ix_users_firebase_uid RENAME TO ix_users_auth_subject")

    op.add_column("users", sa.Column("auth_issuer", sa.String(), nullable=True))
    op.create_index("ix_users_auth_issuer", "users", ["auth_issuer"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_auth_issuer", table_name="users")
    op.drop_column("users", "auth_issuer")

    op.execute("ALTER INDEX ix_users_auth_subject RENAME TO ix_users_firebase_uid")
    op.alter_column("users", "auth_subject", new_column_name="firebase_uid")
