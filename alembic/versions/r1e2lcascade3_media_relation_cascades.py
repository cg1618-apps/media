"""Deleting an entry deletes its media relations

The owner's request: "When deleting a media entry, make sure to clear the
relation that entry has so that there won't be missing entry in relation
afterwards."

Both endpoints of `media_relation` were FK-less (type, id) pairs, so deleting
an entry left every relation naming it in place, drawn as a missing node on
the canvas and a missing card on its neighbours' Related Entries. This gives
each endpoint a composite foreign key onto media(system_id, media_type), ON
DELETE CASCADE - the shape fk_plan_next_media_type already has. Every entry's
AFTER DELETE trigger removes its `media` row, so whichever path deletes an
entry now takes its relations, from both ends, in the same statement.

A key cannot be added over rows that violate it, so the rows that already
name a missing entry - or an id filed under a type that is not its own - are
deleted first. They are exactly the rows the owner asked to be rid of: each
points at an entry that no longer exists and carries nothing but the kind and
a remark about it.

Reversible: the downgrade drops the two keys, which is the schema the earlier
code ran on. The dangling rows are not put back, because there is nothing to
put back that would mean anything - the entries they named are gone - and
the earlier code reads the cleaned table exactly as it read the old one.

Revision ID: r1e2lcascade3
Revises: p1r2oscons3
Create Date: 2026-11-24 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "r1e2lcascade3"
down_revision: Union[str, Sequence[str], None] = "p1r2oscons3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

# A relation either end of which names no media row of that type.
_DELETE_DANGLING = sa.text(
    """
    DELETE FROM media_relation r
    WHERE NOT EXISTS (
        SELECT 1 FROM media m
        WHERE m.system_id = r.from_id AND m.media_type = r.from_type
    )
    OR NOT EXISTS (
        SELECT 1 FROM media m
        WHERE m.system_id = r.to_id AND m.media_type = r.to_type
    )
    """
)


def delete_dangling_relations(bind) -> int:
    """
    The data half of the migration, against any bind; returns how many
    relations went.

    Split out so tests can run the SHIPPED statement against the test session
    - the suite has no Alembic harness for data.
    """
    deleted = bind.execute(_DELETE_DANGLING).rowcount
    logger.info("deleted %d relation(s) naming a missing entry", deleted)
    return deleted


def upgrade() -> None:
    delete_dangling_relations(op.get_bind())
    op.create_foreign_key(
        "fk_media_relation_from",
        "media_relation",
        "media",
        ["from_id", "from_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_media_relation_to",
        "media_relation",
        "media",
        ["to_id", "to_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_media_relation_to", "media_relation", type_="foreignkey")
    op.drop_constraint(
        "fk_media_relation_from", "media_relation", type_="foreignkey"
    )
