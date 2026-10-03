"""Unit tests for the notes section registry."""

import dataclasses

from app.utils import note_sections as ns
from app.utils.media_resolver import OWNER_TABLES


def test_every_section_has_a_known_shape():
    valid = {
        ns.SHAPE_TEXT,
        ns.SHAPE_TEXT_LINKS,
        ns.SHAPE_TEXT_OR_LINK,
        ns.SHAPE_EPISODE_TEXT,
        ns.SHAPE_NAME_LINKS,
        ns.SHAPE_NAME_ENTRIES,
        ns.SHAPE_MUSIC_TRACK,
        ns.SHAPE_MUSIC_STATUS,
        ns.SHAPE_STRUCTURED,
        ns.SHAPE_EXTERNAL,
    }
    for sec in ns.NOTE_SECTIONS:
        assert sec.shape in valid, f"{sec.key} has unknown shape {sec.shape}"


def test_section_keys_are_unique():
    keys = [s.key for s in ns.NOTE_SECTIONS]
    assert len(keys) == len(set(keys))


def test_every_owner_is_a_real_owner_table():
    for sec in ns.NOTE_SECTIONS:
        for owner in sec.owners:
            assert owner in OWNER_TABLES, f"{sec.key} names unknown owner {owner}"


def test_only_remark_is_a_singleton():
    # `ost` was the other one until it became a list of songs like OP and ED.
    singletons = [s.key for s in ns.NOTE_SECTIONS if s.singleton]
    assert singletons == ["remark"]


def test_only_declared_sections_have_kinds():
    with_kinds = [s.key for s in ns.NOTE_SECTIONS if s.kinds]
    # op and ed are absent: their Song Type is free text with suggestions from
    # the "Song Type" option category, not a closed `kinds` list. music_status
    # keys its rows by the music section they describe.
    assert with_kinds == [
        "highlights",
        "music_status",
        "op_ed_changes",
    ]
    # `mods_and_tools` held Mod / Tool here until it became structured. A
    # structured section's dropdowns are fields of its spec, and
    # validate_note_payload consults only the spec - so a section declaring
    # both would have two sources of truth for one column.
    assert ns.section_by_key("mods_and_tools").kinds == ()
    assert [
        f.options
        for f in ns.section_by_key("mods_and_tools").fields
        if f.column == "kind"
    ] == [("Mod", "Tool")]


# Every song list of the music group. One shape, so a song is the same row
# whichever list it is in.
SONG_SECTIONS = ("op", "ed", "insert_songs", "ost")


def test_song_sections_are_music_track_shaped_and_anime_only():
    for key in SONG_SECTIONS:
        sec = ns.section_by_key(key)
        assert sec is not None, f"{key} is missing from the registry"
        assert sec.shape == ns.SHAPE_MUSIC_TRACK
        assert sec.owners == ("anime",)
        assert sec.scope == ns.SCOPE_CATALOG
        assert sec.group == "music"


def test_every_song_carries_the_per_song_status_and_an_optional_episode():
    for key in SONG_SECTIONS:
        sec = ns.section_by_key(key)
        assert sec.statuses == ns.MUSIC_STATUSES == ("Need", "Pending", "Done")
        assert ns.locator_for(sec, "anime") == "Episode(s), e.g. ep 3"
        assert not sec.locator_required
        assert not sec.singleton


def test_only_op_and_ed_carry_a_free_text_song_type():
    for key in ("op", "ed"):
        sec = ns.section_by_key(key)
        assert sec.kind_category == ns.SONG_TYPE_CATEGORY == "Song Type"
        assert sec.kinds == ()
        assert sec.default_kind == "normal"
    for key in ("insert_songs", "ost"):
        sec = ns.section_by_key(key)
        assert sec.kind_category is None
        assert sec.kinds == ()
        assert sec.default_kind is None


def test_song_links_are_text_and_url_pairs_suggested_from_song_source():
    for key in SONG_SECTIONS:
        sec = ns.section_by_key(key)
        assert ns.uses_link_pairs(sec)
        assert sec.link_text_category == ns.SONG_SOURCE_CATEGORY == "Song Source"


