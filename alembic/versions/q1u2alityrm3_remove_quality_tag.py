"""media_tag / system_option: remove the Quality 品質 tag field and its values

Quality was an anime-only tag vocabulary (神作畫, 作畫崩壞, ...). The field is
gone from TAG_FIELDS, so nothing reads or writes it; this deletes what it left
behind - every media_tag row filed under `quality`, and every system_option in
the `Quality` category with its scope, usage and alias rows (ON DELETE
CASCADE). The owner chose not to keep the values anywhere.

Revision ID: q1u2alityrm3
Revises: c1r2e3dited4
Create Date: 2026-10-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "q1u2alityrm3"
down_revision: Union[str, Sequence[str], None] = "c1r2e3dited4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The deleted tags and values are gone; a downgrade has nothing to restore.
irreversible = True


def remove_quality(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness. The tag rows go first and by
    field, so a `quality` row pointing at an option outside the category is
    removed too rather than left for a field nothing declares.
    """
    bind.execute(sa.text("DELETE FROM media_tag WHERE field = 'quality'"))
    bind.execute(sa.text("DELETE FROM system_option WHERE category = 'Quality'"))


def upgrade() -> None:
    remove_quality(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
