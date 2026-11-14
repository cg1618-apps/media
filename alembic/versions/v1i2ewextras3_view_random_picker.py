"""The Random Picker gets its own permission, view.random_picker

1. `super`, `user` and `shared` are granted `view.random_picker`, which their
   locks hold on; `guest` never is, which its lock holds off. The boot seed
   enforces the same, and doing it here puts the release's grant change in one
   place.

Root roles store no grant rows and are skipped. The permission name is a
frozen copy rather than imported from app code - a migration importing app
code breaks the day a later revision changes what it imports.

The downgrade deletes every `view.random_picker` row.

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
HOLDERS = ("super", "user", "shared")


def grant_random_picker(conn) -> None:
    """Grant view.random_picker to the three holders that lack it."""
    conn.execute(
        sa.text(
            "INSERT INTO role_permission (role_id, permission) "
            "SELECT r.system_id, :permission FROM role r "
            "WHERE NOT r.is_root AND r.name IN :names "
            "AND NOT EXISTS (SELECT 1 FROM role_permission x "
            "WHERE x.role_id = r.system_id AND x.permission = :permission)"
        ).bindparams(sa.bindparam("names", expanding=True)),
        {"permission": RANDOM_PICKER, "names": list(HOLDERS)},
    )


def revoke_random_picker(conn) -> None:
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE permission = :permission"),
        {"permission": RANDOM_PICKER},
    )


def upgrade() -> None:
    grant_random_picker(op.get_bind())


def downgrade() -> None:
    revoke_random_picker(op.get_bind())
