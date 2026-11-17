"""Novel becomes Book

The `novel` media type is renamed `book` throughout, and its `type`
vocabulary becomes 輕小說, 小說, 網路小說, 短篇集, 指南/設定集 and 其他.

Schema:

- Tables `novel`, `novel_unit` and `user_novel_unit_rating` become `book`,
  `book_unit` and `user_book_unit_rating`; `book_unit.novel_id` becomes
  `book_id`; `novel_name_{en,cn,roman,jp,alt}` become `book_name_*`.
- `release_date` becomes `release_date_jp` - the original's first
  publication, which is what MAL and Open Library filled it with - and
  `release_date_tw` is added, empty, with the same ISO check.
- Every named object follows the tables, so the result is exactly what
  create_all builds from the models: the primary keys, foreign keys, unique
  and check constraints, indexes, the `public_id` sequence and the delete
  trigger (app/models/media_sync.py names the last two from the table).

Values:

- The media-type key `novel` becomes `book` wherever it is stored:
  media.media_type, book.media_type and its server default, plan_next,
  character_casting and character_casting_voice, media_relation's two
  endpoints, image_attachment.owner_type, user_request.target_type, the three
  scope tables, and the `media_type.novel` permission.
  fk_plan_next_media_type is neither deferrable nor ON UPDATE CASCADE, so it is
  dropped and recreated around the update; the detail table's own
  fk_book_media is recreated under its new name anyway.
- The franchise type token `Novel` becomes `Book`, and a `Novel` key in
  franchise.type_covers moves to `Book`. `franchise.type_slots` is NOT
  rewritten - its `Novel` key is the favourite grid's storage key
  (frontend/src/config/favoriteGrids.js), not a franchise type - and neither
  is `deleted_record`, a tombstone of what was deleted at the time.
- Stored cover paths move with the folder: media.cover_image_file `novel/...`
  and image.storage_key / thumb_key `covers/novel/...` become `book/...`, and
  a backfilled image's `legacy:novel/...` checksum follows its path. The files
  themselves are moved by the app at startup
  (image_manager.move_legacy_cover_folders), since the migration does not
  own the cover volume.
- system_configs `form_defaults:novel` and `random_picker_defaults:novel`
  become `...:book`, with the field names inside (novel_name_*, release_date)
  and any `type` value renamed.
- book.type: Light Novel -> 輕小說, Novel -> 小說, Web -> 網路小說,
  Other -> 其他. 短篇集 and 指南/設定集 are new; entries move there by hand.

The downgrade reverses every step. 短篇集 and 指南/設定集 have no old spelling
and become Other; release_date_tw is dropped with whatever it held.

Revision ID: b1o2okrename3
Revises: p1r2ogfloat3
Create Date: 2026-11-17 00:00:00.000000

"""

import json
import logging
from typing import Optional, Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b1o2okrename3"
down_revision: Union[str, Sequence[str], None] = "p1r2ogfloat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

OLD_KEY, NEW_KEY = "novel", "book"
OLD_FRANCHISE, NEW_FRANCHISE = "Novel", "Book"

TABLES = (
    ("novel", "book"),
    ("novel_unit", "book_unit"),
    ("user_novel_unit_rating", "user_book_unit_rating"),
)

NAME_SUFFIXES = ("en", "cn", "roman", "jp", "alt")

# (table after the rename, old name, new name) for every named constraint
# that is renamed in place. The composite FK to media, the media_type check
# and the release-date check are dropped and recreated instead.
CONSTRAINTS = (
    ("book", "novel_pkey", "book_pkey"),
    ("book", "ck_novel_end_date_iso", "ck_book_end_date_iso"),
    ("book_unit", "novel_unit_pkey", "book_unit_pkey"),
    ("book_unit", "novel_unit_novel_id_fkey", "book_unit_book_id_fkey"),
    ("book_unit", "ck_novel_unit_kind", "ck_book_unit_kind"),
    ("book_unit", "ck_novel_unit_ch_count_arc_only", "ck_book_unit_ch_count_arc_only"),
    ("user_book_unit_rating", "user_novel_unit_rating_pkey", "user_book_unit_rating_pkey"),
    (
        "user_book_unit_rating",
        "user_novel_unit_rating_unit_id_fkey",
        "user_book_unit_rating_unit_id_fkey",
    ),
    (
        "user_book_unit_rating",
        "user_novel_unit_rating_user_id_fkey",
        "user_book_unit_rating_user_id_fkey",
    ),
    ("user_book_unit_rating", "uq_user_novel_unit", "uq_user_book_unit"),
)

