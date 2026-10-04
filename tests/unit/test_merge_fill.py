"""
Merging fills the survivor's blanks from the record merged into it, and never
overwrites what the survivor already holds.
"""

import uuid

from app import models
from app.services.domain.merge_fill import (
    fill_blank_casting,
    fill_blank_columns,
    is_blank,
)


def _character(**columns):
    return models.Character(system_id=uuid.uuid4(), **columns)


def test_a_blank_is_none_or_whitespace():
    assert is_blank(None)
    assert is_blank("")
    assert is_blank("   ")
    assert not is_blank("x")
    assert not is_blank(0)


def test_a_blank_column_is_filled_from_the_merged_record():
    keep = _character(name_cn="小明")
    drop = _character(name_en="Ming", name_cn="明", gender="男", mal_id=5)
    fill_blank_columns(keep, drop)
    assert keep.name_en == "Ming"
    assert keep.gender == "男"
    assert keep.mal_id == 5


def test_a_column_the_survivor_holds_is_never_overwritten():
    keep = _character(name_cn="小明", remark="mine")
    drop = _character(name_cn="明", remark="theirs")
    fill_blank_columns(keep, drop)
    assert keep.name_cn == "小明"
    assert keep.remark == "mine"


def test_a_whitespace_value_counts_as_blank_on_both_sides():
    keep = _character(name_en="  ")
    drop = _character(name_en="Ming", name_jp=" ")
    fill_blank_columns(keep, drop)
    assert keep.name_en == "Ming"
    assert keep.name_jp is None


def test_identity_columns_are_never_copied():
    keep = _character()
    keep_id = keep.system_id
    drop = _character(public_id="abc")
    fill_blank_columns(keep, drop)
    assert keep.system_id == keep_id
    assert keep.public_id is None


def test_a_casting_fills_its_role_remark_and_photo_with_its_focus():
    keep = models.CharacterCasting(role=None, photo_file=None)
    drop = models.CharacterCasting(
        role="Main", remark="child", photo_file="library/a.jpg", photo_focus="20 30"
    )
    fill_blank_casting(keep, drop)
    assert (keep.role, keep.remark) == ("Main", "child")
    assert (keep.photo_file, keep.photo_focus) == ("library/a.jpg", "20 30")


def test_a_casting_photo_it_already_has_keeps_its_own_focus():
    # The focus describes one picture; the loser's focus on another picture
    # would point at the wrong place in the survivor's.
    keep = models.CharacterCasting(photo_file="library/mine.jpg", photo_focus=None)
    drop = models.CharacterCasting(photo_file="library/a.jpg", photo_focus="20 30")
    fill_blank_casting(keep, drop)
    assert (keep.photo_file, keep.photo_focus) == ("library/mine.jpg", None)
