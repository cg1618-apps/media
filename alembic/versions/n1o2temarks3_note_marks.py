"""Note marks: each account's personal values on catalogue note rows

Eleven catalogue sections split: the row stays catalogue, and some of its
values become each account's own (app/utils/note_sections.py,
`NoteField.personal` and `NoteSection.personal_status`, a registry edit).
Those values move off `note` into a per-account mark on the row.

What this revision does:

  note_mark
          created: user_id (users, CASCADE), note_id (note, CASCADE), each
          indexed; values JSONB NOT NULL; timestamps. UNIQUE (user_id,
          note_id), uq_note_mark_user_note.
  data    every non-blank personal value on a note row - PERSONAL_VALUES
          below, a frozen list naming the section, the mark key and where the
          value sits (the status column or a key of `fields`) - becomes the
          installation owner's mark for that row, and is cleared from the row
          (status to NULL, the key removed from `fields`, an emptied `fields`
          to NULL). Blank values are cleared and not moved. The owner is
          OWNER below, h1i2ghlights3's rule copied: the flag holder whatever
          its status, else the first ACTIVE account by username whose role is
          none of admin, guest and shared. When there is something to move
          and no such account, the revision raises rather than guess.

ix_note_one_music_status_per_kind stays as it is: the music_status rows stay
catalogue, one per anime per list; only their status moves.

Downgrade copies the installation owner's marks back onto the rows (status,
or the `fields` key), gives every music_status row still without a status the
old default, "Not Done" (the old code requires one), and drops note_mark.
**Every other account's marks are lost on downgrade**, and so is every
`amount_collected` (the older code has no such field and would refuse the
key): the old shape has room for one value per row, the owner's. Not marked
irreversible - the owner's values come back.

Revision ID: n1o2temarks3
Revises: h1i2ghlights3
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n1o2temarks3"
down_revision: Union[str, Sequence[str], None] = "h1i2ghlights3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, not imports: a migration must keep meaning what it meant
# when it ran. (section, mark key, storage): storage "status" is the column,
# "fields" a key of the fields blob named like the mark key.
PERSONAL_VALUES = (
    ("weapons_and_gear", "collected", "status"),
    ("items", "collected", "status"),
    ("collectibles", "collected", "status"),
    ("enemies", "beaten", "status"),
    ("endings", "completion", "status"),
    ("stats_and_points", "my_value", "fields"),
    ("mods_and_tools", "status", "status"),
    ("op", "status", "status"),
    ("ed", "status", "status"),
    ("insert_songs", "status", "status"),
    ("ost", "status", "status"),
    ("music_status", "status", "status"),
)
MUSIC_STATUS_SECTION = "music_status"
MUSIC_STATUS_DEFAULT = "Not Done"

# h1i2ghlights3's rule, copied: the flag holder wins outright; failing that,
# the first account by username that is active and is not administrative, a
# guest or a shared account. role.name, never role.is_root.
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


def _status_rows():
    return [(s, k) for s, k, storage in PERSONAL_VALUES if storage == "status"]


def _fields_rows():
    return [(s, k) for s, k, storage in PERSONAL_VALUES if storage == "fields"]


def _status_value(alias: str = "n") -> str:
    return f"NULLIF(btrim({alias}.status), '')"


def _fields_value(key: str, alias: str = "n") -> str:
    return f"NULLIF(btrim({alias}.fields ->> '{key}'), '')"


def installation_owner(conn):
    return conn.execute(sa.text(OWNER)).scalar()


def personal_value_count(conn) -> int:
    """How many non-blank personal values there are to move."""
    total = 0
    for section, _key in _status_rows():
        total += conn.execute(
            sa.text(
                f"SELECT count(*) FROM note n WHERE n.section = :s "
                f"AND {_status_value()} IS NOT NULL"
            ),
            {"s": section},
        ).scalar()
    for section, key in _fields_rows():
        total += conn.execute(
            sa.text(
                f"SELECT count(*) FROM note n WHERE n.section = :s "
                f"AND jsonb_typeof(n.fields) = 'object' "
                f"AND {_fields_value(key)} IS NOT NULL"
            ),
            {"s": section},
        ).scalar()
    return total


def _upsert(conn, owner, select_sql: str, params: dict) -> None:
    conn.execute(
        sa.text(
            f"""
            INSERT INTO note_mark
                (system_id, user_id, note_id, values, created_at, updated_at)
            {select_sql}
            ON CONFLICT (user_id, note_id)
            DO UPDATE SET values = note_mark.values || EXCLUDED.values
            """
        ),
        {"owner": owner, **params},
    )


def clear_from_note(conn) -> None:
    """Every personal value off the rows, blank ones included."""
    for section, _key in _status_rows():
        conn.execute(
            sa.text("UPDATE note SET status = NULL WHERE section = :s"),
            {"s": section},
        )
    for section, key in _fields_rows():
        conn.execute(
            sa.text(
                f"""
                UPDATE note
                   SET fields = CASE WHEN fields - '{key}' = '{{}}'::jsonb
                                     THEN NULL ELSE fields - '{key}' END
                 WHERE section = :s
                   AND jsonb_typeof(fields) = 'object'
                   AND fields ? '{key}'
                """
            ),
            {"s": section},
        )


def move_to_owner(conn) -> None:
    """The personal values, as the installation owner's marks, off `note`."""
    if personal_value_count(conn) > 0:
        owner = installation_owner(conn)
        if owner is None:
            raise RuntimeError(
                "n1o2temarks3: personal note values (collected, beaten, "
                "completion, my value, music or mod status) exist but no "
                "account can own them - none holds is_installation_owner and "
                "every other account is on the admin, guest or shared role or "
                "is not active. Create the owner's account (or set the flag "
                "on one) and run it again."
            )
        for section, key in _status_rows():
            _upsert(
                conn,
                owner,
                f"""
                SELECT gen_random_uuid(), :owner, n.system_id,
                       jsonb_build_object(:k, {_status_value()}),
                       {TAIPEI_NOW}, {TAIPEI_NOW}
                  FROM note n
                 WHERE n.section = :s AND {_status_value()} IS NOT NULL
                """,
                {"s": section, "k": key},
            )
        for section, key in _fields_rows():
            _upsert(
                conn,
                owner,
                f"""
                SELECT gen_random_uuid(), :owner, n.system_id,
                       jsonb_build_object(:k, {_fields_value(key)}),
                       {TAIPEI_NOW}, {TAIPEI_NOW}
                  FROM note n
                 WHERE n.section = :s
                   AND jsonb_typeof(n.fields) = 'object'
                   AND {_fields_value(key)} IS NOT NULL
                """,
                {"s": section, "k": key},
            )
    clear_from_note(conn)


