"""Move a casting's seiyuu into character_casting_voice

A character may have several seiyuu in one entry, so person_id leaves
character_casting for a child table, one row per voice. Each existing
non-NULL person_id becomes one voice row at position 0; ck_casting_voice_scope
moves with it, onto the new table.

The voice row carries the casting's media_type and entry_id as well, held
equal by a composite FK onto a new uq_character_casting_entry.

Downgrade keeps the first voice of each casting and drops the rest - a
casting with several seiyuu cannot be expressed in the old shape.

Revision ID: v1o2icemany3
Revises: f1o2calpnt3
Create Date: 2026-10-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "v1o2icemany3"
down_revision: Union[str, Sequence[str], None] = "f1o2calpnt3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VOICED = "media_type IN ('anime', 'anime-movie', 'hentai')"


def upgrade() -> None:
    # Dropped first so the name is free for the new table's copy.
    op.drop_constraint("ck_casting_voice_scope", "character_casting", type_="check")
    op.create_unique_constraint(
        "uq_character_casting_entry",
        "character_casting",
        ["system_id", "media_type", "entry_id"],
    )
    op.create_table(
        "character_casting_voice",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("casting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["casting_id", "media_type", "entry_id"],
            [
                "character_casting.system_id",
                "character_casting.media_type",
                "character_casting.entry_id",
            ],
            name="fk_casting_voice_casting",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["person_id"], ["person.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("casting_id", "person_id", name="uq_casting_voice"),
        sa.CheckConstraint(VOICED, name="ck_casting_voice_scope"),
    )
    op.create_index(
        "ix_character_casting_voice_system_id",
        "character_casting_voice",
        ["system_id"],
    )
    op.create_index(
        "ix_character_casting_voice_casting_id",
        "character_casting_voice",
        ["casting_id"],
    )
    op.create_index(
        "ix_character_casting_voice_person_id",
        "character_casting_voice",
        ["person_id"],
    )
    op.create_index(
        "ix_character_casting_voice_entry",
        "character_casting_voice",
        ["media_type", "entry_id"],
    )
    op.execute(
        """
        INSERT INTO character_casting_voice
            (system_id, casting_id, media_type, entry_id, person_id, position,
             created_at)
        SELECT gen_random_uuid(), system_id, media_type, entry_id, person_id, 0,
               created_at
        FROM character_casting
        WHERE person_id IS NOT NULL
        """
    )
    op.drop_index("ix_character_casting_person_id", table_name="character_casting")
    op.drop_column("character_casting", "person_id")


def downgrade() -> None:
    op.add_column(
        "character_casting",
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "character_casting_person_id_fkey",
        "character_casting",
        "person",
        ["person_id"],
        ["system_id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_character_casting_person_id", "character_casting", ["person_id"]
    )
    op.execute(
        """
        UPDATE character_casting c
        SET person_id = v.person_id
        FROM (
            SELECT DISTINCT ON (casting_id) casting_id, person_id
            FROM character_casting_voice
            ORDER BY casting_id, position
        ) v
        WHERE v.casting_id = c.system_id
        """
    )
    op.drop_table("character_casting_voice")
    op.create_check_constraint(
        "ck_casting_voice_scope",
        "character_casting",
        f"person_id IS NULL OR {VOICED}",
    )
    op.drop_constraint(
        "uq_character_casting_entry", "character_casting", type_="unique"
    )
