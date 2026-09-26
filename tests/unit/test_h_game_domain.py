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
    H_GAME_ART_STYLES,
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
    assert H_GAME_H_PRESENTATIONS == ("靜圖", "動圖", "2D動畫", "3D動畫", "3D模型", "互動")
    assert H_GAME_PLATFORMS == ("Steam", "DLsite", "Nintendo", "Other")
    assert H_GAME_ART_STYLES == (
        "2D",
        "2.5D",
        "3D",
        "Pixel",
        "Live2D",
        "Live-action-like",
        "Live-action",
    )


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
    assert h_game.check_h_presentation(["互動", "3D模型"]) == ["3D模型", "互動"]
    assert h_game.check_art_style(["Live-action", "2D", "2D"]) == ["2D", "Live-action"]


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


# What an h-game does NOT take of game's notes. Everything else reaches it.
GAME_ONLY_SECTIONS = {
    # 評論: one list of reviews and comments stands in for these three.
    "public_reviews",
    "personal_reviews",
    "episode_comments",
    # Its highlights are h_game_highlights.
    "highlight_moments",
    # 攻略 and 圖鑑.
    "beginner",
    "trivia",
    "player_terms",
    # 劇情: its Story List is its story.
    "main_plot",
    "side_plot",
    "character_arcs",
    # 世界觀, whole.
    "lore",
    "story_terms",
    "timeline",
    "mysteries",
    "story_other",
    # 名言/梗, whole.
    "quotes",
    "memes",
}


def test_h_game_takes_game_notes_less_the_game_only_sections():
    game = {s.key for s in ns.sections_for("game")}
    h = {s.key for s in ns.sections_for("h-game")}
    assert game - h == GAME_ONLY_SECTIONS
    assert h - game == {"h_game_highlights", "reviews_and_comments"}


def test_the_per_owner_game_overrides_carry_over():
    for section in ns.NOTE_SECTIONS:
        if "game" not in section.owners or "h-game" not in section.owners:
            continue
        assert ns.label_for(section, "h-game") == ns.label_for(section, "game"), section.key
        assert ns.locator_for(section, "h-game") == ns.locator_for(section, "game"), section.key
        if not section.key.startswith("story_list_"):
            assert ns.group_for(section, "h-game") == ns.group_for(section, "game"), section.key
        assert ns.kinds_for(section, "h-game") == ns.kinds_for(section, "game"), section.key


def test_the_highlights_section():
    section = ns.section_by_key("h_game_highlights")
    assert section.owners == ("h-game",)
    assert section.group_by == "female_characters"
    assert section.owner_where == {}
    locator = next(f for f in section.fields if f.column == "locator")
    assert locator.label == "Route / Scene"
    assert [(f.key, f.type, f.column) for f in section.fields] == [
        ("female_characters", ns.FIELD_NAMES, None),
        ("male_characters", ns.FIELD_NAMES, None),
        ("route_scene", ns.FIELD_TEXT, "locator"),
        # Where the h-comic has a location.
        ("audio", ns.FIELD_SELECT, None),
        ("h_presentation", ns.FIELD_SELECT, None),
        ("art_style", ns.FIELD_SELECT, None),
        ("label", ns.FIELD_TEXT, "kind"),
        ("usefulness", ns.FIELD_SELECT, "status"),
        ("description", ns.FIELD_TEXTAREA, "content"),
    ]


def test_the_highlight_scene_fields_offer_the_entry_columns_options():
    """Audio, H 演出形式 and art style mean what the h_game columns mean."""
    section = ns.section_by_key("h_game_highlights")
    assert ns.field_by_key(section, "audio").options == H_GAME_AUDIO_AVAILABILITY
    assert (
        ns.field_by_key(section, "h_presentation").options == H_GAME_H_PRESENTATIONS
    )
    assert ns.field_by_key(section, "art_style").options == H_GAME_ART_STYLES
    assert ns.field_by_key(section, "location") is None
