"""
An old backup's personal values, filed under the installation owner.

A backup taken before revision u1r2atings3 carries, on the Collection,
Franchise, Series, Character, Person, Studio, Publisher and Novel Unit tabs,
the rating and expectation that were columns on the shared row, and a novel
unit's remark (and its rating, from before user_novel_unit_rating). They are
opinions, and that revision moved them to the installation owner's
user_rating / user_novel_unit_rating rows - so Pull of such a sheet does the
same rather than drop them.

A backup taken before revision h1i2ghlights3 carries, on the H-Comic and
H-Game tabs, `highlight_group_order` - the order of the highlight groups,
which that revision moved to the installation owner's
user_highlight_group_order row. Pull files it there too.

A backup taken before revision f1a2vourites3 carries, on the Quote and Meme
tabs, `is_favorite` - one person's favourites, which that revision moved to
the installation owner's user_favorite rows. Pull files them there too.

A backup taken before revision n1o2temarks3 carries, on the Note tab, the
personal values of catalogue rows - collected, beaten, completion, my value
and the music and mod statuses - in the row's status column or a key of its
`fields`. That revision moved them to the installation owner's note_mark rows;
Pull files them there too. They are recognised by the row's section, which is
exact: on those sections that column or key only ever held the personal value
(note_marks.pop_legacy_note_values). They are taken off the row BEFORE Pull
matches it to a local one, because the match compares content and the local
row no longer carries them.

The header names live here rather than in pull.py because they are personal
column names, and no pipeline module may name one
(tests/services/test_pipelines_write_no_personal_columns.py): Pull asks this
module which headers are legacy, hands it the values, and never writes a
personal row itself.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.services.domain.highlight_group_order import write_group_order
from app.services.domain.note_marks import pop_legacy_note_values, write_mark
from app.services.domain.novel_unit_writer import write_unit_rating
from app.services.domain.user_favorite import write_favorite
from app.services.domain.user_list import installation_owner_id
from app.services.domain.user_rating import write_rating

# tab -> (owner type, {sheet header: personal field}).
LEGACY_PERSONAL_COLUMNS: dict[str, tuple[str, dict[str, str]]] = {
    "Collection": (
        "collection",
        {"my_rating": "my_rating", "collection_expectation": "expectation"},
    ),
    "Franchise": (
        "franchise",
        {"my_rating": "my_rating", "franchise_expectation": "expectation"},
    ),
    "Series": (
        "series",
        {"my_rating": "my_rating", "series_expectation": "expectation"},
    ),
    "Character": ("character", {"my_rating": "my_rating"}),
    "Person": ("person", {"my_rating": "my_rating"}),
    "Studio": ("studio", {"my_rating": "my_rating"}),
    "Publisher": ("publisher", {"my_rating": "my_rating"}),
    "Novel Unit": ("novel_unit", {"my_rating": "my_rating", "remark": "remark"}),
    "H-Comic": ("group_order", {"highlight_group_order": "group_order"}),
    "H-Game": ("group_order", {"highlight_group_order": "group_order"}),
    "Quote": ("favorite_quote", {"is_favorite": "is_favorite"}),
    "Meme": ("favorite_meme", {"is_favorite": "is_favorite"}),
}

# The two favourite owner types -> user_favorite's kind.
FAVORITE_KIND: dict[str, str] = {"favorite_quote": "quote", "favorite_meme": "meme"}


# The tab whose legacy values are found by section rather than by header.
NOTE_TAB = "Note"


def legacy_personal_headers(tab_name: str) -> frozenset[str]:
    """The headers an old sheet's tab may carry for a personal value."""
    legacy = LEGACY_PERSONAL_COLUMNS.get(tab_name)
    return frozenset(legacy[1]) if legacy else frozenset()


def pop_legacy_personal(tab_name: str, payload: dict) -> dict:
    """
    Take an old sheet's personal values out of a row's payload, in place.

    Returns {personal field: value} for the legacy headers the row carried -
    only those present, so a blank cell still means "clear it" and a header
    the sheet never had leaves the owner's value alone. Empty for every other
    tab and for a current sheet.
    """
    if tab_name == NOTE_TAB:
        return pop_legacy_note_values(payload)
    legacy = LEGACY_PERSONAL_COLUMNS.get(tab_name)
    if legacy is None:
        return {}
    _owner_type, fields = legacy
    return {
        field: payload.pop(header)
        for header, field in fields.items()
        if header in payload
    }


def restore_legacy_personal(
    db: Session, tab_name: str, owner_id, values: dict
) -> Optional[str]:
    """
    File an old sheet's personal values under the installation owner, on the
    row just restored. Returns a reason when nobody can own them, for the
    run's unresolved_refs - the values are then lost, and the log says so.
    """
    if not values:
        return None
    owner = installation_owner_id(db)
    if owner is None:
        return (
            f"{tab_name}: a rating, expectation, remark, group order, note "
            "mark or favourite could not be restored - no account exists to "
            "own it"
        )
    if tab_name == NOTE_TAB:
        # Merged into the owner's mark: a value the sheet does not carry
        # leaves the owner's own alone.
        write_mark(db, owner, owner_id, values)
        return None
    owner_type, _fields = LEGACY_PERSONAL_COLUMNS[tab_name]
    if owner_type == "novel_unit":
        write_unit_rating(db, owner, owner_id, values)
    elif owner_type in FAVORITE_KIND:
        # A blank cell is "not a favourite", as the column's False was.
        write_favorite(
            db, owner, FAVORITE_KIND[owner_type], owner_id, bool(values["is_favorite"])
        )
    elif owner_type == "group_order":
        try:
            write_group_order(db, owner, owner_id, values["group_order"])
        except ValueError:
            return (
                f"{tab_name}: highlight_group_order is not a list of names; "
                "not restored"
            )
    else:
        write_rating(db, owner, owner_type, owner_id, values)
    return None
