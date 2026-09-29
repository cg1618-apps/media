"""
Two registry additions for the game guide and the 評論 card.

`groupable_by`: 技能 Skills and the three 物品 sections may be READ one group
per Type. It is a read-view choice the reader toggles, not a layout the
registry imposes, so it is declared apart from `group_by` (which always
groups, and orders its groups by a column on the owner).

介紹 Introduction: the first subsection of 評論 Reviews and Comments, shaped
like 解析 Analysis.
"""

import dataclasses

import pytest

from app.schemas.note import section_out, sections_out
from app.utils import note_sections as ns

GROUPABLE = ("skills", "weapons_and_gear", "items", "collectibles")


# --- groupable_by ---------------------------------------------------------


@pytest.mark.parametrize("key", GROUPABLE)
def test_the_named_thing_sections_can_be_grouped_by_type(key):
    section = ns.section_by_key(key)
    assert section.groupable_by == "type"
    field = next(f for f in section.fields if f.key == "type")
    assert field.type == ns.FIELD_SELECT and field.column == "kind"
    assert section_out(section, "game").groupable_by == "type"
    assert section_out(section, "h-game").groupable_by == "type"


def test_no_other_section_is_groupable():
    assert sorted(s.key for s in ns.NOTE_SECTIONS if s.groupable_by) == sorted(
        GROUPABLE
    )
    assert section_out(ns.section_by_key("advantages"), "game").groupable_by is None


def test_groupable_by_must_name_one_of_the_sections_select_fields():
    skills = ns.section_by_key("skills")
    with pytest.raises(ValueError, match="groupable by 'name'"):
        ns._check_groupable_by(dataclasses.replace(skills, groupable_by="name"))
    with pytest.raises(ValueError, match="groupable by 'nope'"):
        ns._check_groupable_by(dataclasses.replace(skills, groupable_by="nope"))
    ns._check_groupable_by(skills)


# --- 介紹 Introduction ----------------------------------------------------


def test_introduction_is_shaped_like_analysis():
    intro = ns.section_by_key("introduction")
    analysis = ns.section_by_key("analysis")
    assert intro.label == "介紹 Introduction"
    assert intro.shape == analysis.shape == ns.SHAPE_TEXT_LINKS
    assert intro.scope == analysis.scope == ns.SCOPE_CATALOG
    assert intro.owners == analysis.owners


@pytest.mark.parametrize("owner", ["game", "h-game", "anime", "movie", "series"])
def test_introduction_opens_the_reviews_card(owner):
    reviews = [s.key for s in sections_out(owner) if s.group == "reviews"]
    assert reviews[0] == "introduction", reviews


@pytest.mark.parametrize("owner", ["h-comic", "hentai"])
def test_the_flat_h_types_have_no_introduction(owner):
    assert "introduction" not in {s.key for s in ns.sections_for(owner)}
