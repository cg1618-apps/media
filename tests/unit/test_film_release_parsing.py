"""
The film types' release vocabulary where it is read from outside: MAL's
airing status for an anime movie, and an older sheet's list rows.
"""

import pytest

from app.utils.formatter import (
    parse_movie_from_sheet,
    parse_user_media_list_from_sheet,
)
from app.utils.tenrai_utils import map_tenrai_to_anime_movie_data


@pytest.mark.parametrize(
    "mal, expected",
    [
        ("Finished Airing", "Released"),
        ("Currently Airing", "Released"),
        ("Not yet aired", "Not Released"),
        (None, None),
    ],
)
def test_an_anime_movie_takes_its_release_status_from_mal(mal, expected):
    data = map_tenrai_to_anime_movie_data({"status": mal})
    assert data["release_status"] == expected
    assert "airing_status" not in data


def _list_row(media_type, status):
    return parse_user_media_list_from_sheet(
        {"media_type": media_type, "public_id": "1", "username": "u", "status": status}
    )


@pytest.mark.parametrize("media_type", ["movie", "anime-movie"])
def test_an_old_sheet_film_list_row_waits_for_its_release(media_type):
    assert _list_row(media_type, "Watch When Airs")["status"] == "Watch When Released"


@pytest.mark.parametrize("media_type", ["anime", "tv-show", "cartoon", "hentai"])
def test_the_airing_types_keep_watch_when_airs(media_type):
    assert _list_row(media_type, "Watch When Airs")["status"] == "Watch When Airs"


def test_a_current_movies_row_is_read_as_written():
    assert parse_movie_from_sheet({"release_status": "Released"})["release_status"] == "Released"
