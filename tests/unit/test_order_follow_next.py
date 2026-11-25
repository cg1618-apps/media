"""What a follower is shown next in an order: the direct next and the lookahead.

`next_steps` is the one place "next" is decided - the dashboard's up next and
the entry page's panel both read it. A follow at importance X considers only
steps at or above X (Optional < Normal < Recommended < Essential); a skipped
step and a step the viewer has done or started are never next. See
docs/systems/orders.md, "What is next".
"""

import pytest

from app.services.domain.order_follow import (
    ACTIVE,
    DONE,
    PENDING,
    importance_rank,
    next_steps,
)


def _step(name, importance="Normal", state=PENDING, skipped=False):
    return {
        "display_name": name,
        "importance": importance,
        "state": state,
        "skipped": skipped,
    }


def _names(result):
    nxt = result["next"]
    return (
        nxt["display_name"] if nxt else None,
        [s["display_name"] for s in result["coming_up"]],
    )


def _at(steps, name):
    return next(i for i, s in enumerate(steps) if s["display_name"] == name)


class TestRanking:
    def test_the_ladder_runs_optional_to_essential(self):
        ranks = [
            importance_rank(v)
            for v in ("Optional", "Normal", "Recommended", "Essential")
        ]
        assert ranks == sorted(ranks)
        assert len(set(ranks)) == 4

    def test_an_unknown_value_ranks_as_normal(self):
        assert importance_rank(None) == importance_rank("Normal")
        assert importance_rank("nonsense") == importance_rank("Normal")


class TestOwnersExample:
    """
    The owner's example, verbatim: "we follow an order with importance Normal.
    On entry F, G is next but Optional. H comes after G and is Normal, so it is
    shown. Since H is Normal, we still show two more: J (Recommended) and L
    (Essential), when I and K are Normal."
    """

    @pytest.fixture
    def steps(self):
        return [
            _step("F"),
            _step("G", "Optional"),
            _step("H", "Normal"),
            _step("I", "Normal"),
            _step("J", "Recommended"),
            _step("K", "Normal"),
            _step("L", "Essential"),
        ]

    def test_on_f_the_next_is_h_then_j_and_l(self, steps):
        result = next_steps(steps, "Normal", after=_at(steps, "F"))
        assert _names(result) == ("H", ["J", "L"])

    def test_an_optional_follow_takes_g(self, steps):
        result = next_steps(steps, "Optional", after=_at(steps, "F"))
        assert _names(result) == ("G", ["J", "L"])

    def test_a_recommended_follow_jumps_to_j_and_shows_l(self, steps):
        result = next_steps(steps, "Recommended", after=_at(steps, "F"))
        assert _names(result) == ("J", ["L"])

    def test_an_essential_follow_shows_only_l(self, steps):
        result = next_steps(steps, "Essential", after=_at(steps, "F"))
        assert _names(result) == ("L", [])


class TestLookahead:
    def test_an_essential_before_the_next_recommended_is_shown_alone(self):
        steps = [
            _step("A"),
            _step("B", "Normal"),
            _step("C", "Essential"),
            _step("D", "Recommended"),
            _step("E", "Essential"),
        ]
        result = next_steps(steps, "Normal", after=0)
        assert _names(result) == ("B", ["C"])

    def test_a_recommended_next_shows_the_next_essential(self):
        steps = [
            _step("A"),
            _step("B", "Recommended"),
            _step("C", "Recommended"),
            _step("D", "Essential"),
        ]
        assert _names(next_steps(steps, "Normal", after=0)) == ("B", ["D"])

    def test_an_essential_next_shows_nothing_more(self):
        steps = [_step("A"), _step("B", "Essential"), _step("C", "Essential")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("B", [])

    def test_an_optional_next_looks_ahead_like_a_normal_one(self):
        steps = [
            _step("A"),
            _step("B", "Optional"),
            _step("C", "Recommended"),
            _step("D", "Essential"),
        ]
        assert _names(next_steps(steps, "Optional", after=0)) == ("B", ["C", "D"])

    def test_lookahead_stops_when_the_order_runs_out(self):
        steps = [_step("A"), _step("B", "Normal"), _step("C", "Recommended")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("B", ["C"])

    def test_no_higher_rung_left_means_no_lookahead(self):
        steps = [_step("A"), _step("B", "Normal"), _step("C", "Normal")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("B", [])

    def test_lookahead_skips_skipped_and_done_steps(self):
        steps = [
            _step("A"),
            _step("B", "Normal"),
            _step("C", "Recommended", skipped=True),
            _step("D", "Recommended", state=DONE),
            _step("E", "Recommended"),
            _step("F", "Essential", skipped=True),
            _step("G", "Essential"),
        ]
        assert _names(next_steps(steps, "Normal", after=0)) == ("B", ["E", "G"])


class TestDirectNext:
    def test_a_skipped_step_is_never_next(self):
        steps = [_step("A"), _step("B", skipped=True), _step("C")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("C", [])

    def test_a_done_step_is_never_next(self):
        steps = [_step("A"), _step("B", state=DONE), _step("C")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("C", [])

    def test_a_step_in_progress_is_now_not_next(self):
        steps = [_step("A"), _step("B", state=ACTIVE), _step("C")]
        assert _names(next_steps(steps, "Normal", after=0)) == ("C", [])

    def test_only_later_steps_count(self):
        # A pending step BEFORE the current one is the dashboard's gap, not
        # the entry page's next.
        steps = [_step("A"), _step("B"), _step("C")]
        assert _names(next_steps(steps, "Normal", after=1)) == ("C", [])

    def test_from_the_start_the_earliest_gap_is_next(self):
        steps = [_step("A", state=DONE), _step("B"), _step("C", state=DONE)]
        assert _names(next_steps(steps, "Normal")) == ("B", [])

    def test_the_last_step_has_no_next(self):
        steps = [_step("A"), _step("B")]
        assert _names(next_steps(steps, "Normal", after=1)) == (None, [])

    def test_everything_below_the_follow_means_no_next(self):
        steps = [_step("A"), _step("B", "Optional"), _step("C", "Normal")]
        assert _names(next_steps(steps, "Recommended", after=0)) == (None, [])

    def test_an_unset_follow_importance_reads_as_normal(self):
        steps = [_step("A"), _step("B", "Optional"), _step("C", "Normal")]
        assert _names(next_steps(steps, None, after=0)) == ("C", [])
