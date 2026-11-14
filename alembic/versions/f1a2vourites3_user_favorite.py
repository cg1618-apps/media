"""Favourite quotes and memes per account

Whether a quote or a meme is a favourite is an opinion, so each account keeps
its own. It was an `is_favorite` column on the shared rows - one person's
choice, shown to everybody.

What this revision does:

  user_favorite
          created: user_id (users, CASCADE), quote_id (quote, CASCADE),
          meme_id (meme, CASCADE), each indexed, timestamps. CHECK exactly
          one of quote_id and meme_id; UNIQUE (user_id, quote_id) and
          UNIQUE (user_id, meme_id).
  data    every quote and meme whose is_favorite is true becomes a
          user_favorite row for the installation owner. The owner is OWNER
          below - a frozen rule, not an import, the same one u1r2atings3
          uses: the flag holder whatever its status, else the first ACTIVE
          account by username whose role is none of admin, guest and shared.
          It reads role.name and never role.is_root. When there is a
          favourite to move and no such account, the revision raises rather
          than guess.
  drops   quote.is_favorite and meme.is_favorite.

Downgrade re-adds both columns as the baseline had them (nullable boolean, no
server default), sets them true for the installation owner's favourites and
drops user_favorite. **Every other account's favourites are lost on
downgrade**: the old shape has room for one person's. Not marked
irreversible - the owner's favourites, which is all the old schema could
hold, come back whole.

Revision ID: f1a2vourites3
Revises: m1i2xedrows3
Create Date: 2026-11-14 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2vourites3"
down_revision: Union[str, Sequence[str], None] = "m1i2xedrows3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration must keep meaning what it meant
# when it ran.
#
# (table, user_favorite column naming it)
FAVORITE_TABLES = (
    ("quote", "quote_id"),
    ("meme", "meme_id"),
)

# Whose rows the moved favourites become - u1r2atings3's rule, copied. The
# flag holder wins outright; failing that, the first account by username that
# is active and is not administrative, a guest or a shared account.
OWNER = """
SELECT u.id
  FROM users u
  JOIN role r ON r.system_id = u.role_id
 WHERE u.is_installation_owner
    OR (r.name NOT IN ('admin', 'guest', 'shared') AND u.status = 'active')
 ORDER BY u.is_installation_owner DESC, u.username
 LIMIT 1
"""

TAIPEI_NOW = "(now() AT TIME ZONE 'Asia/Taipei')"


def installation_owner(conn):
    return conn.execute(sa.text(OWNER)).scalar()


def favorite_count(conn) -> int:
    """How many rows the old columns mark as a favourite."""
    return sum(
        conn.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE is_favorite")
        ).scalar()
        for table, _column in FAVORITE_TABLES
    )


def copy_to_owner(conn) -> None:
    """The old columns' favourites, as the installation owner's rows."""
    if favorite_count(conn) == 0:
        return
    owner = installation_owner(conn)
    if owner is None:
        raise RuntimeError(
            "f1a2vourites3: favourite quotes or memes exist but no account "
            "can own them - none holds is_installation_owner and every other "
            "account is on the admin, guest or shared role or is not active. "
            "Create the owner's account (or set the flag on one) and run it "
            "again."
        )
    for table, column in FAVORITE_TABLES:
        conn.execute(
            sa.text(
                f"""
                INSERT INTO user_favorite
                    (system_id, user_id, {column}, created_at, updated_at)
                SELECT gen_random_uuid(), :owner, t.system_id,
                       {TAIPEI_NOW}, {TAIPEI_NOW}
                  FROM {table} t
                 WHERE t.is_favorite
                """
            ),
            {"owner": owner},
        )


def copy_back_to_columns(conn) -> None:
    """The installation owner's favourites, back onto the re-added columns."""
    owner = installation_owner(conn)
    if owner is None:
        return
    for table, column in FAVORITE_TABLES:
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} AS t
                   SET is_favorite = true
                  FROM user_favorite f
                 WHERE f.user_id = :owner AND f.{column} = t.system_id
                """
            ),
            {"owner": owner},
        )


def add_old_columns(conn) -> None:
    for table, _column in FAVORITE_TABLES:
        conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN is_favorite BOOLEAN"))


def drop_old_columns(conn) -> None:
    for table, _column in FAVORITE_TABLES:
        conn.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN is_favorite"))


def upgrade() -> None:
    op.create_table(
        "user_favorite",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("meme_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(quote_id, meme_id) = 1",
            name="ck_user_favorite_one_item",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quote_id"], ["quote.system_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meme_id"], ["meme.system_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("user_id", "quote_id", name="uq_user_favorite_quote"),
        sa.UniqueConstraint("user_id", "meme_id", name="uq_user_favorite_meme"),
    )
    for column in ("system_id", "user_id", "quote_id", "meme_id"):
        op.create_index(
            op.f(f"ix_user_favorite_{column}"), "user_favorite", [column], unique=False
        )

    conn = op.get_bind()
    copy_to_owner(conn)
    drop_old_columns(conn)


def downgrade() -> None:
    conn = op.get_bind()
    add_old_columns(conn)
    copy_back_to_columns(conn)
    for column in ("system_id", "user_id", "quote_id", "meme_id"):
        op.drop_index(op.f(f"ix_user_favorite_{column}"), table_name="user_favorite")
    op.drop_table("user_favorite")
