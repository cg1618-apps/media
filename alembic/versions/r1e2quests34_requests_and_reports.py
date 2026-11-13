"""Requests and reports: user_request, users.open_request_limit, two grants

Creates `user_request`, one row per request or report a member files. Both
account references are ON DELETE SET NULL, so a deleted account's requests
stay in the inbox. The target is an FK-less (type, id) pair, with the
target's name copied into target_label at filing.

Adds `users.open_request_limit` (NULL = no limit) and backfills 15 on every
account in the `user` role - that role's default. Everyone else stays NULL.

Grants `self.requests` to the `user` role and `manage.requests` to the
`super` role. `super` also gets `self.requests` from the lifespan's
_enforce_locks, since every permission but admin.authz is locked on for it;
it is granted here too so the database is right before the first start.

Raw SQL for the grants rather than ensure_rbac_seed: a migration importing
live ORM models breaks as soon as a later migration adds a column the model
declares.

The downgrade drops the table, the column and both grants. It loses every
request and every adjusted limit - not irreversible, but not lossless either.

Revision ID: r1e2quests34
Revises: v1i2ewperms34
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "r1e2quests34"
down_revision: Union[str, Sequence[str], None] = "v1i2ewperms34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "user_request"

# Frozen copies of REQUEST_KINDS / REQUEST_STATUSES as of this revision. A
# later change to either vocabulary is a later migration.
KINDS = ("new_entry", "data_error", "incomplete_data", "bug", "other")
STATUSES = ("open", "done", "declined")

# (role, permission) pairs this revision grants.
GRANTS = (
    ("user", "self.requests"),
    ("super", "self.requests"),
    ("super", "manage.requests"),
)

USER_DEFAULT_LIMIT = 15


def _one_of(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_label", sa.String(), nullable=True),
        sa.Column("page_path", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("handled_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_user_request_author",
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_user_request_handled_by",
        ),
        sa.CheckConstraint(_one_of("kind", KINDS), name="ck_user_request_kind"),
        sa.CheckConstraint(
            _one_of("status", STATUSES), name="ck_user_request_status"
        ),
        sa.CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="ck_user_request_target_pair",
        ),
    )
    op.create_index(f"ix_{TABLE}_system_id", TABLE, ["system_id"])
    op.create_index(f"ix_{TABLE}_author_status", TABLE, ["author_id", "status"])
    op.create_index(f"ix_{TABLE}_status_created", TABLE, ["status", "created_at"])

    op.add_column("users", sa.Column("open_request_limit", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_users_open_request_limit_non_negative",
        "users",
        "open_request_limit IS NULL OR open_request_limit >= 0",
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE users SET open_request_limit = :limit "
            "WHERE role_id IN (SELECT system_id FROM role WHERE name = 'user')"
        ),
        {"limit": USER_DEFAULT_LIMIT},
    )
    for role_name, permission in GRANTS:
        # Idempotent, and a no-op on a database the lifespan has never seeded:
        # ensure_rbac_seed creates the roles with these grants on first start.
        conn.execute(
            sa.text("""
                INSERT INTO role_permission (role_id, permission)
                SELECT r.system_id, :permission
                FROM role r
                WHERE r.name = :role_name
                  AND NOT EXISTS (
                      SELECT 1 FROM role_permission x
                      WHERE x.role_id = r.system_id AND x.permission = :permission
                  )
            """),
            {"role_name": role_name, "permission": permission},
        )


def downgrade() -> None:
    conn = op.get_bind()
    # From every role, not only the two granted above: no code before this
    # revision knows either name.
    conn.execute(
        sa.text(
            "DELETE FROM role_permission "
            "WHERE permission IN ('self.requests', 'manage.requests')"
        )
    )
    op.drop_constraint(
        "ck_users_open_request_limit_non_negative", "users", type_="check"
    )
    op.drop_column("users", "open_request_limit")
    op.drop_table(TABLE)
