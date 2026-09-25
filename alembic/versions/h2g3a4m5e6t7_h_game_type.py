"""The h-game media type, its label, and purchase records shared with Game

An eleventh media type, `h-game`: adult games, seen in the `unrestricted`
access mode only. It is to `game` what `h-comic` is to `manga` - a table of
its own that reuses Game's machinery rather than Game's table.

What this revision creates or changes:

  h_game          the detail table, pinned to `media` by the composite FK
                  every media type uses, with its own public_id sequence, the
                  AFTER DELETE trigger that keeps `media` clean, Game's two DLC
                  CHECKs, and a self-FK for the DLC chain
  game_copy       game_id's FK moves from games.system_id to media.system_id,
                  with the same ON DELETE CASCADE, so an h-game can carry
                  purchase records too. Every existing value is already a
                  media.system_id: an entry shares its id with its media row.
  content_label   the system label `h-game`, granted to `unrestricted` and to
                  no other mode. The lifespan seeds the same row
                  (app/services/domain/gated_labels.py) because the API tests
                  build their schema with create_all.

A frozen copy of the label row, not an import of the seed: a migration that
imports app code breaks the day a later revision changes it.

Revision ID: h2g3a4m5e6t7
Revises: o1s2tsingle3
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateSequence, DropSequence

revision: str = "h2g3a4m5e6t7"
down_revision: Union[str, Sequence[str], None] = "o1s2tsingle3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LABEL_KEY = "h-game"
LABEL_NAME = "H-Game"
LABEL_DESCRIPTION = (
    "Adult games. Carried by every h-game entry and every H-Game "
    "franchise; seen in the unrestricted mode only."
)

# The name create_all gives the column's unnamed FK, so a migrated database
# and a create_all one agree.
GAME_COPY_FK = "game_copy_game_id_fkey"

# The shared trigger function; CREATE OR REPLACE keeps this revision
# standalone, exactly as the baseline and every porting migration did.
DELETE_MEDIA_FUNCTION = """
CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
BEGIN
    DELETE FROM media WHERE system_id = OLD.system_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql
"""


def _drop_game_copy_fk() -> None:
    """Drop game_copy.game_id's FK, whatever this database named it."""
    inspector = sa.inspect(op.get_bind())
    for fk in inspector.get_foreign_keys("game_copy"):
        if fk["constrained_columns"] == ["game_id"] and fk.get("name"):
            op.drop_constraint(fk["name"], "game_copy", type_="foreignkey")


