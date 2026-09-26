"""Move guide-note links and h-game highlight locations into the description

攻略筆記 Guide Notes became plain text, and 亮點 Highlights on an h-game lost
its Location field for Audio, H 演出形式 and Art Style.

A guide note's links would sit in a column no editor shows. A highlight's
`fields.location` is worse: `_validate_structured` refuses a `fields` key the
section does not declare, so the row would read fine and then 422 the first
time anybody edited it, on a field they cannot see. Clearing either would lose
what somebody wrote, so each is appended to the row's description - the URLs
one per line, the location as a `Location:` line - after whatever the
description already said.

Revision ID: h6n7otesect8
Revises: h7v8oicecast9
Create Date: 2026-09-26 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h6n7otesect8"
down_revision: Union[str, Sequence[str], None] = "h7v8oicecast9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# A downgrade would have to tell a line the migration appended from one
# somebody typed into a description, and after the first edit there is
# nothing to tell them apart by.
irreversible = True


def _as_json(raw, kind):
    """A JSONB column comes back decoded or, on some drivers, as text."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return kind()
    return raw if isinstance(raw, kind) else kind()


def _append(content, lines):
    body = (content or "").strip()
    return "\n".join(([body] if body else []) + lines) or None


def reshape(bind) -> None:
    """
    The migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    notes = bind.execute(
        sa.text(
            "SELECT system_id, content, links FROM note "
            "WHERE section = 'guide_notes' AND links IS NOT NULL"
        )
    ).fetchall()
    for row in notes:
        links = [
            link.strip()
            for link in _as_json(row.links, list)
            if isinstance(link, str) and link.strip()
        ]
        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, links = NULL "
                "WHERE system_id = :id"
            ),
            {"id": row.system_id, "content": _append(row.content, links)},
        )

    highlights = bind.execute(
        sa.text(
            "SELECT system_id, content, fields FROM note "
            "WHERE section = 'h_game_highlights' AND fields ? 'location'"
        )
    ).fetchall()
    for row in highlights:
        fields = _as_json(row.fields, dict)
        location = fields.pop("location", None)
        location = location.strip() if isinstance(location, str) else ""
        lines = [f"Location: {location}"] if location else []
        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, "
                "fields = CAST(:fields AS JSONB) WHERE system_id = :id"
            ),
            {
                "id": row.system_id,
                "content": _append(row.content, lines),
                "fields": json.dumps(fields, ensure_ascii=False),
            },
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above. The fields coming back need no schema change,
    # so this leaves the text where the upgrade put it.
    pass
