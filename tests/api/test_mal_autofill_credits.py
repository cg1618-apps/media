"""
The MAL autofills credit studios (anime, anime movie) and authors (manga,
novel) - only into a role the entry has no credits for. A role that already
has credits is left as it is, but a credited row MAL names by name and that
has no MAL id is given MAL's.
"""

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import (
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_manga_from_mal,
    autofill_novel_from_mal,
)
from app.services.domain.credits import credit_names, replace_credits

ANIME_RAW = {
    "type": "TV",
    "status": "Finished Airing",
    "score": 9.0,
    "rank": 3,
    "images": {},
    "studios": [
        {
            "mal_id": 11,
            "name": "Madhouse",
            "url": "https://myanimelist.net/anime/producer/11/Madhouse",
        }
    ],
}

MANGA_RAW = {
    "status": "Finished",
    "score": 8.6,
    "rank": 50,
    "images": {},
    "authors": [
        {
            "mal_id": 2619,
            "name": "Ohba, Tsugumi",
            "url": "https://myanimelist.net/people/2619/Tsugumi_Ohba",
            "role": "Story",
        },
        {
            "mal_id": 1893,
            "name": "Obata, Takeshi",
            "url": "https://myanimelist.net/people/1893/Takeshi_Obata",
            "role": "Art",
        },
    ],
}


@pytest.fixture(autouse=True)
def tenrai(monkeypatch):
    monkeypatch.setattr(autofill_module, "fetch_tenrai_anime_data", lambda mal_id: ANIME_RAW)
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_manga_novel_data", lambda mal_id: MANGA_RAW
    )


@pytest.fixture
def anime_movie(db_session, sample_franchise):
    entry = models.AnimeMovies(
        franchise_id=sample_franchise.system_id, anime_movie_name_en="Movie", mal_id=5
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def novel(db_session, sample_franchise):
    entry = models.Novel(
        franchise_id=sample_franchise.system_id, novel_name_en="Novel", mal_id=21,
        mal_link="https://myanimelist.net/manga/21",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def manga(db_session, sample_franchise):
    entry = models.Manga(franchise_id=sample_franchise.system_id, manga_name_en="Manga", mal_id=21)
    db_session.add(entry)
    db_session.flush()
    return entry


def test_anime_with_no_studio_gets_mals(db_session, sample_anime):
    sample_anime.mal_id = 52991
    autofill_anime_from_mal(sample_anime, db=db_session)

    assert credit_names(db_session, sample_anime.system_id, "studio") == ["Madhouse"]
    studio = db_session.query(models.Studio).one()
    assert (studio.mal_id, studio.mal_link) == (11, ANIME_RAW["studios"][0]["url"])


def test_anime_movie_with_no_studio_gets_mals(db_session, anime_movie):
    autofill_anime_movie_from_mal(anime_movie, db=db_session)
    assert credit_names(db_session, anime_movie.system_id, "studio") == ["Madhouse"]


def test_a_credited_studio_is_left_alone_and_linked_when_mal_names_it(db_session, sample_anime):
    # MAL names Madhouse; the entry already credits Madhouse (no MAL id) and
    # Bones. Neither is replaced, nothing is added, and Madhouse gets MAL's id.
    replace_credits(db_session, "anime", sample_anime.system_id, "studio", ["Bones", "MADHOUSE"])
    sample_anime.mal_id = 52991

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert credit_names(db_session, sample_anime.system_id, "studio") == ["Bones", "MADHOUSE"]
    by_name = {s.name_en: s for s in db_session.query(models.Studio)}
    assert set(by_name) == {"Bones", "MADHOUSE"}
    assert by_name["MADHOUSE"].mal_id == 11
    assert by_name["Bones"].mal_id is None


def test_a_credited_studio_with_another_mal_id_keeps_it(db_session, sample_anime):
    replace_credits(db_session, "anime", sample_anime.system_id, "studio", ["Madhouse"])
    db_session.query(models.Studio).one().mal_id = 999
    sample_anime.mal_id = 52991

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert db_session.query(models.Studio).one().mal_id == 999


@pytest.mark.parametrize("fill, entry_fixture, author_role", [
    (autofill_manga_from_mal, "manga", "author"),
    (autofill_novel_from_mal, "novel", "author"),
])
def test_manga_and_novel_get_authors_and_illustrators(
    request, db_session, fill, entry_fixture, author_role
):
    entry = request.getfixturevalue(entry_fixture)
    fill(entry, db=db_session)

    assert credit_names(db_session, entry.system_id, author_role) == ["Tsugumi Ohba"]
    assert credit_names(db_session, entry.system_id, "illustrator") == ["Takeshi Obata"]
    ohba = db_session.query(models.Person).filter_by(mal_id=2619).one()
    media_type = "manga" if entry_fixture == "manga" else "novel"
    assert (author_role, media_type) in {(r.role, r.scope) for r in ohba.roles}


def test_only_the_empty_role_is_filled(db_session, manga):
    replace_credits(db_session, "manga", manga.system_id, "author", ["Someone Else"])

    autofill_manga_from_mal(manga, db=db_session)

    assert credit_names(db_session, manga.system_id, "author") == ["Someone Else"]
    assert credit_names(db_session, manga.system_id, "illustrator") == ["Takeshi Obata"]


def test_an_ambiguous_author_is_skipped_and_the_rest_still_land(db_session, manga):
    db_session.add_all([models.Person(name_en="Tsugumi Ohba"), models.Person(name_jp="Tsugumi Ohba")])
    db_session.flush()

    autofill_manga_from_mal(manga, db=db_session)

    assert credit_names(db_session, manga.system_id, "author") == []
    assert credit_names(db_session, manga.system_id, "illustrator") == ["Takeshi Obata"]
    assert db_session.query(models.Person).count() == 3


def test_without_a_session_no_credit_is_written(db_session, manga):
    # The pure-mapping tests call the autofills with no session; they must
    # still map the columns.
    autofill_manga_from_mal(manga)
    assert manga.serialization_status == "完結"
    assert db_session.query(models.Person).count() == 0
