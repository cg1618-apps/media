"""
Game Platform's two grains: a family and the consoles inside it.

GAME_PLATFORMS in app/utils/game_vocabulary.py is the one statement of which
console belongs to which family; the seed, replace_tags and the picker's
endpoint all read it.
"""

from app.utils.game_vocabulary import (
    GAME_PLATFORM_FAMILIES,
    GAME_PLATFORMS,
    GAME_VOCABULARY,
    with_platform_families,
)


def test_a_console_brings_its_family():
    assert with_platform_families(["Switch"]) == ["Nintendo", "Switch"]


def test_the_family_goes_in_just_before_its_first_console():
    assert with_platform_families(["PC", "PS5", "PS4", "Switch 2"]) == [
        "PC",
        "PlayStation",
        "PS5",
        "PS4",
        "Nintendo",
        "Switch 2",
    ]


def test_a_family_already_tagged_is_not_added_twice():
    assert with_platform_families(["Switch", "Nintendo"]) == ["Switch", "Nintendo"]


def test_matching_ignores_case_and_width_as_resolve_option_does():
    assert with_platform_families(["ｓｗｉｔｃｈ"]) == ["Nintendo", "ｓｗｉｔｃｈ"]
    assert with_platform_families(["Switch", "nintendo"]) == ["Switch", "nintendo"]


def test_families_and_unknown_values_pass_through_untouched():
    assert with_platform_families(["Browser", "Xbox", "Steam Deck"]) == [
        "Browser",
        "Xbox",
        "Steam Deck",
    ]
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


def test_the_vocabulary_lists_each_family_then_its_consoles():
    values = [value for value, _ in GAME_VOCABULARY["Game Platform"]]
    assert values[:3] == ["PlayStation", "PS1", "PS2"]
    assert values[values.index("Nintendo") + 1] == "Switch"
    assert values[values.index("Xbox") + 1] == "Original Xbox"
    assert values[-1] == "Browser"
    assert len(values) == len(set(values))
