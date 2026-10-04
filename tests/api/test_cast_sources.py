"""
GET /api/casting/sources: the entries in a franchise the cast editor may
import a cast from.

`anime` (sample_anime), `sample_franchise`, `character`, `hidden_anime`,
`nsfw_label` and `catalog_writer` live in tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from tests.api.conftest import hidden_anime, nsfw_label  # noqa: F401


def _cast(db_session, entry, media_type, *characters):
    for position, character in enumerate(characters):
        db_session.add(
            models.CharacterCasting(
                character_id=character.system_id,
                media_type=media_type,
                entry_id=entry.system_id,
                position=position,
            )
        )
    db_session.commit()


@pytest.fixture
def season_two(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Season Two",
    )
    db_session.add(entry)
    db_session.commit()
    return entry


@pytest.fixture
def unrelated_anime(db_session):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Other"
    )
    db_session.add(franchise)
    db_session.flush()
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en="Unrelated",
    )
    db_session.add(entry)
    db_session.commit()
    return entry


def _sources(client, franchise_id, exclude=None):
    params = {"franchise_id": str(franchise_id)}
    if exclude:
        params["exclude"] = str(exclude)
    r = client.get("/api/casting/sources", params=params)
    assert r.status_code == 200, r.text
    return r.json()["sources"]


def test_lists_a_franchise_entry_that_has_a_cast(
    admin_client, db_session, sample_franchise, anime, season_two, unrelated_anime,
    character,
):
    _cast(db_session, anime, "anime", character)
    _cast(db_session, unrelated_anime, "anime", character)

    sources = _sources(admin_client, sample_franchise.system_id, exclude=season_two.system_id)
    # Season Two has no cast and the unrelated anime is another franchise's.
    assert [(s["entry_id"], s["cast_count"]) for s in sources] == [
        (str(anime.system_id), 1)
    ]
    assert sources[0]["media_type"] == "anime"


def test_excludes_the_entry_being_edited(admin_client, db_session, sample_franchise, anime, character):
    _cast(db_session, anime, "anime", character)
    assert _sources(admin_client, sample_franchise.system_id, exclude=anime.system_id) == []


def test_leaves_out_an_entry_the_editor_cannot_see(
    catalog_writer, db_session, sample_franchise, anime, hidden_anime, character
):
    """hidden_anime carries a label the writer's mode lacks; anime does not,
    and is the mirror case that proves the filter did the refusing."""
    _cast(db_session, anime, "anime", character)
    _cast(db_session, hidden_anime, "anime", character)

    writer = catalog_writer()
    ids = {s["entry_id"] for s in _sources(writer, sample_franchise.system_id)}
    assert ids == {str(anime.system_id)}


def test_a_guest_cannot_list_sources(client, sample_franchise):
    r = client.get("/api/casting/sources", params={"franchise_id": str(sample_franchise.system_id)})
    assert r.status_code in (401, 403)
