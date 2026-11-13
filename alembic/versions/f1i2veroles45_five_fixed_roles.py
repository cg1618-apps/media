"""Exactly five fixed roles

The roles are `admin`, `super`, `user`, `guest` and `shared`, and nothing
creates or deletes one any more. This revision removes every other role:

  * a role holding no account is deleted (its `role_permission` rows go with
    it, by the foreign key's cascade);
  * a role still holding an account makes the upgrade RAISE, naming the role
    and how many accounts hold it, and nothing is deleted. Moving an account
    to another role is the admin's decision, made on /users, not something a
    deploy should guess.

Then drops `role.is_system`: every role is a system role, so the column says
nothing.

The `shared` role and the two shared accounts are not created here. The
lifespan seed creates them (app/services/rbac/seed.py), as it does the other
roles, because the API tests build their schema with create_all and never run
Alembic.

The five names are written out here as a frozen copy rather than imported
from permissions.ROLE_NAMES - a migration importing app code breaks the day a
later revision changes what it imports.

The downgrade re-adds `is_system`, true for every remaining role. A deleted
role is not restored; it held no account.

Revision ID: f1i2veroles45
Revises: m1c2eiling345
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1i2veroles45"
down_revision: Union[str, Sequence[str], None] = "m1c2eiling345"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLE_NAMES = ("admin", "super", "user", "guest", "shared")


def upgrade() -> None:
    conn = op.get_bind()
    held = conn.execute(
        sa.text(
            "SELECT r.name, count(u.id) FROM role r "
            "JOIN users u ON u.role_id = r.system_id "
            "WHERE r.name NOT IN :names "
            "GROUP BY r.name ORDER BY r.name"
        ).bindparams(sa.bindparam("names", expanding=True)),
        {"names": list(ROLE_NAMES)},
    ).all()
    if held:
        listed = ", ".join(f"{name!r} ({count} account(s))" for name, count in held)
        raise RuntimeError(
            "Only the roles admin, super, user, guest and shared remain, and "
            f"these roles still hold accounts: {listed}. Move those accounts "
            "to another role on /users, then deploy again. Nothing was changed."
        )

    conn.execute(
        sa.text("DELETE FROM role WHERE name NOT IN :names").bindparams(
            sa.bindparam("names", expanding=True)
        ),
        {"names": list(ROLE_NAMES)},
    )
    op.drop_column("role", "is_system")


def downgrade() -> None:
    op.add_column(
        "role",
        sa.Column(
            "is_system", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.execute("UPDATE role SET is_system = true")
