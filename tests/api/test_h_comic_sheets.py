"""
h-comic through Google Sheets: the tab, the parser, and Pull - which writes
rows straight to the tables and so has to re-establish the region rule and the
label itself.

Every test stubs get_all_raw_rows; nothing reaches a real sheet.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.domain.credits import credit_names, tag_values
from app.services.pipelines import pull
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB, TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import parse_h_comic_from_sheet


def _pull(monkeypatch, db_session, tab, headers, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: [headers] + rows)
    result = pull.execute_pull_specific(db_session, tab, log_action=False)
    assert result["status"] == "success", result
    return result


def test_the_tab_is_registered_after_game_and_before_the_list_rows():
    tab = TAB_BY_NAME["H-Comic"]
    assert tab.model is models.HComic
    assert tab.media_type == "h-comic"
    assert MEDIA_TYPE_FOR_TAB["H-Comic"] == "h-comic"
    assert TAB_NAMES.index("Media") < TAB_NAMES.index("H-Comic")
    assert TAB_NAMES.index("H-Comic") < TAB_NAMES.index("User Media List")


def test_person_membership_restores_after_person():
    assert TAB_NAMES.index("Person") < TAB_NAMES.index("Person Membership")


def test_the_parser_types_every_column():
    parsed = parse_h_comic_from_sheet(
        {
            "h_comic_name_cn": "名",
            "region": "KR",
            "ch_total": "12",
            "series_number": "2.0",
            "release_date": "2024",
            "highlight_group_order": '["Ana", "Bea"]',
            "club": "Circle A, Circle B",
            "mal_id": "777",
            "mal_link": "https://myanimelist.net/manga/777",
        }
    )
    assert parsed["region"] == "KR"
    assert parsed["ch_total"] == 12
    assert parsed["series_number"] == 2
    assert parsed["release_date"] == "2024"
    assert parsed["highlight_group_order"] == ["Ana", "Bea"]
    assert parsed["club"] == "Circle A, Circle B"
    assert parsed["mal_id"] == 777
    assert parsed["mal_link"] == "https://myanimelist.net/manga/777"


def test_pull_clears_the_columns_the_region_does_not_use(monkeypatch, db_session):
    headers = [
        "h_comic_name_cn", "region", "originality", "page_total", "series_number",
        "ch_total", "ch_behind",
    ]
    _pull(
        monkeypatch,
        db_session,
        "H-Comic",
        headers,
        [
            ["Zvornik KR", "KR", "原創", "30", "2", "40", "3"],
            ["Zvornik JP", "JP", "原創", "30", "2", "40", "3"],
        ],
    )
    kr = db_session.query(models.HComic).filter_by(h_comic_name_cn="Zvornik KR").one()
    jp = db_session.query(models.HComic).filter_by(h_comic_name_cn="Zvornik JP").one()
    db_session.refresh(kr)
    db_session.refresh(jp)
    assert (kr.originality, kr.page_total, kr.series_number) == (None, None, None)
    assert (kr.ch_total, kr.ch_behind) == (40, 3)
    assert (jp.ch_total, jp.ch_behind) == (None, None)
    assert (jp.originality, jp.page_total, jp.series_number) == ("原創", 30, 2)


def test_pull_stamps_the_label_on_every_row_and_franchise(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "H-Comic",
        ["h_comic_name_cn", "region", "franchise_id"],
        [["Zvornik Pulled", "JP", "Zvornik Pulled Franchise"]],
    )
    entry = db_session.query(models.HComic).filter_by(h_comic_name_cn="Zvornik Pulled").one()
    assert label_keys_for_entry(db_session, entry.system_id) == ["h-comic"]
    franchise = db_session.get(models.Franchise, entry.franchise_id)
    assert franchise.franchise_type == "H-Comic"
    assert label_keys_for_franchise(db_session, franchise.system_id) == ["h-comic"]


def test_pull_restores_credits_and_tags(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "H-Comic",
        ["h_comic_name_cn", "region", "illustrator", "club", "h_genre_plot"],
        [["Zvornik Credited", "KR", "Artist A", "Circle A", "Plot A"]],
    )
    entry = db_session.query(models.HComic).filter_by(h_comic_name_cn="Zvornik Credited").one()
    assert credit_names(db_session, entry.system_id, "illustrator") == ["Artist A"]
    assert credit_names(db_session, entry.system_id, "club") == ["Circle A"]
    assert tag_values(db_session, entry.system_id, "h_genre_plot") == ["Plot A"]


def test_a_label_tab_restore_repairs_a_missing_label(monkeypatch, db_session):
    """A sheet edited by hand can leave an h-comic unlabelled - which would
    make it public. Restoring any label tab puts the label back."""
    entry = models.HComic(h_comic_name_cn="Zvornik Bare", region="JP")
    db_session.add(entry)
    db_session.flush()
    assert label_keys_for_entry(db_session, entry.system_id) == []

    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [["key", "label"], ["h-comic", "H-Comic"]],
    )
    result = pull.execute_pull_specific(
        db_session, "Content Label", log_action=False, may_restore_authz=True
    )
    assert result["status"] == "success", result
    assert label_keys_for_entry(db_session, entry.system_id) == ["h-comic"]


def test_pull_of_the_list_tab_clears_the_counter_the_region_does_not_use(
    monkeypatch, db_session, admin_user
):
    entry = models.HComic(h_comic_name_cn="Zvornik Listed", region="KR")
    db_session.add(entry)
    db_session.commit()

    _pull(
        monkeypatch,
        db_session,
        "User Media List",
        ["media_type", "public_id", "username", "status", "page_fin", "ch_fin", "usefulness"],
        [["h-comic", str(entry.public_id), admin_user.username, "Active Reading", "9", "4", "實用"]],
    )
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=admin_user.id, media_id=entry.system_id)
        .one()
    )
    assert row.page_fin is None
    assert row.ch_fin == 4
    assert row.usefulness == "實用"


def test_person_membership_round_trips_through_its_tab(monkeypatch, db_session):
    club = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Sheet Club")
    artist = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Sheet Artist")
    db_session.add_all([club, artist])
    db_session.flush()

    _pull(
        monkeypatch,
        db_session,
        "Person Membership",
        ["system_id", "member_id", "club_id", "position"],
        [[str(uuid.uuid4()), str(artist.system_id), str(club.system_id), "0"]],
    )
    rows = db_session.query(models.PersonMembership).filter_by(club_id=club.system_id).all()
    assert [(r.member_id, r.position) for r in rows] == [(artist.system_id, 0)]
