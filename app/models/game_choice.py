"""Game choice graph ORM models - the blocks, branches and personal marks of one game's branching story."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now

# The three kinds of block. Validated by the CHECK below and by the router, so
# a Pull cannot write a kind the editor would refuse.
NODE_KINDS: tuple[str, ...] = ("start", "part", "ending")

# The two kinds of branch - the player picks, or the game decides - and the
# plain link, which carries no text and always leads somewhere.
BRANCH_KINDS: tuple[str, ...] = ("choice", "condition")
LINK_KIND = "link"
EDGE_KINDS: tuple[str, ...] = (*BRANCH_KINDS, LINK_KIND)


class GameChoiceNode(Base):
    """
    One block of a game's choice graph - a part of the story: the start, a
    part, or an ending.

    One shared graph per game, written by catalogue admins. game_id is a real
    foreign key onto `media.system_id`, as `game_copy`'s is, so one table
    covers game and h-game alike. Positions are not stored: the page lays the
    graph out from the rows, and `sort_index` only orders blocks within a
    layer.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "game_choice_node"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('start', 'part', 'ending')",
            name="ck_game_choice_node_kind",
        ),
        CheckConstraint(
            "btrim(title) <> ''", name="ck_game_choice_node_title"
        ),
        Index("ix_game_choice_node_game", "game_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    # The block's shared description.
    content = Column(Text, nullable=True)
    sort_index = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class GameChoiceEdge(Base):
    """
    One edge out of a block: a BRANCH or a LINK.

    A branch is a `choice` (the player picks) or a `condition` (the game
    decides - a roll, an earlier decision, affection >= 5). It has a title and
    may carry a shared description; it exists before it leads anywhere
    (to_node_id NULL) and then leads to exactly one block, which may be the
    block it hangs from ("ask again"). Deleting the block it leads to leaves
    the branch leading nowhere again (ON DELETE SET NULL).

    A link joins one block straight to another: no title, no description, and
    always a target other than its own block. The router deletes the links
    into a block before deleting it, since SET NULL would leave one that the
    CHECK refuses.

    Branches may rejoin and the graph may cycle. game_id is denormalised so a
    whole graph is one indexed query per table; a CHECK cannot see across
    rows, so the router refuses an edge whose nodes belong to another game.

    Column order is the Sheets column order, as on the node.
    """

    __tablename__ = "game_choice_edge"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('choice', 'condition', 'link')",
            name="ck_game_choice_edge_kind",
        ),
        CheckConstraint(
            "kind <> 'link' OR "
            "(to_node_id IS NOT NULL AND title IS NULL AND content IS NULL)",
            name="ck_game_choice_edge_link",
        ),
        CheckConstraint(
            "kind = 'link' OR (title IS NOT NULL AND btrim(title) <> '')",
            name="ck_game_choice_edge_branch_title",
        ),
        CheckConstraint(
            "kind <> 'link' OR to_node_id <> from_node_id",
            name="ck_game_choice_edge_no_self",
        ),
        Index("ix_game_choice_edge_game", "game_id"),
        Index("ix_game_choice_edge_from", "from_node_id"),
        Index("ix_game_choice_edge_to", "to_node_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    kind = Column(String, nullable=False)
    from_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_node.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL: a branch that leads nowhere yet. Never NULL on a link.
    to_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_node.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    # A branch's text; NULL on a link.
    title = Column(Text, nullable=True)
    # A branch's shared description; NULL on a link.
    content = Column(Text, nullable=True)
    # The order of the edges out of one block.
    sort_index = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class GameChoiceMark(Base):
    """
    One person's mark on one block or one edge: whether they have done it,
    and a note of their own.

    Personal, unlike the graph it marks: each user holds their own row, and a
    read returns only the viewer's. Exactly one of node_id / edge_id is set,
    and a user holds at most one mark per node and per edge (the two partial
    unique indexes). Deleting the node or edge takes its marks with it.
    game_id is denormalised, as on the edge, so a graph's marks are one query.
    """

    __tablename__ = "game_choice_mark"
    __table_args__ = (
        CheckConstraint(
            "(node_id IS NULL) <> (edge_id IS NULL)",
            name="ck_game_choice_mark_one_target",
        ),
        Index(
            "uq_game_choice_mark_node",
            "user_id",
            "node_id",
            unique=True,
            postgresql_where=text("node_id IS NOT NULL"),
        ),
        Index(
            "uq_game_choice_mark_edge",
            "user_id",
            "edge_id",
            unique=True,
            postgresql_where=text("edge_id IS NOT NULL"),
        ),
        Index("ix_game_choice_mark_game_user", "game_id", "user_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_node.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    edge_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_edge.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    done = Column(Boolean, nullable=False, default=False, server_default="false")
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