# Indexes that are not a constraint's own (those follow their constraint).
INDEXES = (
    ("ix_novel_system_id", "ix_book_system_id"),
    ("ix_novel_unit_system_id", "ix_book_unit_system_id"),
    ("ix_novel_unit_novel_id", "ix_book_unit_book_id"),
    ("ix_novel_unit_novel_kind_position", "ix_book_unit_book_kind_position"),
    ("ix_user_novel_unit_rating_system_id", "ix_user_book_unit_rating_system_id"),
    ("ix_user_novel_unit_rating_unit_id", "ix_user_book_unit_rating_unit_id"),
    ("ix_user_novel_unit_rating_user_id", "ix_user_book_unit_rating_user_id"),
)

ISO = r"'^\d{4}(-\d{2}(-\d{2})?)?$'"

# (table, column) holding a media-type key.
KEY_COLUMNS = (
    ("media", "media_type"),
    ("plan_next", "media_type"),
    ("character_casting", "media_type"),
    ("character_casting_voice", "media_type"),
    ("media_relation", "from_type"),
    ("media_relation", "to_type"),
    ("image_attachment", "owner_type"),
    ("user_request", "target_type"),
    ("person_role", "scope"),
    ("publisher_scope", "scope"),
    ("system_option_scope", "scope"),
)

PERMISSION = ("media_type.novel", "media_type.book")

# (table, column, old prefix, new prefix) for stored paths.
PATHS = (
    ("media", "cover_image_file", "novel/", "book/"),
    ("image", "storage_key", "covers/novel/", "covers/book/"),
    ("image", "thumb_key", "covers/novel/", "covers/book/"),
    ("image", "thumb_key", "covers/thumbs/novel/", "covers/thumbs/book/"),
    ("image", "checksum", "legacy:novel/", "legacy:book/"),
)

TYPES_UP = {
    "Light Novel": "輕小說",
    "Novel": "小說",
    "Web": "網路小說",
    "Other": "其他",
}
TYPES_DOWN = {
    "輕小說": "Light Novel",
    "小說": "Novel",
    "網路小說": "Web",
    "短篇集": "Other",
    "指南/設定集": "Other",
    "其他": "Other",
}

FIELDS_UP = {
    **{f"novel_name_{s}": f"book_name_{s}" for s in NAME_SUFFIXES},
    "release_date": "release_date_jp",
}
FIELDS_DOWN = {new: old for old, new in FIELDS_UP.items()}
# Fields the old shape has no room for.
FIELDS_DROPPED_DOWN = frozenset({"release_date_tw"})

CONFIG_KEYS = (
    ("form_defaults:novel", "form_defaults:book"),
    ("random_picker_defaults:novel", "random_picker_defaults:book"),
)


# ---------------------------------------------------------------------------
# Frozen copies of the value rewrites. app/services/pipelines/legacy_names.py
# does the same for a sheet; these are copied here so the revision does not
# change when the app does.
# ---------------------------------------------------------------------------


def retoken(value: Optional[str], old: str, new: str) -> Optional[str]:
    """A comma-separated franchise_type with its `old` token as `new`, kept in
    place, never listed twice."""
    if not isinstance(value, str):
        return value
    pieces = value.split(",")
    tokens = [p.strip() for p in pieces]
    if old not in tokens:
        return value
    seen = new in tokens
    out: list[str] = []
    for piece, token in zip(pieces, tokens):
        if token == old:
            if seen:
                continue
            seen = True
            piece = piece.replace(old, new)
        out.append(piece)
    if out:
        out[0] = out[0].lstrip()
    return ",".join(out)


def rekey(covers: Optional[dict], old: str, new: str) -> Optional[dict]:
    """type_covers with its `old` key moved to `new`, never over a choice made there."""
    if not isinstance(covers, dict) or old not in covers:
        return covers
    out = dict(covers)
    chosen = out.pop(old)
    out.setdefault(new, chosen)
    return out