def test_link_pairs_are_confined_to_the_songs_and_easter_eggs():
    paired = {s.key for s in ns.NOTE_SECTIONS if ns.uses_link_pairs(s)}
    assert paired == set(SONG_SECTIONS) | {"easter_eggs"}
    assert ns.LINK_PAIR_SECTIONS == frozenset(paired)


def test_only_the_music_sections_carry_a_status():
    # Nothing outside the music group has a section-level status. OST is a
    # song list now, so it carries one like the other three.
    with_status = [s.key for s in ns.NOTE_SECTIONS if s.statuses]
    assert with_status == ["music_status", "op", "ed", "insert_songs", "ost"]


def test_music_status_holds_one_row_per_song_list():
    sec = ns.section_by_key("music_status")
    assert sec.shape == ns.SHAPE_MUSIC_STATUS
    assert sec.shape in ns.STORED_SHAPES
    assert sec.owners == ("anime",)
    assert sec.scope == ns.SCOPE_CATALOG
    assert sec.group == "music"
    # Not a subsection of its own: its rows are drawn above the lists they
    # describe, so the page is told not to render it as a card.
    assert sec.hidden is True
    assert sec.one_per_kind is True
    assert sec.kinds == SONG_SECTIONS == ns.MUSIC_TYPE_KEYS
    assert sec.statuses == ns.MUSIC_TYPE_STATUSES == (
        "All Done",
        "Done",
        "Need",
        "Pending",
        "Not Done",
    )
    assert sec.default_status == ns.MUSIC_TYPE_STATUS_DEFAULT == "Not Done"


def test_every_song_list_points_at_the_music_status_section():
    for key in SONG_SECTIONS:
        assert ns.section_by_key(key).type_status_section == "music_status"
    pointing = {s.key for s in ns.NOTE_SECTIONS if s.type_status_section}
    assert pointing == set(SONG_SECTIONS)


def test_only_music_status_is_hidden_or_keyed_by_kind():
    assert [s.key for s in ns.NOTE_SECTIONS if s.hidden] == ["music_status"]
    assert [s.key for s in ns.NOTE_SECTIONS if s.one_per_kind] == ["music_status"]


def test_the_status_vocabularies_have_one_source():
    # constants.py is what /api/constants serves; the registry imports it
    # rather than restating it.
    from app.utils import constants

    assert ns.MUSIC_STATUSES is constants.MUSIC_STATUSES
    assert ns.MUSIC_TYPE_STATUSES is constants.MUSIC_TYPE_STATUSES


def test_note_option_categories_come_from_the_registry():
    assert ns.NOTE_OPTION_CATEGORIES == ("Song Type", "Song Source")


def test_easter_eggs_is_a_list_under_analysis():
    sec = ns.section_by_key("easter_eggs")
    assert sec.label == "彩蛋 Easter Eggs"
    assert sec.shape == ns.SHAPE_STRUCTURED
    assert sec.owners == ("anime",)
    assert sec.scope == ns.SCOPE_CATALOG
    assert sec.group == "analysis_group"
    assert not sec.singleton
    assert [(f.key, f.column, f.type, f.required) for f in sec.fields] == [
        ("episode", "locator", ns.FIELD_TEXT, False),
        ("description", "content", ns.FIELD_TEXTAREA, True),
        ("links", "links", ns.FIELD_LINK_PAIRS, False),
    ]


def test_every_group_is_a_known_group():
    for sec in ns.NOTE_SECTIONS:
        if sec.group:
            assert ns.group_by_key(sec.group), f"{sec.key} names unknown group"


def test_the_reviews_group_holds_every_evaluative_section():
    grouped = [s.key for s in ns.NOTE_SECTIONS if s.group == "reviews"]
    assert grouped == [
        "introduction",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "episode_comments",
    ]


def test_the_analysis_group_holds_cinematography_and_its_novel_twin():
    # `craft` is the novel-only counterpart of `cinematography`, so the two
    # belong to the same card even though they stay separate sections.
    grouped = [s.key for s in ns.NOTE_SECTIONS if s.group == "analysis_group"]
    assert grouped == [
        "analysis",
        "cinematography",
        "craft",
        "foreshadowing",
        "symmetry",
        "easter_eggs",
    ]


