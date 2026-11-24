"""優點 / 缺點 / 優缺點 become mixed sections: every existing row is personal

The three pros-and-cons sections were personal-scope: each row was its
author's alone, which the section said rather than the row. They are now
mixed catalogue sections, where each row says its own kind in
`note.personal`, so every existing row is marked personal - its author keeps
it, and nobody else starts reading it.

Data only; no schema change. The downgrade clears the flag on every row of
the three sections, which is what a personal-scope section's rows carry. A
public row written since is then its author's own again: there is no public
kind to return it to.

Revision ID: p1r2oscons3
Revises: o1r2derren3
Create Date: 2026-11-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "p1r2oscons3"
down_revision: Union[str, Sequence[str], None] = "o1r2derren3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SECTIONS = "('advantages', 'disadvantages', 'double_edged')"


def upgrade() -> None:
    op.execute(f"UPDATE note SET personal = true WHERE section IN {SECTIONS}")


def downgrade() -> None:
    op.execute(f"UPDATE note SET personal = false WHERE section IN {SECTIONS}")
