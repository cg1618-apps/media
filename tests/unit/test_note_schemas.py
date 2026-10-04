"""Unit tests for note schema validation against the registry."""

import uuid

import pytest

from app.schemas.note import NoteCreate, section_out, validate_note_payload
from app.utils.note_sections import section_by_key


def _payload(**kw):
    base = dict(
        owner_type="anime",
        owner_id=uuid.uuid4(),
        section="advantages",
        content="敘事結構精巧",
    )
    base.update(kw)
    return NoteCreate(**base)


def test_valid_payload_passes():
    validate_note_payload(_payload())


def test_unknown_section_rejected():
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="not_a_section"))


def test_unknown_owner_type_rejected():
    with pytest.raises(ValueError, match="Unknown owner_type"):
        validate_note_payload(_payload(owner_type="podcast"))


def test_section_not_applicable_to_owner_rejected():
    # episode_comments is entry-only; a franchise may not have one.
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(
            _payload(owner_type="franchise", section="episode_comments", locator="ep 1")
        )


def test_external_section_rejected():
    # Quotes and memes live in their own tables, never in `note`.
    with pytest.raises(ValueError, match="own table"):
        validate_note_payload(_payload(section="quotes"))


def test_kind_must_be_in_the_dropdown():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(
            _payload(section="op_ed_changes", locator="ep 3", kind="回顧")
        )


def test_kind_from_the_dropdown_accepted():
    validate_note_payload(
        _payload(section="op_ed_changes", locator="ep 3", kind="變化OP")
    )


def test_kind_rejected_where_no_dropdown_declared():
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(section="extended_episodes", locator="ep 12", kind="加長")
        )


def test_highlight_kind_is_accepted_where_the_owner_has_the_dropdown():
    validate_note_payload(_payload(section="highlights", locator="ep 6", kind="神片段"))
    validate_note_payload(_payload(section="highlights", locator="ep 6", kind="神篇章"))
    validate_note_payload(
        _payload(
            owner_type="tv-show",
            section="highlight_episodes",
            locator="ep 6",
            kind="神片段",
        )
    )


def test_highlight_kind_rejected_for_manga():
    # highlight_episodes offers the dropdown to tv-show and cartoon only.
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(
                owner_type="manga",
                section="highlight_episodes",
                locator="ch 6",
                kind="神片段",
            )
        )


def test_desc_required_section_rejects_empty_content():
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(_payload(section="adaptation", content="   "))


def test_desc_required_does_not_apply_to_other_owners():
    # adaptation is desc_required on anime but not on tv-show, so a row with
    # only a link and no description is valid there.
    validate_note_payload(
        _payload(
            owner_type="tv-show",
            section="adaptation",
            content=None,
            links=["https://example.com/adaptation"],
        )
    )


def test_blank_content_rejected_for_ordinary_text_section():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(content="  "))


def test_name_links_row_may_have_title_and_no_content():
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集",
                 links=["https://example.com/artbook"])
    )


def test_name_links_row_may_have_only_title():
    # name_links shape allows title alone, without content or links
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集", links=None)
    )


def test_episode_text_row_may_have_only_a_locator():
    # episode_text shape allows the locator alone, without content
    validate_note_payload(
        _payload(section="extended_episodes", locator="ep 1", content=None)
    )


def test_episode_text_row_without_locator_and_content_rejected():
    # No registry section can currently reach the episode_text emptiness check:
    # every one of them either requires a locator or requires content, and one
    # of those fires first. The row is still rejected, which is what matters
    # here; the check stays as the guard for a future section that demands
    # neither.
    with pytest.raises(ValueError):
        validate_note_payload(
            _payload(section="questions", locator=None, content=None)
        )


def test_blank_text_links_row_rejected():
    # text_links shape (e.g., adaptation) still requires content or links
    # Use tv-show where adaptation is NOT desc_required, so it hits the emptiness check
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(owner_type="tv-show", section="adaptation", content=None, links=None)
        )


# --- the 評論 review lists as text_links --------------------------------------
# A review row is a body with any number of links: what was said, and where.


@pytest.mark.parametrize(
    "section", ["public_reviews", "advantages", "disadvantages", "double_edged"]
)
def test_review_row_takes_text_and_several_links(section):
    validate_note_payload(
        _payload(
            section=section,
            content="評價兩極，節奏被詬病",
            links=["https://myanimelist.net/reviews/12345", "https://b.example/2"],
        )
    )


def test_review_row_may_be_text_only():
    validate_note_payload(
        _payload(section="public_reviews", content="評價兩極，節奏被詬病")
    )


def test_review_row_may_be_link_only():
    validate_note_payload(
        _payload(
            section="public_reviews",
            content=None,
            links=["https://myanimelist.net/reviews/12345"],
        )
    )