def test_the_quotes_memes_group_holds_both_external_sections():
    grouped = [s.key for s in ns.NOTE_SECTIONS if s.group == "quotes_memes"]
    assert grouped == ["quotes", "memes"]
    assert all(s.shape == ns.SHAPE_EXTERNAL for s in ns.NOTE_SECTIONS if s.group == "quotes_memes")


def test_resources_and_questions_are_the_standalone_sections():
    assert [s.key for s in ns.NOTE_SECTIONS if s.standalone] == [
        "resources",
        "questions",
    ]


def test_no_section_is_both_grouped_and_standalone():
    # Both lift a section out of the Notes card; a group additionally shares one
    # card with its siblings. Setting both says nothing the page can honour.
    for sec in ns.NOTE_SECTIONS:
        assert not (sec.group and sec.standalone), f"{sec.key} sets both"


def test_the_music_group_holds_the_music_sections():
    grouped = [s.key for s in ns.NOTE_SECTIONS if s.group == "music"]
    assert grouped == [
        "music_status",
        "op",
        "ed",
        "insert_songs",
        "ost",
        "op_ed_changes",
    ]


def test_grouped_sections_are_adjacent():
    # The page no longer walks a consecutive run, but a group scattered through
    # the order hides what belongs together from anyone reading the registry.
    #
    # An ungrouped section that lands in the current run's group for SOME
    # owner does not break the run: 評論 Reviews and Comments is flat for an
    # h-comic but opens the 評論 card for an h-game, below 介紹 Introduction.
    runs = []
    for sec in ns.NOTE_SECTIONS:
        if not sec.group and runs and runs[-1] in sec.groups_by_owner.values():
            continue
        if sec.group and (not runs or runs[-1] != sec.group):
            runs.append(sec.group)
        elif not sec.group and runs and runs[-1] is not None:
            runs.append(None)
    # 結局 Endings is the one exception: it closes 劇情 for a game and for an
    # h-game, whose 劇情 is its Story List (see `_story_list_sections`), so it
    # is declared after those four lists and the 劇情 run resumes there.
    named = [g for g in runs if g]
    assert named.count("story") == 2
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "story"][-1] == "endings"
    named.remove("story")
    assert len(named) == len(set(named))


def test_a_tv_show_sees_only_the_grouped_section_that_applies_to_it():
    keys = [s.key for s in ns.sections_for("tv-show") if s.group == "music"]
    assert keys == ["op_ed_changes"]


def test_highlight_kinds_cover_episode_moment_and_arc():
    assert ns.HIGHLIGHT_KINDS == ("神回", "神片段", "神篇章")
    assert ns.section_by_key("highlights").kinds == ns.HIGHLIGHT_KINDS


def test_kinds_for_gives_tv_and_cartoon_a_highlight_dropdown():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.kinds_for(sec, "tv-show") == ns.HIGHLIGHT_KINDS
    assert ns.kinds_for(sec, "cartoon") == ns.HIGHLIGHT_KINDS
    # Manga highlights are always 神回, so a chooser there would have one choice.
    assert ns.kinds_for(sec, "manga") == ()


def test_kinds_for_falls_back_to_the_section_default():
    assert ns.kinds_for(ns.section_by_key("highlights"), "anime") == ns.HIGHLIGHT_KINDS
    assert ns.kinds_for(ns.section_by_key("extended_episodes"), "anime") == ()


def test_op_ed_kinds_exclude_retired_values():
    sec = ns.section_by_key("op_ed_changes")
    assert "回顧" not in sec.kinds
    assert "其他" not in sec.kinds
    assert "加長" not in sec.kinds
    assert "特別OP" not in sec.kinds  # normalized to 特殊OP


def test_retired_sections_are_gone():
    assert ns.section_by_key("special_changes") is None
    assert ns.section_by_key("special_episodes") is None
    # Replaced by the 攻略 group; their rows were migrated, not dropped.
    assert ns.section_by_key("guides") is None
    assert ns.section_by_key("builds_and_mods") is None


