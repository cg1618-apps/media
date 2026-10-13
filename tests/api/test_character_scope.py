"""
GET /api/character/?franchise_id= and ?series_id=: the characters cast on a
franchise's or a series' entries, which the hubs' Characters tab lists.

`anime` (sample_anime, in sample_franchise), `sample_series`, `character`,
`second_character`, `hidden_anime`, `nsfw_label` and `catalog_writer` live in
tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from tests.api.conftest import hidden_anime, nsfw_label  # noqa: F401


def _cast(db_session, entry, character, identity=None, media_type="anime"):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            identity_id=identity.system_id if identity else None,
            media_type=media_type,
            entry_id=entry.system_id,
        )
    )
    db_session.flush()


def _identity(db_session, character, name):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en=name
    )
    db_session.add(identity)
    db_session.flush()
    return identity


@pytest.fixture
def other_franchise_anime(db_session):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Other"
    )
    db_session.add(franchise)
    db_session.flush()
    entry = models.Anime(
        system_id=uuid.uuid4(), franchise_id=franchise.system_id, anime_name_en="Elsewhere"
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def series_anime(db_session, sample_franchise, sample_series):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        series_id=sample_series.system_id,
        anime_name_en="In The Series",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def _list(client, **scope):
    r = client.get("/api/character/", params={k: str(v) for k, v in scope.items()})
    assert r.status_code == 200, r.text
    return r.json()


def _names(rows):
    return [row["display_name"] for row in rows]


def test_franchise_scope_lists_only_its_entries_characters(
    client, db_session, sample_franchise, anime, other_franchise_anime, character,
    second_character,
):
    _cast(db_session, anime, character)
    _cast(db_session, other_franchise_anime, second_character)

    assert _names(_list(client, franchise_id=sample_franchise.system_id)) == ["Ichika"]
    # The mirror case: unscoped, both are listed, so the scope did the narrowing.
    assert set(_names(_list(client))) >= {"Ichika", "Yuki"}


def test_series_scope_lists_only_its_entries_characters(
    client, db_session, sample_series, anime, series_anime, character, second_character,
):
    _cast(db_session, series_anime, character)
    _cast(db_session, anime, second_character)  # same franchise, no series

    assert _names(_list(client, series_id=sample_series.system_id)) == ["Ichika"]


def test_a_character_cast_twice_is_listed_once(
    client, db_session, sample_franchise, anime, series_anime, character,
):
    _cast(db_session, anime, character)
    _cast(db_session, series_anime, character)

    assert _names(_list(client, franchise_id=sample_franchise.system_id)) == ["Ichika"]


def test_scoped_identities_are_only_those_cast_in_scope(
    client, db_session, sample_franchise, anime, other_franchise_anime, character,
):
    cast_here = _identity(db_session, character, "Kid")
    cast_elsewhere = _identity(db_session, character, "Phantom")
    _cast(db_session, anime, character)
    _cast(db_session, anime, character, cast_here)
    _cast(db_session, other_franchise_anime, character, cast_elsewhere)

    [row] = _list(client, franchise_id=sample_franchise.system_id)
    assert [i["display_name"] for i in row["identities"]] == ["Kid"]
    # Unscoped, the character keeps every identity it has.
    [unscoped] = [r for r in _list(client) if r["system_id"] == str(character.system_id)]
    assert {i["display_name"] for i in unscoped["identities"]} == {"Kid", "Phantom"}


def test_a_character_cast_only_as_an_identity_is_listed_with_it(
    client, db_session, sample_franchise, anime, character,
):
    conan = _identity(db_session, character, "Conan")
    _cast(db_session, anime, character, conan)

    [row] = _list(client, franchise_id=sample_franchise.system_id)
    assert row["display_name"] == "Ichika"
    assert [i["display_name"] for i in row["identities"]] == ["Conan"]


def test_a_casting_on_a_hidden_entry_does_not_list_its_character(
    catalog_writer, db_session, sample_franchise, anime, hidden_anime, character,
    second_character,
):
    """hidden_anime carries a label the writer's mode lacks; anime does not,
    and is the mirror case that proves the visibility filter did the refusing."""
    _cast(db_session, anime, character)
    _cast(db_session, hidden_anime, second_character)

    writer = catalog_writer()
    assert _names(_list(writer, franchise_id=sample_franchise.system_id)) == ["Ichika"]


def test_an_identity_cast_only_on_a_hidden_entry_is_not_listed(
    catalog_writer, db_session, sample_franchise, anime, hidden_anime, character,
):
    shown = _identity(db_session, character, "Kid")
    hidden = _identity(db_session, character, "Phantom")
    _cast(db_session, anime, character, shown)
    _cast(db_session, hidden_anime, character, hidden)

    writer = catalog_writer()
    [row] = _list(writer, franchise_id=sample_franchise.system_id)
    assert [i["display_name"] for i in row["identities"]] == ["Kid"]


def test_a_franchise_with_no_cast_lists_nobody(client, sample_franchise, anime, character):
    assert _list(client, franchise_id=sample_franchise.system_id) == []
