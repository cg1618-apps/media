"""
The NG 多周目 card: four structured sections about starting a game over.
"""

import pytest

from app.schemas.note import sections_out
from app.utils import note_sections as ns

NG_PLUS_KEYS = ["ng_flow", "ng_carried_over", "ng_reset", "ng_before_starting"]
TYPED_KEYS = NG_PLUS_KEYS[1:]


def test_the_group_sits_below_worldbuilding():
    keys = [g.key for g in ns.NOTE_GROUPS]
    assert keys.index("ng_plus") == keys.index("worldbuilding") + 1
    group = ns.group_by_key("ng_plus")
    assert group.label == "NG 多周目"


def test_the_group_holds_four_sections_in_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "ng_plus"] == NG_PLUS_KEYS


def test_the_labels():
    labels = [ns.section_by_key(k).label for k in NG_PLUS_KEYS]
    assert labels == [
        "流程 Flow",
        "繼承內容 Carried Over",
        "重置內容 Reset",
        "新周目前需完成 Before Starting",
    ]


def test_the_card_renders_after_worldbuilding():
    # Card order is registry position, so this pins where the card lands.
    order = [s.key for s in sections_out("game")]
    assert order.index("ng_flow") > order.index("story_other")
    assert [k for k in order if k in NG_PLUS_KEYS] == NG_PLUS_KEYS


@pytest.mark.parametrize("key", NG_PLUS_KEYS)
def test_each_is_a_catalogue_structured_section_for_both_game_types(key):
    section = ns.section_by_key(key)
    assert section.shape == ns.SHAPE_STRUCTURED
    assert section.scope == ns.SCOPE_CATALOG
    assert section.owners == ns.GAME_OWNERS
    assert not section.hierarchical
    assert key in {s.key for s in sections_out("h-game")}


def test_flow_has_no_type():
    fields = [f.key for f in ns.section_by_key("ng_flow").fields]
    assert fields == ["name", "description", "points", "links"]
    assert ns.section_by_key("ng_flow").groupable_by is None


@pytest.mark.parametrize("key", TYPED_KEYS)
def test_the_typed_sections_fields_in_order(key):
    section = ns.section_by_key(key)
    fields = {f.key: f for f in section.fields}
    assert list(fields) == ["type", "name", "description", "points", "links"]
    assert (fields["type"].type, fields["type"].column) == (ns.FIELD_SELECT, "kind")
    assert fields["type"].options == ()
    assert fields["name"].column == "title"
    assert (fields["description"].type, fields["description"].column) == (
        ns.FIELD_TEXTAREA,
        "content",
    )
    assert (fields["links"].type, fields["links"].column) == (ns.FIELD_LINKS, "links")
    assert section.groupable_by == "type"


@pytest.mark.parametrize("key", NG_PLUS_KEYS)
def test_points_is_a_list_of_text(key):
    points = next(f for f in ns.section_by_key(key).fields if f.key == "points")
    assert points.type == ns.FIELD_LIST
    assert points.column is None
    assert [(i.key, i.type) for i in points.item_fields] == [("text", ns.FIELD_TEXT)]