def test_anime_sections_in_registry_order():
    keys = [s.key for s in ns.sections_for("anime")]
    assert keys == [
        "remark",
        "remark_list",
        "introduction",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "episode_comments",
        "highlights",
        "analysis",
        "cinematography",
        "foreshadowing",
        "symmetry",
        "easter_eggs",
        "music_status",
        "op",
        "ed",
        "insert_songs",
        "ost",
        "op_ed_changes",
        "extended_episodes",
        "adaptation",
        "resources",
        "questions",
        "quotes",
        "memes",
    ]


def test_collection_gets_the_narrow_set():
    keys = [s.key for s in ns.sections_for("collection")]
    # Registry order, not the order the spec's prose happens to list them in:
    # `questions` sits after `resources` in NOTE_SECTIONS.
    assert keys == [
        "remark",
        "remark_list",
        "introduction",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "analysis",
        "resources",
        "questions",
        "memes",
    ]


def test_franchise_is_series_minus_cinematography():
    series = {s.key for s in ns.sections_for("series")}
    franchise = {s.key for s in ns.sections_for("franchise")}
    assert series - franchise == {"cinematography"}


def test_episode_anchored_sections_never_reach_the_tiers():
    # The shape no longer identifies these - `questions` is episode_text too,
    # and its locator is a source, not an episode, so it belongs everywhere.
    # What marks a section as genuinely episode-anchored is demanding one.
    episode_keys = {s.key for s in ns.NOTE_SECTIONS if s.locator_required}
    for tier in ("series", "franchise", "collection"):
        assert not episode_keys & {s.key for s in ns.sections_for(tier)}


def test_quotes_stay_entry_only():
    assert ns.section_by_key("quotes").owners == tuple(
        o for o in ns.ENTRY_OWNERS if o not in ns.H_OWNERS
    )


def test_memes_span_every_owner():
    # Bar the gated types, which keep no 名言/梗.
    assert set(ns.section_by_key("memes").owners) == set(OWNER_TABLES) - set(
        ns.H_OWNERS
    )


def test_label_for_falls_back_to_default():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.label_for(sec, "manga") == "神回"
    assert ns.label_for(sec, "tv-show") == "神回/神片段"


def test_locator_for_falls_back_to_default():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.locator_for(sec, "manga") == "Chapter(s), e.g. ch 6"
    assert ns.locator_for(sec, "tv-show") == "Episode(s), e.g. ep 3"


def test_locator_for_is_none_without_one():
    assert ns.locator_for(ns.section_by_key("remark"), "anime") is None


def test_episode_anchored_text_links_offer_an_episode():
    """
    foreshadowing/symmetry/cinematography are frequently episode-anchored, so
    the text_links episode input must actually render for them.
    """
    for key in ("foreshadowing", "symmetry", "cinematography"):
        assert ns.section_by_key(key).locator_placeholder


def test_desc_required_is_per_owner():
    sec = ns.section_by_key("adaptation")
    assert "anime" in sec.desc_required
    assert "tv-show" not in sec.desc_required


def test_labels_use_ascii_solidus():
    for sec in ns.NOTE_SECTIONS:
        assert "／" not in sec.label
        for value in sec.labels.values():
            assert "／" not in value


def test_public_reviews_takes_text_or_a_link():
    # A public review is either something someone said or a pointer to where
    # they said it, never both in one row.
    sec = ns.section_by_key("public_reviews")
    assert sec.shape == ns.SHAPE_TEXT_OR_LINK
    assert ns.SHAPE_TEXT_OR_LINK in ns.STORED_SHAPES


def test_public_reviews_is_the_only_text_or_link_section():
    keys = [s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_TEXT_OR_LINK]
    assert keys == ["public_reviews"]


def test_personal_reviews_stays_plain_text():
    assert ns.section_by_key("personal_reviews").shape == ns.SHAPE_TEXT


