"""
Franchise relations: the studio relation's rules, on franchises. A relation is
mutual, each side keeps its own remark, and a related franchise the viewer may
not see is never shown - not on a franchise's page, and not through the
library's has_relations flag.

The hidden franchise carries `nsfw` (`nsfw_label`, the fixture that makes a
refusal possible at all), which the anonymous `client` - the `safe` mode -
does not see. Each refusal is mirrored by owner_client (`unrestricted`)
reading the same relation back, so a green says the label hid it rather than
that there was nothing to show.

The shared rules - pair kept whole, blank remark, self and unknown ids - are
proved on studios in test_studio_relations.py; this file proves the franchise
wiring and the franchise visibility rule.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_NAMES


def _franchise(db, name):
    franchise = models.Franchise(system_id=uuid.uuid4(), franchise_name_en=name)
    db.add(franchise)
    db.flush()
    return franchise


@pytest.fixture
def pair(db_session):
    return (
        _franchise(db_session, "Zvornik Franchise A"),
        _franchise(db_session, "Zvornik Franchise B"),
    )


@pytest.fixture
def hidden_franchise(db_session, nsfw_label):
    franchise = _franchise(db_session, "Zvornik Franchise Hidden")
    db_session.add(
        models.FranchiseContentLabel(
            system_id=uuid.uuid4(),
            franchise_id=franchise.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return franchise


def _put(client, franchise, relations):
    return client.put(
        f"/api/franchise/{franchise.system_id}/related",
        json={
            "relations": [
                {"id": str(other.system_id), "remark": remark}
                for other, remark in relations
            ]
        },
    )


def _related(client, franchise):
    response = client.get(f"/api/franchise/{franchise.system_id}/related")
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


def test_deleting_a_franchise_takes_both_sides_with_it(owner_client, db_session, pair):
    a, b = pair
    _put(owner_client, a, [(b, "x")])
    assert owner_client.delete(f"/api/franchise/{b.system_id}").status_code == 200
    db_session.expire_all()
    assert _related(owner_client, a) == []


# ---------------------------------------------------------------------------
# Access mode
# ---------------------------------------------------------------------------


def test_a_hidden_related_franchise_is_left_out_of_the_list(
    owner_client, client, pair, hidden_franchise
):
    a, b = pair
    _put(owner_client, a, [(b, "seen"), (hidden_franchise, "unseen")])
    assert {name for name, _ in _related(owner_client, a)} == {
        b.display_name,
        hidden_franchise.display_name,
    }
    assert _related(client, a) == [(b.display_name, "seen")]
    # The hidden franchise's own list is a 404: the relation reveals nothing.
    hidden_url = f"/api/franchise/{hidden_franchise.system_id}/related"
    assert client.get(hidden_url).status_code == 404
    assert owner_client.get(hidden_url).status_code == 200


def test_has_relations_counts_only_visible_franchises(
    owner_client, client, pair, hidden_franchise
):
    a, b = pair
    _put(owner_client, a, [(hidden_franchise, None)])

    def flag(c, franchise):
        rows = c.get("/api/franchise/", params={"limit": 2000}).json()
        return {row["system_id"]: row["has_relations"] for row in rows}[
            str(franchise.system_id)
        ]

    assert flag(owner_client, a) is True
    assert flag(client, a) is False
    assert owner_client.get(f"/api/franchise/{a.system_id}").json()["has_relations"] is True
    assert client.get(f"/api/franchise/{a.system_id}").json()["has_relations"] is False
    assert flag(owner_client, b) is False


def test_a_writer_who_cannot_see_a_relation_does_not_remove_it(
    owner_client, catalog_writer, pair, hidden_franchise
):
    """A catalogue editor whose mode carries no labels saves a list it could
    only partly see; the relation it was never shown survives, and it may not
    name the hidden franchise itself. owner_client is the mirror."""
    a, b = pair
    _put(owner_client, a, [(hidden_franchise, "kept")])
    narrow = catalog_writer(username="narrowrelations", label_keys=())
    assert _related(narrow, a) == []
    assert _put(narrow, a, [(b, None)]).status_code == 200
    assert _put(narrow, a, [(hidden_franchise, None)]).status_code == 422
    assert {name for name, _ in _related(owner_client, a)} == {
        b.display_name,
        hidden_franchise.display_name,
    }


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


def test_the_tab_restores_after_franchise():
    assert TAB_NAMES.index("Franchise") < TAB_NAMES.index("Franchise Relation")


def test_a_relation_round_trips_through_its_tab(monkeypatch, db_session, pair):
    a, b = pair
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [
            ["system_id", "franchise_id", "related_franchise_id", "remark"],
            [str(uuid.uuid4()), str(a.system_id), str(b.system_id), "sequel series"],
            [str(uuid.uuid4()), str(b.system_id), str(a.system_id), ""],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Franchise Relation", log_action=False)
    assert result["status"] == "success", result
    rows = {
        (r.franchise_id, r.related_franchise_id): r.remark
        for r in db_session.query(models.FranchiseRelation).all()
    }
    assert rows == {
        (a.system_id, b.system_id): "sequel series",
        (b.system_id, a.system_id): None,
    }


def test_an_added_franchise_also_relates_to_the_others_it_names(owner_client, db_session, pair):
    """The "also related to" ticks reach franchises, the kind omitted as
    everywhere else on this list."""
    a, b = pair
    c = _franchise(db_session, "Zvornik Franchise C")
    _put(owner_client, a, [(b, None)])
    r = owner_client.put(
        f"/api/franchise/{a.system_id}/related",
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
