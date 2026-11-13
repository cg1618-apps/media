"""
Search follows every switch that can be off.

A bucket for an entity kind the viewer may not open, or for a media type its
role does not hold, is ABSENT from the response - not an empty list, which
would still say the kind exists, the rule a hidden gated type's bucket
already follows (gated_types.py).

Every refusal is made to bite with a row that matches the query, and is
paired with the mirror on the same row: holding the key, the bucket is
present and carries it.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_VIEW_CHARACTER,
    PERM_VIEW_PERSON,
    PERM_VIEW_PUBLISHER,
    PERM_VIEW_SEARCH,
    PERM_VIEW_STUDIO,
    media_type_perm,
)
from app.services.rbac.seed import ordinary_media_type_permissions
from tests.api.conftest import make_viewer

QUERY = "Zvornik Switch"
ENTITY_KEYS = {
    "person": PERM_VIEW_PERSON,
    "studio": PERM_VIEW_STUDIO,
    "publisher": PERM_VIEW_PUBLISHER,
    "character": PERM_VIEW_CHARACTER,
}


@pytest.fixture
def matching_rows(db_session, sample_franchise):
    """One row per entity kind and one manga, every one matching QUERY."""
    rows = {
        "person": models.Person(system_id=uuid.uuid4(), name_en=f"{QUERY} Person"),
        "studio": models.Studio(system_id=uuid.uuid4(), name_en=f"{QUERY} Studio"),
        "publisher": models.Publisher(
            system_id=uuid.uuid4(), name_en=f"{QUERY} Publisher"
        ),
        "character": models.Character(
            system_id=uuid.uuid4(), name_en=f"{QUERY} Character"
        ),
        "manga": models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            manga_name_en=f"{QUERY} Manga",
        ),
    }
    db_session.add_all(rows.values())
    db_session.flush()
    return {key: str(row.system_id) for key, row in rows.items()}


def _results(client):
    r = client.get("/api/search/", params={"q": QUERY, "characters": "true"})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def _ids(results, key):
    return [row["system_id"] for row in results[key]]


def _reads(*extra):
    return ordinary_media_type_permissions() | {PERM_VIEW_SEARCH, *extra}


@pytest.mark.parametrize("kind", sorted(ENTITY_KEYS))
def test_an_entity_bucket_is_absent_without_its_key(
    db_session, client, matching_rows, kind
):
    """The other three kinds are held, so the absence is this kind's key and
    not a viewer that sees no entities at all."""
    others = {key for name, key in ENTITY_KEYS.items() if name != kind}
    results = _results(make_viewer(db_session, client, f"no{kind}", _reads(*others)))

    assert kind not in results
    for name in ENTITY_KEYS:
        if name != kind:
            assert matching_rows[name] in _ids(results, name), name


@pytest.mark.parametrize("kind", sorted(ENTITY_KEYS))
def test_an_entity_bucket_is_present_with_its_key(
    db_session, client, matching_rows, kind
):
    results = _results(
        make_viewer(db_session, client, f"only{kind}", _reads(ENTITY_KEYS[kind]))
    )
    assert _ids(results, kind) == [matching_rows[kind]]
    for name in ENTITY_KEYS:
        if name != kind:
            assert name not in results, name


def test_a_media_type_bucket_is_absent_when_the_role_lacks_the_type(
    db_session, client, matching_rows
):
    reads = _reads() - {media_type_perm("manga")}
    results = _results(make_viewer(db_session, client, "nomanga", reads))

    assert "manga" not in results
    # Mirror inside the same response: a type the role does hold still has
    # its bucket.
    assert "anime" in results


def test_a_media_type_bucket_is_present_when_the_role_holds_it(
    db_session, client, matching_rows
):
    results = _results(make_viewer(db_session, client, "withmanga", _reads()))
    assert _ids(results, "manga") == [matching_rows["manga"]]
