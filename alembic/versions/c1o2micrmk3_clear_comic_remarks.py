"""Comic: delete every 備註 Remark and 備註列表 Remark List row

A one-off wipe the owner asked for. Every `remark` and `remark_list` note row
owned by a Comic entry goes - the shared remark and every account's personal
list rows alike. Nothing is kept and no copy is taken.

Only the Comic type (`media.media_type = 'comic'`): not H-Comic, and not the
collection, franchise or series a comic sits in, whose notes are owned by
those groups rather than by the media row. Rows nested under a deleted row
(`parent_id`) and any `note_mark` on one go with it by ON DELETE CASCADE.

Comics keep both sections; only the data goes.

Revision ID: c1o2micrmk3
Revises: s1e2rfields3
Create Date: 2026-11-17 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c1o2micrmk3"
down_revision: Union[str, Sequence[str], None] = "s1e2rfields3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The deleted rows are gone; a downgrade has nothing to restore.
irreversible = True

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

_DELETE = sa.text(
    """
    DELETE FROM note
    WHERE section IN ('remark', 'remark_list')
      AND media_id IN (SELECT system_id FROM media WHERE media_type = 'comic')
    """
)


def clear_comic_remarks(bind) -> int:
    """
    The data half of the migration, against any bind; returns how many rows
    went.

    Split out so tests can run the SHIPPED statement against the test session
    - the suite has no Alembic harness.
    """
    deleted = bind.execute(_DELETE).rowcount
    logger.info("deleted %d comic remark row(s)", deleted)
    return deleted


def upgrade() -> None:
    clear_comic_remarks(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
