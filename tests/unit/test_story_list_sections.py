"""
The 劇情列表 Story List group, and the links the 劇情 sections gained.

Story List holds the first hierarchical sections in the registry, so what is
pinned here is as much about `hierarchical` and `require_any` working at all
as it is about these four sections.
"""

import pytest

from app.schemas.note import NoteCreate, section_out, validate_note_payload
from app.utils import note_sections as ns

STORY_LIST_KEYS = [
    "story_list_main",
    "story_list_side",
    "story_list_character",
    "story_list_event",
]

OWNER = "00000000-0000-0000-0000-000000000001"


def _payload(section: str, **kwargs) -> NoteCreate:
    return NoteCreate(owner_type="game", owner_id=OWNER, section=section, **kwargs)


# --- The group ------------------------------------------------------------


def test_the_group_exists_and_renders_below_story():
    assert ns.group_by_key("story_list") is not None
    keys = [g.key for g in ns.NOTE_GROUPS]
    assert keys.index("story_list") == keys.index("story") + 1

    # Card order is registry position - `splitBlocks` emits one card per group
    # in first-appearance order - so the group label is not what puts this
    # card below 劇情. Where its first section sits is.
    order = [s.key for s in ns.NOTE_SECTIONS]
    assert order.index("story_list_main") > order.index("endings")
    assert order.index("story_list_event") < order.index("todo_now")


def test_the_group_holds_four_strands_in_order():
    assert [
        s.key for s in ns.NOTE_SECTIONS if s.group == "story_list"
    ] == STORY_LIST_KEYS


def test_every_strand_is_game_only_catalogue_and_nestable():
    for key in STORY_LIST_KEYS:
        section = ns.section_by_key(key)
        assert section.owners == ns.GAME_OWNERS, key
        assert section.scope == ns.SCOPE_CATALOG, key
        assert section.hierarchical is True, key
        assert section.shape == ns.SHAPE_STRUCTURED, key


def test_every_strand_declares_the_same_four_fields():
    for key in STORY_LIST_KEYS:
        section = ns.section_by_key(key)
        assert [f.key for f in section.fields] == [
            "order",
            "name",
            "description",
            "links",
        ], key
        assert section.require_any == (("order", "name"),), key


def test_the_order_number_is_free_text_on_the_locator_column():
    # "3", "3.2", "II", "v1.4", "Act I" - a numeric column would refuse four
    # of those five.
    field = ns.field_by_key(ns.section_by_key("story_list_main"), "order")
    assert field.type == ns.FIELD_TEXT
    assert field.column == "locator"


def test_story_list_sections_are_the_only_hierarchical_ones():
    assert [
        s.key for s in ns.NOTE_SECTIONS if s.hierarchical
    ] == STORY_LIST_KEYS


# --- require_any, which is what makes an entry an entry -------------------


def test_an_order_number_alone_is_enough():
    validate_note_payload(_payload("story_list_main", locator="3.2"))


def test_a_name_alone_is_enough():
    validate_note_payload(_payload("story_list_main", title="The Lake"))


def test_a_description_alone_is_not():
    # A body with nothing to call it and no position in the list. This is the
    # case the guides sections would have accepted, and the reason
    # `require_any` exists at all.
    with pytest.raises(ValueError, match="at least one of: No., Name"):
        validate_note_payload(
            _payload("story_list_main", content="Something happens here")
        )


def test_links_alone_are_not_either():
    with pytest.raises(ValueError, match="at least one of: No., Name"):
        validate_note_payload(
            _payload("story_list_main", links=["https://example.com"])
        )


def test_a_strand_accepts_a_parent():
    # The schema layer only checks that the section MAY nest; that the parent
    # exists and is a sibling in every sense needs a query, and lives in
    # app/routers/note.py.
    validate_note_payload(
        _payload("story_list_main", title="Scene 1", parent_id=OWNER)
    )


def test_the_sections_endpoint_reports_the_nesting_and_the_rule():
    out = section_out(ns.section_by_key("story_list_side"), "game")
    assert out.hierarchical is True
    assert out.require_any == [["order", "name"]]


# --- 3: the 劇情 sections gained links -------------------------------------


def test_the_two_plot_sections_carry_links_and_keep_their_chapter():
    for key in ("main_plot", "side_plot"):
        section = ns.section_by_key(key)
        assert section.shape == ns.SHAPE_STRUCTURED, key
        assert [f.key for f in section.fields] == [
            "chapter",
            "description",
            "links",
        ], key
        # The chapter keeps the column it held as an episode_text section, so
        # no row had to move when links were added.
        assert ns.field_by_key(section, "chapter").column == "locator", key


def test_a_plot_beat_still_needs_no_chapter():
    # The opposite of episode_comments and highlight_moments: a beat
    # remembered without its chapter number is still a beat.
    validate_note_payload(_payload("main_plot", content="The tree burns."))
    assert ns.section_by_key("main_plot").locator_required is False


def test_endings_are_the_last_strand_of_the_story():
    """
    An ending is what the story DOES rather than a guide topic, so it belongs
    to 劇情 Story, as the strand after the character arcs.
    """
    section = ns.section_by_key("endings")
    assert section.group == "story"

    keys = [s.key for s in ns.NOTE_SECTIONS if s.group == "story"]
    assert keys[-1] == "endings"


def test_endings_carry_a_completion_status():
    section = ns.section_by_key("endings")
    assert [f.key for f in section.fields] == [
        "name",
        "completion",
        "description",
        "links",
    ]
    assert ns.field_by_key(section, "completion").options == (
        "not yet",
        "reached",
        "skipped",
    )


def test_the_timeline_carries_links():
    assert ns.section_by_key("timeline").shape == ns.SHAPE_TEXT_LINKS


def test_every_story_section_can_hold_a_link():
    # The whole of item 3: no subsection of 劇情 is left unable to cite.
    for section in ns.NOTE_SECTIONS:
        if section.group != "story":
            continue
        if section.shape == ns.SHAPE_STRUCTURED:
            assert any(
                f.type == ns.FIELD_LINKS for f in section.fields
            ), section.key
        else:
            assert section.shape == ns.SHAPE_TEXT_LINKS, section.key


# --- 6-2: side_quests is gone ---------------------------------------------


def test_side_quests_is_retired():
    assert ns.section_by_key("side_quests") is None
    assert "side_quests" not in {s.key for s in ns.sections_for("game")}


def test_nothing_uses_the_name_entries_shape_any_more():
    """
    `side_quests` was its last owner. The shape, its column, its component and
    its Sheets parsing all stay: rows written before this change are still in
    the database and still have to Pull, and a future section may want it.
    """
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES
    assert [s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_NAME_ENTRIES] == []
