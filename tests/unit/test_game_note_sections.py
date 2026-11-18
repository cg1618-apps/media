"""
The game 劇情&任務, 世界觀 and 待辦 sections, and the name_entries shape.

The 攻略 Guides group's order, field specs, owners and scope live in
test_guide_sections_structured.py, and the 劇情&任務 card's own sections in
test_story_list_sections.py. What stays here is the cards around them.
"""

import dataclasses

import pytest

from app.schemas.note import NoteCreate, validate_note_payload
from app.utils import note_sections as ns

STORY_KEYS = [
    "story_list_main",
    "story_list_side",
    "story_list_character",
    "story_list_event",
    "side_quests",
    # An ending is a story OUTCOME rather than a guide topic, so it is the
    # last of the story card rather than a 攻略 section.
    "endings",
]

# The world the plot happens in, a card of its own after 劇情&任務.
STORY_SETTING_KEYS = [
    "lore",
    # A glossary of the story's own vocabulary, beside the lore it names.
    "story_terms",
    "timeline",
    "mysteries",
    # The overflow for a stray story observation.
    "story_other",
]

TODO_KEYS = ["todo_now", "todo_next", "todo_later", "todo_maybe"]


def test_name_entries_is_a_stored_shape():
    assert ns.SHAPE_NAME_ENTRIES == "name_entries"
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES


def test_the_groups_exist_in_order():
    keys = [g.key for g in ns.NOTE_GROUPS]
    assert keys == [
        "reviews",
        "analysis_group",
        # 攻略 was one card of fifteen sections. Five now, each answering one
        # question; the order here mirrors the order they render in.
        "guides",
        "builds",
        "gear",
        "compendium",
        # 劇情&任務: the story as a structure, the quests, the endings.
        "story_list",
        # The world the story happens in.
        "worldbuilding",
        # Starting over, read once the story has been seen through.
        "ng_plus",
        "todo",
        "music",
        # Renders near the end, beside the site-wide Resources card.
        "tools",
        "quotes_memes",
    ]


def test_the_story_card_holds_the_strands_the_quests_and_the_endings_in_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "story_list"] == STORY_KEYS


def test_the_worldbuilding_group_holds_six_sections_in_order():
    # 地理 Geography is the sixth, above 時間線 Timeline - and, unlike the
    # five, an h-game's too, which keeps it in 圖鑑與名詞 Compendium.
    keys = [s.key for s in ns.NOTE_SECTIONS if s.group == "worldbuilding"]
    expected = list(STORY_SETTING_KEYS)
    expected.insert(expected.index("timeline"), "geography")
    assert keys == expected


def test_the_worldbuilding_card_renders_after_the_story_list():
    # Card order is registry position, so this pins where the card lands.
    order = [s.key for s in ns.NOTE_SECTIONS]
    assert order.index("lore") > order.index("story_list_event")
    assert order.index("story_other") < order.index("todo_now")


def test_the_todo_group_holds_four_buckets_then_the_saves():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "todo"] == (
        TODO_KEYS + ["saves"]
    )


def test_saves_is_a_personal_structured_game_section():
    section = ns.section_by_key("saves")
    assert section.label == "存檔 Saves"
    assert section.shape == ns.SHAPE_STRUCTURED
    assert section.owners == ns.GAME_OWNERS
    assert section.scope == ns.SCOPE_PERSONAL


def test_a_save_is_number_name_checkpoint_note_and_the_slot_it_came_from():
    fields = {f.key: f for f in ns.section_by_key("saves").fields}
    assert list(fields) == [
        "number", "name", "checkpoint", "note", "based_on", "choice_node",
    ]
    assert fields["number"].column == "locator"
    assert fields["name"].column == "title"
    assert fields["note"].column == "content"
    # Not a column: no `note` column means "the slot this one was copied
    # from", so it is stored in the `fields` blob.
    assert fields["based_on"].column is None


def test_a_save_may_sit_on_a_node_of_the_choice_graph():
    field = {f.key: f for f in ns.section_by_key("saves").fields}["choice_node"]
    assert field.label == "At node"
    assert field.type == ns.FIELD_CHOICE_NODE == "choice_node"
    # In `fields`, like based_on: no `note` column holds a node id.
    assert field.column is None


def test_a_choice_node_must_be_a_uuid():
    # Whether it names a node of THIS game needs a query, so the router owns
    # that half; the schema refuses what cannot be an id at all.
    with pytest.raises(ValueError):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=None,
                section="saves",
                locator="1",
                kind="regular",
                fields={"choice_node": "the fork"},
            )
        )
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="saves",
            locator="1",
            kind="regular",
            fields={"choice_node": "8d0f6c1e-4b7a-4c55-9d43-2f6f0b8e1a11"},
        )
    )


def test_both_slot_fields_say_which_slot_they_mean():
    # A bare "e.g. 2" does not say whose slot: the number is this save's own,
    # the other is the slot it was copied from.
    fields = {f.key: f for f in ns.section_by_key("saves").fields}
    assert fields["number"].placeholder == "This save's slot number"
    assert fields["based_on"].placeholder == "Slot number it was copied from"


def test_a_save_is_a_regular_checkpoint_unless_marked_main():
    checkpoint = {f.key: f for f in ns.section_by_key("saves").fields}[
        "checkpoint"
    ]
    assert checkpoint.type == ns.FIELD_SELECT
    assert checkpoint.column == "kind"
    assert checkpoint.options == ("regular", "main")
    assert checkpoint.default == "regular"


def test_a_save_needs_a_number_or_a_name():
    # The checkpoint is defaulted, so it cannot be what makes a row worth
    # keeping, and a note alone does not say which save it describes.
    with pytest.raises(ValueError):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=None,
                section="saves",
                kind="regular",
                content="before the boss",
            )
        )
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="saves",
            locator="3",
            kind="main",
            fields={"based_on": "2"},
        )
    )


