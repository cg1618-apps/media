"""note.fields and note.parent_id, for the structured shape

The `structured` note shape lets a section declare its own ordered field spec
in `app/utils/note_sections.py` instead of claiming a fixed set of columns.
Most of what the game guide sections need already has a column - a name is
`title`, a description is `content`, a dropdown is `kind` or `status` - so
those fields stay columns and only the leftovers land in `fields`: a variant,
an alias, a region, the four stat values, and the lists nested inside one row
(a build's armour, a team's members), which no column could hold at all.

One JSONB column rather than a dozen sparse ones, because `note` is shared by
all twelve owner types and its column list is also the Google Sheets Note tab:
a column per field would put twelve mostly-blank columns on every owner's tab
to serve `game` alone, and would turn each later field into a migration. The
nested lists make JSONB unavoidable regardless.

`parent_id` is the other half: the Story List sections nest to any depth, and
a row says which row it sits under. It lands here rather than in its own later
revision so the table is altered once.

Revision ID: n1f2ields3p4
Revises: s1e2asonalix
Create Date: 2026-09-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n1f2ields3p4"
down_revision: Union[str, Sequence[str], None] = "s1e2asonalix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "note",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "note",
        sa.Column("fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # CASCADE so deleting a parent takes its subtree. The alternative, SET
    # NULL, would promote every child to a root on a delete - a Story List
    # whose chapter was removed would read as a flat pile of its own scenes,
    # which is worse than losing them and much harder to notice.
    op.create_foreign_key(
        "note_parent_id_fkey",
        "note",
        "note",
        ["parent_id"],
        ["system_id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_note_parent_id", "note", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_note_parent_id", table_name="note")
    op.drop_constraint("note_parent_id_fkey", "note", type_="foreignkey")
    op.drop_column("note", "fields")
    op.drop_column("note", "parent_id")
