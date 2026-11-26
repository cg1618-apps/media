"""
Series relations: the franchise relation's rules, on series. A relation is
mutual, each side keeps its own remark, and a related series the viewer may
not see is never shown - not on a series' page, and not through the
library's has_relations flag.

The hidden series carries `nsfw` (`nsfw_label`, the fixture that makes a
refusal possible at all), which the anonymous `client` - the `safe` mode -
does not see. Each refusal is mirrored by owner_client (`unrestricted`)
reading the same relation back, so a green says the label hid it rather than
that there was nothing to show.

The shared rules - pair kept whole, blank remark, self and unknown ids - are
proved on studios in test_studio_relations.py; this file proves the series
wiring and the series visibility rule.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_NAMES


def _series(db, name):
    series = models.Series(system_id=uuid.uuid4(), series_name_en=name)
    db.add(series)
    db.flush()
    return series


@pytest.fixture
def pair(db_session):
    return (
        _series(db_session, "Zvornik Series A"),
        _series(db_session, "Zvornik Series B"),
    )


@pytest.fixture
def hidden_series(db_session, nsfw_label):
    series = _series(db_session, "Zvornik Series Hidden")
    db_session.add(
        models.SeriesContentLabel(
            system_id=uuid.uuid4(),
            series_id=series.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return series


def _put(client, series, relations):
    return client.put(
        f"/api/series/{series.system_id}/related",
        json={
            "relations": [
                {"id": str(other.system_id), "remark": remark}
                for other, remark in relations
            ]
        },
    )


def _related(client, series):
    response = client.get(f"/api/series/{series.system_id}/related")
    assert response.status_code == 200, response.text
    return [(row["display_name"], row["remark"]) for row in response.json()]


def test_a_relation_shows_on_both_sides_with_each_sides_own_remark(owner_client, pair):
    a, b = pair
    assert _put(owner_client, a, [(b, "spin-off")]).status_code == 200
    assert _related(owner_client, a) == [(b.display_name, "spin-off")]
    assert _related(owner_client, b) == [(a.display_name, None)]
    assert _put(owner_client, b, [(a, "original")]).status_code == 200
    assert _related(owner_client, b) == [(a.display_name, "original")]
    assert _related(owner_client, a) == [(b.display_name, "spin-off")]
    # And from either side, removal takes both rows.
    assert _put(owner_client, b, []).status_code == 200
    assert _related(owner_client, a) == []


def test_writing_relations_needs_manage_catalog(client, owner_client, pair):
    a, b = pair
    assert _put(client, a, [(b, None)]).status_code in (401, 403)
    assert _put(owner_client, a, [(b, None)]).status_code == 200


def test_deleting_a_series_takes_both_sides_with_it(owner_client, db_session, pair):
    a, b = pair
    _put(owner_client, a, [(b, "x")])
    assert owner_client.delete(f"/api/series/{b.system_id}").status_code == 200
    db_session.expire_all()
    assert _related(owner_client, a) == []
    assert db_session.query(models.SeriesRelation).count() == 0


# ---------------------------------------------------------------------------
# Access mode
# ---------------------------------------------------------------------------


def test_a_hidden_related_series_is_left_out_of_the_list(
    owner_client, client, pair, hidden_series
):
    a, b = pair
    _put(owner_client, a, [(b, "seen"), (hidden_series, "unseen")])
    assert {name for name, _ in _related(owner_client, a)} == {
        b.display_name,
        hidden_series.display_name,
    }
    assert _related(client, a) == [(b.display_name, "seen")]
    # The hidden series' own list is a 404: the relation reveals nothing.
    hidden_url = f"/api/series/{hidden_series.system_id}/related"
    assert client.get(hidden_url).status_code == 404
    assert owner_client.get(hidden_url).status_code == 200


def test_has_relations_counts_only_visible_series(
    owner_client, client, pair, hidden_series
):
    a, b = pair
    _put(owner_client, a, [(hidden_series, None)])

    def flag(c, series):
        rows = c.get("/api/series/", params={"limit": 2000}).json()
        return {row["system_id"]: row["has_relations"] for row in rows}[
            str(series.system_id)
        ]

    assert flag(owner_client, a) is True
    assert flag(client, a) is False
    assert owner_client.get(f"/api/series/{a.system_id}").json()["has_relations"] is True
    assert client.get(f"/api/series/{a.system_id}").json()["has_relations"] is False
    assert flag(owner_client, b) is False


def test_a_writer_who_cannot_see_a_relation_does_not_remove_it(
    owner_client, catalog_writer, pair, hidden_series
):
    """A catalogue editor whose mode carries no labels saves a list it could
    only partly see; the relation it was never shown survives, and it may not
    name the hidden series itself. owner_client is the mirror."""
    a, b = pair
    _put(owner_client, a, [(hidden_series, "kept")])
    narrow = catalog_writer(username="narrowseriesrel", label_keys=())
    assert _related(narrow, a) == []
    assert _put(narrow, a, [(b, None)]).status_code == 200
    assert _put(narrow, a, [(hidden_series, None)]).status_code == 422
    assert {name for name, _ in _related(owner_client, a)} == {
        b.display_name,
        hidden_series.display_name,
    }


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


def test_the_tab_restores_after_series():
    assert TAB_NAMES.index("Series") < TAB_NAMES.index("Series Relation")


def test_a_relation_round_trips_through_its_tab(monkeypatch, db_session, pair):
    a, b = pair
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [
            ["system_id", "series_id", "related_series_id", "remark"],
            [str(uuid.uuid4()), str(a.system_id), str(b.system_id), "side story"],
            [str(uuid.uuid4()), str(b.system_id), str(a.system_id), ""],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Series Relation", log_action=False)
    assert result["status"] == "success", result
    rows = {
        (r.series_id, r.related_series_id): r.remark
        for r in db_session.query(models.SeriesRelation).all()
    }
    assert rows == {
        (a.system_id, b.system_id): "side story",
        (b.system_id, a.system_id): None,
    }


def test_an_added_series_also_relates_to_the_others_it_names(owner_client, db_session, pair):
    """The "also related to" ticks reach series, the kind omitted as
    everywhere else on this list."""
    a, b = pair
    c = _series(db_session, "Zvornik Series C")
    _put(owner_client, a, [(b, None)])
    r = owner_client.put(
        f"/api/series/{a.system_id}/related",
        json={
            "relations": [
                {"id": str(b.system_id)},
                {"id": str(c.system_id), "also_related_to": [{"id": str(b.system_id)}]},
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert [name for name, _ in _related(owner_client, c)] == sorted(
        [a.display_name, b.display_name], key=str.casefold
    )
