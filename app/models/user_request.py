"""A request or report a member files, and the inbox that handles it."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.utils.constants import REQUEST_KINDS, REQUEST_STATUS_OPEN, REQUEST_STATUSES


def _one_of(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class UserRequest(Base):
    """
    One request or report: a missing entry, wrong or incomplete data, a bug,
    or anything else.

    Named `user_request` rather than `request` because fastapi.Request is
    imported across the routers.

    The target is the FK-less (type, id) pair app/utils/media_resolver.py
    resolves - an entry, a grouping tier or an entity, from
    REQUEST_TARGET_TABLES - and its name is copied into `target_label` when
    the request is filed, so a request whose entry was later deleted still
    says what it was about.

    Both account references are SET NULL. A deleted account's requests stay
    in the inbox, shown as from a deleted account; nothing is removed
    automatically.
    """

    __tablename__ = "user_request"
    __table_args__ = (
        CheckConstraint(_one_of("kind", REQUEST_KINDS), name="ck_user_request_kind"),
        CheckConstraint(
            _one_of("status", REQUEST_STATUSES), name="ck_user_request_status"
        ),
        CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="ck_user_request_target_pair",
        ),
        # The limit count and My requests read one author's rows by status;
        # the inbox reads one status, newest first.
        Index("ix_user_request_author_status", "author_id", "status"),
        Index("ix_user_request_status_created", "status", "created_at"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="fk_user_request_author"),
        nullable=True,
    )
    kind = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(UUID(as_uuid=True), nullable=True)
    target_label = Column(String, nullable=True)
    # The SPA path the request was filed from - a bug report's page address.
    page_path = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    remark = Column(Text, nullable=True)
    status = Column(
        String,
        nullable=False,
        default=REQUEST_STATUS_OPEN,
        server_default=REQUEST_STATUS_OPEN,
    )
    # The handler's remark when marking the request done or declined.
    response = Column(Text, nullable=True)
    handled_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="SET NULL", name="fk_user_request_handled_by"
        ),
        nullable=True,
    )
    handled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
