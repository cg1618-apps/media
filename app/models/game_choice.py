"""Game choice graph ORM models - the points, options and personal marks of one game's branching story."""

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

# The four kinds of point. Validated by the CHECK below and by the router, so a
# Pull cannot write a kind the editor would refuse.
NODE_KINDS: tuple[str, ...] = ("start", "choice", "scene", "ending")


class GameChoiceNode(Base):
    """
    One point of a game's choice graph: a start, a choice, a scene or an
    ending.

    One shared graph per game, written by catalogue admins. game_id is a real
    foreign key onto `media.system_id`, as `game_copy`'s is, so one table
    covers game and h-game alike. Positions are not stored: the page lays the
    graph out from the rows, and `sort_index` only orders points within a
    layer.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "game_choice_node"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('start', 'choice', 'scene', 'ending')",
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
    # A free note on the point.
    content = Column(Text, nullable=True)
    sort_index = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class GameChoiceEdge(Base):
    """
    One option of a game's choice graph: an arrow from one point to another,
    carrying the option's text. A NULL option reads "continues to".

    Branches may rejoin and the graph may cycle (a hub you return to); only a
    self-loop is refused, here and in the router. game_id is denormalised so a
    whole graph is one indexed query per table; a CHECK cannot see across
    rows, so the router refuses an edge whose two nodes belong to another game.
    """

    __tablename__ = "game_choice_edge"
    __table_args__ = (
        CheckConstraint(
            "from_node_id <> to_node_id", name="ck_game_choice_edge_no_self"
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
    from_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_node.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    to_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_choice_node.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    option = Column(Text, nullable=True)
    # The order of the options out of one node.
    sort_index = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class GameChoiceMark(Base):
    """
    One person's mark on one point or one option: whether they have done it,
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
