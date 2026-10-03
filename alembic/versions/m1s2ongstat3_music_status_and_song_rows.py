"""Music: a status per song list, OST as a song list, links as text-URL pairs

Every song list of an anime - OP, ED, insert songs, OST - carries a status of
its own ("All Done", "Done", "Need", "Pending", "Not Done"), above and apart
from the per-song Need/Pending/Done. That status is a `music_status` note row
per (anime, list), keyed by `kind`; the OST stops being one structured row per
anime and becomes a list of songs like the other three; and the four song
lists store links as `{"text", "url"}` pairs.

What this revision does:

  note    refuses to run if any `ost` row carries a song name, remark, link,
          locator, entries, structured fields or a type other than `normal`.
          o1s2tsingle3 already guaranteed the first six; the type is checked
          too because the new row has nowhere to keep it. Such a row is moved
          by hand first.
  note    a `music_status` row for every anime and each of op, ed,
          insert_songs and ost. The ost row takes the anime's existing OST
          status where it held Need, Pending or Done; every other row starts
          "Not Done". Idempotent: a (anime, list) that already has one is
          skipped. Authored by the installation owner - the account Pull files
          an author-less note under (`installation_owner_id`): the flag
          holder, else the alphabetically first non-root account, else the
          first account of any kind.
  note    deletes every `ost` row: its status has just been copied.
  note    drops ix_note_one_ost_per_owner and creates
          ix_note_one_music_status_per_kind, unique (media_id, kind) where
          section = 'music_status'.
  note    rewrites op, ed and insert_songs links from ["url", ...] to
          [{"text": null, "url": "url"}, ...]. JSON nulls and empty lists are
          left as they are.
  system_option
          seeds "Song Type" (normal, different version, all inclusive
          version) and "Song Source" (YouTube, YouTube Music, Spotify, Apple
          Music, Bilibili), each scoped to anime. A value that already exists
          is left alone.

Downgrade puts back everything the upgrade changed: the links become URL
strings again, each anime whose OST status is Need, Pending or Done (or All
Done, which the old vocabulary reads as Done) gets its one `normal` OST row
back, and the music_status rows and the new index go, the old index returning.
What it cannot keep is what was only expressible after the upgrade - a link's
text, OST songs, a "Not Done" or "All Done" distinction - so OST song rows
are deleted rather than left to violate the restored singleton index. The
option seeds stay: the older code offers them just as happily.

Not marked irreversible: every row the upgrade rewrote or removed comes back
with the same content, because the refusal above guarantees an OST row held
nothing but the `normal` type and a status.

Revision ID: m1s2ongstat3
Revises: h1e2ntaiep3
Create Date: 2026-10-03 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1s2ongstat3"
down_revision: Union[str, Sequence[str], None] = "h1e2ntaiep3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration that imports app code breaks the day
# a later revision changes it.
SONG_LISTS = ("op", "ed", "insert_songs", "ost")
# The lists that held URL strings. `ost` held no links at all - see
# CARRYING_EXTRA - and its rows are deleted before this runs.
URL_LISTS = ("op", "ed", "insert_songs")
PER_SONG_STATUSES = ("Need", "Pending", "Done")
DEFAULT_STATUS = "Not Done"
SCOPE = "anime"
OPTION_SEEDS = (
    ("Song Type", ("normal", "different version", "all inclusive version")),
    (
        "Song Source",
        ("YouTube", "YouTube Music", "Spotify", "Apple Music", "Bilibili"),
    ),
)

OLD_INDEX = "ix_note_one_ost_per_owner"
NEW_INDEX = "ix_note_one_music_status_per_kind"

CARRYING_EXTRA = """
SELECT count(*) FROM note
WHERE section = 'ost'
  AND (
    title IS NOT NULL
    OR content IS NOT NULL
    OR locator IS NOT NULL
    OR (kind IS NOT NULL AND kind <> 'normal')
    OR (links IS NOT NULL AND links <> 'null'::jsonb AND links <> '[]'::jsonb)
    OR (entries IS NOT NULL AND entries <> 'null'::jsonb AND entries <> '[]'::jsonb)
    OR (fields IS NOT NULL AND fields <> 'null'::jsonb AND fields <> '{}'::jsonb)
  )
"""

# installation_owner_id(), in one query.
AUTHOR = """
SELECT u.id
  FROM users u
  JOIN role r ON r.system_id = u.role_id
 ORDER BY u.is_installation_owner DESC, r.is_root ASC, u.username
 LIMIT 1
"""

BACKFILL = """
INSERT INTO note
    (system_id, media_id, author_id, section, kind, status, sort_index,
     created_at, updated_at)
SELECT gen_random_uuid(), m.system_id, :author, 'music_status', k.kind,
       CASE WHEN k.kind = 'ost' THEN COALESCE(
           (SELECT o.status FROM note o
             WHERE o.section = 'ost'
               AND o.media_id = m.system_id
               AND o.status = ANY(CAST(:per_song AS text[]))
             ORDER BY o.updated_at DESC NULLS LAST, o.system_id
             LIMIT 1),
           :default)
       ELSE :default END,
       k.ord - 1, now(), now()
  FROM media m
 CROSS JOIN unnest(CAST(:kinds AS text[])) WITH ORDINALITY AS k(kind, ord)
 WHERE m.media_type = 'anime'
   AND NOT EXISTS (
       SELECT 1 FROM note n
        WHERE n.section = 'music_status'
          AND n.media_id = m.system_id
          AND n.kind = k.kind
   )
