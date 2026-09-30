"""
PATCH /api/studio/{id} and PATCH /api/publisher/{id}: the detail pages'
inline rating and remark edits, under the rules PUT enforces.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module

KINDS = ["studio", "publisher"]


@pytest.fixture
def record(db_session):
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Patch Studio")
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en="Patch Publisher")
    db_session.add_all([studio, publisher])
    db_session.flush()
    db_session.add(models.PublisherScope(publisher_id=publisher.system_id, scope="game"))
    db_session.flush()
    return {"studio": studio, "publisher": publisher}


def _patch(client, kind, entity, body):
    return client.patch(f"/api/{kind}/{entity.system_id}", json=body)


@pytest.mark.parametrize("kind", KINDS)
def test_patch_changes_only_the_keys_sent(admin_client, record, kind):
    r = _patch(admin_client, kind, record[kind], {"my_rating": "A", "remark": "Kept"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_rating"] == "A"
    assert body["remark"] == "Kept"
    assert body["name_en"] == record[kind].name_en


@pytest.mark.parametrize("kind", KINDS)
def test_patch_returns_the_full_response(admin_client, record, kind):
    body = _patch(admin_client, kind, record[kind], {"remark": "x"}).json()
    for key in ("public_id", "display_name", "credit_count", "media_types", "restricted"):
        assert key in body


def test_publisher_patch_keeps_its_scopes(admin_client, record):
    body = _patch(admin_client, "publisher", record["publisher"], {"remark": "x"}).json()
    assert body["scopes"] == ["game"]


@pytest.mark.parametrize("kind", KINDS)
def test_an_empty_rating_is_null(admin_client, db_session, record, kind):
    record[kind].my_rating = "S"
    db_session.flush()
    body = _patch(admin_client, kind, record[kind], {"my_rating": ""}).json()
    assert body["my_rating"] is None


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "body",
    [
        {"my_rating": "a+"},
        {"display_name_field": "zh"},
        {"name_en": None},
        {"public_id": 5},
        {"system_id": str(uuid.uuid4())},
    ],
)
def test_patch_refuses_what_put_would_refuse(admin_client, record, kind, body):
    assert _patch(admin_client, kind, record[kind], body).status_code == 422


@pytest.mark.parametrize("kind", KINDS)
def test_a_guest_cannot_patch(client, record, kind):
    assert _patch(client, kind, record[kind], {"remark": "x"}).status_code == 401


@pytest.mark.parametrize("kind", KINDS)
def test_a_signed_in_non_admin_cannot_patch(user_client, record, kind):
    assert _patch(user_client, kind, record[kind], {"remark": "x"}).status_code in (
        401,
        403,
    )


@pytest.mark.parametrize("kind", KINDS)
def test_patching_an_unknown_id_is_404(admin_client, kind):
    r = admin_client.patch(f"/api/{kind}/{uuid.uuid4()}", json={"remark": "x"})
    assert r.status_code == 404


def test_a_studio_patch_carrying_a_producer_link_derives_the_id(
    admin_client, record, monkeypatch
):
    fetched = []
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_producer_data", lambda _id: fetched.append(_id)
    )
    body = _patch(
        admin_client,
        "studio",
        record["studio"],
        {"mal_link": "https://myanimelist.net/anime/producer/56/A-1_Pictures"},
    ).json()
    assert body["mal_id"] == 56
    # Derivation only: PATCH is the inline edit, and a MAL fetch belongs to
    # PUT and the Fill pipeline.
    assert fetched == []
