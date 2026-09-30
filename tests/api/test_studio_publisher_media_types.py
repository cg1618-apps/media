"""
media_types and restricted on studio and publisher responses: the sorted,
distinct media types of the VISIBLE entries the company is credited on, and
whether one of them is a gated type.

The refusal tests make the hidden set non-empty: the gated entry is created
through the API, which stamps its gated label, and the guest's mode lacks that
label (asserted, not assumed). The same record is read back through
`admin_client`, whose mode carries every label, so a green proves the gate did
the hiding.

Publishers are never credited on a gated type through the API - no gated type
is a legal publisher scope - so the publisher's gated credit is written
straight to media_credit. It is what makes the publisher refusal test bite.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.content_labels import label_keys_for_entry


def _hentai(admin_client, db_session):
    body = admin_client.post(
        "/api/hentai/", json={"hentai_name_cn": "Zvornik Company Hentai"}
    ).json()
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["hentai"]
    return entry_id


def _h_comic(admin_client, db_session):
    body = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik Company H-Comic", "region": "KR"}
    ).json()
    entry_id = uuid.UUID(body["system_id"])
    assert label_keys_for_entry(db_session, entry_id) == ["h-comic"]
    return entry_id


def _credit(db_session, kind, company, media_id):
    db_session.add(
        models.MediaCredit(
            media_id=media_id, role=kind, **{f"{kind}_id": company.system_id}
        )
    )
    db_session.flush()


@pytest.fixture
def credited_studio(db_session, admin_client, anime):
    """Credited on a visible anime and on a gated hentai."""
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Zvornik Studio")
    db_session.add(studio)
    db_session.flush()
    _credit(db_session, "studio", studio, anime.system_id)
    _credit(db_session, "studio", studio, _hentai(admin_client, db_session))
    return studio


@pytest.fixture
def credited_publisher(db_session, admin_client, manga_entry):
    """Credited on a visible manga and on a gated h-comic."""
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en="Zvornik Publisher")
    db_session.add(publisher)
    db_session.flush()
    _credit(db_session, "publisher", publisher, manga_entry.system_id)
    _credit(db_session, "publisher", publisher, _h_comic(admin_client, db_session))
    return publisher


@pytest.fixture
def companies(credited_studio, credited_publisher):
    return {
        "studio": (credited_studio, ["anime", "hentai"], ["anime"]),
        "publisher": (credited_publisher, ["h-comic", "manga"], ["manga"]),
    }


def _detail(client, kind, company):
    r = client.get(f"/api/{kind}/{company.system_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _from_list(client, kind, company):
    rows = client.get(f"/api/{kind}/").json()
    return next(row for row in rows if row["system_id"] == str(company.system_id))


@pytest.mark.parametrize("kind", ["studio", "publisher"])
@pytest.mark.parametrize("read", [_detail, _from_list], ids=["detail", "list"])
def test_media_types_are_the_visible_ones_and_restricted_follows_them(
    client, admin_client, companies, kind, read
):
    company, everything, narrow = companies[kind]

    admin = read(admin_client, kind, company)
    assert admin["media_types"] == everything
    assert admin["restricted"] is True
    assert admin["credit_count"] == 2

    guest = read(client, kind, company)
    assert guest["media_types"] == narrow
    assert guest["restricted"] is False
    # Derived from the same visible pairs as the types.
    assert guest["credit_count"] == 1


@pytest.mark.parametrize("kind", ["studio", "publisher"])
def test_an_uncredited_company_has_no_media_types(admin_client, db_session, kind):
    model = models.Studio if kind == "studio" else models.Publisher
    company = model(system_id=uuid.uuid4(), name_en=f"Uncredited {kind}")
    db_session.add(company)
    db_session.flush()
    body = _detail(admin_client, kind, company)
    assert body["media_types"] == []
    assert body["restricted"] is False
    assert body["credit_count"] == 0


def test_search_results_carry_the_same_media_types(client, companies):
    studio, _everything, narrow = companies["studio"]
    body = client.get("/api/search/", params={"q": "Zvornik Studio"}).json()
    row = next(
        r for r in body["results"]["studio"] if r["system_id"] == str(studio.system_id)
    )
    assert row["media_types"] == narrow
    assert row["restricted"] is False
