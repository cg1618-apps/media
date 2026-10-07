"""Unit tests for name normalization and comma splitting."""

from types import SimpleNamespace

import pytest

from app.utils.name_normalize import names_of, normalize_name, split_names


def test_trims_and_collapses_whitespace():
    assert normalize_name("  新海 誠  ") == normalize_name("新海誠")


def test_folds_full_width_to_half_width():
    assert normalize_name("ＭＡＰＰＡ") == normalize_name("MAPPA")


def test_case_insensitive():
    assert normalize_name("Mappa") == normalize_name("MAPPA")


def test_distinct_names_stay_distinct():
    assert normalize_name("新海誠") != normalize_name("宮崎駿")


def test_split_names_splits_and_trims():
    assert split_names("A, B ,C") == ["A", "B", "C"]


def test_split_names_drops_empty_fragments():
    assert split_names("A,,  ,B") == ["A", "B"]


def test_split_names_dedupes_on_normalized_key_keeping_first_spelling():
    assert split_names("新海 誠, 新海誠") == ["新海 誠"]


@pytest.mark.parametrize("raw", [None, "", "   ", ","])
def test_split_names_of_nothing_is_empty(raw):
    assert split_names(raw) == []


def test_names_of_splits_an_alt_column_into_its_names():
    row = SimpleNamespace(name_en="Studio 1", name_alt="S1, Studio One")
    assert names_of(row, ("name_en", "name_alt")) == ["Studio 1", "S1", "Studio One"]


def test_names_of_keys_on_the_alt_suffix_whatever_the_prefix():
    row = SimpleNamespace(anime_name_en="Frieren", anime_name_alt="Sousou, Frieren BTJ")
    assert names_of(row, ("anime_name_en", "anime_name_alt")) == [
        "Frieren",
        "Sousou",
        "Frieren BTJ",
    ]


def test_names_of_keeps_a_comma_in_any_other_column_as_one_name():
    # Only an *_alt column holds a list; a comma anywhere else is part of
    # the one name the column holds.
    row = SimpleNamespace(name_en="Shinkai, Makoto", name_alt=None)
    assert names_of(row, ("name_en", "name_alt")) == ["Shinkai, Makoto"]


def test_names_of_strips_and_skips_blank_or_missing_fields():
    row = SimpleNamespace(name_en="  MAPPA  ", name_cn="   ", name_alt=" , ")
    assert names_of(row, ("name_en", "name_cn", "name_jp", "name_alt")) == ["MAPPA"]
