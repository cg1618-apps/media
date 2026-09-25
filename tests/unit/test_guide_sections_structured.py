"""
Unit tests for the reshaped 攻略 Guides group.

Eleven sections moved from `name_entries` / `text_links` onto `structured`,
two were added, and `guide_resources` left the group for a card of its own.
What these pin is the field spec of each - the thing a reader of the section
list cannot check by eye, and the thing a stray edit to the registry would
change silently.
"""

from app.utils import note_sections as ns

# The 攻略 run, split across five cards. One card holding fifteen sections read
# as a wall of collapsed headers rather than as a guide, and `group` is
# display-only - so this was a registry edit with no migration and no data
# change. Each card answers one question, which is what keeps a section from
# being filed by elimination.
GUIDE_CARDS = {
    # How it plays and what is worth knowing: the way in, not the content.
    "guides": ["beginner", "gameplay_systems", "controls", "guide_notes", "trivia"],
    # How to build, in the order the decisions are made.
    "builds": [
        "stats_and_points",
        "skills",
        "builds_and_styles",
        "team_composition",
    ],
    # What to get. Three lists differing in what a row IS, not in what is
    # known about it - which is why they share one spec.
    "gear": ["weapons_and_gear", "items", "collectibles"],
    # Who you meet.
    "compendium": ["characters_guide", "enemies", "game_terms"],
    # Things outside the game itself, rendered beside the site-wide Resources
    # card rather than with the 攻略 run.
    "tools": ["mods_and_tools", "guide_resources"],
}

# Every section this file covers, whichever card it ended up in.
GUIDES_ORDER = [key for keys in GUIDE_CARDS.values() for key in keys]


def _keys(section_key: str) -> list[str]:
    return [f.key for f in ns.section_by_key(section_key).fields]


def _field(section_key: str, field_key: str) -> ns.NoteField:
    return ns.field_by_key(ns.section_by_key(section_key), field_key)


def test_each_card_holds_these_sections_in_this_order():
    for group, keys in GUIDE_CARDS.items():
        assert [s.key for s in ns.NOTE_SECTIONS if s.group == group] == keys, group


def test_the_cards_read_in_this_order_on_the_page():
    """
    Card order is registry position - `splitBlocks` emits one card per group in
    first-appearance order - so where a card lands is decided by where its
    FIRST section sits, and nothing else. Worth pinning: moving one entry would
    reorder a whole card silently.
    """
    order = [s.key for s in ns.NOTE_SECTIONS]
    firsts = [(order.index(keys[0]), group) for group, keys in GUIDE_CARDS.items()]
    assert [group for _, group in sorted(firsts)] == [
        "guides",
        "builds",
        "gear",
        "compendium",
        # After the 劇情, 劇情列表, 世界觀 and 待辦 cards: what it holds is not part of
        # the guide, so it sits beside the site-wide Resources card.
        "tools",
    ]
    assert order.index("guide_resources") < order.index("resources")


def test_no_guide_card_is_left_holding_one_section():
    # A card of one is a section wearing a second header. Two is the floor.
    for group, keys in GUIDE_CARDS.items():
        assert len(keys) >= 2, group


def test_endings_is_no_longer_a_guide_section():
    # It is a story OUTCOME, so it moved to 劇情 Story - see
    # test_story_list_sections.py, which owns its spec now.
    assert ns.section_by_key("endings").group == "story"


def test_every_guide_section_is_game_only_and_catalogue():
    for key in GUIDES_ORDER:
        section = ns.section_by_key(key)
        assert section.owners == ns.GAME_OWNERS, key
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
    """
    They differ in two flags and nothing else: whether a row can carry a
    variant, and whether collecting it is tracked. 技能 Skills takes neither.
    """
    assert _keys("skills") == ["type", "name", "description", "links"]
    for key in ("collectibles", "items", "weapons_and_gear"):
        assert _keys(key) == [
            "type",
            "name",
            "variant",
            "description",
            "links",
            "collected",
        ], key


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


