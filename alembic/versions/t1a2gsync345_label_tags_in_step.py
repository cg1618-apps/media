"""Content labels and their 標籤 Label tags in step

Three labels have a Label tag - nsfw NSFW, ecchi 輕微色情, erotica 擦邊肉番 - and
from here on the app keeps the two in step on an entry, both ways
(app/services/domain/label_tags.py). This revision makes the vocabulary and
the existing rows agree with that:

1. The Label option 肉番 is renamed 擦邊肉番. Where both exist already, 肉番's
   tags move onto 擦邊肉番 and 肉番 is deleted.
2. NSFW, 輕微色情 and 擦邊肉番 exist as Label options.
3. Each is scoped to all nine types with the Label field. A scoped option is
   offered only where it is scoped, and the three were scoped to anime and
   anime movie, which would have hidden the tag that a label write adds.
4. Every entry of those types is brought into step, as the UNION of the two
   sides: a tag without its label attaches the label (and nsfw with it), and
   a label without its tag adds the tag. A one-time backfill keeps every
   statement either side makes: dropping one would delete data the owner
   entered, and of the two sides only a label decides visibility, so the
   union can only hide, never reveal. From here on Pull reconciles with the
   label winning instead, because a sheet's tag column is a copy.

The values below are a frozen copy of the code's, not an import.

Downgrade does nothing to the data - an added row is indistinguishable from
one an admin entered - and the schema is unchanged, so a downgrade past this
revision is still safe.

Revision ID: t1a2gsync345
Revises: g1r2plabels3
Create Date: 2026-11-13 00:00:00.000000

"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "t1a2gsync345"
down_revision: Union[str, Sequence[str], None] = "g1r2plabels3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

CATEGORY = "Label"
FIELD = "label"
# (label key, tag value)
TAGS = (("nsfw", "NSFW"), ("ecchi", "輕微色情"), ("erotica", "擦邊肉番"))
OLD_NAME, NEW_NAME = "肉番", "擦邊肉番"
LABEL_FIELD_TYPES = (
    "anime",
    "anime-movie",
    "movie",
    "tv-show",
    "cartoon",
    "manga",
    "novel",
    "comic",
    "game",
)


def _option_id(conn, value):
    return conn.execute(
        sa.text(
            "SELECT system_id FROM system_option WHERE category = :c AND value = :v"
        ),
        {"c": CATEGORY, "v": value},
    ).scalar()


def rename_old_tag(conn) -> None:
    """Step 1."""
    old = _option_id(conn, OLD_NAME)
    if old is None:
        return
    new = _option_id(conn, NEW_NAME)
    if new is None:
        conn.execute(
            sa.text("UPDATE system_option SET value = :v WHERE system_id = :id"),
            {"v": NEW_NAME, "id": old},
        )
        return
    conn.execute(
        sa.text(
            """
            UPDATE media_tag t SET option_id = :new
            WHERE t.option_id = :old AND NOT EXISTS (
                SELECT 1 FROM media_tag d
                WHERE d.media_id = t.media_id AND d.field = t.field
                  AND d.option_id = :new
            )
            """
        ),
        {"old": old, "new": new},
    )
    conn.execute(
        sa.text("DELETE FROM system_option WHERE system_id = :id"), {"id": old}
    )


def ensure_options(conn) -> dict[str, object]:
    """Steps 2 and 3. Returns {label key: option id}."""
    out = {}
    for key, value in TAGS:
        option = _option_id(conn, value)
        if option is None:
            option = conn.execute(
                sa.text(
                    "INSERT INTO system_option (system_id, category, value, sort_order) "
                    "VALUES (gen_random_uuid(), :c, :v, 0) RETURNING system_id"
                ),
                {"c": CATEGORY, "v": value},
            ).scalar()
        for media_type in LABEL_FIELD_TYPES:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_scope (option_id, scope) "
                    "VALUES (:o, :s) ON CONFLICT DO NOTHING"
                ),
                {"o": option, "s": media_type},
            )
        out[key] = option
    return out


def backfill(conn, options: dict) -> dict[str, int]:
    """Step 4. Returns {"labels": attached, "nsfw": attached, "tags": added}."""
    counts = {"labels": 0, "nsfw": 0, "tags": 0}
    types = sa.bindparam("types", expanding=True)
    for key, _value in TAGS:
        label = conn.execute(
            sa.text("SELECT system_id FROM content_label WHERE key = :k"), {"k": key}
        ).scalar()
        if label is None:
            continue
        counts["labels"] += conn.execute(
            sa.text(
                """
                INSERT INTO media_content_label (system_id, media_id, label_id, position)
                SELECT gen_random_uuid(), t.media_id, :label, 0
                FROM media_tag t JOIN media m ON m.system_id = t.media_id
                WHERE t.field = :field AND t.option_id = :option
                  AND m.media_type IN :types
                  AND NOT EXISTS (
                      SELECT 1 FROM media_content_label h
                      WHERE h.media_id = t.media_id AND h.label_id = :label
                  )
                GROUP BY t.media_id
                """
            ).bindparams(types),
            {
                "label": label,
                "field": FIELD,
                "option": options[key],
                "types": list(LABEL_FIELD_TYPES),
            },
        ).rowcount
    # The nsfw rule over what that attached: label_rules._ADD_MISSING["media"].
    counts["nsfw"] = conn.execute(
        sa.text(
            """
            INSERT INTO media_content_label (system_id, media_id, label_id, position)
            SELECT gen_random_uuid(), owner.media_id, nsfw.system_id,
                   COALESCE(MAX(owner.position), 0) + 1
            FROM media_content_label owner
            JOIN content_label other ON other.system_id = owner.label_id
            CROSS JOIN content_label nsfw
            WHERE other.key <> 'nsfw' AND nsfw.key = 'nsfw'
              AND NOT EXISTS (
                  SELECT 1 FROM media_content_label has
                  WHERE has.media_id = owner.media_id AND has.label_id = nsfw.system_id
              )
            GROUP BY owner.media_id, nsfw.system_id
            """
        )
    ).rowcount
    for key, _value in TAGS:
        counts["tags"] += conn.execute(
            sa.text(
                """
                INSERT INTO media_tag (system_id, media_id, field, option_id, position)
                SELECT gen_random_uuid(), l.media_id, :field, :option,
                       COALESCE((SELECT MAX(p.position) + 1 FROM media_tag p
                                 WHERE p.media_id = l.media_id
                                   AND p.field = :field), 0)
                FROM media_content_label l
                JOIN content_label c ON c.system_id = l.label_id
                JOIN media m ON m.system_id = l.media_id
                WHERE c.key = :key AND m.media_type IN :types
                  AND NOT EXISTS (
                      SELECT 1 FROM media_tag h
                      WHERE h.media_id = l.media_id AND h.field = :field
                        AND h.option_id = :option
                  )
                """
            ).bindparams(types),
            {
                "field": FIELD,
                "option": options[key],
                "key": key,
                "types": list(LABEL_FIELD_TYPES),
            },
        ).rowcount
    return counts


def upgrade() -> None:
    conn = op.get_bind()
    rename_old_tag(conn)
    options = ensure_options(conn)
    counts = backfill(conn, options)
    logger.info(
        "t1a2gsync345: %d labels attached from tags (%d nsfw with them), "
        "%d tags added from labels",
        counts["labels"],
        counts["nsfw"],
        counts["tags"],
    )


def downgrade() -> None:
    pass
