"""The legacy comma-joined columns are gone and their data is in link tables."""

import pytest

from app import models

REMOVED = [
    (models.Anime, "studio"),
    (models.Anime, "director"),
    (models.Anime, "producer"),
    (models.Anime, "music"),
    (models.Anime, "distributor_tw"),
    (models.Anime, "genre_main"),
    (models.Anime, "genre_sub"),
    # The Need/Done seiyuu flag, dropped with no data carried anywhere. The
    # cast's seiyuu live in character_casting_voice and are unaffected.
    (models.Anime, "seiyuu"),
    (models.AnimeMovies, "studio"),
    (models.AnimeMovies, "director"),
    (models.Movies, "director"),
    (models.TVShows, "source_official"),
    (models.Cartoon, "source_official"),
    (models.Manga, "author_plot"),
    (models.Manga, "author_draw"),
    (models.Manga, "publisher_tw"),
    (models.Novel, "author"),
    (models.Novel, "illustrator"),
    (models.Novel, "publisher_tw"),
    (models.Comic, "writer"),
    (models.Comic, "artist"),
    (models.Comic, "publisher"),
    (models.Comic, "imprint"),
    (models.Comic, "continuity"),
    (models.Comic, "era"),
    (models.Comic, "events"),
    (models.Comic, "publisher_tw"),
]


@pytest.mark.parametrize("model,column", REMOVED)
def test_column_is_gone(model, column):
    assert column not in model.__table__.columns


def test_manga_anime_studio_survived():
    # Points at the adaptation, not at a credit of the manga.
    assert "anime_studio" in models.Manga.__table__.columns
