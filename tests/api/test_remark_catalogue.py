"""
`remark` is a catalogue-scope singleton: one shared row per owner, written
under manage.catalog and read by everyone who can see the owner.

Every refusal here runs against a remark that already exists, so the refused
write had a row to change, and asserts the mirror - the same write by a
manage.catalog holder succeeding - so a green says the gate refused and not
that there was nothing to do.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain.remark_field import upsert_remark
from app.utils import note_sections as ns


def _remarks(db, owner_id):
    db.expire_all()
    return [
        (row.author_id, row.content)
        for row in db.query(models.Note).filter(
            models.Note.media_id == owner_id, models.Note.section == "remark"
        )
    ]


@pytest.fixture
def remarked(db_session, owner_user, sample_anime):
    """The catalogue remark on sample_anime, written by the owner account."""
    upsert_remark(db_session, "anime", sample_anime.system_id, "共用備註", owner_user.id)
    db_session.flush()
    return sample_anime


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------


def test_remark_is_a_catalogue_singleton_and_remark_list_stays_personal():
    remark = ns.section_by_key("remark")
    assert remark.scope == ns.SCOPE_CATALOG
    assert remark.singleton
    assert ns.section_by_key("remark_list").scope == ns.SCOPE_PERSONAL


# ---------------------------------------------------------------------------
# Reads: one row, everyone's
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["client", "user_client", "owner_client"])
def test_every_viewer_reads_the_catalogue_remark(request, remarked, who):
    """A guest and a member read the remark the owner wrote."""
    viewer = request.getfixturevalue(who)
    body = viewer.get(f"/api/anime/{remarked.system_id}").json()
    assert body["remark"] == "共用備註"


def test_the_list_endpoint_carries_it_for_a_guest(client, remarked):
    rows = client.get("/api/anime/").json()
    (row,) = [r for r in rows if r["system_id"] == str(remarked.system_id)]
    assert row["remark"] == "共用備註"


def test_a_tier_remark_is_read_by_a_guest(client, db_session, owner_user, sample_franchise):
    upsert_remark(
        db_session, "franchise", sample_franchise.system_id, "從這裡開始", owner_user.id
    )
    db_session.flush()
    body = client.get(f"/api/franchise/{sample_franchise.system_id}").json()
    assert body["remark"] == "從這裡開始"


def test_the_notes_page_serves_the_remark_to_a_guest(client, remarked):
    notes = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(remarked.system_id)},
    ).json()
    assert [n["content"] for n in notes if n["section"] == "remark"] == ["共用備註"]


def test_an_owner_without_a_remark_reads_null(client, sample_anime):
    assert client.get(f"/api/anime/{sample_anime.system_id}").json()["remark"] is None


# ---------------------------------------------------------------------------
# Writes: manage.catalog, one row per owner
# ---------------------------------------------------------------------------


def test_a_second_writer_edits_the_same_row_and_keeps_its_author(
    db_session, owner_user, super_user, remarked
):
    upsert_remark(db_session, "anime", remarked.system_id, "改過了", super_user.id)
    db_session.flush()
    assert _remarks(db_session, remarked.system_id) == [(owner_user.id, "改過了")]


def test_clearing_deletes_the_one_row(db_session, super_user, remarked):
    upsert_remark(db_session, "anime", remarked.system_id, "  ", super_user.id)
    db_session.flush()
    assert _remarks(db_session, remarked.system_id) == []


def test_the_database_refuses_a_second_authors_remark(
    db_session, plain_user, remarked
):
    """ix_note_one_remark_per_owner is per owner, not per author: a second
    row by another account is refused even though the author differs."""
    savepoint = db_session.begin_nested()
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=remarked.system_id,
            section="remark",
            content="另一個人的",
            author_id=plain_user.id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    savepoint.rollback()


def test_a_member_without_manage_catalog_cannot_write_it_through_the_entry(
    user_client, owner_client, db_session, owner_user, remarked
):
    path = f"/api/anime/{remarked.system_id}"
    r = user_client.patch(path, json={"remark": "成員改的"})
    assert r.status_code in (401, 403), r.text
    assert _remarks(db_session, remarked.system_id) == [(owner_user.id, "共用備註")]

    r = owner_client.patch(path, json={"remark": "管理員改的"})
    assert r.status_code == 200, r.text
    assert r.json()["remark"] == "管理員改的"


def test_a_member_cannot_create_one_through_the_notes_api(
    user_client, super_client, sample_anime
):
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "section": "remark",
        "content": "成員的備註",
    }
    assert user_client.post("/api/notes", json=body).status_code == 401
    assert super_client.post("/api/notes", json=body).status_code == 201


def test_a_member_cannot_edit_it_through_the_notes_api(
    user_client, super_client, db_session, remarked
):
    (note_id,) = [
        row.system_id
        for row in db_session.query(models.Note).filter(
            models.Note.media_id == remarked.system_id,
            models.Note.section == "remark",
        )
    ]
    r = user_client.patch(f"/api/notes/{note_id}", json={"content": "成員改的"})
    assert r.status_code == 401
    r = super_client.patch(f"/api/notes/{note_id}", json={"content": "改好了"})
    assert r.status_code == 200, r.text


def test_the_personal_remark_route_is_gone(user_client, sample_anime):
    """Mirror: the same client reaches the /api/me router it lived on, so a
    404 is the route missing and not the router refusing."""
    r = user_client.put(
        f"/api/me/remarks/anime/{sample_anime.system_id}", json={"remark": "x"}
    )
    assert r.status_code in (404, 405)
    r = user_client.put(
        f"/api/me/plan-flags/{sample_anime.system_id}", json={"watch_next": True}
    )
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# 備註列表 stays personal
# ---------------------------------------------------------------------------


def test_a_members_remark_list_row_is_its_own(
    user_client, client, super_client, sample_anime
):
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "section": "remark_list",
        "content": "我自己的",
    }
    assert user_client.post("/api/notes", json=body).status_code == 201

    params = {"owner_type": "anime", "owner_id": str(sample_anime.system_id)}

    def remark_list(c):
        return [
            n["content"]
            for n in c.get("/api/notes", params=params).json()
            if n["section"] == "remark_list"
        ]

    assert remark_list(user_client) == ["我自己的"]
    assert remark_list(super_client) == []
    assert remark_list(client) == []
