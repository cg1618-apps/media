"""BOOK_VOLUME_ONLY_TYPES: the book types whose only unit kind is the volume."""

from app.utils.constants import BOOK_UNIT_KINDS_BY_TYPE, BOOK_VOLUME_ONLY_TYPES


def test_volume_only_types_are_light_novel_and_novel():
    assert set(BOOK_VOLUME_ONLY_TYPES) == {"輕小說", "小說"}


def test_volume_only_types_are_exactly_the_volume_only_unit_kinds():
    # The constant is derived, not typed twice. If a type's allowed kinds
    # change, its counters follow without anyone editing a second list.
    derived = {
        t for t, kinds in BOOK_UNIT_KINDS_BY_TYPE.items() if kinds == ("volume",)
    }
    assert set(BOOK_VOLUME_ONLY_TYPES) == derived