def test_the_story_card_and_the_todo_buckets_reach_h_game():
    for key in STORY_KEYS + TODO_KEYS:
        assert ns.section_by_key(key).owners == ns.GAME_OWNERS, key


def test_the_worldbuilding_sections_are_game_only():
    for key in STORY_SETTING_KEYS:
        assert ns.section_by_key(key).owners == ("game",), key


def test_story_is_catalogue_and_todo_is_personal():
    """
    A todo list is one person's. A catalogue-scope todo would be admin-written
    and read by every viewer, which is not what a todo list is.
    """
    for key in STORY_KEYS:
        assert ns.section_by_key(key).scope == ns.SCOPE_CATALOG, key
    for key in TODO_KEYS:
        assert ns.section_by_key(key).scope == ns.SCOPE_PERSONAL, key


def test_the_old_flat_game_sections_are_gone():
    """Retired by the migration in the same change; their rows moved."""
    assert ns.section_by_key("guides") is None
    assert ns.section_by_key("builds_and_mods") is None


def test_the_guides_group_key_is_free_because_the_section_was_retired():
    """
    Group keys and section keys live in separate dicts, so `guides` COULD name
    both. It names only the group, which is the whole reason the section was
    renamed rather than relabelled.
    """
    assert ns.group_by_key("guides") is not None
    assert ns.section_by_key("guides") is None


def test_no_story_or_todo_section_has_a_dropdown():
    with_kinds = [
        s.key for s in ns.NOTE_SECTIONS if s.kinds and s.key in STORY_KEYS + TODO_KEYS
    ]
    assert with_kinds == []


def test_no_story_or_todo_section_carries_a_section_level_locator():
    """
    A structured section's placeholders come from its spec, so a
    section-level one would be read by nothing.
    """
    anchored = [
        s.key
        for s in ns.NOTE_SECTIONS
        if s.locator_placeholder and s.key in STORY_KEYS + TODO_KEYS
    ]
    assert anchored == []


def test_highlight_moments_still_belongs_to_game_and_stays_flat():
    section = ns.section_by_key("highlight_moments")
    assert section.shape == ns.SHAPE_EPISODE_TEXT
    # An h-game's highlights are h_game_highlights instead.
    assert section.owners == ("game",)
    assert section.group is None


def test_the_site_wide_resources_section_is_untouched():
    """It is a peer of guide_resources, not a replacement for it."""
    section = ns.section_by_key("resources")
    assert section.shape == ns.SHAPE_NAME_LINKS
    assert section.owners == ns.ALL_OWNERS
    assert section.standalone is True


def test_part_reviews_reuse_episode_comments_with_a_game_label():
    section = ns.section_by_key("episode_comments")
    assert "game" in section.owners
    assert section.labels["game"] == "各章評論 Part Reviews"
    assert section.locator_placeholders["game"] == "Chapter / Part, e.g. Ch 3"


@pytest.fixture
def name_entries_section(monkeypatch):
    """
    A `name_entries` section, registered under a real key for the duration of
    one test.

    `side_quests` was the shape's last owner and moved into 劇情列表 Story List.
    The shape, its `entries` column, its component and its Google Sheets
    parsing all remain - rows written before that change are still in the
    database and still have to Pull - so its validation still has to work, and
    would otherwise be covered by nothing at all. A section patched in is the
    honest way to keep testing a live branch with no live caller; deleting
    these tests would have left the branch green by absence.
    """
    section = dataclasses.replace(
        ns.section_by_key("trivia"),
        shape=ns.SHAPE_NAME_ENTRIES,
        fields=(),
    )
    monkeypatch.setitem(ns._BY_KEY, "trivia", section)
    return section


def test_a_name_entries_note_needs_a_title_or_an_entry(name_entries_section):
    """
    validate_note_payload raises ValueError, which the router turns into a 422 -
    it is not a pydantic validator, so constructing the model cannot fail here.
    """
    with pytest.raises(ValueError, match="needs a name or an entry"):
        validate_note_payload(
            NoteCreate(owner_type="game", owner_id=None, section="trivia")
        )


def test_a_name_entries_note_accepts_mixed_text_and_link_entries(
    name_entries_section,
):
    note = NoteCreate(
        owner_type="game",
        owner_id=None,
        section="trivia",
        title="Ranni's questline",
        entries=[
            {"type": "text", "value": "Do not kill Blaidd"},
            {"type": "link", "value": "https://example.com", "label": "Steps"},
        ],
    )
    validate_note_payload(note)
    assert len(note.entries) == 2
    assert note.entries[0]["type"] == "text"


def test_an_entry_alone_is_enough_without_a_title(name_entries_section):
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="trivia",
            entries=[{"type": "link", "value": "https://example.com"}],
        )
    )


def test_a_structured_guide_section_rejects_the_retired_build_kind():
    """
    `Build` was `builds_and_mods`'s kind, and the migration that split that
    section cleared it. It is still refused, but by the FIELD SPEC now rather
    than by the section's `kinds`: `mods_and_tools` declares a `type` field on
    the `kind` column with two options, and `Build` is not one of them.
    """
    with pytest.raises(ValueError, match="not a valid type"):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=None,
                section="mods_and_tools",
                title="SKSE",
                kind="Build",
            )
        )
def test_a_todo_item_may_carry_the_link_that_prompted_it():
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="todo_next",
            content="Clear Caelid",
            links=["https://example.com/guide"],
        )
    )


def test_the_new_sections_do_not_apply_to_anime():
    keys = {s.key for s in ns.sections_for("anime")}
    for key in STORY_KEYS + TODO_KEYS:
        assert key not in keys, key