def test_the_three_glossary_sections_share_one_spec():
    """
    遊戲名詞, 劇情名詞 and 玩法系統 are one shape: a term in Chinese, what
    else it is called, and what it means. Only 玩法系統 adds a type, because
    "game mode", "gacha" and "upgrade system" are different KINDS of system
    in a way two glossary terms are not - and links, because a mechanic is
    something a write-up explains, where a glossary term is only looked up.
    """
    for key in ("game_terms", "story_terms"):
        assert _keys(key) == ["name_cn", "name_alt", "description"], key
    assert _keys("gameplay_systems") == [
        "type",
        "name_cn",
        "name_alt",
        "description",
        "links",
    ]
    for key in ("game_terms", "story_terms", "gameplay_systems"):
        # The Chinese name is the row's name, so it is the `title` column and
        # heads the row; the alternative name is a key in `fields`.
        assert _field(key, "name_cn").column == "title", key
        assert _field(key, "name_alt").column is None, key
        assert _field(key, "description").column == "content", key


def test_story_terms_is_a_game_only_catalogue_section_in_the_worldbuilding_card():
    section = ns.section_by_key("story_terms")
    assert section.group == "worldbuilding"
    assert section.owners == ns.GAME_OWNERS
    assert section.scope == ns.SCOPE_CATALOG


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
        ("gameplay_systems", "type"),
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


def test_guide_resources_shares_a_card_with_mods_and_tools():
    """
    It stood alone while nothing else was like it. A mod is not a guide either
    - the registry said so where `mods_and_tools` used to sit, among the
    walkthrough content - and both are things outside the game, so pairing
    them gives one a home and moves the other out of the guide.
    """
    section = ns.section_by_key("guide_resources")
    assert section.group == "tools"
    assert section.standalone is False
    assert _keys("guide_resources") == ["name", "description", "links"]


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


# --- Collect status, and per-field defaults -------------------------------

COLLECTED_SECTIONS = ("weapons_and_gear", "items", "collectibles")


def test_the_three_gear_sections_track_collecting():
    for key in COLLECTED_SECTIONS:
        assert _keys(key) == [
            "type",
            "name",
            "variant",
            "description",
            "links",
            "collected",
        ], key
        field = _field(key, "collected")
        assert field.column == "status", key
        assert field.options == (
            "not collected",
            "enough collected",
            "fully collected",
            "skip",
        ), key
        assert field.default == "not collected", key


def test_skills_track_no_collecting():
    # A skill is learned rather than collected, so the field would be one
    # nobody could answer. The shared spec takes it as a flag for exactly
    # this reason.
    assert "collected" not in _keys("skills")
    assert ns.section_by_key("skills").fields[-1].key == "links"


def test_an_enemy_starts_on_to_beat():
    field = _field("enemies", "beaten")
    assert field.default == "to beat"
    assert field.default in field.options


def test_every_declared_default_is_one_of_its_field_s_options():
    # A default outside the options would be refused by the validator the
    # moment somebody saved the draft it prefilled - a form that cannot be
    # submitted without changing a field nobody touched.
    for section in ns.NOTE_SECTIONS:
        for field in section.fields:
            if field.default is not None and field.options:
                assert field.default in field.options, (section.key, field.key)


def test_only_a_select_carries_a_default():
    # A default on a free-text field is a placeholder wearing the wrong name:
    # it would be SAVED rather than shown, and then excluded from the
    # emptiness check on top of that.
    for section in ns.NOTE_SECTIONS:
        for field in section.fields:
            if field.default is not None:
                assert field.type == ns.FIELD_SELECT, (section.key, field.key)
                assert field.options, (section.key, field.key)


def test_no_section_defaults_every_field_it_has():
    """
    A defaulted field is excluded from the "is this row empty?" check, so a
    section whose every field carried one could never be saved at all - the
    validator falls back to counting all of them, which makes an untouched
    draft saveable instead. Neither outcome is wanted; the assertion is that
    the situation does not arise.
    """
    for section in ns.NOTE_SECTIONS:
        if section.fields:
            assert any(f.default is None for f in section.fields), section.key
