"""system_option: remove the Franchise for Filter category and its values

Franchise for Filter was a filter-only vocabulary: no TagField read it and no
list page ever filtered on it. It is gone from FILTER_ONLY_CATEGORIES, so
nothing offers it any more; this deletes what it left behind - every
system_option in the `Franchise for Filter` category, with its scope, usage
and alias rows (ON DELETE CASCADE). The owner chose not to keep the values
anywhere.

Revision ID: f1r2filterrm3
Revises: g1m2ainplat3
Create Date: 2026-11-26 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1r2filterrm3"
down_revision: Union[str, Sequence[str], None] = "g1m2ainplat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The deleted values are gone; a downgrade has nothing to restore.
irreversible = True

log = logging.getLogger(f"alembic.runtime.migration.{revision}")


def remove_franchise_for_filter(bind) -> int:
    """
    The data half of the migration, against any bind. Returns how many values
    it deleted.

    Split out so tests can run the SHIPPED statement against the test
    session - the suite has no Alembic harness.
    """
    result = bind.execute(
        sa.text("DELETE FROM system_option WHERE category = 'Franchise for Filter'")
    )
    return result.rowcount


def upgrade() -> None:
    deleted = remove_franchise_for_filter(op.get_bind())
    log.info("deleted %d Franchise for Filter value(s)", deleted)


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
