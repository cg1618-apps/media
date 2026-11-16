"""
The Chinese game vocabulary, and the helper that seeds it.

The data lives here rather than inside the migration for two reasons. The
suite never runs Alembic (tests/api/conftest.py builds the schema with
create_all), so a seed buried in a revision file could not be tested at all;
and the same rows have to exist in every database that was created by
create_all rather than by upgrade.

Values are Chinese, because that is what the pickers show - except Game
Platform, whose values are brand names. An external API's English is a wire
format and lives in `system_option_alias` - see
app/models/system.py. Genre, theme, mode and platform mirror IGDB's own
fields and so carry aliases; Combat Mode is not an IGDB field and carries
none.

Every row is scoped to `game`. That is the load-bearing part: a system_option
with NO scope rows is offered in EVERY media type's picker, so an unscoped
角色扮演 would silently appear in anime's genre dropdown.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.utils.name_normalize import normalize_name

# category -> ((chinese_value, (igdb_aliases, ...)), ...)
GAME_VOCABULARY: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "Game Genre": (
        ("角色扮演", ("Role-playing (RPG)",)),
        ("動作", ("Hack and slash/Beat 'em up",)),
        ("射擊", ("Shooter",)),
        ("平台", ("Platform",)),
        ("解謎", ("Puzzle",)),
        ("策略", ("Strategy",)),
        ("回合制策略", ("Turn-based strategy (TBS)",)),
        ("即時戰略", ("Real Time Strategy (RTS)",)),
        ("戰術", ("Tactical",)),
        ("冒險", ("Adventure",)),
        ("模擬", ("Simulator",)),
        ("競速", ("Racing",)),
        ("運動", ("Sport",)),
        ("格鬥", ("Fighting",)),
        ("音樂", ("Music",)),
        ("益智問答", ("Quiz/Trivia",)),
        ("卡牌與桌遊", ("Card & Board Game",)),
        ("視覺小說", ("Visual Novel",)),
        ("大逃殺", ("Battle Royale",)),
        ("街機", ("Arcade",)),
        ("獨立", ("Indie",)),
        ("點擊冒險", ("Point-and-click",)),
        ("MOBA", ("MOBA",)),
    ),
    "Game Theme": (
        ("動作", ("Action",)),
        ("奇幻", ("Fantasy",)),
        ("科幻", ("Science fiction",)),
        ("恐怖", ("Horror",)),
        ("生存", ("Survival",)),
        ("歷史", ("Historical",)),
        ("潛行", ("Stealth",)),
        ("喜劇", ("Comedy",)),
        ("商業", ("Business",)),
        ("劇情", ("Drama",)),
        ("非虛構", ("Non-fiction",)),
        ("沙盒", ("Sandbox",)),
        ("教育", ("Educational",)),
        ("兒童", ("Kids",)),
        ("開放世界", ("Open world",)),
        ("戰爭", ("Warfare",)),
        ("派對", ("Party",)),
        ("4X", ("4X (explore, expand, exploit, and exterminate)",)),
        ("神秘", ("Mystery",)),
        ("浪漫", ("Romance",)),
    ),
    "Game Mode": (
        ("單人", ("Single player",)),
        ("多人", ("Multiplayer",)),
        ("合作", ("Co-operative",)),
        ("分割畫面", ("Split screen",)),
        ("大型多人線上", ("Massively Multiplayer Online (MMO)",)),
    ),
    # PvE/PvP is not an IGDB field, so these are hand-entered and alias-free.
    "Combat Mode": (
        ("PvE", ()),
        ("PvP", ()),
    ),
    "Game Platform": (),  # filled from GAME_PLATFORMS below
}

# WHICH platform the game is on, at two grains: a family (PlayStation,
# Nintendo, ...) and a console within it (PS5, Switch, ...). The values are
# English rather than Chinese because they are brand names; consoles take the
# short names people tag with, and IGDB's full name is the console's alias.
#
# A family's own aliases are every one of its consoles' IGDB names plus any
# listed here, so one IGDB platform resolves to BOTH the family and the
# console. Browser is a family with no console.
#
# This tuple is the one statement of which console belongs to which family:
# replace_tags adds a console's family on every write (with_platform_families),
# and every Game Platform option the API serves carries its `family`
# (SystemOptionResponse) for the picker to do the same.
#
# Deliberately not storefronts and not subscriptions: which copy was bought
# lives in game_copy.
#
# family -> (the family's own extra igdb aliases, ((console, igdb name), ...))
GAME_PLATFORMS: tuple[
    tuple[str, tuple[str, ...], tuple[tuple[str, str], ...]], ...
] = (
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
            # Not "Xbox": that is the family's value, and uq_system_option_value
            # allows one per category.
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

# console -> family
GAME_PLATFORM_FAMILIES: dict[str, str] = {
    console: family
    for family, _, consoles in GAME_PLATFORMS
    for console, _ in consoles
}

GAME_PLATFORM_FIELD = "game_platform"
PLATFORM_CATEGORY = "Game Platform"


def _platform_vocabulary() -> tuple[tuple[str, tuple[str, ...]], ...]:
    """Each family, then its consoles - the order the picker offers them in."""
    rows: list[tuple[str, tuple[str, ...]]] = []
    for family, extra, consoles in GAME_PLATFORMS:
        rows.append((family, tuple(igdb for _, igdb in consoles) + extra))
        rows.extend((console, (igdb,)) for console, igdb in consoles)
    return tuple(rows)


GAME_VOCABULARY["Game Platform"] = _platform_vocabulary()


def with_platform_families(values: list[str]) -> list[str]:
    """
    `values` with the family of every console among them.

    A missing family goes in just before its first console; nothing else
    moves. Matched as resolve_option matches, ignoring case, width and
    whitespace. A family is never taken out: removing Nintendo while Switch
    stays tagged puts Nintendo back.
    """
    families = {normalize_name(c): f for c, f in GAME_PLATFORM_FAMILIES.items()}
    present = {normalize_name(v) for v in values}
    out: list[str] = []
    for value in values:
        family = families.get(normalize_name(value))
        if family is not None and normalize_name(family) not in present:
            out.append(family)
            present.add(normalize_name(family))
        out.append(value)
    return out


# One vocabulary that already exists gains game-scoped values, so the Sources
# card has something to offer on a game.
#
# The documented rule is that a link a pipeline fetches on is a column
# (games.igdb_link, games.steam_link) and a link that is only ever displayed is
# a media_source reference row - which is what these are.
#
# Games have no ACCESS rows at all: where a game can be played is the
# `game_platform` tag above, and which copy was bought is game_copy.
# SourcesEditor hides the access *editor* for games (`showAccess={false}`),
# since there are no access rows to add. The Sources card still renders a
# "Where to Play" section on a game, from the games.steam_link column rather
# than from a row.
GAME_REFERENCE_SOURCES: tuple[str, ...] = (
    "SteamDB",
    "HowLongToBeat",
    "Metacritic",
)

# Reference Source values this seed does NOT own. "Official site" already
# exists scoped to anime, anime-movie and comic, so it gains a `game` scope
# here; "Wikipedia" and "Fandom wiki" carry no scopes at all, which means they
# are already offered on every media type - _ensure_scope leaves those alone
# rather than narrowing them to games.
GAME_SHARED_REFERENCE_SOURCES: tuple[str, ...] = ("Official site",)


def _option(
    db: Session, category: str, value: str
) -> Optional["models.SystemOption"]:
    return (
        db.query(models.SystemOption)
        .filter_by(category=category, value=value)
        .first()
    )


def _ensure_scope(db: Session, option, scope: str, created: bool) -> None:
    """
    Give this option a `game` scope - unless doing so would take one away.

    A system_option with NO scope rows is offered in EVERY media type's picker.
    So for a value this seed did not create and that carries no scopes yet
    (Wikipedia, Fandom wiki - already shared vocabulary), adding one would
    NARROW it to games alone. Leave those exactly as they are: they already
    reach games.
    """
    if not created and not option.scopes:
        return
    exists = (
        db.query(models.SystemOptionScope)
        .filter_by(option_id=option.system_id, scope=scope)
        .first()
    )
    if exists is None:
        db.add(models.SystemOptionScope(option_id=option.system_id, scope=scope))


def _ensure_alias(db: Session, option, source: str, value: str) -> None:
    exists = (
        db.query(models.SystemOptionAlias)
        .filter_by(option_id=option.system_id, source=source, value=value)
        .first()
    )
    if exists is None:
        db.add(
            models.SystemOptionAlias(
                option_id=option.system_id, source=source, value=value
            )
        )


def seed_game_vocabulary(db: Session) -> None:
    """
    Insert the game vocabulary, its `game` scopes and its IGDB aliases.

    Idempotent on every row: uq_system_option_value would fail a whole Pull on
    a second 角色扮演, and the migration is not the only caller - the test
    fixture and any create_all database run it too.
    """
    for category, values in GAME_VOCABULARY.items():
        for sort_order, (value, aliases) in enumerate(values):
            option = _option(db, category, value)
            created = option is None
            if created:
                option = models.SystemOption(
                    category=category, value=value, sort_order=sort_order
                )
                db.add(option)
                db.flush()
            _ensure_scope(db, option, "game", created)
            for alias in aliases:
                _ensure_alias(db, option, "igdb", alias)

    for sort_order, value in enumerate(
        GAME_REFERENCE_SOURCES + GAME_SHARED_REFERENCE_SOURCES
    ):
        option = _option(db, "Reference Source", value)
        created = option is None
        if created:
            option = models.SystemOption(
                category="Reference Source", value=value, sort_order=sort_order
            )
            db.add(option)
            db.flush()
        _ensure_scope(db, option, "game", created)

    db.flush()
