"""
The pure halves of the h-game rules: the vocabularies, the multi-choice
lists, the registrations that must name h-game wherever they name game, and
the notes registry. No database.
"""

import pytest

from app.services.domain import h_game
from app.services.domain.hierarchy import FRANCHISE_TYPE_FOR, entry_family
from app.services.rbac.gated_types import REQUIRED_LABEL_FOR_TYPE
from app.utils import note_sections as ns
from app.utils.constants import (
    FRANCHISE_FAMILY_FOR_TYPE,
    FRANCHISE_TYPES,
    H_GAME_AUDIO_AVAILABILITY,
    H_GAME_H_PRESENTATIONS,
    H_GAME_LANGUAGE_AVAILABILITY,
    H_GAME_PLATFORMS,
    H_GAME_PLAYSTYLES,
    FranchiseType,
)
from app.utils.credit_roles import CREDIT_ROLES, TAG_FIELDS, credit_roles_for, tag_fields_for


def test_the_vocabularies():
    assert H_GAME_PLAYSTYLES == ("ADV", "RPG", "SLG", "Other")
    assert H_GAME_LANGUAGE_AVAILABILITY == ("官方中文", "中文補丁", "無中文")
    assert H_GAME_AUDIO_AVAILABILITY == ("一般對話", "H場景")
    assert H_GAME_H_PRESENTATIONS == ("靜圖", "動圖", "2D動畫", "3D動畫", "互動")
    assert H_GAME_PLATFORMS == ("Steam", "DLsite", "Nintendo", "Other")


def test_the_franchise_type_is_a_family_of_its_own():
    assert FranchiseType.H_GAME.value == "H-Game"
    assert "H-Game" in FRANCHISE_TYPES
    assert FRANCHISE_TYPE_FOR["h-game"] == FranchiseType.H_GAME
    assert FRANCHISE_FAMILY_FOR_TYPE["H-Game"] == "h-game"
    assert entry_family("h-game") == "h-game"
    assert entry_family("h-comic") != entry_family("h-game")


def test_the_label_is_pinned_to_the_registry():
    assert REQUIRED_LABEL_FOR_TYPE[h_game.MEDIA_TYPE] == h_game.LABEL_KEY


def test_a_list_is_kept_in_vocabulary_order_once():
    assert h_game.check_platform(["Other", "Steam", "Other"]) == ["Steam", "Other"]
    assert h_game.check_h_presentation(["互動", "靜圖"]) == ["靜圖", "互動"]


def test_none_and_empty_are_different_answers():
    assert h_game.check_audio_availability(None) is None
    assert h_game.check_audio_availability([]) == []


@pytest.mark.parametrize("value", ["Steam", ["Xbox"], [1], {"Steam": True}])
def test_a_malformed_list_is_refused(value):
    with pytest.raises(ValueError):
        h_game.check_platform(value)


def test_a_single_choice_is_checked_and_blank_is_none():
    assert h_game.check_playstyle("ADV") == "ADV"
    assert h_game.check_playstyle("  ") is None
    with pytest.raises(ValueError):
        h_game.check_playstyle("FPS")
    with pytest.raises(ValueError):
        h_game.check_language_availability("English")


def test_the_sheet_form_drops_rather_than_raises():
    assert h_game.lenient_choice_list("Steam, Xbox", H_GAME_PLATFORMS, "platform") == ["Steam"]
    assert h_game.lenient_choice_list(["DLsite", "Steam"], H_GAME_PLATFORMS, "platform") == [
        "Steam",
        "DLsite",
    ]
    assert h_game.lenient_choice_list({"x": 1}, H_GAME_PLATFORMS, "platform") is None


def test_credits_and_tags():
    assert [r.key for r in credit_roles_for("h-game")] == ["studio"]
    assert {f.key for f in tag_fields_for("h-game")} == {
        "game_genre",
        "game_theme",
        "h_genre_plot",
        "h_genre_appearance",
        "h_genre_relation",
    }
    assert "h-game" in CREDIT_ROLES["studio"].media_types
    assert "h-game" not in TAG_FIELDS["game_platform"].media_types


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------


def test_every_game_section_reaches_h_game():
    game = {s.key for s in ns.sections_for("game")}
    h = {s.key for s in ns.sections_for("h-game")}
    assert game <= h
    assert h - game == {"h_game_highlights"}


def test_the_per_owner_game_overrides_carry_over():
    for section in ns.NOTE_SECTIONS:
        if "game" not in section.owners:
            continue
        assert ns.label_for(section, "h-game") == ns.label_for(section, "game"), section.key
        assert ns.locator_for(section, "h-game") == ns.locator_for(section, "game"), section.key
        assert ns.group_for(section, "h-game") == ns.group_for(section, "game"), section.key
        assert ns.kinds_for(section, "h-game") == ns.kinds_for(section, "game"), section.key


def test_the_highlights_section():
    section = ns.section_by_key("h_game_highlights")
    assert section.owners == ("h-game",)
    assert section.group_by == "female_characters"
    assert section.owner_where == {}
    locator = next(f for f in section.fields if f.column == "locator")
    assert locator.label == "Route / Scene"
    comic = ns.section_by_key("h_comic_highlights")
    # KR h-comic's fields, bar the locator's label.
    assert [(f.key, f.type, f.column) for f in section.fields if f.column != "locator"] == [
        (f.key, f.type, f.column) for f in comic.fields if f.column != "locator"
    ]
