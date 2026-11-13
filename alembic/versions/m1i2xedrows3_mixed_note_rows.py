"""Mixed sections: a note row may be one account's personal row

Ten catalogue sections become mixed (app/utils/note_sections.py,
`NoteSection.mixed`, a registry edit): beside the catalogue rows they hold
each account's own personal rows. A mixed section holds both kinds, so a
row's kind cannot be read from its section's scope and is stored on the row.

What this revision does:

  note.personal
          added: BOOLEAN NOT NULL, server default false.
  data    nothing moves. Every row that exists before this revision is a
          catalogue row or a row of a personal-scope section, and both read
          false; the server default fills them.

The unique indexes on `note` are untouched: ix_note_one_remark_per_owner
covers `remark` and ix_note_one_music_status_per_kind covers `music_status`,
and neither is mixed - no mixed section is a singleton or one-per-kind.

Downgrade **deletes every personal row** (with their note_mark rows and any
rows nested under them, by the existing CASCADEs) and drops the column. The
older code has no way to tell a personal row from a catalogue one, so a
personal row kept would be read as catalogue and shown to every account.
Not marked irreversible - the catalogue survives intact - but the personal
rows are lost; take a backup first.

Revision ID: m1i2xedrows3
Revises: n1o2temarks3
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1i2xedrows3"
down_revision: Union[str, Sequence[str], None] = "n1o2temarks3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def delete_personal_rows(bind) -> None:
    """The downgrade's data step: every personal row goes."""
    bind.execute(sa.text("DELETE FROM note WHERE personal"))


def upgrade() -> None:
    op.add_column(
        "note",
        sa.Column(
            "personal", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    delete_personal_rows(op.get_bind())
    op.drop_column("note", "personal")
