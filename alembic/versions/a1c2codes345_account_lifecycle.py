"""Account lifecycle: status, the session counter, one-time codes, self.password

  * users.status - pending / active / disabled, CHECK-constrained, default
    active. Every existing account is active.
  * users.session_version - the revocation counter a login token's `sv` claim
    is compared against. Every existing account starts at 0, which is what a
    token minted before the claim reads as, so nobody is signed out.
  * uq_users_username_lower - usernames unique without regard to case. Built
    only after a pre-check: two existing names that differ only in case would
    make the index fail with an opaque error, so the upgrade aborts first and
    names them. Rename one through /users and run it again.
  * account_code - the one-time codes behind reset (and later invite) links;
    only a SHA-256 of each code is stored.
  * self.password granted to `user` and `super`. Both have it locked on, so
    the lifespan's _enforce_locks would add it anyway; doing it here means the
    grant exists from the moment the schema does.

Raw SQL for the grant rather than ensure_rbac_seed: a migration importing
live ORM models breaks as soon as a later migration adds a column the model
declares.

The downgrade drops the table, the index and both columns, and takes
self.password off every role. Lossy only in what it drops: which accounts were
disabled, the counters, and every outstanding link.

Revision ID: a1c2codes345
Revises: v1i2ewperms34
Create Date: 2026-11-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1c2codes345"
down_revision: Union[str, Sequence[str], None] = "v1i2ewperms34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SELF_PASSWORD = "self.password"
GRANTED_TO = ("user", "super")


def assert_usernames_unique_ignoring_case(conn) -> None:
    """Abort, naming them, if two usernames differ only in case."""
    clashes = conn.execute(
        sa.text(
            "SELECT string_agg(username, ', ' ORDER BY username) "
            "FROM users GROUP BY lower(username) HAVING count(*) > 1"
        )
    ).scalars().all()
    if clashes:
        raise RuntimeError(
            "Cannot make usernames unique without regard to case: these "
            "accounts differ only in case - "
            + "; ".join(clashes)
            + ". Rename all but one of each group on /users, then upgrade again."
        )


def grant_self_password(conn) -> None:
    roles = ", ".join(f"'{name}'" for name in GRANTED_TO)
    conn.execute(
        sa.text(f"""
            INSERT INTO role_permission (role_id, permission)
            SELECT r.system_id, '{SELF_PASSWORD}'
            FROM role r
            WHERE r.name IN ({roles})
              AND NOT EXISTS (
                  SELECT 1 FROM role_permission x
                  WHERE x.role_id = r.system_id AND x.permission = '{SELF_PASSWORD}'
              )
        """)
    )


def upgrade() -> None:
    conn = op.get_bind()
    assert_usernames_unique_ignoring_case(conn)

    op.add_column(
        "users",
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
    )
    op.add_column(
        "users",
        sa.Column(
            "session_version", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.create_check_constraint(
        "ck_users_status", "users", "status IN ('pending', 'active', 'disabled')"
    )
    op.create_index(
        "uq_users_username_lower",
        "users",
        [sa.text("lower(username)")],
        unique=True,
    )

    op.create_table(
        "account_code",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("spent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE", name="fk_account_code_user"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_account_code_created_by",
        ),
        sa.UniqueConstraint("code_hash", name="account_code_code_hash_key"),
        sa.CheckConstraint(
            "purpose IN ('invite', 'reset')", name="ck_account_code_purpose"
        ),
        sa.CheckConstraint(
            "purpose <> 'reset' OR user_id IS NOT NULL",
            name="ck_account_code_reset_has_user",
        ),
    )
    op.create_index("ix_account_code_user_id", "account_code", ["user_id"])

    grant_self_password(conn)


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(f"DELETE FROM role_permission WHERE permission = '{SELF_PASSWORD}'")
    )
    op.drop_table("account_code")
    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_constraint("ck_users_status", "users", type_="check")
    op.drop_column("users", "session_version")
    op.drop_column("users", "status")