def test_blank_review_row_rejected():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(section="public_reviews", content="  ", links=None)
        )


# --- episode_comments as text_links -----------------------------------------
# An episode comment is a comment plus its sources, so it carries an episode,
# a body and any number of links. The episode alone is not a note.


def test_episode_comment_may_be_episode_and_text():
    validate_note_payload(
        _payload(section="episode_comments", locator="ep 1", content="開場就定調")
    )


def test_episode_comment_may_carry_several_links():
    validate_note_payload(
        _payload(
            section="episode_comments",
            locator="ep 1",
            content=None,
            links=["https://a.example/1", "https://b.example/2"],
        )
    )


def test_episode_comment_may_carry_text_and_links_together():
    validate_note_payload(
        _payload(
            section="episode_comments",
            locator="ep 1",
            content="開場就定調",
            links=["https://a.example/1", "https://b.example/2"],
        )
    )


def test_episode_comment_with_only_an_episode_rejected():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(section="episode_comments", locator="ep 1", content=None)
        )


def test_unread_section_is_rejected():
    # The section is gone; a client still sending it gets a 422 rather than a
    # row no page will ever render.
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="unread", title="舊清單"))


# --- locator ----------------------------------------------------------------


def test_locator_required_section_rejects_a_missing_locator():
    # An OP/ED change with no episode says nothing about which OP changed.
    with pytest.raises(ValueError, match="requires"):
        validate_note_payload(
            _payload(section="op_ed_changes", locator=None, content="換成劇中曲")
        )


def test_locator_required_section_rejects_a_blank_locator():
    with pytest.raises(ValueError, match="requires"):
        validate_note_payload(
            _payload(section="episode_comments", locator="   ", content="開場就定調")
        )


def test_locator_required_section_passes_with_one():
    validate_note_payload(
        _payload(section="episode_comments", locator="ep 1", content="開場就定調")
    )


def test_locator_stays_optional_on_sections_that_do_not_demand_it():
    validate_note_payload(
        _payload(section="foreshadowing", locator=None, content="紅圍巾")
    )


def test_section_out_reports_the_locator_contract():
    from app.schemas.note import section_out
    from app.utils.note_sections import section_by_key

    out = section_out(section_by_key("episode_comments"), "anime")
    assert out.locator_placeholder == "Episode, e.g. ep 1"
    assert out.locator_required is True

    out = section_out(section_by_key("foreshadowing"), "anime")
    assert out.locator_required is False


def test_question_may_name_its_source():
    validate_note_payload(
        _payload(section="questions", locator="ep 3", content="為何不直接說？")
    )


def test_question_needs_no_source():
    validate_note_payload(
        _payload(section="questions", locator=None, content="為何不直接說？")
    )


def test_question_with_only_a_source_is_rejected():
    # The reverse of the locator_required sections: here the body is the point.
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(
            _payload(section="questions", locator="ep 3", content=None)
        )


# --- music_track: one shape for every song list -------------------------
# op, ed, insert_songs and ost hold the same row: a song name, the per-song
# status, the episode, text-and-URL link pairs, a remark - and a Song Type on
# op and ed alone.

SONG_SECTIONS = ("op", "ed", "insert_songs", "ost")


def _song(section="op", **kw):
    base = dict(section=section, status="Need", content=None)
    if section in ("op", "ed"):
        base["kind"] = "normal"
    base.update(kw)
    return _payload(**base)


def _pair(url="https://youtu.be/a", text="YouTube"):
    return {"text": text, "url": url}


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_may_carry_every_column(section):
    validate_note_payload(
        _song(
            section,
            title="紅蓮華",
            locator="ep 12",
            content="Plays over the rooftop scene.",
            links=[_pair(), _pair("https://open.spotify.com/x", "Spotify")],
        )
    )


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_with_only_a_status_passes(section):
    # "I still need the OP" is a real note before the song has a name.
    validate_note_payload(_song(section))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_with_only_an_episode_passes(section):
    validate_note_payload(_song(section, status=None, locator="ep 3"))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_with_only_a_link_passes(section):
    validate_note_payload(_song(section, status=None, links=[_pair(text=None)]))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_saying_nothing_is_empty(section):
    # On op and ed the Song Type is prefilled with "normal", so it cannot be
    # what makes a row worth storing; a link pair with no URL is no link.
    with pytest.raises(ValueError, match="is empty"):
        validate_note_payload(_song(section, status=None))


def test_insert_song_no_longer_requires_an_episode():
    validate_note_payload(_song("insert_songs", title="Shiroi Kumo", status=None))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_rejects_an_unknown_status(section):
    with pytest.raises(ValueError, match="not a valid status"):
        validate_note_payload(_song(section, status="Someday"))


