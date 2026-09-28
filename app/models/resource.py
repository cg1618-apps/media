"""ResourceNode ORM model - one group or one item on the site-wide Resources page."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class ResourceNode(Base):
    """
    One node of the Resources page: a group, or an item inside one.

    The page is a single tree shared by the whole site - no owner, no author,
    no per-user copy. A `group` has a name and holds other nodes; an `item`
    holds a Markdown body (a link, plain text, or text with inline links) and
    optionally a heading. Groups nest to any depth, and groups and items share
    one ordering inside their parent, so the page is one table rather than a
    group table and an item table whose orders would have to be merged.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "resource_node"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The group this node sits in; NULL is the top level. CASCADE so deleting
    # a group takes its whole subtree rather than orphaning it at the root.
    #
    # DEFERRABLE INITIALLY DEFERRED because Pull restores the Resources tab
    # row by row in whatever order the sheet holds them and commits once per
    # tab: a child row that precedes its parent is only valid once the parent
    # lands, and a deferred check waits for the commit to decide.
    #
    # That the parent is a GROUP, and that a node is not its own ancestor, are
    # rules a CHECK cannot express - they read another row - so the router
    # enforces both (app/routers/resources.py).
    parent_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "resource_node.system_id",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        nullable=True,
        index=True,
    )
    # `group` or `item`. Fixed at creation: the API offers no way to change it.
    kind = Column(String, nullable=False)
    # A group's name (required), or an item's optional heading.
    title = Column(String, nullable=True)
    # An item's Markdown body (required). Always NULL on a group.
    content = Column(Text, nullable=True)
    # Order among the siblings of one parent, groups and items interleaved.
    sort_index = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        CheckConstraint("kind IN ('group', 'item')", name="ck_resource_node_kind"),
        CheckConstraint(
            "kind <> 'group' OR (title IS NOT NULL AND btrim(title) <> '' "
            "AND content IS NULL)",
            name="ck_resource_node_group_shape",
        ),
        CheckConstraint(
            "kind <> 'item' OR (content IS NOT NULL AND btrim(content) <> '')",
            name="ck_resource_node_item_shape",
        ),
    )
