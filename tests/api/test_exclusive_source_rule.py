"""An exclusive source needs an available main source on that platform.

The rule is checked wherever either half is written: the entry write (which
carries `sources`, and may carry `exclusive_source`) and the credits PUT
(which carries the tag). Every refusal below has a Netflix row or a Netflix
tag in place, so the set the rule computes over is never empty - a refusal
that passes on an entry with nothing to refuse would prove nothing. Each
refusal has a mirror that the same setup lets through.
"""

import pytest

from app import models

NETFLIX_ROW = {
    "kind": "access",
    "bucket": "main",
    "name": "Netflix",
    "url": "https://netflix.test/x",
    "available": True,
}


@pytest.fixture
def netflix(db_session):
    option = models.SystemOption(category="Platform", value="Netflix")
    db_session.add(option)
    db_session.commit()
    return option


def _source(db, entry, option=None, *, bucket="main", available=True, name=None):
    db.add(
        models.MediaSource(
            media_id=entry.system_id,
            kind="access",
            bucket=bucket,
            option_id=option.system_id if option is not None else None,
            name=name,
            available=available,
        )
    )
    db.commit()


def _tag(db, entry, option):
    db.add(
        models.MediaTag(
            media_id=entry.system_id,
            field="exclusive_source",
            option_id=option.system_id,
            position=0,
        )
    )
    db.commit()


def _put_exclusive(client, entry, values, media_type="anime"):
    return client.put(
        f"/api/credits/{media_type}/{entry.system_id}",
        json={"tags": {"exclusive_source": values}},
    )


def _stored_exclusive(client, entry):
    return client.get(f"/api/anime/{entry.system_id}").json()["exclusive_source"]


# ---------------------------------------------------------------------------
# The credits PUT: the tag is written against the sources already stored.
# ---------------------------------------------------------------------------


def test_the_tag_is_refused_when_the_entry_has_no_sources(
    owner_client, sample_anime, netflix
):
    r = _put_exclusive(owner_client, sample_anime, ["Netflix"])
    assert r.status_code == 422
    assert "Netflix" in r.json()["detail"]
    assert _stored_exclusive(owner_client, sample_anime) is None


@pytest.mark.parametrize("available", [False, None])
def test_the_tag_is_refused_when_the_main_row_is_not_available(
    owner_client, db_session, sample_anime, netflix, available
):
    _source(db_session, sample_anime, netflix, available=available)
    r = _put_exclusive(owner_client, sample_anime, ["Netflix"])
    assert r.status_code == 422


def test_the_tag_is_refused_when_netflix_is_only_an_other_source(
    owner_client, db_session, sample_anime, netflix
):
    # Typed text that merely reads "Netflix" is not the vocabulary platform.
    _source(db_session, sample_anime, bucket="other", available=None, name="Netflix")
    r = _put_exclusive(owner_client, sample_anime, ["Netflix"])
    assert r.status_code == 422


def test_the_tag_is_refused_when_another_platform_is_the_available_one(
    owner_client, db_session, sample_anime, netflix
):
    crunchyroll = models.SystemOption(category="Platform", value="Crunchyroll")
    db_session.add(crunchyroll)
    db_session.commit()
    _source(db_session, sample_anime, crunchyroll, available=True)
    r = _put_exclusive(owner_client, sample_anime, ["Netflix"])
    assert r.status_code == 422


def test_the_tag_is_accepted_with_an_available_main_row(
    owner_client, db_session, sample_anime, netflix
):
    _source(db_session, sample_anime, netflix, available=True)
    r = _put_exclusive(owner_client, sample_anime, ["Netflix"])
    assert r.status_code == 200
    assert _stored_exclusive(owner_client, sample_anime) == "Netflix"


def test_clearing_the_tag_is_always_accepted(
    owner_client, db_session, sample_anime, netflix
):
    _tag(db_session, sample_anime, netflix)  # a stored violation
    r = _put_exclusive(owner_client, sample_anime, [])
    assert r.status_code == 200
    assert _stored_exclusive(owner_client, sample_anime) is None


def test_a_credits_put_that_leaves_the_tag_alone_is_not_checked(
    owner_client, db_session, sample_anime, netflix
):
    # A row stored before the rule existed must not block every other edit.
    _tag(db_session, sample_anime, netflix)
    r = owner_client.put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"tags": {"genre_main": ["奇幻"]}},
    )
    assert r.status_code == 200


