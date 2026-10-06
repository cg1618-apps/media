"""character_identity, and character_casting.identity_id

A character's other identities - the character row stays the main one. A cast
row may name one of them; NULL is the main identity, and the unique key gains
identity_id with NULLS NOT DISTINCT so the main identity is still cast once
per entry. fk_casting_identity holds a row's identity to its own character.

The downgrade drops every cast row that names an identity before restoring the
old (character, entry) key, which those rows would otherwise violate. That is
the data the identities table held - a downgrade of a new table loses its
rows - not an irreversible change to anything that existed before.

Revision ID: h1c2i3dentty
Revises: g2c3hbranch4
Create Date: 2026-10-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "h1c2i3dentty"
down_revision: Union[str, Sequence[str], None] = "g2c3hbranch4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IDENTITY = "character_identity"
CASTING = "character_casting"


def upgrade() -> None:
    op.create_table(
        IDENTITY,
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_jp", sa.String(), nullable=True),
        sa.Column("name_alt", sa.String(), nullable=True),
        sa.Column("display_name_field", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("photo_focus", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_identity_has_a_name",
        ),
        sa.ForeignKeyConstraint(
            ["character_id"], ["character.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "system_id", "character_id", name="uq_character_identity_owner"
        ),
    )
    op.create_index(op.f("ix_character_identity_system_id"), IDENTITY, ["system_id"])
    op.create_index(
        op.f("ix_character_identity_character_id"), IDENTITY, ["character_id"]
    )

    op.add_column(
        CASTING,
        sa.Column("identity_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(op.f("ix_character_casting_identity_id"), CASTING, ["identity_id"])
    op.drop_constraint("uq_character_casting", CASTING, type_="unique")
    op.create_unique_constraint(
        "uq_character_casting",
        CASTING,
        ["character_id", "identity_id", "media_type", "entry_id"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_foreign_key(
        "fk_casting_identity",
        CASTING,
        IDENTITY,
        ["identity_id", "character_id"],
        ["system_id", "character_id"],
        deferrable=True,
        initially="DEFERRED",
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM {CASTING} WHERE identity_id IS NOT NULL")
    op.drop_constraint("fk_casting_identity", CASTING, type_="foreignkey")
    op.drop_constraint("uq_character_casting", CASTING, type_="unique")
    op.create_unique_constraint(
        "uq_character_casting", CASTING, ["character_id", "media_type", "entry_id"]
    )
    op.drop_index(op.f("ix_character_casting_identity_id"), table_name=CASTING)
    op.drop_column(CASTING, "identity_id")
    op.drop_index(op.f("ix_character_identity_character_id"), table_name=IDENTITY)
    op.drop_index(op.f("ix_character_identity_system_id"), table_name=IDENTITY)
    op.drop_table(IDENTITY)
