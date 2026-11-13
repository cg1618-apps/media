"""The in-process fixed-window counter behind the login and reset limits."""

import pytest
from freezegun import freeze_time

from app.services import rate_limit


@pytest.fixture(autouse=True)
def _fresh():
    rate_limit.clear()
    yield
    rate_limit.clear()


def test_under_the_limit_nothing_is_refused():
    for _ in range(4):
        rate_limit.hit("k", 900)
    assert rate_limit.check("k", 5) is None


def test_at_the_limit_the_wait_is_reported_in_whole_seconds():
    with freeze_time("2026-11-13 12:00:00"):
        for _ in range(5):
            rate_limit.hit("k", 900)
        assert rate_limit.check("k", 5) == 900
    with freeze_time("2026-11-13 12:10:00"):
        assert rate_limit.check("k", 5) == 300


def test_the_window_ends_and_the_count_starts_again():
    with freeze_time("2026-11-13 12:00:00"):
        for _ in range(5):
            rate_limit.hit("k", 900)
    with freeze_time("2026-11-13 12:15:01"):
        assert rate_limit.check("k", 5) is None
        rate_limit.hit("k", 900)
        assert rate_limit.check("k", 1) == 900


def test_keys_are_independent():
    for _ in range(5):
        rate_limit.hit("a", 900)
    assert rate_limit.check("a", 5) is not None
    assert rate_limit.check("b", 5) is None


def test_reset_forgets_one_key():
    for _ in range(5):
        rate_limit.hit("a", 900)
        rate_limit.hit("b", 900)
    rate_limit.reset("a")
    assert rate_limit.check("a", 5) is None
    assert rate_limit.check("b", 5) is not None