def copy_back_to_note(conn) -> None:
    """The installation owner's marks, back onto the rows."""
    owner = installation_owner(conn)
    if owner is not None:
        for section, key in _status_rows():
            conn.execute(
                sa.text(
                    """
                    UPDATE note AS n
                       SET status = m.values ->> :k
                      FROM note_mark m
                     WHERE m.user_id = :owner AND m.note_id = n.system_id
                       AND n.section = :s AND m.values ? :k
                    """
                ),
                {"owner": owner, "s": section, "k": key},
            )
        for section, key in _fields_rows():
            conn.execute(
                sa.text(
                    """
                    UPDATE note AS n
                       SET fields = COALESCE(n.fields, '{}'::jsonb)
                                    || jsonb_build_object(:k, m.values -> :k)
                      FROM note_mark m
                     WHERE m.user_id = :owner AND m.note_id = n.system_id
                       AND n.section = :s AND m.values ? :k
                    """
                ),
                {"owner": owner, "s": section, "k": key},
            )
    conn.execute(
        sa.text(
            "UPDATE note SET status = :d WHERE section = :s AND status IS NULL"
        ),
        {"d": MUSIC_STATUS_DEFAULT, "s": MUSIC_STATUS_SECTION},
    )


def upgrade() -> None:
    op.create_table(
        "note_mark",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["note.system_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("user_id", "note_id", name="uq_note_mark_user_note"),
    )
    for column in ("system_id", "user_id", "note_id"):
        op.create_index(
            op.f(f"ix_note_mark_{column}"), "note_mark", [column], unique=False
        )
    move_to_owner(op.get_bind())


def downgrade() -> None:
    copy_back_to_note(op.get_bind())
    for column in ("note_id", "user_id", "system_id"):
        op.drop_index(op.f(f"ix_note_mark_{column}"), table_name="note_mark")
    op.drop_table("note_mark")
