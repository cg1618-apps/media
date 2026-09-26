"""A hentai casting may name a seiyuu

Hentai is animated, so it is cast the way anime is: ck_casting_voice_scope
gains `hentai` beside anime and anime-movie.

Revision ID: h7v8oicecast9
Revises: h6e7n8srcs9
"""

from typing import Sequence, Union

from alembic import op

revision: str = "h7v8oicecast9"
down_revision: Union[str, Sequence[str], None] = "h6e7n8srcs9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "ck_casting_voice_scope"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, "character_casting", type_="check")
    op.create_check_constraint(
        CONSTRAINT,
        "character_casting",
        "person_id IS NULL OR media_type IN ('anime', 'anime-movie', 'hentai')",
    )


def downgrade() -> None:
    """
    The older constraint refuses a seiyuu on a hentai casting, so those
    seiyuu are un-cast first. The castings themselves stay - the older code
    reads a hentai cast just as happily without its voices.
    """
    op.execute(
        "UPDATE character_casting SET person_id = NULL "
        "WHERE media_type = 'hentai' AND person_id IS NOT NULL"
    )
    op.drop_constraint(CONSTRAINT, "character_casting", type_="check")
    op.create_check_constraint(
        CONSTRAINT,
        "character_casting",
        "person_id IS NULL OR media_type IN ('anime', 'anime-movie')",
    )
