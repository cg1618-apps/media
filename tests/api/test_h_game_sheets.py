"""
h-game through Google Sheets: the tab, the parser, and Pull - which writes
rows straight to the tables and so has to keep the vocabularies and the label
itself.

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
from app.utils.formatter import parse_h_game_from_sheet


def _pull(monkeypatch, db_session, tab, headers, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: [headers] + rows)
    result = pull.execute_pull_specific(db_session, tab, log_action=False)
    assert result["status"] == "success", result
    return result


def test_the_tab_is_registered_after_media_and_before_the_list_rows():
    tab = TAB_BY_NAME["H-Game"]
    assert tab.model is models.HGame
    assert tab.media_type == "h-game"
    assert MEDIA_TYPE_FOR_TAB["H-Game"] == "h-game"
    assert TAB_NAMES.index("Media") < TAB_NAMES.index("H-Game")
    assert TAB_NAMES.index("H-Game") < TAB_NAMES.index("User Media List")


def test_the_parser_types_every_column():
    parsed = parse_h_game_from_sheet(
        {
            "h_game_name_cn": "名",
            "series_number": "2.0",
            "playstyle": "SLG",
            "release_date": "2024",
            "all_cg": "TRUE",
            "language_availability": "非官方中文",
            "dialogue_audio": '["H場景", "一般對話"]',
            "sound_effect": "H場景",
            "h_presentation": "直接互動, 靜態",
            "art_style": "Pixel, 2D",
            "h_art_style": "unknown, Live2D",
            "platform": '["DLsite"]',
            "price_original_jp": "1980",
            "highlight_group_order": '["Ana", "Bea"]',
            "studio": "Studio A",
        }
    )
    assert parsed["series_number"] == 2
    assert parsed["playstyle"] == "SLG"
    assert parsed["all_cg"] == "Yes"
    assert "animation_availability" not in parsed
    assert parsed["language_availability"] == "非官方中文"
    assert parsed["dialogue_audio"] == ["一般對話", "H場景"]
    assert parsed["sound_effect"] == ["H場景"]
    assert parsed["h_presentation"] == ["靜態", "直接互動"]
    assert parsed["art_style"] == ["2D", "Pixel"]
    assert parsed["h_art_style"] == ["Live2D", "unknown"]
    assert parsed["platform"] == ["DLsite"]
    assert parsed["highlight_group_order"] == ["Ana", "Bea"]
    assert parsed["studio"] == "Studio A"


def test_the_parser_reads_dialogue_audio_under_its_old_header():
    """A sheet last backed up before the rename heads the column audio_availability."""
    parsed = parse_h_game_from_sheet({"audio_availability": "H場景"})
    assert parsed["dialogue_audio"] == ["H場景"]


def test_the_new_header_wins_over_the_old_one():
    """The mirror: once both exist, the old header is ignored."""
    parsed = parse_h_game_from_sheet(
        {"dialogue_audio": "一般對話", "audio_availability": "H場景"}
    )
    assert parsed["dialogue_audio"] == ["一般對話"]


def test_the_parser_drops_values_outside_a_vocabulary():
    parsed = parse_h_game_from_sheet(
        {"playstyle": "FPS", "platform": '["Steam", "Xbox"]', "language_availability": "English"}
    )
    assert parsed["playstyle"] is None
    assert parsed["platform"] == ["Steam"]
    assert parsed["language_availability"] is None


def test_pull_stamps_the_label_on_every_row_and_franchise(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "H-Game",
        ["h_game_name_cn", "franchise_id", "platform"],
        [["Zvornik Pulled", "Zvornik Pulled Franchise", '["Nintendo", "Steam"]']],
    )
    entry = db_session.query(models.HGame).filter_by(h_game_name_cn="Zvornik Pulled").one()
    db_session.refresh(entry)
    assert entry.platform == ["Steam", "Nintendo"]
    assert label_keys_for_entry(db_session, entry.system_id) == ["h-game"]
    franchise = db_session.get(models.Franchise, entry.franchise_id)
    assert franchise.franchise_type == "H-Game"
    assert label_keys_for_franchise(db_session, franchise.system_id) == ["h-game"]


def test_pull_restores_credits_and_tags(monkeypatch, db_session):
    _pull(
        monkeypatch,
        db_session,
        "H-Game",
        ["h_game_name_cn", "studio", "game_genre", "h_genre_relation"],
        [["Zvornik Credited", "Studio A", "Genre A", "Relation A"]],
    )
    entry = db_session.query(models.HGame).filter_by(h_game_name_cn="Zvornik Credited").one()
    assert credit_names(db_session, entry.system_id, "studio") == ["Studio A"]
    assert tag_values(db_session, entry.system_id, "game_genre") == ["Genre A"]
    assert tag_values(db_session, entry.system_id, "h_genre_relation") == ["Relation A"]


def test_a_label_tab_restore_repairs_a_missing_label(monkeypatch, db_session):
    """A sheet edited by hand can leave an h-game unlabelled - which would
    make it public. Restoring any label tab puts the label back."""
    entry = models.HGame(h_game_name_cn="Zvornik Bare")
    db_session.add(entry)
    db_session.flush()
    assert label_keys_for_entry(db_session, entry.system_id) == []

    monkeypatch.setattr(
        pull, "get_all_raw_rows", lambda name: [["key", "label"], ["h-game", "H-Game"]]
    )
    result = pull.execute_pull_specific(
        db_session, "Content Label", log_action=False, may_restore_authz=True
    )
    assert result["status"] == "success", result
    assert label_keys_for_entry(db_session, entry.system_id) == ["h-game"]


def test_a_game_copy_row_restores_onto_an_h_game(monkeypatch, db_session, admin_user):
    entry = models.HGame(h_game_name_cn="Zvornik Copied")
    db_session.add(entry)
    db_session.commit()
    _pull(
        monkeypatch,
        db_session,
        "Game Copy",
        ["system_id", "game_id", "storefront", "ownership", "copy_format"],
        [[str(uuid.uuid4()), str(entry.system_id), "Other", "Owned", "Digital"]],
    )
    rows = db_session.query(models.GameCopy).filter_by(game_id=entry.system_id).all()
    assert [(r.storefront, r.ownership) for r in rows] == [("Other", "Owned")]