def convert_config(value, fields: dict, types: dict, dropped=frozenset()):
    """One per-type config value with its field names and `type` values mapped."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key in dropped:
                continue
            if key == "type":
                if isinstance(item, list):
                    item = [types.get(v, v) if isinstance(v, str) else v for v in item]
                elif isinstance(item, str):
                    item = types.get(item, item)
            else:
                item = convert_config(item, fields, types, dropped)
            out[fields.get(key, key)] = item
        return out
    if isinstance(value, list):
        return [
            fields.get(v, v) if isinstance(v, str) else convert_config(v, fields, types, dropped)
            for v in value
            if not (isinstance(v, str) and v in dropped)
        ]
    return value


def _json(raw):
    if raw is None:
        return None
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


# ---------------------------------------------------------------------------
# Data steps, run against a schema whose tables are already named `book`
# (after the upgrade's renames, before the downgrade's). Split out so tests
# can run the shipped code against the test session.
# ---------------------------------------------------------------------------


def _keys(bind, old: str, new: str) -> None:
    for table, column in KEY_COLUMNS:
        bind.execute(
            sa.text(f"UPDATE {table} SET {column} = :new WHERE {column} = :old"),
            {"new": new, "old": old},
        )


def _paths(bind, up: bool) -> None:
    for table, column, old, new in PATHS:
        src, dst = (old, new) if up else (new, old)
        bind.execute(
            sa.text(
                f"UPDATE {table} SET {column} = :dst || substr({column}, :n) "
                f"WHERE {column} LIKE :pattern"
            ),
            {"dst": dst, "n": len(src) + 1, "pattern": src.replace("_", r"\_") + "%"},
        )


def _franchises(bind, old: str, new: str) -> int:
    rows = bind.execute(
        sa.text(
            "SELECT system_id, franchise_type, type_covers FROM franchise "
            "WHERE franchise_type LIKE :pattern OR type_covers ? :key"
        ),
        {"pattern": f"%{old}%", "key": old},
    ).all()
    changed = 0
    for system_id, franchise_type, raw_covers in rows:
        covers = _json(raw_covers)
        new_type = retoken(franchise_type, old, new)
        new_covers = rekey(covers, old, new)
        if new_type == franchise_type and new_covers == covers:
            continue
        bind.execute(
            sa.text(
                "UPDATE franchise SET franchise_type = :t, "
                "type_covers = CAST(:c AS JSONB) WHERE system_id = :id"
            ),
            {
                "t": new_type,
                "c": json.dumps(new_covers, ensure_ascii=False) if new_covers else None,
                "id": system_id,
            },
        )
        changed += 1
    return changed


def _configs(bind, up: bool) -> None:
    fields, types = (FIELDS_UP, TYPES_UP) if up else (FIELDS_DOWN, TYPES_DOWN)
    dropped = frozenset() if up else FIELDS_DROPPED_DOWN
    for old_key, new_key in CONFIG_KEYS:
        src, dst = (old_key, new_key) if up else (new_key, old_key)
        row = bind.execute(
            sa.text("SELECT config_value FROM system_configs WHERE config_key = :k"),
            {"k": src},
        ).first()
        if row is None:
            continue
        value = row[0]
        try:
            converted = json.dumps(
                convert_config(json.loads(value), fields, types, dropped),
                ensure_ascii=False,
            )
        except (TypeError, ValueError):
            converted = value
        bind.execute(
            sa.text(
                "UPDATE system_configs SET config_key = :dst, config_value = :v "
                "WHERE config_key = :src"
            ),
            {"dst": dst, "v": converted, "src": src},
        )


def _types(bind, mapping: dict) -> None:
    for old, new in mapping.items():
        bind.execute(
            sa.text("UPDATE book SET type = :new WHERE type = :old"),
            {"new": new, "old": old},
        )


def rewrite(bind) -> None:
    """The upgrade's data half: every stored `novel` spelling as `book`."""
    _keys(bind, OLD_KEY, NEW_KEY)
    bind.execute(
        sa.text("UPDATE book SET media_type = :new WHERE media_type = :old"),
        {"new": NEW_KEY, "old": OLD_KEY},
    )
    bind.execute(
        sa.text("UPDATE role_permission SET permission = :new WHERE permission = :old"),
        {"new": PERMISSION[1], "old": PERMISSION[0]},
    )
    _paths(bind, up=True)
    franchises = _franchises(bind, OLD_FRANCHISE, NEW_FRANCHISE)
    _configs(bind, up=True)
    _types(bind, TYPES_UP)
    logger.info("Novel became Book: %s franchises retyped.", franchises)


