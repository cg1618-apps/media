"""Notes rework, catalogue half: suggestion seeds, gated reviews, NG reset

The registry gains field-level suggestion categories, a `collected` collect
status, an amount total and an NG Reset on the three 物品 sections, a group on
攻略資源 Guide Resources, the 地理 Geography section, and the 待辦 quick move;
and `reviews_and_comments` leaves it, the gated types taking 大眾評價 and
我的評價 like every other type. Only three of those touch stored data:

  system_option
          seeds "Character Group" (商人, 重要NPC, 主角, 同伴, 可攻略, 反派),
          "Collectible Type" (重要物品) and "Item Type" (重要道具, 任務道具),
          with no scope rows, so game and h-game both get them. "Geography
          Group" has no value yet; the registry constant lists it. A value
          that already exists is left alone.
  note    every `reviews_and_comments` row becomes `public_reviews`. A
          personal section becomes a catalogue one, so the row is everyone's
          now; `author_id` is kept as provenance.
  note    `fields.ng_reset = 'yes'` on every `weapons_and_gear`, `items` and
          `collectibles` row that has no ng_reset yet. `fields` may be SQL
          NULL or JSON null; both become an object.

Downgrade puts back what the older registry can say. `public_reviews` and
`personal_reviews` rows on an h-comic, hentai or h-game become
`reviews_and_comments` again - exact for the moved rows, since those owners
had neither section before, and the nearest home for a personal review
written since. `ng_reset` and `amount_total` leave `fields` on the three gear
sections, a guide resource's group is cleared, and a `collected` status
becomes `fully collected`, the old vocabulary's nearest truthful value. Those
are what was only expressible after the upgrade, and the older validator
would refuse an edit to a row still carrying them. 地理 Geography rows are
left in place: the older code lists no such section and touches none of
them, and an upgrade brings them back. The option seeds stay, as
m1s2ongstat3's do.

Not marked irreversible: every row the upgrade rewrote comes back with the
same content.

Revision ID: n1o2tesrwk3
Revises: p1r2ivatedat3
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n1o2tesrwk3"
down_revision: Union[str, Sequence[str], None] = "p1r2ivatedat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration that imports app code breaks the day
# a later revision changes it.
SUGGESTION_SEEDS = (
    ("Character Group", ("商人", "重要NPC", "主角", "同伴", "可攻略", "反派")),
    ("Collectible Type", ("重要物品",)),
    ("Item Type", ("重要道具", "任務道具")),
)
OLD_REVIEWS = "reviews_and_comments"
PUBLIC_REVIEWS = "public_reviews"
PERSONAL_REVIEWS = "personal_reviews"
GATED_TYPES = ("h-comic", "hentai", "h-game")
GEAR_SECTIONS = ("weapons_and_gear", "items", "collectibles")
NEW_GEAR_KEYS = ("ng_reset", "amount_total")
NG_RESET_DEFAULT = "yes"


def seed_note_suggestions(conn) -> None:
    """Additive and idempotent: an existing value keeps what it has."""
    for category, values in SUGGESTION_SEEDS:
        for sort_order, value in enumerate(values):
            exists = conn.execute(
                sa.text(
                    "SELECT 1 FROM system_option "
                    "WHERE category = :category AND value = :value"
                ),
                {"category": category, "value": value},
            ).scalar()
            if exists:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :category, :value, :sort_order, "
                    "now(), now())"
                ),
                {"category": category, "value": value, "sort_order": sort_order},
            )


def move_reviews(conn) -> None:
    conn.execute(
        sa.text("UPDATE note SET section = :new WHERE section = :old"),
        {"new": PUBLIC_REVIEWS, "old": OLD_REVIEWS},
    )


def restore_reviews(conn) -> None:
    conn.execute(
        sa.text(
            """
            UPDATE note SET section = :old
             WHERE section = ANY(CAST(:sections AS text[]))
               AND media_id IN (
                   SELECT system_id FROM media
                    WHERE media_type = ANY(CAST(:types AS text[]))
               )
            """
        ),
        {
            "old": OLD_REVIEWS,
            "sections": [PUBLIC_REVIEWS, PERSONAL_REVIEWS],
            "types": list(GATED_TYPES),
        },
    )


def backfill_ng_reset(conn) -> None:
    """Idempotent: a row that already says yes or no keeps it. `||` on a JSON
    null would build an array, hence the CASE."""
    conn.execute(
        sa.text(
            """
            UPDATE note
               SET fields = CASE WHEN jsonb_typeof(fields) = 'object'
                                 THEN fields ELSE '{}'::jsonb END
                            || jsonb_build_object('ng_reset', CAST(:value AS text))
             WHERE section = ANY(CAST(:sections AS text[]))
               AND (
                   fields IS NULL
                   OR jsonb_typeof(fields) <> 'object'
                   OR NOT fields ? 'ng_reset'
               )
            """
        ),
        {"value": NG_RESET_DEFAULT, "sections": list(GEAR_SECTIONS)},
    )


def drop_gear_fields(conn) -> None:
    conn.execute(
        sa.text(
            """
            UPDATE note SET fields = fields - CAST(:keys AS text[])
             WHERE section = ANY(CAST(:sections AS text[]))
               AND jsonb_typeof(fields) = 'object'
               AND fields ?| CAST(:keys AS text[])
            """
        ),
        {"keys": list(NEW_GEAR_KEYS), "sections": list(GEAR_SECTIONS)},
    )


def clear_guide_resource_groups(conn) -> None:
    conn.execute(
        sa.text(
            "UPDATE note SET kind = NULL "
            "WHERE section = 'guide_resources' AND kind IS NOT NULL"
        )
    )


def collected_to_fully_collected(conn) -> None:
    conn.execute(
        sa.text(
            "UPDATE note SET status = 'fully collected' "
            "WHERE section = ANY(CAST(:sections AS text[])) AND status = 'collected'"
        ),
        {"sections": list(GEAR_SECTIONS)},
    )


def upgrade() -> None:
    conn = op.get_bind()
    seed_note_suggestions(conn)
    move_reviews(conn)
    backfill_ng_reset(conn)


def downgrade() -> None:
    conn = op.get_bind()
    restore_reviews(conn)
    drop_gear_fields(conn)
    clear_guide_resource_groups(conn)
    collected_to_fully_collected(conn)
