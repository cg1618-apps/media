"""h_game: dialogue audio, sound effect, H 演出 art style; animation dropped

- audio_availability is renamed dialogue_audio: the voiced parts, now that
  sound_effect records the other half of what a game sounds like.
- sound_effect is new, a JSONB list over the same vocabulary.
- h_art_style is new, a JSONB list: what the H scenes look like, recorded
  beside art_style, which is what the whole game looks like.
- animation_availability is dropped with its data. h_presentation's 動態
  answers the same question, so nothing is carried across.
- h_presentation's vocabulary is replaced (靜態 / 動態 / 間接互動 / 直接互動),
  and no old value maps onto a new one, so every entry's is cleared, and so is
  the same field on every 亮點 Highlights note, which offers the same options.

Revision ID: h4g5amefx6
Revises: a1n2idblink3
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h4g5amefx6"
down_revision: Union[str, Sequence[str], None] = "a1n2idblink3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The dropped animation column and the cleared h_presentation values are gone;
# a downgrade could restore the columns but not what they held.
irreversible = True


def reshape(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness.
    """
    bind.execute(sa.text("UPDATE h_game SET h_presentation = NULL"))
    bind.execute(
        sa.text(
            "UPDATE note SET fields = fields - 'h_presentation' "
            "WHERE section = 'h_game_highlights' AND fields ? 'h_presentation'"
        )
    )


def upgrade() -> None:
    op.alter_column("h_game", "audio_availability", new_column_name="dialogue_audio")
    op.add_column(
        "h_game",
        sa.Column("sound_effect", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "h_game",
        sa.Column("h_art_style", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.drop_column("h_game", "animation_availability")
    reshape(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: the columns come back, their data does not.
    op.add_column(
        "h_game",
        sa.Column("animation_availability", sa.Boolean(), nullable=True),
    )
    op.drop_column("h_game", "h_art_style")
    op.drop_column("h_game", "sound_effect")
    op.alter_column("h_game", "dialogue_audio", new_column_name="audio_availability")
