"""Book's `type` vocabulary and the rules that branch on it."""

import pytest

from app.services.pipelines.legacy_names import (
    BOOK_REGION_RENAMES,
    BOOK_TYPE_RENAMES,
    book_type,
    config_value,
    franchise_type,
    legacy_cell_values,
    type_covers,
)
from app.utils.constants import (
    BOOK_REGIONS,
    BOOK_SERIALIZATION_STATUSES,
    BOOK_TYPES,
    BOOK_UNIT_KINDS_BY_TYPE,
    BOOK_VOLUME_ONLY_TYPES,
    FRANCHISE_TYPES,
    HENTAI_SOURCE_MATERIALS,
    FranchiseType,
)
from app.utils.name_normalize import name_slot_for


def test_the_types():
    # The order the Type filter and the form's dropdown list them in.
    assert BOOK_TYPES == ("小說", "輕小說", "網路小說", "短篇集", "指南/設定集", "其他")


def test_the_regions():
    assert BOOK_REGIONS == ("歐美", "日本", "中國", "韓國", "台灣")


def test_the_serialization_statuses_in_order_of_a_run():
    # Manga and book share this list; the form and the library filter both
    # read it in this order.
    assert BOOK_SERIALIZATION_STATUSES == (
        "未出",
        "連載中",
        "連載中 (不穩定)",
        "連載中 (有生之年)",
        "停更",
        "可能更多",
        "完結",
        "腰斬",
    )


def test_every_type_has_its_unit_kinds():
    assert set(BOOK_UNIT_KINDS_BY_TYPE) == set(BOOK_TYPES)


def test_the_new_types_take_the_rules_of_other():
    for new in ("短篇集", "指南/設定集"):
        assert BOOK_UNIT_KINDS_BY_TYPE[new] == BOOK_UNIT_KINDS_BY_TYPE["其他"]


def test_the_volume_only_types():
    assert set(BOOK_VOLUME_ONLY_TYPES) == {"輕小說", "小說"}


def test_the_franchise_type_is_book():
    assert FranchiseType.BOOK == "Book"
    assert "Book" in FRANCHISE_TYPES and "Novel" not in FRANCHISE_TYPES


def test_hentai_source_material_keeps_novel():
    """It names the genre adapted from, not this media type."""
    assert "Novel" in HENTAI_SOURCE_MATERIALS


@pytest.mark.parametrize(
    "book_type_value, expected",
    [("輕小說", "jp"), ("網路小說", "jp"), (None, "jp"), ("小說", "cn"), ("短篇集", "cn"), ("其他", "cn")],
)
def test_a_cjk_author_slot_follows_the_type(book_type_value, expected):
    assert name_slot_for("鴨志田一", role="author", scope="book", book_type=book_type_value) == expected


def test_every_old_type_maps_into_the_new_vocabulary():
    assert set(BOOK_TYPE_RENAMES) == {"Light Novel", "Novel", "Web", "Other"}
    assert set(BOOK_TYPE_RENAMES.values()) <= set(BOOK_TYPES)
    assert book_type("Web") == "網路小說"
    assert book_type("短篇集") == "短篇集"
    assert book_type(None) is None


def test_the_old_type_vocabulary_on_a_book_row_is_mapped():
    row = legacy_cell_values("Book", {"type": "Light Novel", "cover_image_file": "novel/x.jpg"})
    assert row == {"type": "輕小說", "cover_image_file": "book/x.jpg"}


def test_the_type_is_not_mapped_on_another_tab():
    assert legacy_cell_values("Manga", {"type": "Novel"}) == {"type": "Novel"}


@pytest.mark.parametrize(
    "value, expected",
    [("Novel", "Book"), ("ACG, Novel", "ACG, Book"), ("Novel,TV", "Book,TV"), ("Book, Novel", "Book"), ("TV", "TV")],
)
def test_franchise_type_tokens(value, expected):
    assert franchise_type(value) == expected


def test_type_covers_never_overwrites_a_book_choice():
    assert type_covers({"Novel": "a"}) == {"Book": "a"}
    assert type_covers({"Novel": "a", "Book": "b"}) == {"Book": "b"}
    assert type_covers({"Anime": "a"}) == {"Anime": "a"}


def test_config_value_renames_fields_and_type_values():
    assert config_value(
        {"defaults": {"novel_name_jp": "x", "release_date": "", "type": "Novel"},
         "autofill": ["novel_name_en", "region"],
         "filters": {"type": ["Web", "Other"], "region": ["JP"]}}
    ) == {
        "defaults": {"book_name_jp": "x", "release_date_jp": "", "type": "小說"},
        "autofill": ["book_name_en", "region"],
        "filters": {"type": ["網路小說", "其他"], "region": ["JP"]},
    }


def test_a_books_release_is_the_jp_date_then_the_tw_one():
    """Casting, credits and the person, studio and publisher profiles all
    serve primary_release_value as `release_date`; a book must still give one."""
    from types import SimpleNamespace

    from app.utils.release_date import RELEASE_PRIORITY, primary_release_value

    assert RELEASE_PRIORITY["book"] == ("release_date_jp", "release_date_tw")
    assert primary_release_value("book", SimpleNamespace(release_date_jp="2006", release_date_tw="2010")) == "2006"
    assert primary_release_value("book", SimpleNamespace(release_date_jp=None, release_date_tw="2010")) == "2010"
    assert primary_release_value("book", SimpleNamespace(release_date_jp=None, release_date_tw=None)) is None


def test_an_older_sheet_restores_a_book_region_in_chinese():
    """A Books tab backed up before the region was renamed (b1o2okregion3)."""
    assert BOOK_REGION_RENAMES == {
        "Western": "歐美", "JP": "日本", "CN": "中國", "KR": "韓國", "TW": "台灣",
    }
    assert set(BOOK_REGION_RENAMES.values()) == set(BOOK_REGIONS)
    assert legacy_cell_values("Book", {"region": "JP"})["region"] == "日本"
    assert legacy_cell_values("Book", {"region": "日本"})["region"] == "日本"
    # A manga's region is another vocabulary and never moves.
    assert legacy_cell_values("Manga", {"region": "JP"})["region"] == "JP"
