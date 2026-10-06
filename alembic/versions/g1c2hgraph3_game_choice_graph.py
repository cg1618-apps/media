"""game_choice_node, game_choice_edge, game_choice_mark: the game choice graph

One shared graph per game - points (start, choice, scene, ending) and the
options between them - written by catalogue admins, plus one personal table
where each user marks a point or an option done and keeps a note on it.

All three hang off `media.system_id`, as `game_copy` does, so one set of
tables covers game and h-game. Branches may rejoin and the graph may cycle;
only a self-loop is refused. Deleting a node takes its edges and every mark on
it; deleting an edge takes its marks.

Revision ID: g1c2hgraph3
Revises: a1l2onegrp3
Create Date: 2026-10-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "g1c2hgraph3"
down_revision: Union[str, Sequence[str], None] = "a1l2onegrp3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_choice_node",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("sort_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["game_id"], ["media.system_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "kind IN ('start', 'choice', 'scene', 'ending')",
            name="ck_game_choice_node_kind",
        ),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_game_choice_node_title"),
    )
    op.create_index(
        "ix_game_choice_node_system_id", "game_choice_node", ["system_id"]
    )
    op.create_index("ix_game_choice_node_game", "game_choice_node", ["game_id"])

    op.create_table(
        "game_choice_edge",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("option", sa.Text(), nullable=True),
        sa.Column("sort_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["game_id"], ["media.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["from_node_id"], ["game_choice_node.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["to_node_id"], ["game_choice_node.system_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "from_node_id <> to_node_id", name="ck_game_choice_edge_no_self"
        ),
    )
    op.create_index(
        "ix_game_choice_edge_system_id", "game_choice_edge", ["system_id"]
    )
    op.create_index("ix_game_choice_edge_game", "game_choice_edge", ["game_id"])
    op.create_index("ix_game_choice_edge_from", "game_choice_edge", ["from_node_id"])
    op.create_index("ix_game_choice_edge_to", "game_choice_edge", ["to_node_id"])

    op.create_table(
        "game_choice_mark",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("edge_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("done", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["game_id"], ["media.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["node_id"], ["game_choice_node.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["edge_id"], ["game_choice_edge.system_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "(node_id IS NULL) <> (edge_id IS NULL)",
            name="ck_game_choice_mark_one_target",
        ),
    )
    op.create_index(
        "ix_game_choice_mark_system_id", "game_choice_mark", ["system_id"]
    )
    op.create_index(
        "uq_game_choice_mark_node",
        "game_choice_mark",
        ["user_id", "node_id"],
        unique=True,
        postgresql_where=sa.text("node_id IS NOT NULL"),
    )
    op.create_index(
        "uq_game_choice_mark_edge",
        "game_choice_mark",
        ["user_id", "edge_id"],
        unique=True,
        postgresql_where=sa.text("edge_id IS NOT NULL"),
    )
    op.create_index(
        "ix_game_choice_mark_game_user", "game_choice_mark", ["game_id", "user_id"]
    )


def downgrade() -> None:
    op.drop_table("game_choice_mark")
    op.drop_table("game_choice_edge")
    op.drop_table("game_choice_node")
