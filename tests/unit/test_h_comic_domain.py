"""
The pure halves of the h-comic rules: the region clears, the vocabularies, the
group order, the `names` note field and `group_by`. No database.
"""

import uuid
from types import SimpleNamespace

import pytest

from app.schemas.note import NoteCreate, validate_note_payload
from app.services.domain import h_comic
from app.utils import note_sections as ns
from app.utils.constants import (
    FRANCHISE_TYPES,
    H_COMIC_ANIMATION_STATUSES,
    H_COMIC_REGIONS,
    FranchiseType,
)


def _entry(region, **columns):
    base = {
        "region": region,
        "originality": "原創",
        "animation_status": "Animated",
        "series_number": 1,
        "page_total": 20,
        "ch_total": 30,
        "ch_behind": 2,
        "highlight_group_order": ["Ana"],
    }
    base.update(columns)
    return SimpleNamespace(**base)


def test_the_vocabularies():
    assert H_COMIC_REGIONS == ("JP", "KR")
    assert H_COMIC_ANIMATION_STATUSES == ("Not Animated", "Announced", "Animated")
    assert FranchiseType.H_COMIC.value == "H-Comic"
    assert "H-Comic" in FRANCHISE_TYPES


def test_kr_clears_the_jp_only_columns():
    entry = _entry("KR")
    h_comic.clear_h_comic_catalog(entry)
    assert (entry.originality, entry.animation_status, entry.series_number, entry.page_total) == (
        None, None, None, None,
    )
    assert (entry.ch_total, entry.ch_behind, entry.highlight_group_order) == (30, 2, ["Ana"])


def test_jp_clears_the_kr_only_columns():
    entry = _entry("JP")
    h_comic.clear_h_comic_catalog(entry)
    assert (entry.ch_total, entry.ch_behind, entry.highlight_group_order) == (None, None, None)
    assert entry.page_total == 20


def test_no_region_clears_nothing():
    entry = _entry(None)
    h_comic.clear_h_comic_catalog(entry)
    assert entry.page_total == 20 and entry.ch_total == 30


@pytest.mark.parametrize(
    "region,cleared,kept", [("JP", "ch_fin", "page_fin"), ("KR", "page_fin", "ch_fin")]
)
def test_the_reader_counters_follow_the_region(region, cleared, kept):
    row = SimpleNamespace(page_fin=5, ch_fin=6)
    h_comic.clear_h_comic_list(row, SimpleNamespace(region=region))
    assert getattr(row, cleared) is None
    assert getattr(row, kept) is not None


def test_the_group_order_is_normalized():
    assert h_comic.normalize_group_order([" Ana", "Bea", "Ana", ""]) == ["Ana", "Bea"]
    assert h_comic.normalize_group_order([]) is None
    assert h_comic.normalize_group_order(None) is None
    with pytest.raises(ValueError):
        h_comic.normalize_group_order("Ana")
    with pytest.raises(ValueError):
        h_comic.normalize_group_order([1])


def test_region_is_required_and_closed():
    with pytest.raises(ValueError):
        h_comic.check_region(None)
    with pytest.raises(ValueError):
        h_comic.check_region("CN")
    assert h_comic.check_region("KR") == "KR"


def test_a_blank_vocabulary_value_reads_as_none():
    assert h_comic.check_usefulness("") is None
    assert h_comic.check_originality("  ") is None


def test_franchise_types_are_split_on_commas():
    assert h_comic.is_h_comic_franchise(SimpleNamespace(franchise_type="ACG, H-Comic"))
    assert not h_comic.is_h_comic_franchise(SimpleNamespace(franchise_type="ACG"))
    assert not h_comic.is_h_comic_franchise(SimpleNamespace(franchise_type=None))


# ---------------------------------------------------------------------------
# The highlights section and the `names` field
# ---------------------------------------------------------------------------


def _highlight(**fields):
    return NoteCreate(
        owner_type="h-comic",
        owner_id=uuid.uuid4(),
        section="h_comic_highlights",
        fields=fields,
    )


def test_the_section_is_registered_with_its_grouping():
    section = ns.section_by_key("h_comic_highlights")
    assert section.owners == ("h-comic",)
    assert section.scope == ns.SCOPE_CATALOG
    assert section.group_by == "female_characters"
    assert section.owner_where == {"region": ("KR",)}
    names = [f for f in section.fields if f.type == ns.FIELD_NAMES]
    assert {f.key for f in names} == {"female_characters", "male_characters"}
    assert all(f.column is None for f in names)


def test_names_are_accepted_as_a_list_of_strings():
    validate_note_payload(_highlight(female_characters=["Ana", "Bea"]))


@pytest.mark.parametrize("value", [[], None])
def test_the_required_names_field_refuses_empty(value):
    with pytest.raises(ValueError, match="required"):
        validate_note_payload(_highlight(female_characters=value))


@pytest.mark.parametrize("value", ["Ana", ["Ana", ""], [3]])
def test_a_names_field_refuses_anything_but_names(value):
    with pytest.raises(ValueError, match="names"):
        validate_note_payload(_highlight(female_characters=value))


def test_group_by_must_name_a_names_field():
    bad = ns.NoteSection(
        key="bad",
        shape=ns.SHAPE_STRUCTURED,
        label="Bad",
        owners=("h-comic",),
        scope=ns.SCOPE_CATALOG,
        group_by="location",
        fields=(ns.NoteField(key="location", label="Location"),),
    )
    with pytest.raises(ValueError):
        ns._check_group_by(bad)
    good = ns.section_by_key("h_comic_highlights")
    ns._check_group_by(good)
