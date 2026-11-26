"""
Game Platform's two grains: a family and the consoles inside it.

GAME_PLATFORMS in app/utils/game_vocabulary.py is the one statement of which
console belongs to which family; the seed, replace_tags and the picker's
endpoint all read it.
"""

from app.utils.game_vocabulary import (
    EXCLUSIVE_PLATFORMS,
    GAME_PLATFORM_FAMILIES,
    GAME_PLATFORMS,
    GAME_VOCABULARY,
    with_platform_families,
)

MAIN = ["PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "Browser"]


def test_a_console_brings_its_family():
    assert with_platform_families(["Switch"]) == ["Nintendo", "Switch"]


def test_main_platforms_go_ahead_of_every_specific_one():
    """
    The families first, in the fixed main-platform order whatever order they
    were handed in, then the consoles in the order they were handed.
    """
    assert with_platform_families(["PC", "PS5", "PS4", "Switch 2"]) == [
        "PC",
        "PlayStation",
        "Nintendo",
        "PS5",
        "PS4",
        "Switch 2",
    ]
    assert with_platform_families(["Switch", "Windows", "PC"]) == [
        "PC",
        "Nintendo",
        "Switch",
        "Windows",
    ]
    assert with_platform_families(["Windows", "PS5", "PC"]) == [
        "PC",
        "PlayStation",
        "Windows",
        "PS5",
    ]


def test_a_family_already_tagged_is_not_added_twice_and_moves_ahead():
    assert with_platform_families(["Switch", "Nintendo"]) == ["Nintendo", "Switch"]


def test_matching_ignores_case_and_width_as_resolve_option_does():
    assert with_platform_families(["ｓｗｉｔｃｈ"]) == ["Nintendo", "ｓｗｉｔｃｈ"]
    assert with_platform_families(["Switch", "nintendo"]) == ["nintendo", "Switch"]
    assert with_platform_families(["browser", "Ｗｉｎｄｏｗｓ"]) == [
        "PC",
        "browser",
        "Ｗｉｎｄｏｗｓ",
    ]


def test_an_unknown_value_counts_as_a_specific_platform():
    assert with_platform_families(["Steam Deck", "Xbox"]) == ["Xbox", "Steam Deck"]


def test_families_alone_take_the_fixed_order():
    assert with_platform_families(["Browser", "Xbox", "PC"]) == ["PC", "Xbox", "Browser"]
    assert with_platform_families([]) == []


def test_every_console_names_a_family_and_no_console_is_a_family():
    families = {family for family, _, _ in GAME_PLATFORMS}
    assert families == {"PlayStation", "Nintendo", "Xbox", "PC", "Mobile", "Browser"}
    assert len(GAME_PLATFORM_FAMILIES) > 0
    assert set(GAME_PLATFORM_FAMILIES.values()) <= families
    assert not set(GAME_PLATFORM_FAMILIES) & families
    assert "Browser" not in GAME_PLATFORM_FAMILIES.values()


def test_one_igdb_name_is_an_alias_of_both_the_family_and_the_console():
    aliases = dict(GAME_VOCABULARY["Game Platform"])
    for console, family in GAME_PLATFORM_FAMILIES.items():
        (igdb,) = aliases[console]
        assert igdb in aliases[family], f"{igdb} is not on {family}"


def test_the_families_are_in_main_platform_order():
    assert [family for family, _, _ in GAME_PLATFORMS] == MAIN


def test_the_exclusive_platforms_follow_the_main_platform_order():
    assert list(EXCLUSIVE_PLATFORMS) == ["PC", "PlayStation", "Xbox", "Nintendo", "Mobile"]
    assert [p for p in MAIN if p in EXCLUSIVE_PLATFORMS] == list(EXCLUSIVE_PLATFORMS)


def test_the_vocabulary_lists_the_families_then_each_familys_consoles():
    values = [value for value, _ in GAME_VOCABULARY["Game Platform"]]
    assert values[:6] == MAIN
    consoles = [
        console for _, _, members in GAME_PLATFORMS for console, _ in members
    ]
    assert values[6:] == consoles
    assert values[6:10] == ["Windows", "Mac", "Linux", "DOS"]
    assert values[10] == "PS1"
    assert values[values.index("Xbox Series X|S") + 1] == "Switch"
    assert values[-1] == "Windows Phone"
    assert len(values) == len(set(values))


def test_the_frontend_lists_the_same_main_platforms():
    """
    MAIN_PLATFORMS in frontend/src/lib/gamePlatforms.js orders the library's
    Platform filter and tells the picker which values are main. It is a copy,
    so this is what keeps it in step with GAME_PLATFORMS.
    """
    import re
    from pathlib import Path

    source = Path("frontend/src/lib/gamePlatforms.js").read_text(encoding="utf-8")
    block = re.search(r"export const MAIN_PLATFORMS = \[(.*?)\];", source, re.DOTALL)
    assert block, "MAIN_PLATFORMS literal not found in gamePlatforms.js"
    assert re.findall(r'"([^"]+)"', block.group(1)) == MAIN
