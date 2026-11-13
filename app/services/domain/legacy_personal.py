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

The header names live here rather than in pull.py because they are personal
column names, and no pipeline module may name one
(tests/services/test_pipelines_write_no_personal_columns.py): Pull asks this
module which headers are legacy, hands it the values, and never writes a
personal row itself.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.services.domain.highlight_group_order import write_group_order
from app.services.domain.novel_unit_writer import write_unit_rating
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
}


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
            f"{tab_name}: a rating, expectation, remark or group order could "
            "not be restored - no account exists to own it"
        )
    owner_type, _fields = LEGACY_PERSONAL_COLUMNS[tab_name]
    if owner_type == "novel_unit":
        write_unit_rating(db, owner, owner_id, values)
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
