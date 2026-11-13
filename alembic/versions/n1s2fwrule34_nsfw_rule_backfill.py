"""Every label other than nsfw is stored with nsfw

The rule the label write paths now enforce (app/services/domain/label_rules.py),
applied once to the rows written before it: every entry and franchise carrying
a label other than `nsfw` gains `nsfw`. The gated types' entries are most of
them - they carried their own label and nothing else.

Nothing becomes hidden that was visible: `nsfw`'s lowest mode is `normal`, and
every other label is already hidden at or below it.

The SQL is a frozen copy of label_rules.add_missing_nsfw, not an import.

Downgrade does nothing, and says so: a row this added is indistinguishable
from one an admin attached, so removing them would be a guess. The schema is
unchanged, so a downgrade past this revision is still safe.

Revision ID: n1s2fwrule34
Revises: l1a2belcode3
Create Date: 2026-11-13 00:00:00.000000

"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "n1s2fwrule34"
down_revision: Union[str, Sequence[str], None] = "l1a2belcode3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

ADD_MISSING = {
    "media": """
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
    """,
    "franchise": """
        INSERT INTO franchise_content_label
            (system_id, franchise_id, label_id, position)
        SELECT gen_random_uuid(), owner.franchise_id, nsfw.system_id,
               COALESCE(MAX(owner.position), 0) + 1
        FROM franchise_content_label owner
        JOIN content_label other ON other.system_id = owner.label_id
        CROSS JOIN content_label nsfw
        WHERE other.key <> 'nsfw' AND nsfw.key = 'nsfw'
          AND NOT EXISTS (
              SELECT 1 FROM franchise_content_label has
              WHERE has.franchise_id = owner.franchise_id
                AND has.label_id = nsfw.system_id
          )
        GROUP BY owner.franchise_id, nsfw.system_id
    """,
}


def backfill(conn) -> dict[str, int]:
    """Attach nsfw wherever another label lacks it. Returns the counts."""
    return {owner: conn.execute(sa.text(sql)).rowcount for owner, sql in ADD_MISSING.items()}


def upgrade() -> None:
    added = backfill(op.get_bind())
    logger.info(
        "n1s2fwrule34: nsfw added to %s entries and %s franchises",
        added["media"],
        added["franchise"],
    )


def downgrade() -> None:
    pass
