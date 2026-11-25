"""
The AniList link a studio, person and character carry beside their MAL link.

Entered by hand and stored as given: no id is derived from it, nothing is
fetched from it, and it reaches the sheet as a plain column so Backup and
Pull All carry it.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME
from app.utils.formatter import format_model_for_sheet

STUDIO_LINK = "https://anilist.co/studio/2/Kyoto-Animation"
PERSON_LINK = "https://anilist.co/staff/95185/Kana-Hanazawa"
CHARACTER_LINK = "https://anilist.co/character/11/Edward-Elric"

# route, a minimal body, the link, the model and its Sheets tab
ENTITIES = {
    "studio": ("/api/studio/", {"name_en": "Kyoto Animation"}, STUDIO_LINK, models.Studio, "Studio"),
    "person": ("/api/person/", {"name_en": "Kana Hanazawa"}, PERSON_LINK, models.Person, "Person"),
    "character": (
        "/api/character/",
        {"name_en": "Edward Elric"},
        CHARACTER_LINK,
        models.Character,
        "Character",
    ),
}


@pytest.fixture(autouse=True)
def no_external_calls(monkeypatch):
    """No AniList (or any) request is made: a save that tried one fails here."""
    import requests

    def refuse(*args, **kwargs):
        raise AssertionError(f"unexpected HTTP request: {args!r}")

    monkeypatch.setattr(requests.Session, "request", refuse)


@pytest.mark.parametrize("kind", sorted(ENTITIES))
def test_create_stores_and_returns_the_link(owner_client, kind):
    route, body, link, _, _ = ENTITIES[kind]
    r = owner_client.post(route, json={**body, "anilist_link": link})
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["anilist_link"] == link
    read = owner_client.get(f"{route}{created['system_id']}").json()
    assert read["anilist_link"] == link


@pytest.mark.parametrize("kind", sorted(ENTITIES))
def test_put_changes_and_clears_the_link(owner_client, kind):
    route, body, link, _, _ = ENTITIES[kind]
    created = owner_client.post(route, json=body).json()
    assert created["anilist_link"] is None

    r = owner_client.put(f"{route}{created['system_id']}", json={**body, "anilist_link": link})
    assert r.status_code == 200, r.text
    assert r.json()["anilist_link"] == link

    r = owner_client.put(f"{route}{created['system_id']}", json={**body, "anilist_link": None})
    assert r.status_code == 200, r.text
    assert r.json()["anilist_link"] is None


@pytest.mark.parametrize("kind", sorted(ENTITIES))
def test_patch_sets_the_link_and_derives_nothing(owner_client, kind):
    route, body, link, _, _ = ENTITIES[kind]
    created = owner_client.post(route, json=body).json()
    r = owner_client.patch(f"{route}{created['system_id']}", json={"anilist_link": link})
    assert r.status_code == 200, r.text
    assert r.json()["anilist_link"] == link
    # The MAL link is the one an id is read from; an AniList one leaves it alone.
    assert r.json()["mal_id"] is None


@pytest.mark.parametrize("kind", sorted(ENTITIES))
def test_the_link_round_trips_through_its_sheets_tab(db_session, kind):
    _, body, link, model, tab_name = ENTITIES[kind]
    row = model(**body, anilist_link=link)
    db_session.add(row)
    db_session.commit()

    tab = TAB_BY_NAME[tab_name]
    header = [c.name for c in model.__table__.columns if c.name not in tab.drop_columns]
    assert "anilist_link" in header
    cells = dict(zip(header, format_model_for_sheet(row, columns=header)))
    assert cells["anilist_link"] == link

    parsed = tab.parser({k: "" if v is None else str(v) for k, v in cells.items()})
    assert parsed["anilist_link"] == link
    assert tab.parser({"anilist_link": ""})["anilist_link"] is None


@pytest.mark.parametrize("kind", sorted(ENTITIES))
def test_a_sheet_from_before_the_column_leaves_the_link_alone(kind):
    _, body, _, _, tab_name = ENTITIES[kind]
    # No anilist_link key, so Pull's upsert keeps the local value.
    assert "anilist_link" not in TAB_BY_NAME[tab_name].parser(dict(body))
