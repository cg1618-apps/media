"""Game Platform offers its main platforms first, and every game stores them first

  system_option
          every `Game Platform` value's sort_order becomes its place in the
          new list: the six main platforms (families) PC, PlayStation, Xbox,
          Nintendo, Mobile, Browser, then every specific platform (console)
          grouped by family in that same order, each family's consoles in the
          order they already had. That is what the seed gives a fresh
          database. A Game Platform value outside the seed keeps its
          sort_order.
  media_tag
          every entry's `game_platform` tags are re-positioned so the main
          platforms come first: a stable split, families ahead of every other
          value, each group keeping its order. A tagged console whose family
          is not tagged gains the family, where its first console stood - the
          rule replace_tags applies on every write from here on. Matched on
          the stored option values, which are the seed's spellings.

Idempotent: a second run finds every sort_order and position in place.

Downgrade puts the old interleaved sort_order back - each family followed by
its consoles, in the family order PlayStation, Nintendo, Xbox, PC, Mobile,
Browser. Tag positions are not restored: the older code reads them in any
order, and a family the upgrade added is one it would have added itself on
the next write. So nothing is lost on the way down, and the revision is not
marked irreversible.

The vocabulary is a frozen copy of app/utils/game_vocabulary.py's
GAME_PLATFORMS rather than an import - a migration importing app code breaks
the day a later revision changes it.

Revision ID: g1m2ainplat3
Revises: c1r2ontrating3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g1m2ainplat3"
down_revision: Union[str, Sequence[str], None] = "c1r2ontrating3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY = "Game Platform"
FIELD = "game_platform"

# family -> (consoles, ...), in main-platform order.
PLATFORMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("PC", ("Windows", "Mac", "Linux", "DOS")),
    (
        "PlayStation",
        ("PS1", "PS2", "PS3", "PS4", "PS5", "PSP", "Vita", "PS VR", "PS VR2"),
    ),
    ("Xbox", ("Original Xbox", "Xbox 360", "Xbox One", "Xbox Series X|S")),
    (
        "Nintendo",
        (
            "Switch",
            "Switch 2",
            "Wii",
            "Wii U",
            "GameCube",
            "N64",
            "SNES",
            "Super Famicom",
            "NES",
            "Famicom",
            "DS",
            "DSi",
            "3DS",
            "New 3DS",
            "Game Boy",
            "Game Boy Color",
            "Game Boy Advance",
        ),
    ),
    ("Mobile", ("iOS", "Android", "Windows Phone")),
    ("Browser", ()),
)

# The family order g1c2onsoles3 left, for the downgrade.
OLD_FAMILY_ORDER = ("PlayStation", "Nintendo", "Xbox", "PC", "Mobile", "Browser")

FAMILIES = tuple(family for family, _ in PLATFORMS)
FAMILY_OF = {console: family for family, consoles in PLATFORMS for console in consoles}


def new_order() -> list[str]:
    """The families, then every family's consoles."""
    return list(FAMILIES) + [c for _, consoles in PLATFORMS for c in consoles]


def old_order() -> list[str]:
    """Each family followed by its consoles, in the old family order."""
    consoles = dict(PLATFORMS)
    out: list[str] = []
    for family in OLD_FAMILY_ORDER:
        out.append(family)
        out.extend(consoles[family])
    return out


def main_platforms_first(values: list[str]) -> list[str]:
    """
    The frozen with_platform_families: a missing family where its first console
    stands, then every family ahead of every other value, each group in order.
    """
    present = set(values)
    expanded: list[str] = []
    for value in values:
        family = FAMILY_OF.get(value)
        if family is not None and family not in present:
            expanded.append(family)
            present.add(family)
        expanded.append(value)
    return [v for v in expanded if v in FAMILIES] + [
        v for v in expanded if v not in FAMILIES
    ]


def set_sort_order(conn, order: list[str]) -> None:
    for sort_order, value in enumerate(order):
        conn.execute(
            sa.text(
                "UPDATE system_option SET sort_order = :sort_order "
                "WHERE category = :category AND value = :value "
                "AND sort_order IS DISTINCT FROM :sort_order"
            ),
            {"category": CATEGORY, "value": value, "sort_order": sort_order},
        )


def reposition_tags(conn) -> None:
    option_ids = dict(
        conn.execute(
            sa.text(
                "SELECT value, system_id FROM system_option WHERE category = :category"
            ),
            {"category": CATEGORY},
        ).all()
    )
    rows = conn.execute(
        sa.text(
            "SELECT t.media_id, t.system_id, t.position, o.value "
            "FROM media_tag t JOIN system_option o ON o.system_id = t.option_id "
            "WHERE t.field = :field "
            "ORDER BY t.media_id, t.position, t.created_at, t.system_id"
        ),
        {"field": FIELD},
    ).all()

    by_media: dict = {}
    for media_id, tag_id, position, value in rows:
        by_media.setdefault(media_id, []).append((tag_id, position, value))

    for media_id, tags in by_media.items():
        # A value may only be tagged once (uq_media_tag_row), so it names its row.
        tag_of = {value: (tag_id, position) for tag_id, position, value in tags}
        wanted = main_platforms_first([value for _, _, value in tags])
        for position, value in enumerate(wanted):
            if value in tag_of:
                tag_id, current = tag_of[value]
                if current != position:
                    conn.execute(
                        sa.text("UPDATE media_tag SET position = :position WHERE system_id = :id"),
                        {"id": tag_id, "position": position},
                    )
            elif value in option_ids:
                conn.execute(
                    sa.text(
                        "INSERT INTO media_tag "
                        "(system_id, media_id, field, option_id, position, created_at) "
                        "VALUES (gen_random_uuid(), :media_id, :field, :option_id, "
                        ":position, now())"
                    ),
                    {
                        "media_id": media_id,
                        "field": FIELD,
                        "option_id": option_ids[value],
                        "position": position,
                    },
                )


def apply_upgrade(conn) -> None:
    set_sort_order(conn, new_order())
    reposition_tags(conn)


def apply_downgrade(conn) -> None:
    set_sort_order(conn, old_order())


def upgrade() -> None:
    apply_upgrade(op.get_bind())


def downgrade() -> None:
    apply_downgrade(op.get_bind())
