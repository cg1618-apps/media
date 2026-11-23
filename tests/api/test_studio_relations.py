"""
Studio relations: a relation is mutual, each side keeps its own remark, and a
related studio the viewer may not see is never shown - not on a studio's page,
and not through the library's has_relations flag.

The access-mode refusals each have the hidden studio present and related, and
are mirrored by owner_client (`unrestricted`) reading the same relation back,
so a green says the label hid it rather than that there was nothing to show.
The hidden studio is credited only on a hentai, which the API stamps with the
`hentai` label that neither a guest reader nor the `safe` mode sees.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_NAMES


def _studio(db, name):
    studio = models.Studio(system_id=uuid.uuid4(), name_en=name)
    db.add(studio)
    db.flush()
    return studio


@pytest.fixture
def trio(db_session):
    return tuple(
        _studio(db_session, f"Zvornik Relation {name}") for name in ("A", "B", "C")
    )


@pytest.fixture
def hidden_studio(owner_client, db_session):
    """A studio credited only on a hentai: hidden outside `unrestricted`."""
    body = owner_client.post(
        "/api/hentai/", json={"hentai_name_cn": "Zvornik Relation Hentai"}
    ).json()
    hentai_id = uuid.UUID(body["system_id"])
    assert "hentai" in label_keys_for_entry(db_session, hentai_id)
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "studio", ["Zvornik Relation Hidden"]
    )
    return credits_service.find_studio(db_session, "Zvornik Relation Hidden")


def _put(client, studio, relations):
    return client.put(
        f"/api/studio/{studio.system_id}/related",
        json={
            "relations": [
                {"id": str(other.system_id), "remark": remark}
                for other, remark in relations
            ]
        },
    )


def _related(client, studio):
    response = client.get(f"/api/studio/{studio.system_id}/related")
    assert response.status_code == 200, response.text
    return [(row["display_name"], row["remark"]) for row in response.json()]


def test_a_relation_shows_on_both_sides_with_each_sides_own_remark(owner_client, trio):
    a, b, c = trio
    response = _put(owner_client, a, [(b, "animation subsidiary"), (c, None)])
    assert response.status_code == 200, response.text
    assert _related(owner_client, a) == [
        (b.display_name, "animation subsidiary"),
        (c.display_name, None),
    ]
    # The other side shows A, with no remark until its own side writes one.
    assert _related(owner_client, b) == [(a.display_name, None)]
    assert _related(owner_client, c) == [(a.display_name, None)]

    assert _put(owner_client, b, [(a, "parent company")]).status_code == 200
    assert _related(owner_client, b) == [(a.display_name, "parent company")]
    # B's remark is B's: A's side keeps its own.
    assert _related(owner_client, a)[0] == (b.display_name, "animation subsidiary")


def test_a_blank_remark_is_stored_as_none(owner_client, trio):
    a, b, _ = trio
    _put(owner_client, a, [(b, "   ")])
    assert _related(owner_client, a) == [(b.display_name, None)]


def test_removing_a_relation_from_one_side_removes_it_from_both(
    owner_client, db_session, trio
):
    a, b, c = trio
    _put(owner_client, a, [(b, "x"), (c, "y")])
    _put(owner_client, b, [(a, "z")])
    assert _put(owner_client, b, []).status_code == 200
    assert _related(owner_client, b) == []
    assert _related(owner_client, a) == [(c.display_name, "y")]
    pair = [a.system_id, b.system_id]
    assert (
        db_session.query(models.CompanyRelation)
        .filter(models.CompanyRelation.studio_id.in_(pair))
        .filter(models.CompanyRelation.related_studio_id.in_(pair))
        .count()
        == 0
    )


def test_a_studio_cannot_relate_to_itself_or_to_an_unknown_studio(owner_client, trio):
    a, _, _ = trio
    assert _put(owner_client, a, [(a, None)]).status_code == 422
    ghost = models.Studio(system_id=uuid.uuid4(), name_en="never stored")
    assert _put(owner_client, a, [(ghost, None)]).status_code == 422


def test_writing_relations_needs_manage_catalog(guest_reader, owner_client, trio):
    a, b, _ = trio
    assert _put(guest_reader, a, [(b, None)]).status_code in (401, 403)
    assert _put(owner_client, a, [(b, None)]).status_code == 200


def test_deleting_a_studio_takes_both_sides_with_it(owner_client, db_session, trio):
    a, b, _ = trio
    _put(owner_client, a, [(b, "x")])
    assert owner_client.delete(f"/api/studio/{b.system_id}").status_code == 200
    db_session.expire_all()
    assert _related(owner_client, a) == []
    assert (
        db_session.query(models.CompanyRelation)
        .filter(
            (models.CompanyRelation.studio_id == b.system_id)
            | (models.CompanyRelation.related_studio_id == b.system_id)
        )
        .count()
        == 0
    )


# ---------------------------------------------------------------------------
# Access mode
# ---------------------------------------------------------------------------


def test_a_hidden_related_studio_is_left_out_of_the_list(
    owner_client, guest_reader, trio, hidden_studio
):
    a, b, _ = trio
    _put(owner_client, a, [(b, "seen"), (hidden_studio, "unseen")])
    assert {name for name, _ in _related(owner_client, a)} == {
        b.display_name,
        hidden_studio.display_name,
    }
    assert _related(guest_reader, a) == [(b.display_name, "seen")]
    # The hidden studio's own list stays a 404: the relation reveals nothing.
    hidden_url = f"/api/studio/{hidden_studio.system_id}/related"
    assert guest_reader.get(hidden_url).status_code == 404
    assert owner_client.get(hidden_url).status_code == 200


def test_has_relations_counts_only_visible_studios(
    owner_client, guest_reader, trio, hidden_studio
):
    a, b, _ = trio
    _put(owner_client, a, [(hidden_studio, None)])

    def flags(client):
        rows = client.get("/api/studio/").json()
        return {row["system_id"]: row["has_relations"] for row in rows}

    assert flags(owner_client)[str(a.system_id)] is True
    assert flags(guest_reader)[str(a.system_id)] is False
    assert owner_client.get(f"/api/studio/{a.system_id}").json()["has_relations"] is True
    assert guest_reader.get(f"/api/studio/{a.system_id}").json()["has_relations"] is False
    assert flags(owner_client)[str(b.system_id)] is False


def test_a_writer_who_cannot_see_a_relation_does_not_remove_it(
    owner_client, mode_client, trio, hidden_studio
):
    """An editor in the `safe` mode saves a list it could only partly see; the
    relation to the studio it was never shown survives. owner_client, in
    `unrestricted`, is the mirror that shows it is there."""
    a, b, _ = trio
    _put(owner_client, a, [(hidden_studio, "kept")])
    narrowed = mode_client("safe")
    assert _related(narrowed, a) == []
    assert _put(narrowed, a, [(b, None)]).status_code == 200
    # Nor may the narrowed editor name the hidden studio itself.
    assert _put(narrowed, a, [(hidden_studio, None)]).status_code == 422
    assert _related(owner_client, a) == sorted(
        [(b.display_name, None), (hidden_studio.display_name, "kept")],
        key=lambda r: r[0].casefold(),
    )


# ---------------------------------------------------------------------------
# Merge and Sheets
# ---------------------------------------------------------------------------


def test_a_merge_moves_both_sides_and_drops_the_duplicate(owner_client, db_session):
    keep = _studio(db_session, "Zvornik Merge Keep")
    drop = _studio(db_session, "Zvornik Merge Drop")
    shared = _studio(db_session, "Zvornik Merge Shared")
    only_drop = _studio(db_session, "Zvornik Merge Only Drop")
    _put(owner_client, keep, [(shared, "keep's words"), (drop, None)])
    _put(owner_client, drop, [(shared, "drop's words"), (only_drop, "moved")])

    response = owner_client.post(
        f"/api/studio/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert _related(owner_client, keep) == sorted(
        [(only_drop.display_name, "moved"), (shared.display_name, "keep's words")],
        key=lambda r: r[0].casefold(),
    )
    assert _related(owner_client, only_drop) == [(keep.display_name, None)]
    assert _related(owner_client, shared) == [(keep.display_name, None)]


def test_the_tab_restores_after_studio_and_publisher():
    assert TAB_NAMES.index("Studio") < TAB_NAMES.index("Company Relation")
    assert TAB_NAMES.index("Publisher") < TAB_NAMES.index("Company Relation")


def test_a_relation_round_trips_through_its_tab_in_the_pre_publisher_shape(monkeypatch, db_session):
    a = _studio(db_session, "Zvornik Sheet A")
    b = _studio(db_session, "Zvornik Sheet B")
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [
            ["system_id", "studio_id", "related_studio_id", "remark"],
            [str(uuid.uuid4()), str(a.system_id), str(b.system_id), "sister studio"],
            [str(uuid.uuid4()), str(b.system_id), str(a.system_id), ""],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Company Relation", log_action=False)
    assert result["status"] == "success", result
    rows = {
        (r.studio_id, r.related_studio_id): r.remark
        for r in db_session.query(models.CompanyRelation)
        .filter(models.CompanyRelation.studio_id.in_([a.system_id, b.system_id]))
        .all()
    }
    assert rows == {
        (a.system_id, b.system_id): "sister studio",
        (b.system_id, a.system_id): None,
    }
