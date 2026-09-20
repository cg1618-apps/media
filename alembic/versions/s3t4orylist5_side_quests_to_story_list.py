"""Move 支線任務列表 Side Quests into the 劇情列表 Story List group

A side quest is a strand of the story rather than a guide topic, so
`side_quests` is retired and its rows become `story_list_side` entries. The
section was held back from the guides reshape for exactly this reason: there
was nowhere for its rows to go until this group existed, and retiring it then
would have meant deleting them.

The shape changes as well as the key. `side_quests` was `name_entries` - a
title plus one ordered array of text lines and labelled links - and a Story
List entry is `structured`: an order number, a name, a description and links.
So the title becomes the name, the text items become the description one per
line, and the link items become links, exactly as the guides reshape mapped
its ten sections. Nothing gets an order number: the old shape had nowhere to
put one, so inventing one here would be inventing data. `sort_index` carries
the order they were already in.

Nothing gains a parent either. Every migrated row lands at the top level,
which is where a flat list belongs; nesting is something the reader does
afterwards.

One case needs more than the guides mapping. A Story List entry must carry an
order number OR a name, and an old side quest with no title and only entries
would satisfy neither - it would read fine and then 422 the first time
anybody edited it, on a field they had not touched. Such a row's FIRST text
line becomes its name, and stops being part of the description. That is the
row's own first line rather than an invention, and it is what the list was
already calling that quest.

Revision ID: s3t4orylist5
Revises: g2u3ides4r5
Create Date: 2026-09-20 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s3t4orylist5"
down_revision: Union[str, Sequence[str], None] = "g2u3ides4r5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Same reasoning as the guides reshape this follows: the old array held a
# row's text and its links interleaved in one order, and flattening that is
# not reversible - a downgrade would invent an order rather than restore one.
# It would also have to guess which `story_list_side` rows had been side
# quests, and after the first edit there is nothing to guess from.
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
    session - the suite has no Alembic harness - rather than restating them
    and passing while this is wrong.
    """
    rows = bind.execute(
        sa.text(
            "SELECT system_id, title, content, links, entries FROM note "
            "WHERE section = 'side_quests'"
        )
    ).fetchall()

    for row in rows:
        lines = [(row.content or "").strip()] if (row.content or "").strip() else []
        links = list(_as_list(row.links))

        for item in _as_list(row.entries):
            if not isinstance(item, dict):
                continue
            value = (item.get("value") or "").strip()
            if not value:
                continue
            if item.get("type") == "link":
                links.append(value)
            else:
                lines.append(value)

        # A Story List entry needs an order number or a name, and the old
        # shape had nowhere to put an order number. A row with no title would
        # satisfy neither, so its first line becomes its name.
        title = (row.title or "").strip() or None
        if title is None and lines:
            title = lines.pop(0)

        bind.execute(
            sa.text(
                "UPDATE note SET section = 'story_list_side', title = :title, "
                "content = :content, links = :links, entries = NULL "
                "WHERE system_id = :id"
            ),
            {
                "id": row.system_id,
                "title": title,
                "content": "\n".join(lines) or None,
                "links": json.dumps(links) if links else None,
            },
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above. Reverting this means restoring the dump the
    # deploy takes before it runs anything.
    pass
