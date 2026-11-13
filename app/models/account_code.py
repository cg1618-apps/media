"""
One-time codes behind the account links: reset links and invite links.

The code itself is never stored. It is 32 random bytes
(`secrets.token_urlsafe(32)`), handed out once inside a link, and only its
SHA-256 is kept. A fast hash is the standard choice for a high-entropy token -
there is nothing to brute-force - and it lets a row be found BY its hash;
bcrypt is for low-entropy passwords. The functions that mint and spend codes
are in app/services/domain/account_codes.py.
"""

import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AccountCode(Base):
    """A one-time code: what it is for, whose it is, and whether it is spent."""

    __tablename__ = "account_code"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('invite', 'reset')", name="ck_account_code_purpose"
        ),
        # A reset link resets SOMEBODY. An invite names nobody until it is
        # spent and creates the account.
        CheckConstraint(
            "purpose <> 'reset' OR user_id IS NOT NULL",
            name="ck_account_code_reset_has_user",
        ),
    )

    system_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purpose = Column(String, nullable=False)
    # SHA-256 hex of the code. Unique, and the column a code is looked up by.
    code_hash = Column(String, nullable=False, unique=True)
    # The account a reset link resets. Deleting the account takes its codes
    # with it - a code for an account that no longer exists is unknown, which
    # is refused the same way a spent one is.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_account_code_user"),
        nullable=True,
        index=True,
    )
    # Who issued it. Null from the CLI on the box, which acts as nobody.
    created_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="SET NULL", name="fk_account_code_created_by"
        ),
        nullable=True,
    )
    # The account an invite created, once it is spent. Its own column rather
    # than user_id because the two need opposite deletion rules: a reset code
    # goes with its account (CASCADE), while a declined registration must
    # leave its invite recorded as spent (SET NULL), so the link cannot be
    # used again.
    created_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="SET NULL", name="fk_account_code_created_user"
        ),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    # Null until spent. Spent and expired rows are kept: they are tiny, and an
    # invite must stay spent.
    spent_at = Column(DateTime(timezone=True), nullable=True)
