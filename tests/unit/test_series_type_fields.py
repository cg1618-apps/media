"""
TV show runtime from TMDB, and the airing-type vocabularies the TV show and
cartoon dropdowns are served (app/routers/constants.py).
"""

from app.utils import constants as c
from app.utils.imdb_utils import map_imdb_to_cartoon_data, map_imdb_to_tv_show_data


def _season(*runtimes):
    return {"air_date": "2024-01-05", "episodes": [{"runtime": r} for r in runtimes]}


def test_a_tv_season_maps_its_most_common_episode_runtime():
    mapped = map_imdb_to_tv_show_data(None, _season(44, 52, 44), None)
    assert mapped["runtime_min"] == 44


def test_a_tv_season_without_runtimes_falls_back_to_the_show():
    mapped = map_imdb_to_tv_show_data({"episode_run_time": [42]}, _season(None), None)
    assert mapped["runtime_min"] == 42


def test_a_cartoon_maps_runtime_min_not_length_ep_min():
    mapped = map_imdb_to_cartoon_data(None, _season(11, 11), None)
    assert mapped["runtime_min"] == 11
    assert "length_ep_min" not in mapped


def test_tv_show_airing_types_default_first():
    assert c.TV_SHOW_AIRING_TYPES == ("TV", "Special")


def test_cartoon_airing_types_no_longer_offer_ova():
    assert "OVA" not in c.CARTOON_AIRING_TYPES
    assert c.CARTOON_AIRING_TYPES == ("TV", "Movie", "Special")


def _patch_tv(monkeypatch, runtimes):
    from app.services.domain import autofill as autofill_module

    monkeypatch.setattr(
        autofill_module,
        "fetch_imdb_data",
        lambda imdb_id: {"tmdb_raw": {"id": 1}, "omdb_raw": None},
    )
    monkeypatch.setattr(
        autofill_module, "fetch_tmdb_tv_season_data", lambda i, n: _season(*runtimes)
    )
    monkeypatch.setattr(autofill_module, "cover_needs_download", lambda *a: False)


def _show(**kwargs):
    import types

    defaults = dict(
        system_id="55555555-5555-5555-5555-555555555555", imdb_id="tt1",
        season_part="Season 1", airing_status="Finished Airing",
        release_date="2024-01-05", ep_total=2, runtime_min=None,
        imdb_rating=None, imdb_series_rating=None, cover_image_file="x.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def test_tv_autofill_fills_the_runtime(monkeypatch):
    from app.services.domain.autofill import autofill_tv_show_from_imdb

    _patch_tv(monkeypatch, (45, 45))
    show = _show()
    autofill_tv_show_from_imdb(show, db=None)
    assert show.runtime_min == 45


def test_tv_autofill_keeps_a_typed_runtime(monkeypatch):
    from app.services.domain.autofill import autofill_tv_show_from_imdb

    _patch_tv(monkeypatch, (45, 45))
    show = _show(runtime_min=50)
    autofill_tv_show_from_imdb(show, db=None)
    assert show.runtime_min == 50
