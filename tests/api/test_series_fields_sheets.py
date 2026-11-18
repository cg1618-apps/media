"""
A sheet written before the series-type columns moved still restores.

The Anime tab's single `release_date` became `release_date_jp` and
`release_date_tw`, the Cartoons tab's `length_ep_min` became `runtime_min`,
and the Book tab's `read_order` is gone. Backup rewrites every header, but a
Pull from a sheet backed up before the migration carries the old ones: the
renamed values must land in their new columns, and neither the renamed nor the
retired header may be reported as a stale column.

Requires PostgreSQL. See tests/api/conftest.py.
"""

from app import models
from app.services.pipelines import pull
from app.utils.formatter import (
    parse_anime_from_sheet,
    parse_book_from_sheet,
    parse_cartoon_from_sheet,
    parse_tv_show_from_sheet,
)

# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------


def test_an_old_anime_header_fills_both_release_dates():
    parsed = parse_anime_from_sheet({"release_date": "2023-04"})
    assert parsed["release_date_jp"] == "2023-04"
    assert parsed["release_date_tw"] == "2023-04"
    assert "release_date" not in parsed


def test_a_current_anime_header_is_read_as_written():
    parsed = parse_anime_from_sheet(
        {"release_date_jp": "2023-04", "release_date_tw": "", "runtime_min": "24"}
    )
    assert parsed["release_date_jp"] == "2023-04"
    assert parsed["release_date_tw"] is None
    assert parsed["runtime_min"] == 24


def test_an_old_cartoon_header_fills_the_runtime():
    assert parse_cartoon_from_sheet({"length_ep_min": "22"})["runtime_min"] == 22
    assert parse_cartoon_from_sheet({"runtime_min": "11"})["runtime_min"] == 11


def test_a_tv_show_reads_its_airing_type_and_runtime():
    parsed = parse_tv_show_from_sheet({"airing_type": "Special", "runtime_min": "45"})
    assert parsed["airing_type"] == "Special"
    assert parsed["runtime_min"] == 45


def test_a_book_no_longer_parses_a_read_order():
    assert "read_order" not in parse_book_from_sheet({"read_order": "2"})


# ---------------------------------------------------------------------------
# Pull
# ---------------------------------------------------------------------------


def _pull(db, monkeypatch, tab, headers, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: [headers] + rows)
    return pull.execute_pull_specific(db, tab, log_action=False)


def test_pull_restores_an_old_anime_tab_into_both_dates(db_session, monkeypatch):
    result = _pull(
        db_session, monkeypatch, "Anime",
        ["anime_name_cn", "release_date"], [["舊表", "2023-04-05"]],
    )

    assert result["status"] == "success"
    assert not any("release_date" in ref for ref in result.get("unresolved_refs", []))
    anime = db_session.query(models.Anime).filter_by(anime_name_cn="舊表").one()
    assert anime.release_date_jp == "2023-04-05"
    assert anime.release_date_tw == "2023-04-05"


def test_pull_reads_a_current_anime_tab_as_written(db_session, monkeypatch):
    # The mirror case: a sheet carrying the new headers must not be overridden
    # by the fallback, even if it also still carries the old one.
    result = _pull(
        db_session, monkeypatch, "Anime",
        ["anime_name_cn", "release_date", "release_date_jp", "release_date_tw"],
        [["新表", "1999", "2023-04", ""]],
    )

    assert result["status"] == "success"
    anime = db_session.query(models.Anime).filter_by(anime_name_cn="新表").one()
    assert anime.release_date_jp == "2023-04"
    assert anime.release_date_tw is None


def test_pull_restores_an_old_cartoon_runtime(db_session, monkeypatch):
    result = _pull(
        db_session, monkeypatch, "Cartoons",
        ["cartoon_name_cn", "length_ep_min"], [["卡通", "22"]],
    )

    assert result["status"] == "success"
    assert not any("length_ep_min" in ref for ref in result.get("unresolved_refs", []))
    cartoon = db_session.query(models.Cartoon).filter_by(cartoon_name_cn="卡通").one()
    assert cartoon.runtime_min == 22


def test_pull_does_not_report_a_retired_book_read_order(db_session, monkeypatch):
    result = _pull(
        db_session, monkeypatch, "Book",
        ["book_name_cn", "read_order"], [["小說", "2"]],
    )

    assert result["status"] == "success"
    assert not any("read_order" in ref for ref in result.get("unresolved_refs", []))


def test_a_tv_show_pulled_without_an_airing_type_is_tv(db_session, monkeypatch):
    result = _pull(
        db_session, monkeypatch, "TV Shows", ["tv_name_cn"], [["影集"]],
    )

    assert result["status"] == "success"
    show = db_session.query(models.TVShows).filter_by(tv_name_cn="影集").one()
    assert show.airing_type == "TV"


def test_unexpected_headers_names_neither_renamed_nor_retired_columns():
    assert pull.unexpected_headers("Anime", ["release_date"]) == []
    assert pull.unexpected_headers("Cartoons", ["length_ep_min"]) == []
    assert pull.unexpected_headers("Book", ["read_order"]) == []
    # The mirror: an unknown header on the same tab is still reported, so the
    # empty lists above are the exemption at work, not a silent function.
    assert pull.unexpected_headers("Anime", ["no_such_column"]) == ["no_such_column"]
