"""Grant the view family to the user role

The four view.* permissions (view.entities, view.search, view.extras,
view.personal) gate the parts of the site a logged-out visitor does not see.
This installs them on the existing `user` role so a signed-in member keeps
reading everything they read before. `guest` is given nothing. `super` needs
no row here: the lifespan's _enforce_locks tops it up, because every
permission but admin.authz is locked on for it.

Raw SQL rather than ensure_rbac_seed: a migration importing live ORM models
breaks as soon as a later migration adds a column the model declares.

Downgrade deletes the four grants from every role, since no code before this
revision knows the names.

Revision ID: v1i2ewperms34
Revises: g1a2mevocab34
Create Date: 2026-10-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "v1i2ewperms34"
down_revision: Union[str, Sequence[str], None] = "g1a2mevocab34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VIEW_PERMISSIONS = ("view.entities", "view.search", "view.extras", "view.personal")


def grant_view_permissions(conn) -> None:
    """Give the `user` role the four keys it lacks. Idempotent."""
    values = ", ".join(f"('{p}')" for p in VIEW_PERMISSIONS)
    conn.execute(
        sa.text(f"""
            INSERT INTO role_permission (role_id, permission)
            SELECT u.system_id, p.permission
            FROM role u
            CROSS JOIN (VALUES {values}) AS p(permission)
            WHERE u.name = 'user'
              AND NOT EXISTS (
                  SELECT 1 FROM role_permission x
                  WHERE x.role_id = u.system_id AND x.permission = p.permission
              )
        """)
    )

    has_user = conn.execute(
        sa.text("SELECT COUNT(*) FROM role WHERE name = 'user'")
    ).scalar_one()
    if not has_user:
        # A database the lifespan has never seeded: ensure_rbac_seed creates
        # the role with these grants on first start.
        return
    granted = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM role_permission rp "
            "JOIN role r ON r.system_id = rp.role_id "
            "WHERE r.name = 'user' AND rp.permission LIKE 'view.%'"
        )
    ).scalar_one()
    if granted < len(VIEW_PERMISSIONS):
        raise RuntimeError(
            f"user role holds {granted} view.* grants after the upgrade; "
            f"expected {len(VIEW_PERMISSIONS)}"
        )


def revoke_view_permissions(conn) -> None:
    """Take the four keys off every role: no code before this revision names them."""
    names = ", ".join(f"'{p}'" for p in VIEW_PERMISSIONS)
    conn.execute(sa.text(f"DELETE FROM role_permission WHERE permission IN ({names})"))


def upgrade() -> None:
    grant_view_permissions(op.get_bind())


def downgrade() -> None:
    revoke_view_permissions(op.get_bind())
