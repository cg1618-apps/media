"""
Unit tests for the script that fills Game.is_main with "Main".

No database: the Session is stubbed with fixed rows, so the fill/overwrite
and dry-run/apply paths are exercised on plain objects.
"""

import uuid
from types import SimpleNamespace

from app.models import Game
from scripts import fill_game_is_main as script


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeSession:
    def __init__(self, rows):
        self.rows = rows
        self.commits = 0

    def query(self, model):
        assert model is Game
        return FakeQuery(self.rows)

    def commit(self):
        self.commits += 1


def game(is_main):
    return SimpleNamespace(system_id=uuid.uuid4(), game_name_en="G", is_main=is_main)


def test_empty_values_are_filled_and_labels_kept():
    rows = [game(None), game(""), game("  "), game("Main"), game("Remake"), game("Remaster")]
    db = FakeSession(rows)

    report = script.fill(db, apply=True)

    assert [r.is_main for r in rows] == ["Main"] * 4 + ["Remake", "Remaster"]
    assert [previous for _, _, previous in report] == [None, "", "  "]
    assert db.commits == 1


def test_overwrite_replaces_every_label():
    rows = [game(None), game("Main"), game("Remake"), game("Remaster")]

    report = script.fill(FakeSession(rows), overwrite=True, apply=True)

    assert [r.is_main for r in rows] == ["Main"] * 4
    # A row already Main is not reported as changed.
    assert [previous for _, _, previous in report] == [None, "Remake", "Remaster"]


def test_dry_run_changes_nothing():
    rows = [game(None), game("Remake")]
    db = FakeSession(rows)

    report = script.fill(db, overwrite=True)

    assert [r.is_main for r in rows] == [None, "Remake"]
    assert len(report) == 2
    assert db.commits == 0


def test_second_run_is_a_noop():
    rows = [game(None), game("Remake")]
    db = FakeSession(rows)
    script.fill(db, apply=True)

    assert script.fill(db, apply=True) == []
    assert db.commits == 1


def test_main_is_the_first_game_is_main_value():
    assert script.MAIN == "Main"
