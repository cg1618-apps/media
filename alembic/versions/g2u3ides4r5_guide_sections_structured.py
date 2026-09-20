"""Move the 攻略 Guides rows onto the structured shape

Ten guide sections were `name_entries` - a title plus one ordered array whose
items are each a line of text or a labelled link - and one (`stats_and_points`)
was `text_links`. All eleven are `structured` now, with a declared field spec
apiece, so their rows have to be reshaped as well as their registry entries.

The mapping is the same everywhere and is best-effort by design: the title was
already the name and stays in `title`; the text items become the description,
one per line, appended to whatever `content` already held; and the link items
become `links`. The only interesting case is a section whose new spec has NO
links field - `characters_guide`, `enemies`, `mods_and_tools` and
`stats_and_points` - where a URL would otherwise be refused by validation on
the next edit and lost. Those URLs are written into the description instead, so
nothing is dropped silently even though the field is gone.

`entries` is cleared on every migrated row: validation refuses a column no
field of the spec claims, so a row that kept its old array would be unsavable.

Revision ID: g2u3ides4r5
Revises: n1f2ields3p4
Create Date: 2026-09-20 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g2u3ides4r5"
down_revision: Union[str, Sequence[str], None] = "n1f2ields3p4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The old array held a row's text and its links INTERLEAVED, in one order.
# This flattens that into a body plus a link list, which loses the
# interleaving - so a downgrade would invent an order rather than restore one.
# `deploy/migrations downgrade` refuses to reverse past this and freezes with
# the dump path instead, which is the honest outcome.
irreversible = True

# The ten sections whose rows are `name_entries`, and whether the shape they
# become still has somewhere to put a URL.
ENTRY_SECTIONS = {
    "builds_and_styles": True,
    "skills": True,
    "collectibles": True,
    "items": True,
    "weapons_and_gear": True,
    "characters_guide": False,
    "enemies": False,
    "endings": True,
    "mods_and_tools": False,
    "guide_resources": True,
}


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


def _link_line(item) -> str:
    """A URL written into prose, keeping its label where it had one."""
    label = (item.get("label") or "").strip()
    value = (item.get("value") or "").strip()
    return f"{label}: {value}" if label else value


def reshape(bind) -> None:
    """
    The whole migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session: the suite has no Alembic harness (tests/api/conftest.py builds
    its schema with create_all), and a test that restated this SQL would pass
    while the shipped SQL was wrong.
    """
    rows = bind.execute(
        sa.text(
            "SELECT system_id, section, content, links, entries FROM note "
            "WHERE section = ANY(:sections) AND entries IS NOT NULL"
        ),
        {"sections": list(ENTRY_SECTIONS)},
    ).fetchall()

    for row in rows:
        keeps_links = ENTRY_SECTIONS[row.section]
        lines = [(row.content or "").strip()] if (row.content or "").strip() else []
        links = list(_as_list(row.links))

        for item in _as_list(row.entries):
            if not isinstance(item, dict):
                continue
            value = (item.get("value") or "").strip()
            if not value:
                continue
            if item.get("type") == "link":
                if keeps_links:
                    links.append(value)
                else:
                    lines.append(_link_line(item))
            else:
                lines.append(value)

        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, links = :links, entries = NULL "
                "WHERE system_id = :id"
            ),
            {
                "id": row.system_id,
                "content": "\n".join(lines) or None,
                "links": json.dumps(links) if links else None,
            },
        )

    # stats_and_points was text_links, so its body is already the description.
    # Its new spec has no links field, so the URLs move into that body rather
    # than sitting in a column nothing will render and validation will refuse.
    stat_rows = bind.execute(
        sa.text(
            "SELECT system_id, content, links FROM note "
            "WHERE section = 'stats_and_points' AND links IS NOT NULL"
        )
    ).fetchall()
    for row in stat_rows:
        lines = [(row.content or "").strip()] if (row.content or "").strip() else []
        lines.extend(url for url in _as_list(row.links) if url)
        bind.execute(
            sa.text(
                "UPDATE note SET content = :content, links = NULL WHERE system_id = :id"
            ),
            {"id": row.system_id, "content": "\n".join(lines) or None},
        )


def upgrade() -> None:
    reshape(op.get_bind())


def downgrade() -> None:
    # Deliberately not reversed. The old array held the ORDER of a row's text
    # and links interleaved, and the forward migration flattens that into a
    # body plus a link list; rebuilding it would invent an order rather than
    # restore one. Reverting this change means restoring a dump, which is what
    # the deploy takes before it runs anything.
    pass