def restore(bind) -> None:
    """The downgrade's data half: every `book` spelling back to `novel`."""
    _keys(bind, NEW_KEY, OLD_KEY)
    bind.execute(
        sa.text("UPDATE book SET media_type = :new WHERE media_type = :old"),
        {"new": OLD_KEY, "old": NEW_KEY},
    )
    bind.execute(
        sa.text("UPDATE role_permission SET permission = :new WHERE permission = :old"),
        {"new": PERMISSION[0], "old": PERMISSION[1]},
    )
    _paths(bind, up=False)
    _franchises(bind, NEW_FRANCHISE, OLD_FRANCHISE)
    _configs(bind, up=False)
    _types(bind, TYPES_DOWN)


# ---------------------------------------------------------------------------
# Schema steps
# ---------------------------------------------------------------------------


def _plan_next_fk() -> None:
    op.create_foreign_key(
        "fk_plan_next_media_type",
        "plan_next",
        "media",
        ["media_id", "media_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )


def _media_fk(table: str) -> None:
    op.create_foreign_key(
        f"fk_{table}_media",
        table,
        "media",
        ["system_id", "media_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
        deferrable=True,
        initially="DEFERRED",
    )


def upgrade() -> None:
    bind = op.get_bind()

    # Everything that pins media_type to `novel`, or would refuse the update.
    op.drop_constraint("fk_plan_next_media_type", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_novel_media", "novel", type_="foreignkey")
    op.drop_constraint("ck_novel_media_type", "novel", type_="check")
    op.drop_constraint("ck_novel_release_date_iso", "novel", type_="check")

    for old, new in TABLES:
        op.rename_table(old, new)
    op.alter_column("book_unit", "novel_id", new_column_name="book_id")
    for suffix in NAME_SUFFIXES:
        op.alter_column("book", f"novel_name_{suffix}", new_column_name=f"book_name_{suffix}")
    op.alter_column("book", "release_date", new_column_name="release_date_jp")
    op.add_column("book", sa.Column("release_date_tw", sa.String(), nullable=True))

    for table, old, new in CONSTRAINTS:
        op.execute(f'ALTER TABLE {table} RENAME CONSTRAINT "{old}" TO "{new}"')
    for old, new in INDEXES:
        op.execute(f'ALTER INDEX "{old}" RENAME TO "{new}"')
    op.execute('ALTER SEQUENCE "novel_public_id_seq" RENAME TO "book_public_id_seq"')
    op.execute('ALTER TRIGGER "trg_novel_delete_media" ON book RENAME TO "trg_book_delete_media"')

    rewrite(bind)

    op.alter_column("book", "media_type", server_default=NEW_KEY)
    op.create_check_constraint("ck_book_media_type", "book", f"media_type = '{NEW_KEY}'")
    op.create_check_constraint("ck_book_release_date_jp_iso", "book", f"release_date_jp ~ {ISO}")
    op.create_check_constraint("ck_book_release_date_tw_iso", "book", f"release_date_tw ~ {ISO}")
    _media_fk("book")
    _plan_next_fk()


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_constraint("fk_plan_next_media_type", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_book_media", "book", type_="foreignkey")
    op.drop_constraint("ck_book_media_type", "book", type_="check")
    op.drop_constraint("ck_book_release_date_jp_iso", "book", type_="check")
    op.drop_constraint("ck_book_release_date_tw_iso", "book", type_="check")

    restore(bind)

    op.execute('ALTER TRIGGER "trg_book_delete_media" ON book RENAME TO "trg_novel_delete_media"')
    op.execute('ALTER SEQUENCE "book_public_id_seq" RENAME TO "novel_public_id_seq"')
    for old, new in INDEXES:
        op.execute(f'ALTER INDEX "{new}" RENAME TO "{old}"')
    for table, old, new in CONSTRAINTS:
        op.execute(f'ALTER TABLE {table} RENAME CONSTRAINT "{new}" TO "{old}"')

    op.drop_column("book", "release_date_tw")
    op.alter_column("book", "release_date_jp", new_column_name="release_date")
    for suffix in NAME_SUFFIXES:
        op.alter_column("book", f"book_name_{suffix}", new_column_name=f"novel_name_{suffix}")
    op.alter_column("book_unit", "book_id", new_column_name="novel_id")
    for old, new in TABLES:
        op.rename_table(new, old)

    op.alter_column("novel", "media_type", server_default=OLD_KEY)
    op.create_check_constraint("ck_novel_media_type", "novel", f"media_type = '{OLD_KEY}'")
    op.create_check_constraint("ck_novel_release_date_iso", "novel", f"release_date ~ {ISO}")
    _media_fk("novel")
    _plan_next_fk()