def test_episode_comments_is_text_links_with_an_episode_field():
    # A comment on an episode carries a body and any number of sources, and
    # still has to say which episode it is about.
    sec = ns.section_by_key("episode_comments")
    assert sec.shape == ns.SHAPE_TEXT_LINKS
    assert ns.locator_for(sec, "anime") == "Episode, e.g. ep 1"
    # A game is cut into chapters, so it reuses the section under its own label.
    assert ns.locator_for(sec, "game") == "Chapter / Part, e.g. Ch 3"
    # Not h-game: its comments go in 評論 Reviews and Comments.
    assert sec.owners == ("anime", "tv-show", "cartoon", "game")


def test_unread_is_gone():
    # Unread was Resources with a different name: same shape, same owners, and
    # nothing in the row said which list it belonged to. Its rows moved to
    # `resources`, so the key must not come back.
    assert ns.section_by_key("unread") is None
    assert "unread" not in {s.key for s in ns.NOTE_SECTIONS}


# --- locator ----------------------------------------------------------------
# The field is not an episode: it may be a scene, a chapter, a timestamp or the
# source of a question. One free-text column, labelled and required per section.


def test_locator_for_labels_the_field_per_section_and_owner():
    assert (
        ns.locator_for(ns.section_by_key("episode_comments"), "anime")
        == "Episode, e.g. ep 1"
    )
    # Manga counts chapters, not episodes.
    assert (
        ns.locator_for(ns.section_by_key("highlight_episodes"), "manga")
        == "Chapter(s), e.g. ch 6"
    )
    # A section with no anchor at all offers no field.
    assert ns.locator_for(ns.section_by_key("advantages"), "anime") is None


def test_sections_that_are_meaningless_without_an_anchor_require_one():
    required = {s.key for s in ns.NOTE_SECTIONS if s.locator_required}
    assert required == {
        "episode_comments",
        "highlights",
        "highlight_episodes",
        "highlight_moments",
        "op_ed_changes",
        "extended_episodes",
    }


def test_locator_stays_optional_where_the_work_may_have_no_anchor():
    # These reach movies and the series/franchise tiers, where there is often
    # nothing to point at.
    for key in ("cinematography", "foreshadowing", "symmetry"):
        assert not ns.section_by_key(key).locator_required


def test_questions_records_where_the_question_came_from():
    # The locator here is not an episode at all - it is the source that
    # prompted the question. Same column, section-supplied label.
    sec = ns.section_by_key("questions")
    assert sec.shape == ns.SHAPE_EPISODE_TEXT
    assert ns.locator_for(sec, "anime") == "Source, e.g. ep 3"
    # Optional: plenty of questions arise from the work as a whole.
    assert not sec.locator_required
    # But a source with no question attached is nothing, so the body is not.
    assert sec.desc_required == sec.owners
    # An h-comic and a hentai keep no Questions.
    assert "h-comic" not in sec.owners and "hentai" not in sec.owners


def test_insert_songs_sits_directly_below_ed():
    # It replaced the music_track `insert` section, which sat there, and it is
    # read as the third theme-song list rather than as an afterthought.
    keys = [s.key for s in ns.NOTE_SECTIONS]
    assert keys[keys.index("ed") + 1] == "insert_songs"


def test_the_music_track_insert_section_is_gone():
    # Folded into insert_songs: one list, anchored to the episode. Revision
    # i1n2s3e4r5t6 deleted its rows.
    assert ns.section_by_key("insert") is None


def test_insert_songs_is_anime_only():
    assert ns.section_by_key("insert_songs").owners == ("anime",)


# --- scope -----------------------------------------------------------------
# catalog: one shared set of rows, admin-authored, read by everyone.
# personal: one set per user, read only by its author.
# Sections backed by their own table (quotes, memes) store no note row and so
# have no scope to declare.
PERSONAL_KEYS = {
    "remark",
    # The other half of 備註: the short things, one per row, that a single
    # block of prose turns into a wall. Personal for the same reason 備註 is.
    "remark_list",
    "advantages",
    "disadvantages",
    "double_edged",
    "episode_comments",
    "questions",
    "personal_reviews",
    # The gated types' one list of reviews and comments, personal like the
    # 我的評價 it stands in for.
    "reviews_and_comments",
    # The 待辦 buckets. Four sections rather than one with a kind, because
    # sort_index orders rows within one (owner, section) pair.
    "todo_now",
    "todo_next",
    "todo_later",
    "todo_maybe",
    # Save slots sit at the bottom of 待辦: which save is which is one
    # person's run, like the buckets above it.
    "saves",
}

