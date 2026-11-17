"""
備註 Remark is a catalogue-scope LIST: any number of shared rows per owner,
written under manage.catalog through the notes API and read by everyone who
can see the owner. 個人筆記 Personal Notes is its personal counterpart.

There is no `remark` on an entry or a group any more: their create, update and
patch routes neither take one nor return one, so every remark is written on
the notes page.

Every refusal here runs against a remark that already exists, so the refused
write had a row to change, and asserts the mirror - the same write by a
manage.catalog holder succeeding - so a green says the gate refused and not
that there was nothing to do.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.utils import note_sections as ns


def _remarks(db, column, owner_id):
    db.expire_all()
    return sorted(
        row.content
        for row in db.query(models.Note).filter(
            getattr(models.Note, column) == owner_id, models.Note.section == "remark"
        )
    )


def _note_body(owner_type, owner_id, content, section="remark"):
    return {
        "owner_type": owner_type,
        "owner_id": str(owner_id),
        "section": section,
        "content": content,
    }


@pytest.fixture
def remarked(db_session, owner_user, sample_anime):
    """One catalogue remark on sample_anime, written by the owner account."""
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="remark",
            content="共用備註",
            links=[],
            sort_index=0.0,
            author_id=owner_user.id,
        )
    )
    db_session.flush()
    return sample_anime


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------


def test_remark_is_a_catalogue_list_and_personal_notes_is_personal():
    remark = ns.section_by_key("remark")
    assert remark.scope == ns.SCOPE_CATALOG
    assert remark.shape == ns.SHAPE_TEXT_LINKS
    assert not remark.singleton

    personal = ns.section_by_key("personal_notes")
    assert personal.scope == ns.SCOPE_PERSONAL
    assert personal.shape == ns.SHAPE_TEXT_LINKS
    assert personal.label == "個人筆記 Personal Notes"
    assert ns.section_by_key("remark_list") is None


# ---------------------------------------------------------------------------
# Many rows per owner
# ---------------------------------------------------------------------------


def test_the_notes_api_takes_a_second_remark_on_one_owner(super_client, remarked):
    body = _note_body("anime", remarked.system_id, "第二條")
    r = super_client.post("/api/notes", json=body)
    assert r.status_code == 201, r.text

    notes = super_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(remarked.system_id)},
    ).json()
    assert [n["content"] for n in notes if n["section"] == "remark"] == [
        "共用備註",
        "第二條",
    ]


def test_the_database_takes_a_second_authors_remark(
    db_session, plain_user, remarked
):
    """ix_note_one_remark_per_owner is gone: a second row on the same owner
    flushes. `remarked` already holds one, so a surviving index would bite."""
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=remarked.system_id,
            section="remark",
            content="另一個人的",
            links=[],
            author_id=plain_user.id,
        )
    )
    db_session.flush()
    assert _remarks(db_session, "media_id", remarked.system_id) == [
        "共用備註",
        "另一個人的",
    ]


def test_a_remark_takes_links(super_client, sample_anime):
    body = {
        **_note_body("anime", sample_anime.system_id, "出處"),
        "links": [{"text": "訪談", "url": "https://example.com/interview"}],
    }
    r = super_client.post("/api/notes", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["links"] == [
        {"text": "訪談", "url": "https://example.com/interview"}
    ]


# ---------------------------------------------------------------------------
# Reads: everyone's
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["client", "user_client", "owner_client"])
def test_every_viewer_reads_the_catalogue_remark(request, remarked, who):
    viewer = request.getfixturevalue(who)
    notes = viewer.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(remarked.system_id)},
    ).json()
    assert [n["content"] for n in notes if n["section"] == "remark"] == ["共用備註"]


# ---------------------------------------------------------------------------
# No `remark` on an entry or a group
# ---------------------------------------------------------------------------


def test_an_entry_response_carries_no_remark(client, remarked):
    assert "remark" not in client.get(f"/api/anime/{remarked.system_id}").json()
    (row,) = [
        r for r in client.get("/api/anime/").json()
        if r["system_id"] == str(remarked.system_id)
    ]
    assert "remark" not in row


@pytest.mark.parametrize("method", ["patch", "put"])
def test_an_entry_write_ignores_a_remark(owner_client, db_session, remarked, method):
    """`remarked` holds one remark, so a write that still reached the note -
    replacing or clearing it - would change what is asserted."""
    r = getattr(owner_client, method)(
        f"/api/anime/{remarked.system_id}",
        json={"remark": "從表單來的", "anime_name_en": "Renamed"},
    )
    assert r.status_code == 200, r.text
    # The mirror: the same write's real column landed.
    assert r.json()["anime_name_en"] == "Renamed"
    assert "remark" not in r.json()
    assert _remarks(db_session, "media_id", remarked.system_id) == ["共用備註"]


def test_creating_an_entry_with_a_remark_writes_no_note(
    owner_client, db_session, sample_franchise
):
    res = owner_client.post(
        "/api/movies/",
        json={
            "movie_name_en": "Remarked Movie",
            "franchise_id": str(sample_franchise.system_id),
            "remark": "from the Add form",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert "remark" not in body
    assert _remarks(db_session, "media_id", uuid.UUID(body["system_id"])) == []


@pytest.mark.parametrize(
    "owner_type, column, name_field",
    [
        ("collection", "collection_id", "collection_name_en"),
        ("franchise", "franchise_id", "franchise_name_en"),
    ],
)
def test_creating_a_group_with_a_remark_writes_no_note(
    owner_client, db_session, owner_type, column, name_field
):
    res = owner_client.post(
        f"/api/{owner_type}/", json={name_field: "Remarked", "remark": "hub remark"}
    )
    assert res.status_code in (200, 201), res.text
    body = res.json()
    assert "remark" not in body
    assert _remarks(db_session, column, uuid.UUID(body["system_id"])) == []


@pytest.mark.parametrize("method", ["patch", "put"])
def test_a_group_write_ignores_a_remark(
    owner_client, db_session, owner_user, sample_series, method
):
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            series_id=sample_series.system_id,
            section="remark",
            content="系列備註",
            links=[],
            author_id=owner_user.id,
        )
    )
    db_session.flush()
    r = getattr(owner_client, method)(
        f"/api/series/{sample_series.system_id}",
        json={"remark": "從表單來的", "series_name_en": "Renamed Series"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["series_name_en"] == "Renamed Series"
    assert "remark" not in r.json()
    assert _remarks(db_session, "series_id", sample_series.system_id) == ["系列備註"]


# ---------------------------------------------------------------------------
# Writes: manage.catalog
# ---------------------------------------------------------------------------


def test_a_member_cannot_create_one_through_the_notes_api(
    user_client, super_client, sample_anime
):
    body = _note_body("anime", sample_anime.system_id, "成員的備註")
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
# 個人筆記 is personal
# ---------------------------------------------------------------------------


def test_a_members_personal_note_is_its_own(
    user_client, client, super_client, sample_anime
):
    body = _note_body("anime", sample_anime.system_id, "我自己的", "personal_notes")
    assert user_client.post("/api/notes", json=body).status_code == 201

    params = {"owner_type": "anime", "owner_id": str(sample_anime.system_id)}

    def personal_notes(c):
        return [
            n["content"]
            for n in c.get("/api/notes", params=params).json()
            if n["section"] == "personal_notes"
        ]

    assert personal_notes(user_client) == ["我自己的"]
    assert personal_notes(super_client) == []
    assert personal_notes(client) == []


def test_the_old_section_key_is_refused(user_client, sample_anime):
    body = _note_body("anime", sample_anime.system_id, "x", "remark_list")
    assert user_client.post("/api/notes", json=body).status_code in (400, 422)