@pytest.mark.parametrize("section", ("op", "ed"))
def test_song_type_is_free_text_on_op_and_ed(section):
    # Suggested from the "Song Type" option category, never closed.
    validate_note_payload(_song(section, kind="acoustic"))
    validate_note_payload(_song(section, kind="all inclusive version"))


@pytest.mark.parametrize("section", ("insert_songs", "ost"))
def test_insert_songs_and_ost_take_no_song_type(section):
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(_song(section, kind="normal"))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_takes_several_link_pairs(section):
    validate_note_payload(
        _song(section, links=[_pair(), _pair("https://b.example", None)])
    )


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_link_pair_needs_a_url(section):
    with pytest.raises(ValueError, match="needs a URL"):
        validate_note_payload(_song(section, links=[_pair(url="  ")]))


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_song_refuses_a_bare_url_string(section):
    # The pair shape is the only one these sections take, so a reader never
    # has to guess which of two shapes a stored row is in.
    with pytest.raises(ValueError, match="text-and-URL pairs"):
        validate_note_payload(_song(section, links=["https://youtu.be/a"]))


def test_a_url_string_section_refuses_a_link_pair():
    # The mirror: everything outside the songs keeps URL strings.
    validate_note_payload(
        _payload(section="analysis", links=["https://a.example"])
    )
    with pytest.raises(ValueError, match="must be URLs"):
        validate_note_payload(_payload(section="analysis", links=[_pair()]))


def test_a_link_pair_with_an_unknown_key_is_refused():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _song("op", links=[{"url": "https://a.example", "label": "x"}])


def test_the_music_track_insert_section_is_no_longer_a_section():
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="insert", content="anything"))


def test_insert_song_rejected_for_non_anime_owners():
    for owner in ("tv-show", "cartoon", "anime-movie", "series"):
        with pytest.raises(ValueError, match="does not apply"):
            validate_note_payload(
                _song("insert_songs", owner_type=owner, locator="ep 12")
            )


def test_section_out_exposes_the_song_contract():
    for key in SONG_SECTIONS:
        out = section_out(section_by_key(key), "anime")
        assert out.shape == "music_track"
        assert out.group == "music"
        assert out.locator_placeholder == "Episode(s), e.g. ep 3"
        assert not out.locator_required
        assert not out.singleton
        assert out.statuses == ["Need", "Pending", "Done"]
        assert out.link_pairs is True
        assert out.link_text_category == "Song Source"
        # The per-type status bar is rendered from these three alone.
        assert out.type_status_section == "music_status"
        assert out.type_statuses == [
            "All Done",
            "Done",
            "Need",
            "Pending",
            "Not Done",
        ]
        assert out.type_status_default == "Not Done"
        assert out.hidden is False
    op = section_out(section_by_key("op"), "anime")
    assert op.kind_category == "Song Type" and op.default_kind == "normal"
    assert op.kinds == []
    ost = section_out(section_by_key("ost"), "anime")
    assert ost.kind_category is None and ost.default_kind is None


def test_section_out_reports_url_string_links_elsewhere():
    out = section_out(section_by_key("analysis"), "anime")
    assert out.link_pairs is False
    assert out.link_text_category is None
    assert out.type_status_section is None
    assert out.type_statuses == []


# --- music_status: one status per song list -------------------------------


def _type_status(**kw):
    base = dict(section="music_status", kind="op", status="Not Done", content=None)
    base.update(kw)
    return _payload(**base)


@pytest.mark.parametrize("kind", SONG_SECTIONS)
@pytest.mark.parametrize(
    "status", ("All Done", "Done", "Need", "Pending", "Not Done")
)
def test_music_status_takes_each_list_and_each_status(kind, status):
    validate_note_payload(_type_status(kind=kind, status=status))


def test_music_status_kind_must_name_a_song_list():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(_type_status(kind="op_ed_changes"))


def test_music_status_needs_a_kind_and_a_status():
    with pytest.raises(ValueError, match="needs a kind"):
        validate_note_payload(_type_status(kind=None))
    with pytest.raises(ValueError, match="needs a status"):
        validate_note_payload(_type_status(status=None))


def test_music_status_refuses_a_per_song_value_outside_its_vocabulary():
    with pytest.raises(ValueError, match="not a valid status"):
        validate_note_payload(_type_status(status="Someday"))


def test_music_status_carries_nothing_else():
    for extra in (
        dict(title="紅蓮華"),
        dict(content="anything"),
        dict(locator="ep 3"),
        dict(links=["https://a.example"]),
        dict(entries=[{"type": "text", "value": "x"}]),
    ):
        with pytest.raises(ValueError, match="takes no"):
            validate_note_payload(_type_status(**extra))


