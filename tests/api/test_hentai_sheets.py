"""
hentai through Google Sheets: the tab, the parser, and Pull - which writes
rows straight to the tables and so has to re-attach the label itself.

Every test stubs get_all_raw_rows; nothing reaches a real sheet.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

from app import models
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.domain.credits import credit_names, tag_values
from app.services.pipelines import pull
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB, TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import parse_hentai_from_sheet


def _pull(monkeypatch, db_session, tab, headers, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: [headers] + rows)
    result = pull.execute_pull_specific(db_session, tab, log_action=False)
    assert result["status"] == "success", result
    return result


def test_the_tab_is_registered_after_h_comic_and_before_the_list_rows():
    tab = TAB_BY_NAME["Hentai"]
    assert tab.model is models.Hentai
    assert tab.media_type == "hentai"
    assert MEDIA_TYPE_FOR_TAB["Hentai"] == "hentai"
    assert TAB_NAMES.index("Media") < TAB_NAMES.index("Hentai")
    assert TAB_NAMES.index("H-Comic") < TAB_NAMES.index("Hentai")
    assert TAB_NAMES.index("Hentai") < TAB_NAMES.index("User Media List")


def test_the_parser_types_every_column():
    parsed = parse_hentai_from_sheet(
        {
            "hentai_name_cn": "名",
            "source_material": "Manga",
            "series_number": "2.0",
            "release_date": "2024",
            "mal_id": "188",
            "mal_link": "https://myanimelist.net/anime/188",
            "studio": "Studio A, Studio B",
        }
    )
    assert parsed["source_material"] == "Manga"
    assert parsed["series_number"] == 2
    assert parsed["release_date"] == "2024"
    assert parsed["mal_id"] == 188
    assert parsed["studio"] == "Studio A, Studio B"


def test_pull_stamps_the_label_on_every_row_and_franchise(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "Hentai",
        ["hentai_name_cn", "franchise_id"],
        [["Zvornik Pulled", "Zvornik Pulled Franchise"]],
    )
    entry = db_session.query(models.Hentai).filter_by(hentai_name_cn="Zvornik Pulled").one()
    assert label_keys_for_entry(db_session, entry.system_id) == ["hentai"]
    franchise = db_session.get(models.Franchise, entry.franchise_id)
    assert franchise.franchise_type == "Hentai"
    assert label_keys_for_franchise(db_session, franchise.system_id) == ["hentai"]


def test_pull_restores_credits_and_tags(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "Hentai",
        ["hentai_name_cn", "studio", "director", "h_genre_plot"],
        [["Zvornik Credited", "Studio Z", "Director Z", "Plot Z"]],
    )
    entry = db_session.query(models.Hentai).filter_by(hentai_name_cn="Zvornik Credited").one()
    assert credit_names(db_session, entry.system_id, "studio") == ["Studio Z"]
    assert credit_names(db_session, entry.system_id, "director") == ["Director Z"]
    assert tag_values(db_session, entry.system_id, "h_genre_plot") == ["Plot Z"]


def test_a_label_tab_restore_repairs_a_missing_label(monkeypatch, db_session):
    """A sheet edited by hand can leave a hentai unlabelled - which would make
    it public. Restoring any label tab puts the label back."""
    entry = models.Hentai(hentai_name_cn="Zvornik Bare")
    db_session.add(entry)
    db_session.flush()
    assert label_keys_for_entry(db_session, entry.system_id) == []

    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [["key", "label"], ["hentai", "Hentai"]],
    )
    result = pull.execute_pull_specific(
        db_session, "Content Label", log_action=False, may_restore_authz=True
    )
    assert result["status"] == "success", result
    assert label_keys_for_entry(db_session, entry.system_id) == ["hentai"]


def test_calculate_repairs_a_missing_label(db_session):
    """The generic pass covers hentai by its REQUIRED_LABEL_FOR_TYPE entry."""
    from app.services.calculation import run_sync_gated_labels

    entry = models.Hentai(hentai_name_cn="Zvornik Calculated")
    db_session.add(entry)
    db_session.flush()
    assert label_keys_for_entry(db_session, entry.system_id) == []
    run_sync_gated_labels(db_session)
    assert label_keys_for_entry(db_session, entry.system_id) == ["hentai"]
