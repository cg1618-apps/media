"""media_source: move every Other Sources row into Restricted Sources

A one-time move of the free-form `other` bucket into `restricted`, on every
media entry. The rows keep their id, kind, name, url and position, so each
entry's sources render in the same order afterwards; `other` and
`restricted` rows already share one position sequence (`replace_sources`
numbers the whole payload).

An `other` row whose name the entry already carries as a `restricted` row of
the same kind would collide on `uq_media_source_row`, so that copy is deleted
instead of moved - the restricted row it duplicates stays as it is.

Revision ID: o1r2srcrestr3
Revises: d1e2dupmusic3
Create Date: 2026-09-29 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "o1r2srcrestr3"
down_revision: Union[str, Sequence[str], None] = "d1e2dupmusic3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Once moved, nothing records which restricted rows used to be `other`.
irreversible = True


def move(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    bind.execute(
        sa.text(
            """
            DELETE FROM media_source other
             USING media_source restricted
             WHERE other.bucket = 'other'
               AND restricted.bucket = 'restricted'
               AND restricted.media_id = other.media_id
               AND restricted.kind = other.kind
               AND restricted.name = other.name
            """
        )
    )
    bind.execute(
        sa.text(
            "UPDATE media_source SET bucket = 'restricted' WHERE bucket = 'other'"
        )
    )


def upgrade() -> None:
    move(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
