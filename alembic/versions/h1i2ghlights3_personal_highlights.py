"""Highlights per account; the highlight group order per account; no view.personal

The six highlight sections - highlights, highlight_episodes,
highlight_passages, highlight_moments, h_comic_highlights, h_game_highlights -
are somebody's opinion of the work, so each account keeps its own: they
become personal note sections (app/utils/note_sections.py, a registry edit).
The order of an h-comic's or h-game's highlight groups goes with them. And
`view.personal`, which only ever withheld two of those sections from guests,
has nothing left to open.

What this revision does:

  user_highlight_group_order
          created: user_id (users, CASCADE), media_id (media, CASCADE), each
          indexed; group_order JSONB NOT NULL; timestamps. UNIQUE (user_id,
          media_id).
  data    every non-null h_comic / h_game.highlight_group_order that is a
          non-empty JSON array becomes the installation owner's row for that
          entry. Every note row of the six sections is re-authored to the
          installation owner, so the rows stay readable by the one account
          they were written for. The owner is OWNER below - a frozen rule,
          not an import: the flag holder whatever its status, else the first
          ACTIVE account by username whose role is none of admin, guest and
          shared. It reads role.name and never role.is_root. When there is
          something to move and no such account, the revision raises rather
          than guess.
  grants  every role_permission row for 'view.personal' is deleted.
  drops   h_comic.highlight_group_order and h_game.highlight_group_order.

Downgrade re-adds the two columns (nullable JSONB, as the baseline had them),
copies the installation owner's orders back onto them and drops
user_highlight_group_order. **Every other account's group orders are lost on
downgrade**: the old shape has room for one. Highlight rows are left with
whoever authors them now - the six sections are catalogue again in the older
code, so another account's highlights become rows every viewer of the entry
reads. The view.personal grants are not restored: which roles held it is not
recorded anywhere, and an admin re-grants it on Roles. Not marked
irreversible - the owner's orders and every highlight row come back.

Revision ID: h1i2ghlights3
Revises: u1r2atings3
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h1i2ghlights3"
down_revision: Union[str, Sequence[str], None] = "u1r2atings3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration must keep meaning what it meant
# when it ran.
HIGHLIGHT_SECTIONS = (
    "highlights",
    "highlight_episodes",
    "highlight_passages",
    "highlight_moments",
    "h_comic_highlights",
    "h_game_highlights",
)
ORDER_TABLES = ("h_comic", "h_game")
VIEW_PERSONAL = "view.personal"

# u1r2atings3's rule, copied: the flag holder wins outright; failing that,
# the first account by username that is active and is not administrative, a
# guest or a shared account. role.name, not role.is_root, and 'active' a
# literal, for the reasons given there.
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

# An order worth keeping: a JSON array with something in it. The write paths
# never stored anything else, but a restored cell is checked, not trusted.
_HAS_ORDER = (
    "highlight_group_order IS NOT NULL "
    "AND jsonb_typeof(highlight_group_order) = 'array' "
    "AND jsonb_array_length(highlight_group_order) > 0"
)


def _sections_sql() -> str:
    return ", ".join(f"'{s}'" for s in HIGHLIGHT_SECTIONS)


def installation_owner(conn):
    return conn.execute(sa.text(OWNER)).scalar()


def personal_value_count(conn) -> int:
    """How many group orders and highlight rows there are to move."""
    total = conn.execute(
        sa.text(f"SELECT count(*) FROM note WHERE section IN ({_sections_sql()})")
    ).scalar()
    for table in ORDER_TABLES:
        total += conn.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE {_HAS_ORDER}")
        ).scalar()
    return total


def move_to_owner(conn) -> None:
    """The group orders and the highlight rows, as the installation owner's."""
    if personal_value_count(conn) == 0:
        return
    owner = installation_owner(conn)
    if owner is None:
        raise RuntimeError(
            "h1i2ghlights3: highlight notes or highlight group orders exist "
            "but no account can own them - none holds is_installation_owner "
            "and every other account is on the admin, guest or shared role "
            "or is not active. Create the owner's account (or set the flag on "
            "one) and run it again."
        )
    for table in ORDER_TABLES:
        conn.execute(
            sa.text(
                f"""
                INSERT INTO user_highlight_group_order
                    (system_id, user_id, media_id, group_order,
                     created_at, updated_at)
                SELECT gen_random_uuid(), :owner, t.system_id,
                       t.highlight_group_order, {TAIPEI_NOW}, {TAIPEI_NOW}
                  FROM {table} t
                 WHERE {_HAS_ORDER}
                """
            ),
            {"owner": owner},
        )
    conn.execute(
        sa.text(
            f"UPDATE note SET author_id = :owner "
            f"WHERE section IN ({_sections_sql()})"
        ),
        {"owner": owner},
    )


def drop_view_personal(conn) -> None:
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE permission = :p"),
        {"p": VIEW_PERSONAL},
    )


def add_old_columns(conn) -> None:
    for table in ORDER_TABLES:
        conn.execute(
            sa.text(f"ALTER TABLE {table} ADD COLUMN highlight_group_order JSONB")
        )


def drop_old_columns(conn) -> None:
    for table in ORDER_TABLES:
        conn.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN highlight_group_order"))


def copy_back_to_columns(conn) -> None:
    """The installation owner's orders, back onto the re-added columns."""
    owner = installation_owner(conn)
    if owner is None:
        return
    for table in ORDER_TABLES:
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} AS t
                   SET highlight_group_order = o.group_order
                  FROM user_highlight_group_order o
                 WHERE o.user_id = :owner AND o.media_id = t.system_id
                """
            ),
            {"owner": owner},
        )


def upgrade() -> None:
    op.create_table(
        "user_highlight_group_order",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "group_order", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["media_id"], ["media.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "user_id", "media_id", name="uq_user_highlight_group_order"
        ),
    )
    for column in ("system_id", "user_id", "media_id"):
        op.create_index(
            op.f(f"ix_user_highlight_group_order_{column}"),
            "user_highlight_group_order",
            [column],
            unique=False,
        )

    conn = op.get_bind()
    move_to_owner(conn)
    drop_view_personal(conn)
    drop_old_columns(conn)


def downgrade() -> None:
    conn = op.get_bind()
    add_old_columns(conn)
    copy_back_to_columns(conn)
    for column in ("media_id", "user_id", "system_id"):
        op.drop_index(
            op.f(f"ix_user_highlight_group_order_{column}"),
            table_name="user_highlight_group_order",
        )
    op.drop_table("user_highlight_group_order")
