"""Ratings and expectations per account; a novel unit's remark per reader

A rating of a collection, franchise, series, character, person, studio or
publisher, and the expectation of the three tiers, are opinions, so each
account keeps its own. They were columns on the shared rows - one person's
view, shown to everybody. A novel unit's remark was the same thing one level
down, and it moves beside the unit rating that already is per reader.

What this revision does:

  user_rating
          created: user_id (users, CASCADE), one owner FK per table
          (collection_id, franchise_id, series_id, character_id, person_id,
          studio_id, publisher_id, each CASCADE and indexed), my_rating,
          expectation, timestamps. CHECK exactly one owner; CHECK an
          expectation only on a tier; UNIQUE (user_id, the seven) NULLS NOT
          DISTINCT.
  user_novel_unit_rating
          gains `remark` (text).
  data    every non-null my_rating and *_expectation becomes a user_rating
          row for the installation owner, and every non-null novel_unit.remark
          lands on the owner's unit-rating row for that unit, an existing row
          kept and a missing one inserted. The owner is OWNER below - a
          frozen rule, not an import: the flag holder, else the first ACTIVE
          account by username whose role is none of admin, guest and shared.
          It reads role.name and never role.is_root, and a pending or
          disabled account never receives the owner's data. When there is something to move
          and no such account, the revision raises rather than guess.
  drops   my_rating from the seven tables, collection_expectation,
          franchise_expectation, series_expectation, and novel_unit.remark.

Downgrade re-adds the columns as the baseline had them (nullable varchar, no
server default - the old "Low" expectation default was the ORM's, not the
database's), copies the installation owner's values back onto them, drops
`remark` from user_novel_unit_rating (deleting the rows that then hold no
rating) and drops user_rating. **Every other account's ratings,
expectations and unit remarks are lost on downgrade**: the old shape has room
for one person's. Not marked irreversible - the owner's data, which is all
the old schema could hold, comes back whole.

Revision ID: u1r2atings3
Revises: s1w2itches345
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "u1r2atings3"
down_revision: Union[str, Sequence[str], None] = "s1w2itches345"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration must keep meaning what it meant
# when it ran.
#
# (table, owner column on user_rating, expectation column or None)
RATED_TABLES = (
    ("collection", "collection_id", "collection_expectation"),
    ("franchise", "franchise_id", "franchise_expectation"),
    ("series", "series_id", "series_expectation"),
    ("character", "character_id", None),
    ("person", "person_id", None),
    ("studio", "studio_id", None),
    ("publisher", "publisher_id", None),
)
OWNER_COLUMNS = tuple(column for _table, column, _exp in RATED_TABLES)

# Whose rows the moved values become. The flag holder wins outright; failing
# that, the first account by username that is active and is not
# administrative, a guest or a shared account. role.name, not role.is_root: a
# later revision drops that column, and this must still run after it. 'active'
# is a literal for the same reason: a frozen copy of users.status's vocabulary,
# so a pending registrant or a disabled account is never handed the data.
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


def _quoted(table: str) -> str:
    # "character" is not reserved in Postgres, but quoting every name costs
    # nothing and keeps one spelling.
    return f'"{table}"'


def installation_owner(conn):
    return conn.execute(sa.text(OWNER)).scalar()


def personal_value_count(conn) -> int:
    """How many non-null values the old columns hold."""
    total = 0
    for table, _column, expectation in RATED_TABLES:
        condition = "my_rating IS NOT NULL"
        if expectation:
            condition += f" OR {expectation} IS NOT NULL"
        total += conn.execute(
            sa.text(f"SELECT count(*) FROM {_quoted(table)} WHERE {condition}")
        ).scalar()
    total += conn.execute(
        sa.text("SELECT count(*) FROM novel_unit WHERE remark IS NOT NULL")
    ).scalar()
    return total


def copy_to_owner(conn) -> None:
    """The old columns' values, as the installation owner's rows."""
    if personal_value_count(conn) == 0:
        return
    owner = installation_owner(conn)
    if owner is None:
        raise RuntimeError(
            "u1r2atings3: ratings, expectations or novel unit remarks exist "
            "but no account can own them - none holds is_installation_owner "
            "and every other account is on the admin, guest or shared role "
            "or is not active. Create the owner's account (or set the flag on "
            "one) and run it again."
        )
    for table, column, expectation in RATED_TABLES:
        exp_value = f"t.{expectation}" if expectation else "NULL"
        condition = "t.my_rating IS NOT NULL"
        if expectation:
            condition += f" OR t.{expectation} IS NOT NULL"
        conn.execute(
            sa.text(
                f"""
                INSERT INTO user_rating
                    (system_id, user_id, {column}, my_rating, expectation,
                     created_at, updated_at)
                SELECT gen_random_uuid(), :owner, t.system_id, t.my_rating,
                       {exp_value},
                       {TAIPEI_NOW}, {TAIPEI_NOW}
                  FROM {_quoted(table)} t
                 WHERE {condition}
                """
            ),
            {"owner": owner},
        )
    conn.execute(
        sa.text(
            f"""
            INSERT INTO user_novel_unit_rating
                (system_id, user_id, unit_id, remark, created_at, updated_at)
            SELECT gen_random_uuid(), :owner, n.system_id, n.remark,
                   {TAIPEI_NOW}, {TAIPEI_NOW}
              FROM novel_unit n
             WHERE n.remark IS NOT NULL
            ON CONFLICT ON CONSTRAINT uq_user_novel_unit
            DO UPDATE SET remark = EXCLUDED.remark
            """
        ),
        {"owner": owner},
    )


def copy_back_to_columns(conn) -> None:
    """The installation owner's rows, back onto the re-added columns."""
    owner = installation_owner(conn)
    if owner is None:
        return
    for table, column, expectation in RATED_TABLES:
        assignments = "my_rating = r.my_rating"
        if expectation:
            assignments += f", {expectation} = r.expectation"
        conn.execute(
            sa.text(
                f"""
                UPDATE {_quoted(table)} AS t
                   SET {assignments}
                  FROM user_rating r
                 WHERE r.user_id = :owner AND r.{column} = t.system_id
                """
            ),
            {"owner": owner},
        )
    conn.execute(
        sa.text(
            """
            UPDATE novel_unit AS n
               SET remark = r.remark
              FROM user_novel_unit_rating r
             WHERE r.user_id = :owner AND r.unit_id = n.system_id
            """
        ),
        {"owner": owner},
    )


