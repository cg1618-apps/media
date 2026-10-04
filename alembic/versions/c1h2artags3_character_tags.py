"""Characters carry appearance and trait tags

A character gains two vocabulary-backed lists, `appearance` and `trait`, drawn
from the system_option categories "Character Appearance" and "Character
Trait". They are stored in `character_tag`, media_tag's twin: media_tag cannot
hold them because its `media_id` is a real foreign key up to `media`, and a
character is not an entry.

Both foreign keys cascade. Deleting a character takes its tags with it, as it
takes its castings; deleting a vocabulary value takes it off every character
that carried it, as it does off every entry.

No data moves: the table starts empty, and the two categories have no values
until an admin or a character form adds one.

Revision ID: c1h2artags3
Revises: r2v3textlink4
Create Date: 2026-10-04 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c1h2artags3"
down_revision: Union[str, Sequence[str], None] = "r2v3textlink4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "character_tag",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(), nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "position", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["character_id"], ["character.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "character_id", "field", "option_id", name="uq_character_tag_row"
        ),
    )
    op.create_index(
        "ix_character_tag_character", "character_tag", ["character_id"]
    )
    op.create_index(
        op.f("ix_character_tag_option_id"), "character_tag", ["option_id"]
    )
    op.create_index(
        op.f("ix_character_tag_system_id"), "character_tag", ["system_id"]
    )


def downgrade() -> None:
    # Reversible, and the rows it drops are the only copy of which characters
    # carried which tags. The vocabulary values themselves stay in
    # system_option, under their two categories, for an upgrade to reuse.
    op.drop_index(op.f("ix_character_tag_system_id"), table_name="character_tag")
    op.drop_index(op.f("ix_character_tag_option_id"), table_name="character_tag")
    op.drop_index("ix_character_tag_character", table_name="character_tag")
    op.drop_table("character_tag")
