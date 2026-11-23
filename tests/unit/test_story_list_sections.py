"""
The 劇情列表&任務 Story & Quests group: the four story strands, 支線任務 Side
Quests and 結局 Endings.

The strands are hierarchical sections, so what is pinned here is as much
about `hierarchical` and `require_any` working at all as it is about these
sections.
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
CARD = [*STORY_LIST_KEYS, "side_quests", "endings"]

OWNER = "00000000-0000-0000-0000-000000000001"


def _payload(section: str, **kwargs) -> NoteCreate:
    return NoteCreate(owner_type="game", owner_id=OWNER, section=section, **kwargs)


# --- The group ------------------------------------------------------------


def test_the_group_is_story_and_quests_and_story_is_gone():
    assert ns.group_by_key("story_list").label == "劇情列表&任務 Story & Quests"
    assert ns.group_by_key("story") is None
    keys = [g.key for g in ns.NOTE_GROUPS]
    assert keys.index("worldbuilding") == keys.index("story_list") + 1
    for key in ("main_plot", "side_plot", "character_arcs"):
        assert ns.section_by_key(key) is None, key
    assert not [s.key for s in ns.NOTE_SECTIONS if s.group == "story"]


def test_the_card_holds_the_strands_then_side_quests_then_endings():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "story_list"] == CARD


@pytest.mark.parametrize("owner", ["game", "h-game"])
def test_both_owners_read_the_same_card(owner):
    """No per-owner group: an h-game's strands are in this card too."""
    assert [
        s.key for s in ns.sections_for(owner) if ns.group_for(s, owner) == "story_list"
    ] == CARD


def test_every_strand_is_game_only_catalogue_and_nestable():
    for key in STORY_LIST_KEYS:
        section = ns.section_by_key(key)
        assert section.owners == ns.GAME_OWNERS, key
        assert section.scope == ns.SCOPE_CATALOG, key
        assert section.hierarchical is True, key
        assert section.shape == ns.SHAPE_STRUCTURED, key
        assert section.groups_by_owner == {}, key


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


def test_the_hierarchical_sections_are_the_strands_side_quests_and_geography():
    # 地理 Geography nests too - a region holding areas holding rooms - and is
    # declared with 世界觀 Worldbuilding, after this card.
    assert [s.key for s in ns.NOTE_SECTIONS if s.hierarchical] == [
        *STORY_LIST_KEYS,
        "side_quests",
        "geography",
    ]


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


# --- 結局 Endings ------------------------------------------------------


def test_endings_are_last_of_the_card():
    section = ns.section_by_key("endings")
    assert section.group == "story_list"
    assert section.groups_by_owner == {}
    keys = [s.key for s in ns.NOTE_SECTIONS if s.group == "story_list"]
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


# --- 支線任務 Side Quests -------------------------------------------------


def _quest(**kwargs) -> NoteCreate:
    return _payload("side_quests", **kwargs)


def test_side_quests_shape():
    section = ns.section_by_key("side_quests")
    assert section.label == "支線任務 Side Quests"
    assert section.owners == ns.GAME_OWNERS
    assert section.scope == ns.SCOPE_CATALOG
    assert section.shape == ns.SHAPE_STRUCTURED
    assert section.hierarchical is True
    assert section.groupable_by == "type"
    assert section.require_any == (("name",),)
    spec = {f.key: f for f in section.fields}
    assert list(spec) == [
        "type",
        "name",
        "region",
        "cautions",
        "prerequisite",
        "core_npc",
        "other_npcs",
        "rewards",
        "remark",
        "links",
        "done",
    ]
    assert (spec["type"].column, spec["type"].type, spec["type"].options) == (
        "kind",
        ns.FIELD_SELECT,
        (),
    )
    assert spec["type"].option_category == "Side Quest Type"
    assert spec["name"].column == "title"
    assert spec["remark"].column == "content"
    assert spec["links"].column == "links"
    for key in ("region", "cautions", "prerequisite", "core_npc", "other_npcs", "rewards"):
        assert spec[key].column is None, key
    assert spec["other_npcs"].type == ns.FIELD_NAMES
    assert spec["rewards"].type == ns.FIELD_LIST
    assert [f.key for f in spec["rewards"].item_fields] == ["text"]


def test_the_done_status_is_personal_ng_reset_and_starts_on_to_do():
    done = ns.field_by_key(ns.section_by_key("side_quests"), "done")
    assert done.column == "status"
    assert done.personal is True
    assert done.ng_resets is True
    assert done.default == "to do"
    assert done.options == ns.QUEST_STATUSES
    assert {"to do", "done"} <= set(done.options)


def test_both_npc_fields_suggest_from_the_characters():
    section = ns.section_by_key("side_quests")
    for key in ("core_npc", "other_npcs"):
        assert ns.field_by_key(section, key).suggest_from == "characters_guide", key
    out = {f.key: f for f in section_out(section, "h-game").fields}
    assert out["core_npc"].suggest_from == "characters_guide"
    assert out["other_npcs"].suggest_from == "characters_guide"
    assert out["region"].suggest_from is None


def test_a_quest_needs_a_name():
    with pytest.raises(ValueError, match="at least one of: Name"):
        validate_note_payload(_quest(fields={"region": "Valley IV"}))
    validate_note_payload(_quest(title="Lost Cargo"))


def test_a_full_quest_validates_and_free_text_npcs_are_accepted():
    validate_note_payload(
        _quest(
            kind="委託",
            title="Lost Cargo",
            content="worth it",
            links=[{"text": "Wiki", "url": "https://a.example"}],
            fields={
                "region": "Valley IV",
                "cautions": "missable after chapter 3",
                "prerequisite": "Finish Act I",
                "core_npc": "Somebody with no character row",
                "other_npcs": ["Perlica", "Chen Qianyu"],
                "rewards": [{"text": "500 gold"}, {"text": "A key"}],
            },
        )
    )


def test_a_step_nests_under_its_chain():
    validate_note_payload(_quest(title="Step 1", parent_id=OWNER))


def test_a_blank_other_npc_is_refused():
    with pytest.raises(ValueError, match="non-empty names"):
        validate_note_payload(_quest(title="x", fields={"other_npcs": ["  "]}))


def _section(owners, field):
    return ns.NoteSection(
        key="x",
        shape=ns.SHAPE_STRUCTURED,
        label="x",
        owners=owners,
        scope=ns.SCOPE_CATALOG,
        fields=(field,),
    )


def test_suggest_from_is_checked_at_import():
    npc = ns.NoteField(key="npc", label="NPC", suggest_from="characters_guide")
    # characters_guide is a game and h-game section only.
    with pytest.raises(ValueError, match="holds no named rows"):
        ns._check_suggest_from(_section(("game", "anime"), npc))
    closed = ns.NoteField(
        key="npc",
        label="NPC",
        type=ns.FIELD_SELECT,
        options=("a",),
        suggest_from="characters_guide",
    )
    with pytest.raises(ValueError, match="not a free-text field"):
        ns._check_suggest_from(_section(("game",), closed))
    # The mirror: the same text field on game alone passes.
    ns._check_suggest_from(_section(("game",), npc))


def test_the_side_quest_type_category_is_a_suggestion_category():
    assert "Side Quest Type" in ns.NOTE_SUGGESTION_CATEGORIES


# --- name_entries ---------------------------------------------------------


def test_nothing_uses_the_name_entries_shape_any_more():
    """
    The shape, its column, its component and its Sheets parsing all stay:
    rows written in it before are still in the database and still have to
    Pull, and a future section may want it.
    """
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES
    assert [s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_NAME_ENTRIES] == []
