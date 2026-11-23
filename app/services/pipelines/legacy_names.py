"""
Names a sheet written before a rename still carries, and what they became.

Backup writes only the current names. A sheet in Google Drive is as old as its
last Backup, though, so Pull reads an older one by mapping the old names onto
the new ones before anything parses a row: a tab under its old title, a header
under its old name (pull.RENAMED_COLUMNS) and a cell value in its old spelling
(legacy_cell_values below).

The main rename here is Novel becoming Book: the tabs `Novel`, `Novel Unit`
and `User Novel Unit Rating`, the media-type key `novel`, the franchise type
`Novel`, the cover folder `novel/`, the two per-type system_configs keys and
the fields inside them, and the old `type` vocabulary. The other is the tab
`Studio Relation` becoming `Company Relation` once a publisher could be
either end; its columns kept their names, so only the title maps.
"""

import json
from typing import Any, Optional

# Current tab name -> the titles an older sheet may carry it under, tried in
# order when the current tab is missing or empty.
LEGACY_TAB_NAMES: dict[str, tuple[str, ...]] = {
    "Book": ("Novel",),
    "Book Unit": ("Novel Unit",),
    "User Book Unit Rating": ("User Novel Unit Rating",),
    "Company Relation": ("Studio Relation",),
}

OLD_MEDIA_TYPE = "novel"
MEDIA_TYPE = "book"
OLD_FRANCHISE_TYPE = "Novel"
FRANCHISE_TYPE = "Book"

# A book's `type`, old spelling -> new. 短篇集 and 指南/設定集 have no old
# spelling: they are new choices an admin moves entries into by hand.
BOOK_TYPE_RENAMES: dict[str, str] = {
    "Light Novel": "輕小說",
    "Novel": "小說",
    "Web": "網路小說",
    "Other": "其他",
}

# Book fields an older sheet or config names differently.
BOOK_FIELD_RENAMES: dict[str, str] = {
    **{f"novel_name_{s}": f"book_name_{s}" for s in ("en", "cn", "roman", "jp", "alt")},
    "release_date": "release_date_jp",
}

# The system_configs keys that name the type.
CONFIG_KEY_RENAMES: dict[str, str] = {
    "form_defaults:novel": "form_defaults:book",
    "random_picker_defaults:novel": "random_picker_defaults:book",
}

# tab -> the columns holding a media-type key (or an owner/scope that is one).
_MEDIA_TYPE_COLUMNS: dict[str, tuple[str, ...]] = {
    "Media": ("media_type",),
    "User Media List": ("media_type",),
    "User Highlight Group Order": ("media_type",),
    "Plan Next": ("media_type",),
    "Character Casting": ("media_type",),
    "Character Casting Voice": ("media_type",),
    "Media Relation": ("from_type", "to_type"),
    "Person Role": ("scope",),
    "Publisher Scope": ("scope",),
    "System Option Scope": ("scope",),
    # A sheet from before notes and memes carried their owner as foreign keys.
    "Note": ("owner_type",),
    "Meme": ("owner_type",),
}

# tabs whose cover_image_file is a stored path `<owner>/<file>`.
_COVER_PATH_TABS = frozenset({"Media", "Book"})
_OLD_COVER_PREFIX = f"{OLD_MEDIA_TYPE}/"
_COVER_PREFIX = f"{MEDIA_TYPE}/"


def book_type(value: Any) -> Any:
    """One `type` value in the current vocabulary."""
    if isinstance(value, str):
        return BOOK_TYPE_RENAMES.get(value.strip(), value)
    return value


def franchise_type(value: Any) -> Any:
    """
    A comma-separated franchise_type with its `Novel` token as `Book`. The
    other tokens keep their order and spacing, and a value that already names
    Book does not list it twice.
    """
    if not isinstance(value, str):
        return value
    pieces = value.split(",")
    tokens = [p.strip() for p in pieces]
    if OLD_FRANCHISE_TYPE not in tokens:
        return value
    has_book = FRANCHISE_TYPE in tokens
    out: list[str] = []
    for piece, token in zip(pieces, tokens):
        if token == OLD_FRANCHISE_TYPE:
            if has_book:
                continue
            has_book = True
            piece = piece.replace(OLD_FRANCHISE_TYPE, FRANCHISE_TYPE)
        out.append(piece)
    if out:
        out[0] = out[0].lstrip()
    return ",".join(out)


def type_covers(value: Any) -> Any:
    """A type_covers mapping with its `Novel` key as `Book`, never over a
    choice already made under Book."""
    if not isinstance(value, dict) or OLD_FRANCHISE_TYPE not in value:
        return value
    out = dict(value)
    chosen = out.pop(OLD_FRANCHISE_TYPE)
    out.setdefault(FRANCHISE_TYPE, chosen)
    return out


def config_value(value: Any) -> Any:
    """
    One per-type system_configs value with its fields and type values renamed.

    A form default's `defaults` keys and `autofill` names are field names; a
    random picker default's `filters.type` holds `type` values. Walked rather
    than addressed, so a value whose shape has grown still converts.
    """
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            new_key = BOOK_FIELD_RENAMES.get(key, key)
            if key == "type":
                item = [book_type(v) for v in item] if isinstance(item, list) else book_type(item)
            else:
                item = config_value(item)
            out[new_key] = item
        return out
    if isinstance(value, list):
        return [BOOK_FIELD_RENAMES.get(v, v) if isinstance(v, str) else config_value(v) for v in value]
    return value


def _json_cell(cell: Any, convert) -> Any:
    """Apply `convert` to a cell holding JSON, leaving anything unparseable as is."""
    if not isinstance(cell, str) or not cell.strip():
        return cell
    try:
        parsed = json.loads(cell)
    except ValueError:
        return cell
    converted = convert(parsed)
    if converted == parsed:
        return cell
    return json.dumps(converted, ensure_ascii=False)


def _cover_path(cell: Any) -> Any:
    if isinstance(cell, str) and cell.startswith(_OLD_COVER_PREFIX):
        return _COVER_PREFIX + cell[len(_OLD_COVER_PREFIX):]
    return cell


def legacy_cell_values(tab_name: str, raw: dict) -> dict:
    """
    One sheet row (header -> cell) with every pre-rename value in its current
    spelling. A row already in the current spelling comes back unchanged.
    """
    out: Optional[dict] = None

    def put(column: str, value: Any) -> None:
        nonlocal out
        if value != raw.get(column):
            if out is None:
                out = dict(raw)
            out[column] = value

    for column in _MEDIA_TYPE_COLUMNS.get(tab_name, ()):
        if column in raw and isinstance(raw[column], str) and raw[column].strip() == OLD_MEDIA_TYPE:
            put(column, MEDIA_TYPE)
    if tab_name in _COVER_PATH_TABS and "cover_image_file" in raw:
        put("cover_image_file", _cover_path(raw["cover_image_file"]))
    if tab_name == "Book" and "type" in raw:
        put("type", book_type(raw["type"]))
    if tab_name == "Franchise":
        if "franchise_type" in raw:
            put("franchise_type", franchise_type(raw["franchise_type"]))
        if "type_covers" in raw:
            put("type_covers", _json_cell(raw["type_covers"], type_covers))
    if tab_name == "System Configs":
        key = raw.get("config_key")
        new_key = CONFIG_KEY_RENAMES.get(key.strip(), key) if isinstance(key, str) else key
        # Only an old key's value is in the old spelling: a current one is
        # left exactly as written.
        if new_key != key:
            put("config_key", new_key)
            if "config_value" in raw:
                put("config_value", _json_cell(raw["config_value"], config_value))
    return raw if out is None else out