def add_old_columns(conn) -> None:
    for table, _column, expectation in RATED_TABLES:
        conn.execute(
            sa.text(f"ALTER TABLE {_quoted(table)} ADD COLUMN my_rating VARCHAR")
        )
        if expectation:
            conn.execute(
                sa.text(
                    f"ALTER TABLE {_quoted(table)} ADD COLUMN {expectation} VARCHAR"
                )
            )
    conn.execute(sa.text("ALTER TABLE novel_unit ADD COLUMN remark VARCHAR"))


def drop_old_columns(conn) -> None:
    for table, _column, expectation in RATED_TABLES:
        conn.execute(sa.text(f"ALTER TABLE {_quoted(table)} DROP COLUMN my_rating"))
        if expectation:
            conn.execute(
                sa.text(f"ALTER TABLE {_quoted(table)} DROP COLUMN {expectation}")
            )
    conn.execute(sa.text("ALTER TABLE novel_unit DROP COLUMN remark"))


def upgrade() -> None:
    owner_fks = [
        sa.Column(column, postgresql.UUID(as_uuid=True), nullable=True)
        for column in OWNER_COLUMNS
    ]
    op.create_table(
        "user_rating",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        *owner_fks,
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("expectation", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(" + ", ".join(OWNER_COLUMNS) + ") = 1",
            name="ck_user_rating_one_owner",
        ),
        sa.CheckConstraint(
            "expectation IS NULL OR "
            "num_nonnulls(collection_id, franchise_id, series_id) = 1",
            name="ck_user_rating_expectation_on_tier",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        *[
            sa.ForeignKeyConstraint([column], [f"{table}.system_id"], ondelete="CASCADE")
            for table, column, _exp in RATED_TABLES
        ],
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "user_id",
            *OWNER_COLUMNS,
            name="uq_user_rating_owner",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index(
        op.f("ix_user_rating_system_id"), "user_rating", ["system_id"], unique=False
    )
    op.create_index(
        op.f("ix_user_rating_user_id"), "user_rating", ["user_id"], unique=False
    )
    for column in OWNER_COLUMNS:
        op.create_index(
            op.f(f"ix_user_rating_{column}"), "user_rating", [column], unique=False
        )
    op.add_column(
        "user_novel_unit_rating", sa.Column("remark", sa.Text(), nullable=True)
    )

    conn = op.get_bind()
    copy_to_owner(conn)
    drop_old_columns(conn)


def downgrade() -> None:
    conn = op.get_bind()
    add_old_columns(conn)
    copy_back_to_columns(conn)
    # A unit row that held only a remark has nothing left to say.
    conn.execute(
        sa.text("DELETE FROM user_novel_unit_rating WHERE my_rating IS NULL")
    )
    op.drop_column("user_novel_unit_rating", "remark")
    for column in OWNER_COLUMNS:
        op.drop_index(op.f(f"ix_user_rating_{column}"), table_name="user_rating")
    op.drop_index(op.f("ix_user_rating_user_id"), table_name="user_rating")
    op.drop_index(op.f("ix_user_rating_system_id"), table_name="user_rating")
    op.drop_table("user_rating")
