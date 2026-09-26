"""
Where a game's notes RENDER, as opposed to what they hold.

Three changes share this file because all three are layout: 解析 Analysis
moves into 評論 Reviews for games alone, 備註列表 joins 備註 in the Notes card,
and 待辦 Todo is rendered by the game detail page inside its Progress slip
(the frontend half of that is Game.test.jsx).
"""

from app.schemas.note import section_out, sections_out
from app.utils import note_sections as ns


def _group_of(section_key: str, owner_type: str) -> str | None:
    return section_out(ns.section_by_key(section_key), owner_type).group


# --- The mechanism --------------------------------------------------------


def test_group_for_falls_back_to_the_declared_group():
    section = ns.section_by_key("advantages")
    assert section.groups_by_owner == {}
    assert ns.group_for(section, "game") == "reviews"
    assert ns.group_for(section, "anime") == "reviews"


def test_analysis_is_the_only_section_with_a_per_owner_group():
    # It puts the same rows in a different card for one owner, which is worth
    # keeping rare: a reader of NOTE_SECTIONS sees `group` and would have to
    # notice the override to be right about where a section lands.
    #
    # The others are all h-game's. 評論 Reviews and Comments opens its 評論
    # card, where an h-comic or a hentai has it flat, having nothing else of
    # 評論 to share a card with. And an h-game has no prose 劇情, so for it
    # the Story List sections ARE 劇情.
    overridden = [s.key for s in ns.NOTE_SECTIONS if s.groups_by_owner]
    assert overridden == [
        "reviews_and_comments",
        "analysis",
        "story_list_main",
        "story_list_side",
        "story_list_character",
        "story_list_event",
    ]


def test_every_overridden_group_is_a_real_group():
    for section in ns.NOTE_SECTIONS:
        for owner, group in section.groups_by_owner.items():
            assert owner in section.owners, (section.key, owner)
            assert ns.group_by_key(group) is not None, (section.key, group)


# --- 4: 解析 Analysis ------------------------------------------------------


def test_analysis_is_a_review_subsection_for_a_game():
    assert _group_of("analysis", "game") == "reviews"


def test_analysis_keeps_its_own_card_everywhere_else():
    for owner in ("anime", "anime-movie", "tv-show", "novel", "manga", "series"):
        assert _group_of("analysis", owner) == "analysis_group", owner


def test_analysis_reads_last_in_the_reviews_card_for_a_game():
    # Card contents follow registry order, and `analysis` is declared after
    # every review section - so "last" needs no mechanism of its own, but it
    # does need asserting, because moving the entry would silently change it.
    reviews = [s.key for s in sections_out("game") if s.group == "reviews"]
    assert reviews[-1] == "analysis"


def test_a_game_has_no_analysis_card_left_to_render():
    """
    The reason the override is the right shape rather than a second section.

    `analysis_group` holds 解析, 分鏡/演出, 巧思, 伏筆 and 對稱, and a game has
    only the first. Moving it leaves that card with nothing, so it is not
    rendered at all - rather than standing there holding one section, which is
    what it did before.
    """
    assert [s.key for s in sections_out("game") if s.group == "analysis_group"] == []
    assert [
        s.key for s in sections_out("anime") if s.group == "analysis_group"
    ] == ["analysis", "cinematography", "foreshadowing", "symmetry"]


# --- 5: 備註列表 Remark List ----------------------------------------------


def test_the_remark_list_sits_beside_the_remark_and_is_not_a_group():
    section = ns.section_by_key("remark_list")
    assert section.group is None
    assert section.standalone is False

    keys = [s.key for s in sections_out("game")]
    assert keys.index("remark_list") == keys.index("remark") + 1


def test_the_remark_list_is_personal_and_takes_many_rows():
    section = ns.section_by_key("remark_list")
    assert section.scope == ns.SCOPE_PERSONAL
    # The whole point of it. 備註 is the singleton; this is the list.
    assert section.singleton is False
    assert ns.section_by_key("remark").singleton is True


def test_the_remark_and_the_remark_list_are_both_kept():
    # Deliberately not merged: a list whose first item is three paragraphs
    # reads as badly as a paragraph made of bullets.
    game = {s.key for s in sections_out("game")}
    assert {"remark", "remark_list"} <= game
    assert ns.section_by_key("remark").singleton
    assert not ns.section_by_key("remark_list").singleton


def test_the_remark_list_reaches_every_owner_that_has_a_remark():
    # The need came from games, but nothing about a short note is game-shaped,
    # and the two are read as a pair wherever 備註 appears - so they share an
    # owners tuple as well as a scope.
    remark = ns.section_by_key("remark")
    assert ns.section_by_key("remark_list").owners == remark.owners
    for owner in ("anime", "novel", "series", "collection", "game"):
        keys = {s.key for s in sections_out(owner)}
        assert {"remark", "remark_list"} <= keys, owner


def test_the_remark_list_can_carry_a_link():
    assert ns.section_by_key("remark_list").shape == ns.SHAPE_TEXT_LINKS
