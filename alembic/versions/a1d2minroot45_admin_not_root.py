"""The admin stops being root

1. The `admin` role stores its fixed set as grant rows, as every other role
   does: `admin.authz`, `manage.pipelines`, `manage.requests`,
   `manage.announcements`, `manage.options`, `manage.images` and
   `manage.resources`, and nothing else. Any other row it holds is deleted.
2. `role.is_root` is dropped. Nothing short-circuits a permission check any
   more.
3. Every account on the `admin` role gets ceiling and default NULL: no
   mode, so it resolves the empty object set and reads no catalogue.
4. No data moves. Production's `cg1618` is already `super` and the
   installation owner, and the self family was never implicit for root. The
   migration LOGS any personal row owned by an `admin`-role account - list,
   plan, seasonal, novel unit ratings, game copies and marks, watch order
   follows, personal-scope notes - and leaves it, so the deploy log shows
   anything unexpected.

The grant list and the personal note sections are frozen copies rather than
imported from app code - a migration importing app code breaks the day a
later revision changes what it imports.

The downgrade restores `is_root` on `admin`, deletes the admin role's grant
rows (a root role stores none) and puts its accounts back at ceiling and
default `unrestricted`.

Revision ID: a1d2minroot45
Revises: s1w2itches345
Create Date: 2026-11-13 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1d2minroot45"
down_revision: Union[str, Sequence[str], None] = "s1w2itches345"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

ADMIN_ROLE = "admin"
ADMIN_GRANTS = (
    "admin.authz",
    "manage.pipelines",
    "manage.requests",
    "manage.announcements",
    "manage.options",
    "manage.images",
    "manage.resources",
)
# (table, the column naming its account) for every per-account table.
PERSONAL_TABLES = (
    ("user_media_list", "user_id"),
    ("plan_next", "user_id"),
    ("seasonal", "user_id"),
    ("user_novel_unit_rating", "user_id"),
    ("game_copy", "user_id"),
    ("game_choice_mark", "user_id"),
    ("watch_order_follow", "user_id"),
)
PERSONAL_NOTE_SECTIONS = (
    "advantages",
    "disadvantages",
    "double_edged",
    "episode_comments",
    "personal_reviews",
    "questions",
    "remark",
    "remark_list",
    "saves",
    "todo_later",
    "todo_maybe",
    "todo_next",
    "todo_now",
)

_ADMIN_ACCOUNTS = (
    "SELECT u.id FROM users u JOIN role r ON r.system_id = u.role_id "
    "WHERE r.name = :admin"
)


def _log_personal_rows(conn) -> None:
    for table, column in PERSONAL_TABLES:
        count = conn.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE {column} IN ({_ADMIN_ACCOUNTS})"),
            {"admin": ADMIN_ROLE},
        ).scalar()
        if count:
            logger.warning(
                "%s: %d %s row(s) belong to an admin-role account; left in place",
                revision,
                count,
                table,
            )
    notes = conn.execute(
        sa.text(
            f"SELECT count(*) FROM note WHERE author_id IN ({_ADMIN_ACCOUNTS}) "
            "AND section IN :sections"
        ).bindparams(sa.bindparam("sections", expanding=True)),
        {"admin": ADMIN_ROLE, "sections": list(PERSONAL_NOTE_SECTIONS)},
    ).scalar()
    if notes:
        logger.warning(
            "%s: %d personal-scope note(s) belong to an admin-role account; left in place",
            revision,
            notes,
        )


def upgrade() -> None:
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text("SELECT system_id FROM role WHERE name = :admin"), {"admin": ADMIN_ROLE}
    ).scalar()
    if admin_id is not None:
        conn.execute(
            sa.text(
                "DELETE FROM role_permission WHERE role_id = :role "
                "AND permission NOT IN :grants"
            ).bindparams(sa.bindparam("grants", expanding=True)),
            {"role": admin_id, "grants": list(ADMIN_GRANTS)},
        )
        for permission in ADMIN_GRANTS:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permission (role_id, permission) "
                    "SELECT :role, :permission WHERE NOT EXISTS ("
                    "SELECT 1 FROM role_permission "
                    "WHERE role_id = :role AND permission = :permission)"
                ),
                {"role": admin_id, "permission": permission},
            )
        conn.execute(
            sa.text(
                "UPDATE users SET mode_ceiling = NULL, mode_default = NULL "
                "WHERE role_id = :role"
            ),
            {"role": admin_id},
        )
        _log_personal_rows(conn)
    op.drop_column("role", "is_root")


def downgrade() -> None:
    op.add_column(
        "role",
        sa.Column("is_root", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text("SELECT system_id FROM role WHERE name = :admin"), {"admin": ADMIN_ROLE}
    ).scalar()
    if admin_id is None:
        return
    conn.execute(sa.text("UPDATE role SET is_root = true WHERE system_id = :role"), {"role": admin_id})
    conn.execute(sa.text("DELETE FROM role_permission WHERE role_id = :role"), {"role": admin_id})
    conn.execute(
        sa.text(
            "UPDATE users SET mode_ceiling = 'unrestricted', mode_default = 'unrestricted' "
            "WHERE role_id = :role"
        ),
        {"role": admin_id},
    )
