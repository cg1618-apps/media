"""view.extras goes; the Random Picker gets its own permission, view.random_picker

1. `super`, `user` and `shared` are granted `view.random_picker`, which their
   locks hold on; `guest` and `admin` never are, which their locks hold off.
2. Every `view.extras` grant row is deleted. After the admin's pages moved to
   `manage.*` keys it gated only the Random Picker, Future Releases and
   Completions, and each now has its own gate: `view.random_picker`, any
   ordinary media type, and `self.list`. Permissions are not stored apart from
   their grant rows, so nothing else names it.

The boot seed enforces the same locks; doing it here puts the release's grant
change in one place. Every permission name is a frozen copy rather than
imported from app code - a migration importing app code breaks the day a later
revision changes what it imports.

The downgrade re-grants `view.extras` to `user` and `super` where they hold
`view.random_picker` - the two roles the earlier code seeded it on; `shared`
held it locked off - and deletes every `view.random_picker` row.

Revision ID: v1i2ewextras3
Revises: f1a2vourites3
Create Date: 2026-11-14 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v1i2ewextras3"
down_revision: Union[str, Sequence[str], None] = "f1a2vourites3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RANDOM_PICKER = "view.random_picker"
EXTRAS = "view.extras"
HOLDERS = ("super", "user", "shared")
EXTRAS_HOLDERS = ("super", "user")


def _grant(conn, permission, role_names, *, holding=None) -> None:
    """Grant `permission` to the named roles lacking it (and holding
    `holding`, when given)."""
    holding_clause = (
        "AND EXISTS (SELECT 1 FROM role_permission h "
        "WHERE h.role_id = r.system_id AND h.permission = :holding) "
        if holding
        else ""
    )
    conn.execute(
        sa.text(
            "INSERT INTO role_permission (role_id, permission) "
            "SELECT r.system_id, :permission FROM role r "
            "WHERE r.name IN :names "
            + holding_clause
            + "AND NOT EXISTS (SELECT 1 FROM role_permission x "
            "WHERE x.role_id = r.system_id AND x.permission = :permission)"
        ).bindparams(sa.bindparam("names", expanding=True)),
        {"permission": permission, "names": list(role_names), "holding": holding},
    )


def _revoke(conn, permission) -> None:
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE permission = :permission"),
        {"permission": permission},
    )


def apply_upgrade(conn) -> None:
    _grant(conn, RANDOM_PICKER, HOLDERS)
    _revoke(conn, EXTRAS)


def apply_downgrade(conn) -> None:
    _grant(conn, EXTRAS, EXTRAS_HOLDERS, holding=RANDOM_PICKER)
    _revoke(conn, RANDOM_PICKER)


def upgrade() -> None:
    apply_upgrade(op.get_bind())


def downgrade() -> None:
    apply_downgrade(op.get_bind())
