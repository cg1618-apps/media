"""Game Platform gains a value per console beside its six families

  system_option
          one `Game Platform` value per console (PS5, Switch, Original Xbox,
          Windows, ...), scoped to `game`, each carrying its IGDB name as an
          `igdb` alias. The families keep every alias they had, so one IGDB
          name now resolves to both the family and the console. Every Game
          Platform value's sort_order becomes its place in the list - each
          family followed by its consoles - which is what the seed gives a
          fresh database. A console value that already exists keeps its
          scopes as the seed would: an unscoped one stays offered everywhere.
  media_tag
          untouched. Existing games keep their family tags; no console is
          guessed for them. From here on a console tag brings its family with
          it, which is code (replace_tags), not data.

Downgrade takes the consoles' `igdb` aliases away, so the older resolver -
which takes the first match - sees exactly one value per IGDB name again, and
puts the families back at sort_order 0-5 with the consoles after them. The
console values themselves stay, and so does every tag on them: the older code
reads them as ordinary Game Platform values, and dropping them would delete
whatever consoles were tagged since the upgrade. Every family tag was written
beside its console, so nothing the older code relies on is missing. An
upgrade picks the stayed values back up.

Not marked irreversible: nothing the upgrade changed is lost on the way down,
and no tag is lost either.

The vocabulary is a frozen copy of app/utils/game_vocabulary.py's
GAME_PLATFORMS rather than an import - a migration importing app code breaks
the day a later revision changes it.

Revision ID: g1c2onsoles3
Revises: s1t2atistics3
Create Date: 2026-11-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g1c2onsoles3"
down_revision: Union[str, Sequence[str], None] = "s1t2atistics3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY = "Game Platform"
SCOPE = "game"
SOURCE = "igdb"

# family -> (the family's own extra igdb aliases, ((console, igdb name), ...))
PLATFORMS: tuple[tuple[str, tuple[str, ...], tuple[tuple[str, str], ...]], ...] = (
    (
        "PlayStation",
        (),
        (
            ("PS1", "PlayStation"),
            ("PS2", "PlayStation 2"),
            ("PS3", "PlayStation 3"),
            ("PS4", "PlayStation 4"),
            ("PS5", "PlayStation 5"),
            ("PSP", "PlayStation Portable"),
            ("Vita", "PlayStation Vita"),
            ("PS VR", "PlayStation VR"),
            ("PS VR2", "PlayStation VR2"),
        ),
    ),
    (
        "Nintendo",
        (),
        (
            ("Switch", "Nintendo Switch"),
            ("Switch 2", "Nintendo Switch 2"),
            ("Wii", "Wii"),
            ("Wii U", "Wii U"),
            ("GameCube", "Nintendo GameCube"),
            ("N64", "Nintendo 64"),
            ("SNES", "Super Nintendo Entertainment System"),
            ("Super Famicom", "Super Famicom"),
            ("NES", "Nintendo Entertainment System"),
            ("Famicom", "Family Computer"),
            ("DS", "Nintendo DS"),
            ("DSi", "Nintendo DSi"),
            ("3DS", "Nintendo 3DS"),
            ("New 3DS", "New Nintendo 3DS"),
            ("Game Boy", "Game Boy"),
            ("Game Boy Color", "Game Boy Color"),
            ("Game Boy Advance", "Game Boy Advance"),
        ),
    ),
    (
        "Xbox",
        (),
        (
            ("Original Xbox", "Xbox"),
            ("Xbox 360", "Xbox 360"),
            ("Xbox One", "Xbox One"),
            ("Xbox Series X|S", "Xbox Series X|S"),
        ),
    ),
    (
        "PC",
        (),
        (
            ("Windows", "PC (Microsoft Windows)"),
            ("Mac", "Mac"),
            ("Linux", "Linux"),
            ("DOS", "DOS"),
        ),
    ),
    (
        "Mobile",
        (),
        (
            ("iOS", "iOS"),
            ("Android", "Android"),
            ("Windows Phone", "Windows Phone"),
        ),
    ),
    ("Browser", ("Web browser",), ()),
)


def _rows() -> list[tuple[str, tuple[str, ...]]]:
    """(value, igdb aliases) in picker order: each family, then its consoles."""
    rows = []
    for family, extra, consoles in PLATFORMS:
        rows.append((family, tuple(igdb for _, igdb in consoles) + extra))
        rows.extend((console, (igdb,)) for console, igdb in consoles)
    return rows


def _option_id(conn, value):
    return conn.execute(
        sa.text(
            "SELECT system_id FROM system_option "
            "WHERE category = :category AND value = :value"
        ),
        {"category": CATEGORY, "value": value},
    ).scalar()


def _has_scopes(conn, option_id) -> bool:
    return bool(
        conn.execute(
            sa.text("SELECT 1 FROM system_option_scope WHERE option_id = :id LIMIT 1"),
            {"id": option_id},
        ).scalar()
    )


def apply_upgrade(conn) -> None:
    """Idempotent: a second run finds every row in place and changes nothing."""
    for sort_order, (value, aliases) in enumerate(_rows()):
        option_id = _option_id(conn, value)
        created = option_id is None
        if created:
            option_id = conn.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :category, :value, :sort_order, "
                    "now(), now()) RETURNING system_id"
                ),
                {"category": CATEGORY, "value": value, "sort_order": sort_order},
            ).scalar()
        else:
            conn.execute(
                sa.text(
                    "UPDATE system_option SET sort_order = :sort_order "
                    "WHERE system_id = :id AND sort_order <> :sort_order"
                ),
                {"id": option_id, "sort_order": sort_order},
            )
        # The seed's _ensure_scope: a value that exists with no scope rows is
        # already offered everywhere, and a scope would narrow it.
        if created or _has_scopes(conn, option_id):
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_scope (option_id, scope) "
                    "SELECT :id, :scope WHERE NOT EXISTS ("
                    "SELECT 1 FROM system_option_scope "
                    "WHERE option_id = :id AND scope = :scope)"
                ),
                {"id": option_id, "scope": SCOPE},
            )
        for alias in aliases:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_alias (option_id, source, value) "
                    "SELECT :id, :source, :value WHERE NOT EXISTS ("
                    "SELECT 1 FROM system_option_alias "
                    "WHERE option_id = :id AND source = :source AND value = :value)"
                ),
                {"id": option_id, "source": SOURCE, "value": alias},
            )


def apply_downgrade(conn) -> None:
    """The consoles' aliases go; the values and their tags stay."""
    for _, _, consoles in PLATFORMS:
        for console, igdb in consoles:
            conn.execute(
                sa.text(
                    "DELETE FROM system_option_alias a USING system_option o "
                    "WHERE a.option_id = o.system_id AND o.category = :category "
                    "AND o.value = :value AND a.source = :source "
                    "AND a.value = :alias"
                ),
                {
                    "category": CATEGORY,
                    "value": console,
                    "source": SOURCE,
                    "alias": igdb,
                },
            )
    order = [family for family, _, _ in PLATFORMS] + [
        console for _, _, consoles in PLATFORMS for console, _ in consoles
    ]
    for sort_order, value in enumerate(order):
        conn.execute(
            sa.text(
                "UPDATE system_option SET sort_order = :sort_order "
                "WHERE category = :category AND value = :value"
            ),
            {"category": CATEGORY, "value": value, "sort_order": sort_order},
        )


def upgrade() -> None:
    apply_upgrade(op.get_bind())


def downgrade() -> None:
    apply_downgrade(op.get_bind())
