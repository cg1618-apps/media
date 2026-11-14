"""Statistics gets its own permission, view.statistics

`super`, `user` and `shared` are granted `view.statistics`, which their locks
hold on; `guest` and `admin` never are, which their locks hold off. Until now
the Statistics page opened on any ordinary `media_type.*`, which reached the
guest; the page and its catalogue counts now ask this key instead.

The boot seed enforces the same locks; doing it here puts the release's grant
change in one place. The permission and role names are frozen copies rather
than imported from app code - a migration importing app code breaks the day a
later revision changes what it imports.

The downgrade deletes every `view.statistics` row. Nothing was revoked on the
way up, so nothing has to be put back.

Revision ID: s1t2atistics3
Revises: o1r2iginal35
Create Date: 2026-11-14 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "s1t2atistics3"
down_revision: Union[str, Sequence[str], None] = "o1r2iginal35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATISTICS = "view.statistics"
HOLDERS = ("super", "user", "shared")


def apply_upgrade(conn) -> None:
    """Grant view.statistics to each holder role lacking it."""
    conn.execute(
        sa.text(
            "INSERT INTO role_permission (role_id, permission) "
            "SELECT r.system_id, :permission FROM role r "
            "WHERE r.name IN :names "
            "AND NOT EXISTS (SELECT 1 FROM role_permission x "
            "WHERE x.role_id = r.system_id AND x.permission = :permission)"
        ).bindparams(sa.bindparam("names", expanding=True)),
        {"permission": STATISTICS, "names": list(HOLDERS)},
    )


def apply_downgrade(conn) -> None:
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE permission = :permission"),
        {"permission": STATISTICS},
    )


def upgrade() -> None:
    apply_upgrade(op.get_bind())


def downgrade() -> None:
    apply_downgrade(op.get_bind())