"""


def _rewrite_links(conn, element_sql: str) -> None:
    conn.execute(
        sa.text(
            f"""
            UPDATE note SET links = (
                SELECT jsonb_agg({element_sql} ORDER BY t.ord)
                  FROM jsonb_array_elements(note.links) WITH ORDINALITY AS t(e, ord)
            )
            WHERE section = ANY(CAST(:sections AS text[]))
              AND jsonb_typeof(links) = 'array'
              AND links <> '[]'::jsonb
            """
        ),
        {"sections": list(URL_LISTS)},
    )


def refuse_ost_extras(conn) -> None:
    carrying = conn.execute(sa.text(CARRYING_EXTRA)).scalar()
    if carrying:
        raise RuntimeError(
            f"{carrying} 'ost' note row(s) carry a song name, remark, link, "
            "type other than 'normal' or other field the OST status cannot "
            "hold. Move them by hand before upgrading."
        )


def backfill_music_status(conn) -> None:
    anime = conn.execute(
        sa.text("SELECT count(*) FROM media WHERE media_type = 'anime'")
    ).scalar()
    if not anime:
        return
    author = conn.execute(sa.text(AUTHOR)).scalar()
    if author is None:
        raise RuntimeError(
            "There are anime but no user account to author their music status "
            "rows. Create an account before upgrading."
        )
    conn.execute(
        sa.text(BACKFILL),
        {
            "author": author,
            "kinds": list(SONG_LISTS),
            "per_song": list(PER_SONG_STATUSES),
            "default": DEFAULT_STATUS,
        },
    )


def delete_ost_singletons(conn) -> None:
    conn.execute(sa.text("DELETE FROM note WHERE section = 'ost'"))


def links_to_pairs(conn) -> None:
    _rewrite_links(
        conn,
        "CASE WHEN jsonb_typeof(t.e) = 'string' "
        "THEN jsonb_build_object('text', NULL, 'url', t.e) ELSE t.e END",
    )


def links_to_urls(conn) -> None:
    _rewrite_links(
        conn,
        "CASE WHEN jsonb_typeof(t.e) = 'object' THEN t.e -> 'url' ELSE t.e END",
    )


def seed_song_options(conn) -> None:
    """Additive and idempotent: an existing value keeps its scopes."""
    for category, values in OPTION_SEEDS:
        for sort_order, value in enumerate(values):
            exists = conn.execute(
                sa.text(
                    "SELECT 1 FROM system_option "
                    "WHERE category = :category AND value = :value"
                ),
                {"category": category, "value": value},
            ).scalar()
            if exists:
                continue
            option_id = conn.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :category, :value, :sort_order, "
                    "now(), now()) RETURNING system_id"
                ),
                {"category": category, "value": value, "sort_order": sort_order},
            ).scalar()
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_scope (option_id, scope) "
                    "VALUES (:option_id, :scope) "
                    "ON CONFLICT (option_id, scope) DO NOTHING"
                ),
                {"option_id": option_id, "scope": SCOPE},
            )


def restore_ost_singletons(conn) -> None:
    """One `normal` OST row per anime whose OST status the old vocabulary can
    say; the OST songs written since go, so the singleton index can return."""
    conn.execute(sa.text("DELETE FROM note WHERE section = 'ost'"))
    conn.execute(
        sa.text(
            """
            INSERT INTO note
                (system_id, media_id, author_id, section, kind, status,
                 sort_index, created_at, updated_at)
            SELECT gen_random_uuid(), s.media_id, s.author_id, 'ost', 'normal',
                   CASE WHEN s.status = 'All Done' THEN 'Done' ELSE s.status END,
                   0, now(), now()
              FROM note s
             WHERE s.section = 'music_status'
               AND s.kind = 'ost'
               AND s.status IN ('All Done', 'Done', 'Need', 'Pending')
            """
        )
    )
    conn.execute(sa.text("DELETE FROM note WHERE section = 'music_status'"))


def upgrade() -> None:
    conn = op.get_bind()
    refuse_ost_extras(conn)
    backfill_music_status(conn)
    delete_ost_singletons(conn)
    op.drop_index(OLD_INDEX, table_name="note")
    op.create_index(
        NEW_INDEX,
        "note",
        ["media_id", "kind"],
        unique=True,
        postgresql_where=sa.text("section = 'music_status'"),
    )
    links_to_pairs(conn)
    seed_song_options(conn)


def downgrade() -> None:
    conn = op.get_bind()
    links_to_urls(conn)
    op.drop_index(NEW_INDEX, table_name="note")
    restore_ost_singletons(conn)
    op.create_index(
        OLD_INDEX,
        "note",
        ["media_id"],
        unique=True,
        postgresql_where=sa.text("section = 'ost'"),
    )