def test_music_status_is_anime_only():
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(_type_status(owner_type="tv-show"))


def test_section_out_marks_music_status_hidden():
    out = section_out(section_by_key("music_status"), "anime")
    assert out.hidden is True
    assert out.one_per_kind is True
    assert out.kinds == ["op", "ed", "insert_songs", "ost"]
    assert out.default_status == "Not Done"


# --- 彩蛋 Easter Eggs -------------------------------------------------------


def _egg(**kw):
    base = dict(section="easter_eggs", content="The poster in ep 3 is from ep 12.")
    base.update(kw)
    return _payload(**base)


def test_easter_egg_takes_an_episode_a_description_and_several_urls():
    validate_note_payload(_egg())
    validate_note_payload(
        _egg(locator="ep 3", links=["https://a.example", "https://b.example"])
    )
    # Like the rest of 解析, a link alone is a note.
    validate_note_payload(_egg(content=None, links=["https://a.example"]))


def test_easter_egg_refuses_link_pairs():
    with pytest.raises(ValueError, match="must be URLs"):
        validate_note_payload(_egg(links=[_pair()]))


def test_an_empty_easter_egg_is_refused():
    with pytest.raises(ValueError, match="note is empty"):
        validate_note_payload(_egg(content=None, locator="ep 3"))


def test_easter_egg_takes_no_status_or_structured_fields():
    with pytest.raises(ValueError, match="takes no status"):
        validate_note_payload(_egg(status="Done"))
    with pytest.raises(ValueError, match="takes no structured fields"):
        validate_note_payload(_egg(fields={}))


def test_section_out_reports_url_string_links_for_easter_eggs():
    out = section_out(section_by_key("easter_eggs"), "anime")
    assert out.shape == "text_links"
    assert out.link_pairs is False
    assert out.fields == []
    assert out.locator_placeholder == "Episode(s), e.g. ep 3"


def test_music_sections_are_anime_only():
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(_song("op", owner_type="tv-show"))


def test_a_non_music_section_takes_no_status():
    with pytest.raises(ValueError, match="takes no status"):
        validate_note_payload(_payload(status="Done"))


def test_section_out_carries_the_group_and_both_dropdowns():
    out = section_out(section_by_key("op"), "anime")
    assert out.group == "music"
    assert out.group_label == "音樂 Music"
    assert out.group_icon == "fa-music"
    assert out.default_kind == "normal"
    assert out.statuses == ["Need", "Pending", "Done"]


def test_an_ungrouped_section_reports_no_group():
    out = section_out(section_by_key("adaptation"), "anime")
    assert out.group is None and out.group_label is None
    assert out.standalone is False
    assert out.statuses == []


def test_section_out_carries_standalone():
    # Resources renders as its own top-level card, so the page needs to be told
    # to lift it out of the Notes card even though it names no group.
    out = section_out(section_by_key("resources"), "anime")
    assert out.standalone is True
    assert out.group is None


def test_section_out_carries_the_registry_scope():
    from app.schemas.note import section_out
    from app.utils import note_sections as ns

    personal = section_out(ns.section_by_key("personal_reviews"), "anime")
    assert personal.scope == ns.SCOPE_PERSONAL

    catalog = section_out(ns.section_by_key("public_reviews"), "anime")
    assert catalog.scope == ns.SCOPE_CATALOG

    external = section_out(ns.section_by_key("quotes"), "anime")
    assert external.scope is None


# --- OP/ED 變動 links ----------------------------------------------------------
# op_ed_changes is the one episode_text section whose rows also carry links:
# where the changed OP or ED can be watched. URL strings, as on text_links,
# never text-and-URL pairs.


def test_op_ed_change_takes_an_episode_a_kind_text_and_several_links():
    validate_note_payload(
        _payload(
            section="op_ed_changes",
            locator="ep 10",
            kind="變化OP",
            content="換成劇中曲",
            links=["https://youtu.be/a", "https://b23.tv/b"],
        )
    )


def test_op_ed_change_may_be_only_an_episode_and_links():
    validate_note_payload(
        _payload(
            section="op_ed_changes",
            locator="ep 10",
            content=None,
            links=["https://youtu.be/a"],
        )
    )


def test_op_ed_change_links_are_urls_not_pairs():
    with pytest.raises(ValueError, match="must be URLs"):
        validate_note_payload(
            _payload(
                section="op_ed_changes",
                locator="ep 10",
                links=[{"text": "YouTube", "url": "https://youtu.be/a"}],
            )
        )


def test_section_out_reports_which_episode_text_sections_take_links():
    assert section_out(section_by_key("op_ed_changes"), "anime").takes_links is True
    for key in ("extended_episodes", "highlights", "questions"):
        assert section_out(section_by_key(key), "anime").takes_links is False