CATALOG_KEYS = {
    "introduction",
    "music_status",
    "op",
    "ed",
    "insert_songs",
    "ost",
    "op_ed_changes",
    "extended_episodes",
    "adaptation",
    "resources",
    "public_reviews",
    "highlights",
    "highlight_episodes",
    "highlight_passages",
    "highlight_moments",
    "h_comic_highlights",
    "h_game_highlights",
    "analysis",
    "cinematography",
    "craft",
    "foreshadowing",
    "symmetry",
    "easter_eggs",
    # 攻略 Guides
    "beginner",
    "gameplay_systems",
    "controls",
    "trivia",
    "guide_notes",
    "team_composition",
    "story_list_main",
    "story_list_side",
    "story_list_character",
    "story_list_event",
    "builds_and_styles",
    "stats_and_points",
    "classes",
    "skills",
    "collectibles",
    "items",
    "weapons_and_gear",
    "characters_guide",
    "enemies",
    "game_terms",
    "player_terms",
    "endings",
    "mods_and_tools",
    "guide_resources",
    # 劇情 Story
    "main_plot",
    "side_plot",
    "character_arcs",
    "lore",
    "story_terms",
    "timeline",
    "mysteries",
    "story_other",
    # NG 多周目
    "ng_flow",
    "ng_carried_over",
    "ng_reset",
    "ng_before_starting",
}


def test_scope_has_no_default():
    """
    The guard the whole scheme rests on. With a default, the next section added
    would inherit it silently - and if that default were `catalog`, one
    person's private note would be published to every user by omission.
    """
    field = {f.name: f for f in dataclasses.fields(ns.NoteSection)}["scope"]
    assert field.default is dataclasses.MISSING
    assert field.default_factory is dataclasses.MISSING


def test_every_stored_section_declares_a_real_scope():
    for sec in ns.NOTE_SECTIONS:
        if sec.shape in ns.STORED_SHAPES:
            assert sec.scope in (ns.SCOPE_CATALOG, ns.SCOPE_PERSONAL), (
                f"{sec.key} declares scope {sec.scope!r}"
            )


def test_external_sections_carry_no_scope():
    # quotes and memes are universal - shared, unfiltered, no per-user copies -
    # and are stored in their own tables, so a scope on them would mean nothing.
    external = [s for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_EXTERNAL]
    assert {s.key for s in external} == {"quotes", "memes"}
    for sec in external:
        assert sec.scope is None


def test_the_personal_sections_are_exactly_these_fourteen():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_PERSONAL} == (
        PERSONAL_KEYS
    )
    assert ns.PERSONAL_SECTIONS == PERSONAL_KEYS


def test_the_catalog_sections_are_exactly_these():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_CATALOG} == (
        CATALOG_KEYS
    )
    assert ns.CATALOG_SECTIONS == CATALOG_KEYS


def test_the_two_scopes_partition_every_stored_section():
    stored = {s.key for s in ns.NOTE_SECTIONS if s.shape in ns.STORED_SHAPES}
    assert len(stored) == 73
    assert ns.PERSONAL_SECTIONS | ns.CATALOG_SECTIONS == stored
    assert not (ns.PERSONAL_SECTIONS & ns.CATALOG_SECTIONS)


def test_sections_by_scope_returns_registry_order():
    keys = [s.key for s in ns.sections_by_scope(ns.SCOPE_PERSONAL)]
    assert keys == [
        "remark",
        "remark_list",
        "reviews_and_comments",
        "advantages",
        "disadvantages",
        "double_edged",
        "personal_reviews",
        "episode_comments",
        # The 待辦 run sits after `symmetry` and before the music group.
        "todo_now",
        "todo_next",
        "todo_later",
        "todo_maybe",
        "saves",
        "questions",
    ]
