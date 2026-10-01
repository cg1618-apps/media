"""
Pull carries the image focal-point columns.

Backup writes every table column, so the focus columns reach the sheet with no
code of their own; Pull is per-column, so each parser has to name them. A
malformed cell is folded to NULL (centred) rather than refusing the tab.
"""

import pytest

from app.utils import formatter

PARSERS = [
    (formatter.parse_media_from_sheet, "cover_image_focus"),
    (formatter.parse_anime_from_sheet, "cover_image_focus"),
    (formatter.parse_h_game_from_sheet, "cover_image_focus"),
    (formatter.parse_person_from_sheet, "photo_focus"),
    (formatter.parse_character_from_sheet, "photo_focus"),
    (formatter.parse_character_casting_from_sheet, "photo_focus"),
    (formatter.parse_studio_from_sheet, "logo_focus"),
    (formatter.parse_publisher_from_sheet, "logo_focus"),
]


@pytest.mark.parametrize("parser, key", PARSERS)
def test_a_well_formed_focus_is_kept(parser, key):
    assert parser({key: "50% 20%"})[key] == "50% 20%"


@pytest.mark.parametrize("parser, key", PARSERS)
@pytest.mark.parametrize("cell", ["", None, "left top", "101% 0%"])
def test_a_blank_or_malformed_cell_restores_as_null(parser, key, cell):
    assert parser({key: cell})[key] is None


def test_every_parsed_image_column_has_its_focus_beside_it():
    """
    The drift guard: a parser that restores an image key must restore its
    focus too. quote and meme are the deliberate exceptions - their images
    are shown uncropped, so they have no focus column.
    """
    image_keys = {"cover_image_file", "photo_file", "logo_file"}
    missing = []
    for name in dir(formatter):
        if not (name.startswith("parse_") and name.endswith("_from_sheet")):
            continue
        parser = getattr(formatter, name)
        try:
            parsed = parser({})
        except Exception:  # a parser that needs a key is irrelevant here
            continue
        for key in image_keys & set(parsed):
            if key.replace("_file", "_focus") not in parsed:
                missing.append(f"{name}: {key}")
    assert missing == []
