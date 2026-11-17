"""備註 Remark becomes a shared list; 備註列表 becomes 個人筆記 Personal Notes

`remark` stops being one block of prose per owner and becomes a list, shaped
like every other text_links section (app/utils/note_sections.py), and the
personal `remark_list` section is renamed `personal_notes`.

  report        every remark whose text runs to more than one line is logged
                BEFORE anything changes - owner type, entry or group name,
                public id, system id and the full text - so the owner can
                split it by hand. multiline_remarks() returns the same rows,
                for a report produced outside a migration run.
  index         ix_note_one_remark_per_owner is dropped: an owner may hold
                any number of remark rows.
  remark rows   each stays one row, in place - same system_id, owner,
                author, content (line breaks kept) and timestamps. Nothing is
                split. `links` becomes [] where it is NULL (SQL or JSON), the
                empty form a text_links row stores.
  remark_list   every row's `section` becomes `personal_notes`. Nothing else
                on the row changes.

Downgrade renames `personal_notes` back to `remark_list` and puts the
singleton index back, which cannot be built while an owner holds more than one
remark row. So an owner's remark rows are FOLDED into one: the first in the
notes page's order (sort_index, NULL as 0, then created_at, then system_id)
keeps its id and takes every row's text in that order, separated by a blank
line, with each row's links appended as `title: url` lines - the old remark
was plain text and took no links. The other rows are deleted. Nothing written
is lost, but the split into rows is, and a note_mark on a deleted row goes
with it (ON DELETE CASCADE). Rejected: declaring the revision irreversible,
which would send a deploy's rollback straight to its freeze tier over
something a downgrade can carry; and moving the extra rows to 備註列表, which
would turn shared catalogue text into one account's private notes.

Revision ID: p1n2otesrmk3
Revises: c1o2micrmk3
Create Date: 2026-11-17 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "p1n2otesrmk3"
down_revision: Union[str, Sequence[str], None] = "c1o2micrmk3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

INDEX = "ix_note_one_remark_per_owner"
OWNER_COLUMNS = ["media_id", "collection_id", "franchise_id", "series_id"]

# The owner's type and name, whichever of the four FK columns is set. An
# entry's name is media.display_name; a group has none stored, so its first
# filled name stands in, CN first as the group pages read.
_MULTILINE = sa.text(
    """
    SELECT
        CASE
            WHEN n.media_id IS NOT NULL THEN m.media_type
            WHEN n.collection_id IS NOT NULL THEN 'collection'
            WHEN n.franchise_id IS NOT NULL THEN 'franchise'
            ELSE 'series'
        END AS owner_type,
        COALESCE(
            m.display_name,
            c.collection_name_cn, c.collection_name_en, c.collection_name_roman,
            c.collection_name_jp, c.collection_name_alt,
            f.franchise_name_cn, f.franchise_name_en, f.franchise_name_roman,
            f.franchise_name_jp, f.franchise_name_alt,
            s.series_name_cn, s.series_name_en, s.series_name_roman,
            s.series_name_jp, s.series_name_alt
        ) AS name,
        COALESCE(m.public_id, c.public_id, f.public_id, s.public_id) AS public_id,
        COALESCE(n.media_id, n.collection_id, n.franchise_id, n.series_id)
            AS owner_id,
        n.system_id AS note_id,
        n.content AS content
    FROM note AS n
    LEFT JOIN media AS m ON m.system_id = n.media_id
    LEFT JOIN collection AS c ON c.system_id = n.collection_id
    LEFT JOIN franchise AS f ON f.system_id = n.franchise_id
    LEFT JOIN series AS s ON s.system_id = n.series_id
    WHERE n.section = 'remark'
      AND btrim(n.content, E' \\t\\r\\n') LIKE E'%\\n%'
    ORDER BY owner_type, name, n.sort_index NULLS FIRST, n.created_at
    """
)

# A row written without links holds SQL NULL; one written with an explicit
# None holds JSON null. Both are "no links".
_LINKS_AS_LIST = sa.text(
    "UPDATE note SET links = '[]'::jsonb "
    "WHERE section = 'remark' AND (links IS NULL OR links = 'null'::jsonb)"
)


def _rename_section(conn, old: str, new: str) -> int:
    return conn.execute(
        sa.text("UPDATE note SET section = :new WHERE section = :old"),
        {"old": old, "new": new},
    ).rowcount


def multiline_remarks(conn) -> list[dict]:
    """
    Every remark whose text, trimmed, still runs to more than one line.

    Each is {owner_type, name, public_id, owner_id, note_id, content}, ordered
    by owner type and name. A remark that is one line plus trailing blank lines
    is not listed: there is nothing in it to split.
    """
    return [dict(row._mapping) for row in conn.execute(_MULTILINE)]


def log_multiline_remarks(conn) -> list[dict]:
    """multiline_remarks, each written to the migration log in full."""
    rows = multiline_remarks(conn)
    logger.info("%d remark(s) run to more than one line", len(rows))
    for row in rows:
        logger.info(
            "multi-line remark: %s #%s %s (owner %s, note %s)\n%s",
            row["owner_type"],
            row["public_id"],
            row["name"],
            row["owner_id"],
            row["note_id"],
            row["content"],
        )
    return rows


def _link_line(link) -> str:
    if isinstance(link, str):
        return link.strip()
    url = (link.get("url") or "").strip()
    title = (link.get("text") or "").strip()
    return f"{title}: {url}" if url and title else url or title


def fold_remarks(conn) -> int:
    """
    One remark row per owner again, for the singleton index; returns how many
    rows were folded away.

    The first row in the notes page's order keeps its id and takes every row's
    text, blank-line separated, links appended as lines; the rest are deleted.
    An owner already holding one row is left alone except for its links,
    which a plain-text remark cannot hold.
    """
    rows = conn.execute(
        sa.text(
            f"""
            SELECT system_id, {', '.join(OWNER_COLUMNS)}, content, links
            FROM note
            WHERE section = 'remark'
            ORDER BY {', '.join(OWNER_COLUMNS)},
                     COALESCE(sort_index, 0), created_at, system_id
            """
        )
    ).all()

    by_owner: dict = {}
    for row in rows:
        key = tuple(getattr(row, c) for c in OWNER_COLUMNS)
        by_owner.setdefault(key, []).append(row)

    folded = 0
    for group in by_owner.values():
        if len(group) == 1 and not group[0].links:
            continue
        parts = []
        for row in group:
            lines = [(row.content or "").strip()]
            lines += [_link_line(link) for link in (row.links or [])]
            text = "\n".join(line for line in lines if line)
            if text:
                parts.append(text)
        keep, rest = group[0], group[1:]
        conn.execute(
            sa.text(
                "UPDATE note SET content = :content, links = NULL "
                "WHERE system_id = :id"
            ),
            {"content": "\n\n".join(parts) or None, "id": keep.system_id},
        )
        for row in rest:
            conn.execute(
                sa.text("DELETE FROM note WHERE system_id = :id"),
                {"id": row.system_id},
            )
        folded += len(rest)
    logger.info("folded %d remark row(s) into their owner's first", folded)
    return folded


def drop_index(conn) -> None:
    conn.execute(sa.text(f"DROP INDEX IF EXISTS {INDEX}"))


def create_index(conn) -> None:
    """The singleton index this revision drops - r1e2mcatalog3's shape."""
    conn.execute(
        sa.text(
            f"CREATE UNIQUE INDEX {INDEX} ON note ({', '.join(OWNER_COLUMNS)}) "
            "NULLS NOT DISTINCT WHERE section = 'remark'"
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    # Before anything changes, so the report shows the remarks as they were.
    log_multiline_remarks(conn)
    drop_index(conn)
    conn.execute(_LINKS_AS_LIST)
    renamed = _rename_section(conn, "remark_list", "personal_notes")
    logger.info("renamed %d remark_list row(s) to personal_notes", renamed)


def downgrade() -> None:
    conn = op.get_bind()
    _rename_section(conn, "personal_notes", "remark_list")
    fold_remarks(conn)
    drop_index(conn)
    create_index(conn)