def upgrade() -> None:
    op.execute(CreateSequence(sa.Sequence("h_game_public_id_seq")))

    op.create_table(
        "h_game",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "media_type", sa.String(), server_default="h-game", nullable=False
        ),
        sa.Column("h_game_name_en", sa.String(), nullable=True),
        sa.Column("h_game_name_cn", sa.String(), nullable=True),
        sa.Column("h_game_name_jp", sa.String(), nullable=True),
        sa.Column("h_game_name_roman", sa.String(), nullable=True),
        sa.Column("h_game_name_alt", sa.String(), nullable=True),
        sa.Column("series_number", sa.Integer(), nullable=True),
        sa.Column("playstyle", sa.String(), nullable=True),
        sa.Column("game_type", sa.String(), nullable=True),
        sa.Column("base_game_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("release_status", sa.String(), nullable=True),
        sa.Column("release_date", sa.String(), nullable=True),
        sa.Column("current_patch", sa.String(), nullable=True),
        sa.Column("completion_level", sa.String(), nullable=True),
        sa.Column("all_endings", sa.String(), nullable=True),
        sa.Column("all_cg", sa.String(), nullable=True),
        sa.Column("steam_progress_sync", sa.Boolean(), nullable=True),
        sa.Column("achievements_earned", sa.Integer(), nullable=True),
        sa.Column("achievements_total", sa.Integer(), nullable=True),
        sa.Column("hltb_main", sa.Float(), nullable=True),
        sa.Column("hltb_main_extra", sa.Float(), nullable=True),
        sa.Column("hltb_completionist", sa.Float(), nullable=True),
        sa.Column("price_original_us", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_original_jp", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_original_tw", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_us", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_jp", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_tw", sa.Numeric(10, 2), nullable=True),
        sa.Column("language_availability", sa.String(), nullable=True),
        sa.Column(
            "audio_availability",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("animation_availability", sa.Boolean(), nullable=True),
        sa.Column(
            "h_presentation", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("platform", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("igdb_id", sa.Integer(), nullable=True),
        sa.Column("igdb_link", sa.String(), nullable=True),
        sa.Column("steam_appid", sa.Integer(), nullable=True),
        sa.Column("steam_link", sa.String(), nullable=True),
        sa.Column("dlsite_link_jp", sa.String(), nullable=True),
        sa.Column("dlsite_link_tw", sa.String(), nullable=True),
        sa.Column(
            "highlight_group_order",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("type_slots", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("media_type = 'h-game'", name="ck_h_game_media_type"),
        sa.CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_game_release_date_iso",
        ),
        sa.CheckConstraint(
            "game_type <> 'Base Game' OR base_game_id IS NULL",
            name="ck_h_game_base_no_parent",
        ),
        sa.CheckConstraint(
            "base_game_id IS NULL OR base_game_id <> system_id",
            name="ck_h_game_not_self_parent",
        ),
        sa.ForeignKeyConstraint(
            ["base_game_id"], ["h_game.system_id"], ondelete="SET NULL"
        ),
        # DEFERRABLE INITIALLY DEFERRED: the media row is written after the
        # detail row, because it copies public_id and a Sequence default does
        # not mint that until the INSERT runs. See app/models/media_sync.py.
        sa.ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_h_game_media",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_h_game_system_id"), "h_game", ["system_id"], unique=False
    )
    op.execute(DELETE_MEDIA_FUNCTION)
    op.execute(
        "CREATE TRIGGER trg_h_game_delete_media "
        "AFTER DELETE ON h_game "
        "FOR EACH ROW EXECUTE FUNCTION delete_media_row()"
    )

    # Purchase records follow the entry through `media`, so an h-game can
    # carry them as a game does.
    _drop_game_copy_fk()
    op.create_foreign_key(
        GAME_COPY_FK,
        "game_copy",
        "media",
        ["game_id"],
        ["system_id"],
        ondelete="CASCADE",
    )

    # The system label, and its grant to `unrestricted` alone. Both are
    # idempotent: a database the lifespan already seeded keeps its row.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO content_label "
            "(system_id, key, label, description, sort_order, created_at, updated_at) "
            "SELECT gen_random_uuid(), :key, :label, :description, 0, now(), now() "
            "WHERE NOT EXISTS (SELECT 1 FROM content_label WHERE key = :key)"
        ),
        {"key": LABEL_KEY, "label": LABEL_NAME, "description": LABEL_DESCRIPTION},
    )
    bind.execute(
        sa.text(
            "INSERT INTO access_mode_label (system_id, mode_id, label_id, created_at) "
            "SELECT gen_random_uuid(), m.system_id, l.system_id, now() "
            "FROM access_mode m, content_label l "
            "WHERE m.key = 'unrestricted' AND l.key = :key "
            "AND NOT EXISTS (SELECT 1 FROM access_mode_label x "
            "WHERE x.mode_id = m.system_id AND x.label_id = l.system_id)"
        ),
        {"key": LABEL_KEY},
    )


def downgrade() -> None:
    """
    Take the type out whole. The h-game entries go first, through `media`,
    so everything hanging off an entry by foreign key goes with them - list
    rows, credits, tags, sources, labels, notes, quotes, plans and purchase
    records. The rows that name the type by a plain string are deleted by
    hand: castings, every scope naming h-game, and the highlights notes. The
    game_copy FK goes back to `games` once no copy points anywhere else.
    """
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM character_casting WHERE media_type = 'h-game'")
    )
    bind.execute(sa.text("DELETE FROM media WHERE media_type = 'h-game'"))
    bind.execute(sa.text("DELETE FROM person_role WHERE scope = 'h-game'"))
    bind.execute(sa.text("DELETE FROM publisher_scope WHERE scope = 'h-game'"))
    bind.execute(
        sa.text("DELETE FROM system_option_scope WHERE scope = 'h-game'")
    )
    bind.execute(sa.text("DELETE FROM note WHERE section = 'h_game_highlights'"))
    bind.execute(
        sa.text("DELETE FROM content_label WHERE key = :key"), {"key": LABEL_KEY}
    )

    # Any copy left pointing at something other than a game would fail the
    # FK below; after the delete above there should be none.
    bind.execute(
        sa.text(
            "DELETE FROM game_copy WHERE game_id NOT IN (SELECT system_id FROM games)"
        )
    )
    _drop_game_copy_fk()
    op.create_foreign_key(
        GAME_COPY_FK,
        "game_copy",
        "games",
        ["game_id"],
        ["system_id"],
        ondelete="CASCADE",
    )

    op.execute("DROP TRIGGER IF EXISTS trg_h_game_delete_media ON h_game")
    op.drop_index(op.f("ix_h_game_system_id"), table_name="h_game")
    op.drop_table("h_game")
    op.execute(DropSequence(sa.Sequence("h_game_public_id_seq")))