def _anime_movie(client, franchise, **extra):
    return client.post(
        "/api/anime-movie/",
        json={
            "anime_movie_name_en": "Film",
            "franchise_id": str(franchise.system_id),
            **extra,
        },
    )


def test_anime_movie_tag_is_refused_without_its_row(
    owner_client, db_session, sample_franchise, netflix
):
    created = _anime_movie(
        owner_client,
        sample_franchise,
        sources=[{**NETFLIX_ROW, "available": False}],
    )
    assert created.status_code == 201, created.text
    r = owner_client.put(
        f"/api/credits/anime-movie/{created.json()['system_id']}",
        json={"tags": {"exclusive_source": ["Netflix"]}},
    )
    assert r.status_code == 422


def test_anime_movie_tag_is_accepted_with_its_row(
    owner_client, sample_franchise, netflix
):
    created = _anime_movie(owner_client, sample_franchise, sources=[NETFLIX_ROW])
    assert created.status_code == 201, created.text
    r = owner_client.put(
        f"/api/credits/anime-movie/{created.json()['system_id']}",
        json={"tags": {"exclusive_source": ["Netflix"]}},
    )
    assert r.status_code == 200


def test_anime_movie_create_carrying_both_halves_is_checked(
    owner_client, db_session, sample_franchise, netflix
):
    refused = _anime_movie(
        owner_client,
        sample_franchise,
        sources=[{**NETFLIX_ROW, "available": None}],
        exclusive_source="Netflix",
    )
    assert refused.status_code == 422
    accepted = _anime_movie(
        owner_client,
        sample_franchise,
        sources=[NETFLIX_ROW],
        exclusive_source="Netflix",
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["exclusive_source"] == "Netflix"


# ---------------------------------------------------------------------------
# The entry write: sources, and optionally the tag, in one request.
# ---------------------------------------------------------------------------


def test_a_create_carrying_both_halves_is_accepted(
    owner_client, sample_franchise, netflix
):
    r = owner_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Exclusive",
            "franchise_id": str(sample_franchise.system_id),
            "sources": [NETFLIX_ROW],
            "exclusive_source": "Netflix",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["exclusive_source"] == "Netflix"


def test_a_create_naming_an_exclusive_source_without_its_row_is_refused(
    owner_client, db_session, sample_franchise, netflix
):
    r = owner_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Exclusive",
            "franchise_id": str(sample_franchise.system_id),
            "sources": [{**NETFLIX_ROW, "available": False}],
            "exclusive_source": "Netflix",
        },
    )
    assert r.status_code == 422
    assert "Netflix" in r.json()["detail"]
    assert (
        db_session.query(models.Anime).filter_by(anime_name_en="Exclusive").count()
        == 0
    )


def test_a_patch_removing_the_exclusive_row_is_refused(
    owner_client, db_session, sample_anime, netflix
):
    _source(db_session, sample_anime, netflix, available=True)
    _tag(db_session, sample_anime, netflix)
    r = owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "Elsewhere"}]},
    )
    assert r.status_code == 422
    names = [
        s["name"]
        for s in owner_client.get(f"/api/anime/{sample_anime.system_id}").json()[
            "sources"
        ]
    ]
    assert names == ["Netflix"]


def test_a_patch_removing_the_row_and_clearing_the_tag_together_is_accepted(
    owner_client, db_session, sample_anime, netflix
):
    _source(db_session, sample_anime, netflix, available=True)
    _tag(db_session, sample_anime, netflix)
    r = owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [], "exclusive_source": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["exclusive_source"] is None
    assert r.json()["sources"] == []


def test_a_patch_adding_the_row_and_setting_the_tag_together_is_accepted(
    owner_client, sample_anime, netflix
):
    r = owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [NETFLIX_ROW], "exclusive_source": "Netflix"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["exclusive_source"] == "Netflix"


def test_a_put_marking_the_exclusive_row_unavailable_is_refused(
    owner_client, db_session, sample_anime, netflix
):
    _source(db_session, sample_anime, netflix, available=True)
    _tag(db_session, sample_anime, netflix)
    r = owner_client.put(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{**NETFLIX_ROW, "available": False}]},
    )
    assert r.status_code == 422


def test_a_patch_that_touches_neither_half_is_not_checked(
    owner_client, db_session, sample_anime, netflix
):
    _tag(db_session, sample_anime, netflix)  # a stored violation
    r = owner_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"airing_status": "Currently Airing"},
    )
    assert r.status_code == 200
