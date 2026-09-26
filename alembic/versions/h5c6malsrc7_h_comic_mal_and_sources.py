"""h-comic: a MAL link, its own main sources, and two reference sources

Three things, all about where an h-comic comes from.

  mal_id, mal_link   The MyAnimeList entry Tenrai fills an h-comic from, the
                     way manga's pair works: the link is typed, the id is
                     extracted from it.

  Platform values    Scoped to h-comic alone, in two sets split by usage.
                     The eight regional storefronts an h-comic is read on
                     (`watch`: the Main Sources picker), and the four
                     publishers a KR work is officially serialised by
                     (`origin`: the Official Source picker). h-comic had no
                     Platform value of its own, so both pickers offered only
                     what carries no scope at all - which was Prime Video.

  Prime Video        Given explicit rows for the five watched types, as
                     n1d2plscope3 gave Netflix and Disney+. Unscoped reads as
                     "everywhere", which put a streaming service in the picker
                     of every read type, h-comic included. Only while it is
                     still unscoped: a value that already carries scopes is
                     offered where an admin put it, and adding the five would
                     widen it rather than narrow it.

  Reference Source   Official site and Twitter gain an h-comic scope - unless
                     either carries no scopes, which already means every type
                     and which a first scope row would narrow.

Frozen values rather than an import: a migration that imports app code breaks
the day a later revision changes it.

Revision ID: h5c6malsrc7
Revises: h4a5r6tstyle
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "h5c6malsrc7"
down_revision: Union[str, Sequence[str], None] = "h4a5r6tstyle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCOPE = "h-comic"

# (value, usage), in the order each picker offers them. Sort orders start
# past every Platform value that exists today, so these keep this order among
# themselves.
H_COMIC_PLATFORMS = (
    ("DLsite TW", "watch"),
    ("DLsite JP", "watch"),
    ("Toptoon TW", "watch"),
    ("Toptoon KR", "watch"),
    ("Toomics TW", "watch"),
    ("Toomics KR", "watch"),
    ("Lezhin TW", "watch"),
    ("Lezhin KR", "watch"),
    ("DLsite", "origin"),
    ("Toptoon", "origin"),
    ("Toomics", "origin"),
    ("Lezhin", "origin"),
)
H_COMIC_PLATFORM_VALUES = tuple(value for value, _usage in H_COMIC_PLATFORMS)
FIRST_SORT_ORDER = 20

REFERENCE_VALUES = ("Official site", "Twitter")

PRIME_VIDEO = "Prime Video"
WATCHED = ("anime", "anime-movie", "movie", "tv-show", "cartoon")


def seed_platforms(conn) -> None:
    """
    The twelve values, their h-comic scope and their usage. Idempotent: an
    existing value keeps its sort order and gains the scope.

    The usage row is written only on a value that has none yet and no scope
    but h-comic - one this revision owns. A value with no usage rows serves
    both pickers, so a first usage row NARROWS it; one offered elsewhere is
    left as an admin set it.
    """
    for offset, (value, _usage) in enumerate(H_COMIC_PLATFORMS):
        conn.execute(
            sa.text(
                """
                INSERT INTO system_option
                       (system_id, category, value, sort_order, created_at, updated_at)
                SELECT gen_random_uuid(), 'Platform', :value, :sort_order, now(), now()
                 WHERE NOT EXISTS (
                       SELECT 1 FROM system_option
                        WHERE category = 'Platform' AND value = :value)
                """
            ),
            {"value": value, "sort_order": FIRST_SORT_ORDER + offset},
        )
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, :scope
              FROM system_option o
             WHERE o.category = 'Platform'
               AND o.value = ANY(CAST(:values AS text[]))
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scope": SCOPE, "values": list(H_COMIC_PLATFORM_VALUES)},
    )
    for value, usage in H_COMIC_PLATFORMS:
        conn.execute(
            sa.text(
                """
                INSERT INTO system_option_usage (option_id, usage)
                SELECT o.system_id, :usage
                  FROM system_option o
                 WHERE o.category = 'Platform'
                   AND o.value = :value
                   AND NOT EXISTS (SELECT 1 FROM system_option_usage u
                                    WHERE u.option_id = o.system_id)
                   AND NOT EXISTS (SELECT 1 FROM system_option_scope x
                                    WHERE x.option_id = o.system_id
                                      AND x.scope <> :scope)
                """
            ),
            {"value": value, "usage": usage, "scope": SCOPE},
        )


def scope_references(conn) -> None:
    """Official site and Twitter on h-comic, where they carry scopes at all."""
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, :scope
              FROM system_option o
             WHERE o.category = 'Reference Source'
               AND o.value = ANY(CAST(:values AS text[]))
               AND EXISTS (SELECT 1 FROM system_option_scope s
                            WHERE s.option_id = o.system_id)
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scope": SCOPE, "values": list(REFERENCE_VALUES)},
    )


def scope_prime_video(conn) -> None:
    """Prime Video on the five watched types, while it is still unscoped."""
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, s.scope
              FROM system_option o
             CROSS JOIN unnest(CAST(:scopes AS text[])) AS s(scope)
             WHERE o.category = 'Platform'
               AND o.value = :value
               AND NOT EXISTS (SELECT 1 FROM system_option_scope x
                                WHERE x.option_id = o.system_id)
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scopes": list(WATCHED), "value": PRIME_VIDEO},
    )


def upgrade() -> None:
    op.add_column("h_comic", sa.Column("mal_id", sa.Integer(), nullable=True))
    op.add_column("h_comic", sa.Column("mal_link", sa.String(), nullable=True))

    conn = op.get_bind()
    scope_prime_video(conn)
    seed_platforms(conn)
    scope_references(conn)


def downgrade() -> None:
    """
    The columns go, and so do the h-comic scope rows. The twelve values are
    deleted only where h-comic is their sole scope - one an admin has since
    offered elsewhere stays - taking the source rows that cite them first.
    Prime Video's rows stay: which of them existed before cannot be told from
    the rows, and the older code offers it on those types just as happily.
    """
    conn = op.get_bind()
    doomed = """
        SELECT o.system_id FROM system_option o
         WHERE o.category = 'Platform'
           AND o.value = ANY(CAST(:values AS text[]))
           AND NOT EXISTS (SELECT 1 FROM system_option_scope s
                            WHERE s.option_id = o.system_id AND s.scope <> :scope)
    """
    params = {"values": list(H_COMIC_PLATFORM_VALUES), "scope": SCOPE}
    conn.execute(
        sa.text(f"DELETE FROM media_source WHERE option_id IN ({doomed})"), params
    )
    conn.execute(
        sa.text(f"DELETE FROM system_option WHERE system_id IN ({doomed})"), params
    )
    conn.execute(
        sa.text(
            """
            DELETE FROM system_option_scope s
             USING system_option o
             WHERE s.option_id = o.system_id
               AND s.scope = :scope
               AND (o.category, o.value) IN (
                   SELECT 'Platform', unnest(CAST(:platforms AS text[]))
                   UNION ALL
                   SELECT 'Reference Source', unnest(CAST(:references AS text[])))
            """
        ),
        {
            "scope": SCOPE,
            "platforms": list(H_COMIC_PLATFORM_VALUES),
            "references": list(REFERENCE_VALUES),
        },
    )

    op.drop_column("h_comic", "mal_link")
    op.drop_column("h_comic", "mal_id")
