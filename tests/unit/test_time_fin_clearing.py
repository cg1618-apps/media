"""
time_fin - "Paused at" - and the rules that clear it.

Pure objects: apply_list_payload and the mark_*_list halves take a
UserMediaList row that is never added to a session. Every clearing test starts
from a row that HOLDS a paused position, so a green proves the rule removed
it rather than that there was nothing to remove; each is paired with the write
that must leave it alone.
"""

import pytest

from app.models import Anime, Movies, UserMediaList
from app.services.domain.completion import mark_movie_list, mark_tv_list
from app.services.domain.user_list import (
    LIST_FIELDS,
    apply_list_payload,
    clean_time_fin,
)

WATCHING_TYPES = ("anime", "anime-movie", "movie", "tv-show", "cartoon", "hentai")
EPISODIC_TYPES = ("anime", "tv-show", "cartoon", "hentai")


def _row(**fields):
    base = {"status": "Active Watching", "ep_fin": 3, "time_fin": "14:35"}
    base.update(fields)
    return UserMediaList(**base)


# ---------------------------------------------------------------------------
# Which types own it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("media_type", WATCHING_TYPES)
def test_every_watching_type_owns_time_fin(media_type):
    assert "time_fin" in LIST_FIELDS[media_type]


@pytest.mark.parametrize(
    "media_type", ("manga", "novel", "comic", "game", "h-comic", "h-game")
)
def test_no_other_type_owns_time_fin(media_type):
    assert "time_fin" not in LIST_FIELDS[media_type]


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, stored",
    [
        ("  1:10:00 ", "1:10:00"),
        ("14:35", "14:35"),
        ("", None),
        ("   ", None),
        (None, None),
        ("ending credits", "ending credits"),
    ],
)
def test_clean_time_fin_strips_and_stores_a_blank_as_null(raw, stored):
    assert clean_time_fin(raw) == stored


def test_a_written_value_is_stripped():
    row = _row(time_fin=None)
    apply_list_payload(row, {"time_fin": "  22:10  "}, "anime")
    assert row.time_fin == "22:10"


def test_a_blank_write_clears_it():
    row = _row()
    apply_list_payload(row, {"time_fin": "   "}, "movie")
    assert row.time_fin is None


# ---------------------------------------------------------------------------
# Rule 1: ep_fin going up clears it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("media_type", EPISODIC_TYPES)
def test_stepping_ep_fin_up_clears_the_paused_position(media_type):
    row = _row()
    apply_list_payload(row, {"ep_fin": 4}, media_type)
    assert row.ep_fin == 4
    assert row.time_fin is None


def test_ep_fin_up_from_nothing_still_clears():
    row = _row(ep_fin=None)
    apply_list_payload(row, {"ep_fin": 1}, "anime")
    assert row.time_fin is None


def test_a_new_paused_position_in_the_same_write_wins():
    row = _row()
    apply_list_payload(row, {"ep_fin": 4, "time_fin": " 02:10 "}, "anime")
    assert row.ep_fin == 4
    assert row.time_fin == "02:10"


def test_an_echo_of_the_stored_position_does_not_count_as_new():
    """A form that re-sends every field sends time_fin back unchanged; that is
    not the writer saying where episode 4 is paused."""
    row = _row()
    apply_list_payload(row, {"ep_fin": 4, "time_fin": "14:35"}, "anime")
    assert row.time_fin is None


def test_a_blank_position_in_the_same_write_is_not_a_new_one():
    row = _row()
    apply_list_payload(row, {"ep_fin": 4, "time_fin": ""}, "anime")
    assert row.time_fin is None


# The mirrors: writes that do not carry ep_fin upward leave it alone.


def test_a_write_without_ep_fin_leaves_it_alone():
    row = _row()
    apply_list_payload(row, {"my_rating": "A"}, "anime")
    assert row.time_fin == "14:35"


def test_resaving_the_same_ep_fin_leaves_it_alone():
    row = _row()
    apply_list_payload(row, {"ep_fin": 3}, "anime")
    assert row.time_fin == "14:35"


def test_stepping_ep_fin_down_leaves_it_alone():
    row = _row()
    apply_list_payload(row, {"ep_fin": 2}, "anime")
    assert row.time_fin == "14:35"


# ---------------------------------------------------------------------------
# Rule 2: becoming Completed clears it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("media_type", WATCHING_TYPES)
@pytest.mark.parametrize("status", ("Completed", "Completed (解說)"))
def test_becoming_completed_clears_the_paused_position(media_type, status):
    row = _row()
    apply_list_payload(row, {"watching_status": status}, media_type)
    assert row.time_fin is None


def test_becoming_completed_clears_even_a_position_sent_in_the_same_write():
    row = _row()
    apply_list_payload(
        row, {"watching_status": "Completed", "time_fin": "50:00"}, "movie"
    )
    assert row.time_fin is None


def test_a_status_write_that_is_not_completed_leaves_it_alone():
    row = _row()
    apply_list_payload(row, {"watching_status": "Paused"}, "movie")
    assert row.time_fin == "14:35"


def test_resending_completed_on_a_completed_row_is_not_becoming_completed():
    """A rewatch: the row is already Completed and the viewer records where
    they paused. A write that re-sends the status must not wipe it."""
    row = _row(status="Completed", time_fin=None)
    apply_list_payload(
        row, {"watching_status": "Completed", "time_fin": "1:10:00"}, "movie"
    )
    assert row.time_fin == "1:10:00"


# ---------------------------------------------------------------------------
# Mark completed (and reaching the total, which calls the same halves)
# ---------------------------------------------------------------------------


def test_mark_tv_list_clears_the_paused_position():
    row = _row()
    mark_tv_list(row, Anime(ep_total=12))
    assert row.time_fin is None


def test_mark_movie_list_clears_the_paused_position():
    row = _row(time_fin="1:10:00")
    mark_movie_list(row, Movies())
    assert row.time_fin is None
