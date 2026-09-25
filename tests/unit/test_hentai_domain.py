"""hentai's vocabularies and the franchise families. Pure functions, no DB."""

from types import SimpleNamespace

import pytest

from app.services.domain import gated_labels, hentai
from app.services.domain.hierarchy import (
    FRANCHISE_TYPE_FOR,
    check_franchise_type_family,
    entry_family,
    franchise_families,
)
from app.services.rbac import gated_types
from app.utils import constants as c


def test_the_label_key_is_the_one_the_gated_type_requires():
    assert gated_types.REQUIRED_LABEL_FOR_TYPE[hentai.MEDIA_TYPE] == hentai.LABEL_KEY
    assert hentai.LABEL_KEY in gated_labels.SYSTEM_LABELS


def test_every_required_label_has_a_system_label_row_to_seed():
    assert set(gated_types.REQUIRED_LABEL_FOR_TYPE.values()) <= set(gated_labels.SYSTEM_LABELS)


@pytest.mark.parametrize(
    "check,good,bad",
    [
        (hentai.check_source_material, "Manga", "Game"),
        (hentai.check_originality, "原創", "original"),
        (hentai.check_airing_status, "Finished Airing", "Animated"),
        (hentai.check_usefulness, "實用", "useful"),
    ],
)
def test_each_vocabulary_accepts_its_values_and_refuses_others(check, good, bad):
    assert check(good) == good
    assert check(None) is None
    assert check("  ") is None
    with pytest.raises(ValueError):
        check(bad)


def test_source_materials_are_the_three_the_owner_named():
    assert c.HENTAI_SOURCE_MATERIALS == ("Original", "Manga", "Novel")


# ---------------------------------------------------------------------------
# Families
# ---------------------------------------------------------------------------


def test_the_family_map_is_the_agreed_one():
    assert c.FRANCHISE_FAMILY_FOR_TYPE["H-Comic"] == "h-comic"
    assert c.FRANCHISE_FAMILY_FOR_TYPE["Hentai"] == "h-comic"
    assert "Hentai" in c.FRANCHISE_TYPES
    assert FRANCHISE_TYPE_FOR["hentai"] == c.FranchiseType.HENTAI


@pytest.mark.parametrize(
    "value,families",
    [
        (None, {"mainstream"}),
        ("", {"mainstream"}),
        ("ACG, Anime", {"mainstream"}),
        ("H-Comic", {"h-comic"}),
        ("H-Comic, Hentai", {"h-comic"}),
        ("ACG, Hentai", {"mainstream", "h-comic"}),
    ],
)
def test_franchise_families(value, families):
    assert franchise_families(value) == families


def test_a_mixed_franchise_type_is_refused_and_one_family_is_not():
    with pytest.raises(ValueError):
        check_franchise_type_family("Anime, Hentai")
    check_franchise_type_family("H-Comic, Hentai")
    check_franchise_type_family("ACG, Anime")


def test_entry_families():
    assert entry_family("hentai") == "h-comic"
    assert entry_family("h-comic") == "h-comic"
    assert entry_family("anime") == "mainstream"


def test_a_franchise_brings_the_label_of_each_gated_type_it_holds():
    both = SimpleNamespace(franchise_type="H-Comic, Hentai")
    assert gated_labels.franchise_label_keys(both) == ["h-comic", "hentai"]
    assert gated_labels.franchise_label_keys(SimpleNamespace(franchise_type="ACG")) == []
