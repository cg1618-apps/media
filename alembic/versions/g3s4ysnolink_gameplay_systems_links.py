"""Move 玩法系統 Gameplay Systems links into the description

The section no longer declares a links field: a gameplay system is looked up
rather than sourced, like the glossary sections it shares a spec with, and a
write-up worth keeping belongs in 攻略資源 Guide Resources.

A row saved while the field existed would keep its URLs in a column no field
claims, and `_validate_structured` refuses that - so the row would read fine
and then 422 the first time anybody edited it, on a field they cannot see.
Clearing the column would lose the URLs, so each is appended to the row's
description, one per line, after whatever the description already said.

Revision ID: g3s4ysnolink
Revises: n1d2plscope3
Create Date: 2026-09-25 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g3s4ysnolink"
down_revision: Union[str, Sequence[str], None] = "n1d2plscope3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# A downgrade would have to tell a URL the migration appended from one
# somebody typed into a description, and after the first edit there is
# nothing to tell them apart by.
irreversible = True


def _as_list(raw):
    """A JSONB column comes back as a list or, on some drivers, as text."""
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    return raw if isinstance(raw, list) else []


def reshape(bind) -> None:
    """
    The migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    rows = bind.execute(
        sa.text(
            "SELECT system_id, content, links FROM note "
            "WHERE section = 'gameplay_systems' AND links IS NOT NULL"
        )
    ).fetchall()

    for row in rows:
        links = [
            link.strip()
            for link in _as_list(row.links)
            if isinstance(link, str) and link.strip()
        ]
        body = (row.content or "").strip()
        lines = ([body] if body else []) + links
        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, links = NULL "
                "WHERE system_id = :id"
            ),
            {"id": row.system_id, "content": "\n".join(lines) or None},
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above. The field coming back needs no schema change,
    # so this leaves the URLs where the upgrade put them.
    pass
