"""
Access modes: which objects a session may reach.

The role axis answers "what kinds of operation may this account perform".
This axis answers "which objects can those operations reach", and the two are
deliberately disjoint. What a mode shows - its content labels and field
groups - is derived in code from its key's place in seed_modes.MODE_ORDER and
is not stored, so there is nowhere a mode could be given `manage.catalog` or
`admin.authz`, and nowhere an edit could make two databases disagree.

An account holds one role and a mode CEILING (users.mode_ceiling): it may use
every mode ranked at or below it in seed_modes.MODE_ORDER, and exactly one is
active per session. Per-account denials SUBTRACT from whichever mode is active
and can never add to it, so the ceiling on the user list is a trustworthy
upper bound.
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class AccessMode(Base):
    """One named ceiling on what a session may reach."""

    __tablename__ = "access_mode"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    key = Column(String, nullable=False, unique=True, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # UI ordering only. The order enforcement uses is seed_modes.MODE_ORDER,
    # defined on the four keys in code - this column is editable and is not
    # it. The widening test for a mode switch is a set comparison, not a ">".
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    is_system = Column(Boolean, nullable=False, default=False, server_default="false")
    # There is deliberately no column for "what a logged-out visitor gets".
    # That is the `safe` mode, always, resolved by key in
    # services/rbac/modes.py - see resolve_mode for why it is not data.
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class UserAccessModeDenial(Base):
    """
    One item this account does NOT get, in any mode it uses.

    Subtraction only. There is no "grant" counterpart and there must not be
    one: the ceiling is an upper bound, so an account's reach is always a
    subset of its active mode's, and widening a mode later reaches everyone not
    explicitly narrowed. To let one person reach MORE, raise the ceiling and
    deny the specifics.

    Hangs off the ACCOUNT, so a denial applies in every mode it switches to.
    Only something the ceiling shows can be denied; set_mode_ceiling deletes
    the denials a lowered ceiling no longer shows.
    """

    __tablename__ = "user_access_mode_denial"
    __table_args__ = (
        # Mirrors the constraint already on note's four owner columns.
        CheckConstraint(
            "(label_id IS NOT NULL)::int + (field_group_key IS NOT NULL)::int = 1",
            name="ck_denial_names_one_thing",
        ),
        UniqueConstraint("user_id", "label_id", name="uq_denial_label"),
        UniqueConstraint("user_id", "field_group_key", name="uq_denial_field_group"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label_id = Column(
        UUID(as_uuid=True),
        ForeignKey("content_label.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    field_group_key = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
