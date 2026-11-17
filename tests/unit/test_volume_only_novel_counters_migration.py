"""The volume-only novel counter cleanup, checked without running Alembic.

The archived revision ran against the vocabulary of its day, when the
volume-only types were spelled Light Novel and Novel; Novel became Book and
those became 輕小說 and 小說 later (b1o2okrename3). Its SQL is therefore
checked against the old spellings, and the current constants against the
current ones.
"""

import importlib.util
import pathlib

from app.utils import constants
from app.utils.constants import BOOK_UNIT_KINDS_BY_TYPE, BOOK_VOLUME_ONLY_TYPES

# The volume-only types as the archived revision spelled them.
VOLUME_ONLY_AT_THE_TIME = ("Light Novel", "Novel")

# Loaded by path: alembic/versions is not an importable package.
_path = (
    pathlib.Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions_archive"
    / "v1o2l3o4n5l6_volume_only_novel_counters.py"
)
_spec = importlib.util.spec_from_file_location("v1o2l3o4n5l6", _path)
mod = importlib.util.module_from_spec(_spec)
# The archived revision imports the constant by its name at the time, which
# the app no longer defines; it is lent the vocabulary of its day to load.
constants.NOVEL_VOLUME_ONLY_TYPES = VOLUME_ONLY_AT_THE_TIME
try:
    _spec.loader.exec_module(mod)
finally:
    del constants.NOVEL_VOLUME_ONLY_TYPES


def test_volume_only_types_are_light_novel_and_novel():
    assert set(BOOK_VOLUME_ONLY_TYPES) == {"輕小說", "小說"}


def test_volume_only_types_are_exactly_the_volume_only_unit_kinds():
    # The constant is derived, not typed twice. If a type's allowed kinds
    # change, its counters follow without anyone editing a second list.
    derived = {
        t for t, kinds in BOOK_UNIT_KINDS_BY_TYPE.items() if kinds == ("volume",)
    }
    assert set(BOOK_VOLUME_ONLY_TYPES) == derived


def test_both_statements_target_only_the_volume_only_types():
    for sql in (mod.DELETE_NON_VOLUME_UNITS, mod.CLEAR_COUNTERS):
        for t in VOLUME_ONLY_AT_THE_TIME:
            assert f"'{t}'" in sql
        assert "'Web'" not in sql
        assert "'Other'" not in sql


def test_delete_spares_volume_rows():
    assert "unit_kind <> 'volume'" in mod.DELETE_NON_VOLUME_UNITS


def test_clear_blanks_every_chapter_and_arc_column():
    for column in ("arc_total", "ch_total", "arc_fin", "ch_fin", "ch_fin_in_arc"):
        assert column in mod.CLEAR_COUNTERS


def test_clear_leaves_the_volume_columns_alone():
    for column in ("vol_fin", "vol_total_original", "vol_total_tw"):
        assert column not in mod.CLEAR_COUNTERS


def test_clear_skips_rows_that_are_already_clean():
    # The guard keeps the UPDATE from touching (and re-stamping updated_at on)
    # every light novel in the database on a re-run.
    assert "arc_total IS NOT NULL" in mod.CLEAR_COUNTERS
