"""
The content-rating vocabulary, which ratings each access mode hides, and the
Sheets Pull's reading of the column.

hidden_ratings is the whole gate's arithmetic: shared_visibility,
the credit and cast readers and the gallery all ask it. The refusal cases
name a concrete mode and assert a non-empty answer, so a gate that hid
nothing would fail here rather than pass vacuously.
"""

import pytest

from app.services.rbac.resolver import GUEST_FALLBACK, Viewer
from app.services.rbac.seed_modes import MODE_ORDER
from app.services.rbac.shared_visibility import hidden_ratings
from app.utils.content_rating import (
    CONTENT_RATING_LABELS,
    CONTENT_RATINGS,
    RATING_LOWEST_MODE,
    check_content_rating,
    normalize_content_rating,
)
from app.utils.formatter import (
    parse_person_from_sheet,
    parse_publisher_from_sheet,
    parse_studio_from_sheet,
)


def _viewer(mode_key):
    return Viewer(
        username="u", role_id=None, role_name="user", permissions=frozenset(), mode_key=mode_key
    )


def test_every_rating_names_a_real_mode_and_a_label():
    assert set(RATING_LOWEST_MODE) == set(CONTENT_RATINGS) == set(CONTENT_RATING_LABELS)
    assert set(RATING_LOWEST_MODE.values()) <= set(MODE_ORDER)
    # Ascending: each rating's lowest mode is no narrower than the one before.
    ranks = [MODE_ORDER.index(RATING_LOWEST_MODE[r]) for r in CONTENT_RATINGS]
    assert ranks == sorted(ranks)


@pytest.mark.parametrize(
    "mode, hidden",
    [
        ("safe", {"borderline", "unrestricted"}),
        ("normal", {"borderline", "unrestricted"}),
        ("borderline", {"unrestricted"}),
        ("unrestricted", set()),
    ],
)
def test_each_mode_hides_the_ratings_above_it(mode, hidden):
    assert hidden_ratings(_viewer(mode)) == hidden


@pytest.mark.parametrize("viewer", [GUEST_FALLBACK, _viewer(None), _viewer("bespoke")])
def test_an_unresolved_mode_is_safe(viewer):
    """Fail-closed: no mode is the narrowest mode, never the widest."""
    assert hidden_ratings(viewer) == {"borderline", "unrestricted"}


def test_an_internal_call_hides_nothing():
    assert hidden_ratings(None) == frozenset()


@pytest.mark.parametrize("value", CONTENT_RATINGS)
def test_a_known_rating_is_accepted(value):
    assert check_content_rating(value) == value


@pytest.mark.parametrize("value", ["", None, "adult", "Normal", "Borderline (15+)"])
def test_anything_else_is_refused(value):
    with pytest.raises(ValueError):
        check_content_rating(value)


@pytest.mark.parametrize(
    "cell, expected",
    [
        ("borderline", "borderline"),
        (" Unrestricted ", "unrestricted"),
        ("", "normal"),
        (None, "normal"),
        ("adult", "normal"),
    ],
)
def test_a_restored_rating_is_folded_onto_the_three(cell, expected):
    assert normalize_content_rating(cell) == expected


@pytest.mark.parametrize(
    "parse", [parse_person_from_sheet, parse_studio_from_sheet, parse_publisher_from_sheet]
)
class TestContentRatingSurvivesAPull:
    def test_a_rating_is_parsed_back(self, parse):
        assert parse({"content_rating": "unrestricted"})["content_rating"] == "unrestricted"

    def test_an_absent_column_is_normal(self, parse):
        """A sheet without the column restores every record as unrated, never
        as NULL, which the NOT NULL column would refuse."""
        assert parse({})["content_rating"] == "normal"
