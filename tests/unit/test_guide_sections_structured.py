"""
Unit tests for the reshaped 攻略 Guides group.

Eleven sections moved from `name_entries` / `text_links` onto `structured`,
two were added, and `guide_resources` left the group for a card of its own.
What these pin is the field spec of each - the thing a reader of the section
list cannot check by eye, and the thing a stray edit to the registry would
change silently.
"""

from app.utils import note_sections as ns

# Display order of the 攻略 group after the reshape. `side_quests` is still
# here: it leaves when the 劇情列表 Story List group exists to receive it.
GUIDES_ORDER = [
    "beginner",
    "controls",
    "guide_notes",
    "trivia",
    "side_quests",
    "stats_and_points",
    "builds_and_styles",
    "team_composition",
    "skills",
    "collectibles",
    "items",
    "weapons_and_gear",
    "characters_guide",
    "enemies",
    "endings",
    "mods_and_tools",
]


def _keys(section_key: str) -> list[str]:
    return [f.key for f in ns.section_by_key(section_key).fields]


def _field(section_key: str, field_key: str) -> ns.NoteField:
    return ns.field_by_key(ns.section_by_key(section_key), field_key)


def test_the_group_reads_in_this_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "guides"] == GUIDES_ORDER


def test_every_guide_section_is_game_only_and_catalogue():
    for key in GUIDES_ORDER:
        section = ns.section_by_key(key)
        assert section.owners == ("game",), key
        assert section.scope == ns.SCOPE_CATALOG, key


def test_guide_notes_is_a_plain_list_beneath_controls():
    section = ns.section_by_key("guide_notes")
    assert section.shape == ns.SHAPE_TEXT_LINKS
    assert GUIDES_ORDER.index("guide_notes") == GUIDES_ORDER.index("controls") + 1


def test_team_composition_sits_below_builds():
    assert (
        GUIDES_ORDER.index("team_composition")
        == GUIDES_ORDER.index("builds_and_styles") + 1
    )


# --- The field specs ------------------------------------------------------


def test_stats_carry_four_values_and_only_mine_is_quick_editable():
    assert _keys("stats_and_points") == [
        "name",
        "min_value",
        "rec_value",
        "softmax_value",
        "my_value",
        "description",
    ]
    quick = [f.key for f in ns.section_by_key("stats_and_points").fields if f.quick_edit]
    assert quick == ["my_value"]
    # The three thresholds are the game's, so they are written not stepped.
    assert not _field("stats_and_points", "min_value").quick_edit


def test_quick_edit_is_used_by_exactly_one_field_in_the_whole_registry():
    # It puts an editor in the READ view, so a section that grows one by
    # accident starts saving on blur where nobody expects it to.
    quick = [
        (s.key, f.key) for s in ns.NOTE_SECTIONS for f in s.fields if f.quick_edit
    ]
    assert quick == [("stats_and_points", "my_value")]


def test_a_build_holds_five_nested_lists():
    assert _keys("builds_and_styles") == [
        "name",
        "stats",
        "armor",
        "weapons",
        "items",
        "skills",
        "description",
        "links",
    ]
    rows = {
        "stats": ["name", "min_value", "rec_value"],
        "armor": ["body_part", "name", "special"],
        "weapons": ["range_type", "type", "name", "special"],
        "items": ["type", "name", "amount"],
        "skills": ["type", "name"],
    }
    for key, item_keys in rows.items():
        field = _field("builds_and_styles", key)
        assert field.type == ns.FIELD_LIST, key
        assert [f.key for f in field.item_fields] == item_keys, key


def test_a_team_is_a_list_of_members():
    assert _keys("team_composition") == ["name", "members", "description", "links"]
    members = _field("team_composition", "members")
    assert [f.key for f in members.item_fields] == [
        "name",
        "role",
        "build",
        "description",
    ]
    assert members.item_fields[1].label == "定位"


def test_the_four_named_thing_sections_share_one_spec():
    assert _keys("skills") == ["type", "name", "description", "links"]
    for key in ("collectibles", "items", "weapons_and_gear"):
        assert _keys(key) == ["type", "name", "variant", "description", "links"], key


def test_characters_carry_a_group_and_an_alias_and_no_links():
    assert _keys("characters_guide") == ["group", "name", "alias", "description"]


def test_enemies_carry_a_tier_a_region_and_a_closed_beaten_status():
    assert _keys("enemies") == [
        "tier",
        "region",
        "name",
        "alias",
        "description",
        "beaten",
    ]
    assert _field("enemies", "beaten").options == ("to beat", "beaten", "cheesed", "skip")


def test_endings_carry_a_completion_status():
    assert _keys("endings") == ["name", "completion", "description", "links"]
    assert _field("endings", "completion").options == ("not yet", "reached", "skipped")


def test_mods_keep_their_type_and_gain_a_developer_and_a_status():
    assert _keys("mods_and_tools") == [
        "type",
        "name",
        "developer",
        "description",
        "status",
    ]
    # The old `kinds` dropdown, carried over rather than dropped: every
    # existing row is tagged with one of these two.
    assert _field("mods_and_tools", "type").options == ("Mod", "Tool")
    assert _field("mods_and_tools", "status").options == (
        "常駐",
        "to use",
        "to play",
        "played",
        "won't",
    )


def test_the_open_vocabularies_declare_no_options():
    # A select with no options renders as free text. Tier, group and type are
    # the game's vocabulary, not ours, so a closed list would be wrong by the
    # second game.
    for section_key, field_key in (
        ("enemies", "tier"),
        ("characters_guide", "group"),
        ("skills", "type"),
        ("collectibles", "type"),
    ):
        field = _field(section_key, field_key)
        assert field.type == ns.FIELD_SELECT, (section_key, field_key)
        assert field.options == (), (section_key, field_key)


def test_no_structured_guide_section_still_declares_kinds_or_statuses():
    # `kinds` / `statuses` are the PER-SHAPE dropdown vocabularies, and a
    # structured section's dropdowns come from its spec instead. A section
    # declaring both would have two sources of truth for one column, and
    # validate_note_payload consults only the spec.
    for key in GUIDES_ORDER:
        section = ns.section_by_key(key)
        if section.shape == ns.SHAPE_STRUCTURED:
            assert section.kinds == (), key
            assert section.statuses == (), key


# --- guide_resources leaves the group -------------------------------------


def test_guide_resources_is_standalone_and_sits_before_resources():
    section = ns.section_by_key("guide_resources")
    assert section.group is None
    assert section.standalone is True
    assert _keys("guide_resources") == ["name", "description", "links"]

    order = [s.key for s in ns.NOTE_SECTIONS]
    assert order.index("guide_resources") < order.index("resources")


def test_guide_resources_and_resources_share_neither_key_nor_label():
    # Two cards reading "Resources" on one page would be unreadable.
    guide = ns.section_by_key("guide_resources")
    site = ns.section_by_key("resources")
    assert guide.key != site.key
    assert guide.label != site.label


def test_no_guide_section_reaches_another_media_type():
    for owner in ("anime", "novel", "manga", "series", "franchise", "collection"):
        keys = {s.key for s in ns.sections_for(owner)}
        for key in GUIDES_ORDER + ["guide_resources"]:
            assert key not in keys, (owner, key)


def test_no_guide_section_carries_a_locator():
    # A guide row says WHICH region or WHICH chapter as a field of its own
    # where it needs to; none of them anchors to one the way an episode
    # comment does, so none shows the locator input.
    for key in GUIDES_ORDER + ["guide_resources"]:
        assert ns.section_by_key(key).locator_placeholder is None, key
