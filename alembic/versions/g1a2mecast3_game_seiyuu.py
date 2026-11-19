"""A game casting may name a seiyuu

Games are voiced, so a game is cast the way anime is: ck_casting_voice_scope,
on character_casting_voice, gains `game` beside anime, anime-movie and
hentai. character_casting itself has no media-type constraint - which types
may be cast is casting.CASTING_MEDIA_TYPES - so the voice rows are the only
schema change.

Revision ID: g1a2mecast3
Revises: n1w2needswork3
"""

from typing import Sequence, Union

from alembic import op

revision: str = "g1a2mecast3"
down_revision: Union[str, Sequence[str], None] = "n1w2needswork3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "character_casting_voice"
CONSTRAINT = "ck_casting_voice_scope"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(
        CONSTRAINT, TABLE, "media_type IN ('anime', 'anime-movie', 'hentai', 'game')"
    )


def downgrade() -> None:
    """
    The older constraint refuses a voice on a game casting, so those voices
    are removed first. The game castings themselves stay - the older code
    simply does not offer them - as the hentai seiyuu revision's downgrade
    did.
    """
    op.execute(f"DELETE FROM {TABLE} WHERE media_type = 'game'")
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(
        CONSTRAINT, TABLE, "media_type IN ('anime', 'anime-movie', 'hentai')"
    )
