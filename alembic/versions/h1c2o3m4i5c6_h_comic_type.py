"""The h-comic media type, its label, and club membership

A tenth media type, `h-comic`: adult comics, seen in the `unrestricted` access
mode only. It gets a table of its own - its fields are too different from
manga's to share one - with two variants keyed on `region` (JP / KR), the same
pattern as novel's `type`. The columns a region does not use are cleared on
every write path by the application, so nothing here constrains them.

What this revision creates:

  h_comic             the detail table, pinned to `media` by the composite FK
                      every media type uses, with its own public_id sequence
                      and the AFTER DELETE trigger that keeps `media` clean
  user_media_list     two personal columns: page_fin (JP's reading counter)
                      and usefulness
  person_membership   an artist's membership of a club; both ends are people
  content_label       the system label `h-comic`, granted to `unrestricted`
                      and to no other mode. The lifespan seeds the same row
                      (app/services/domain/h_comic.py ensure_label) because
                      the API tests build their schema with create_all.

A frozen copy of the label row, not an import of the seed: a migration that
imports app code breaks the day a later revision changes it.

Revision ID: h1c2o3m4i5c6
Revises: f2a3vslots45
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateSequence, DropSequence

revision: str = "h1c2o3m4i5c6"
down_revision: Union[str, Sequence[str], None] = "f2a3vslots45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LABEL_KEY = "h-comic"
LABEL_NAME = "H-Comic"
LABEL_DESCRIPTION = (
    "Adult comics. Carried by every h-comic entry and every H-Comic "
    "franchise; seen in the unrestricted mode only."
)

# The shared trigger function; CREATE OR REPLACE keeps this revision
# standalone, exactly as the baseline and every porting migration did.
DELETE_MEDIA_FUNCTION = """
CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
BEGIN
    DELETE FROM media WHERE system_id = OLD.system_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql
"""


def upgrade() -> None:
    op.execute(CreateSequence(sa.Sequence("h_comic_public_id_seq")))

    op.create_table(
        "h_comic",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "media_type", sa.String(), server_default="h-comic", nullable=False
        ),
        sa.Column("h_comic_name_en", sa.String(), nullable=True),
        sa.Column("h_comic_name_cn", sa.String(), nullable=True),
        sa.Column("h_comic_name_alt", sa.String(), nullable=True),
        sa.Column("h_comic_name_jp", sa.String(), nullable=True),
        sa.Column("h_comic_name_kr", sa.String(), nullable=True),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("originality", sa.String(), nullable=True),
        sa.Column("animation_status", sa.String(), nullable=True),
        sa.Column("series_number", sa.Integer(), nullable=True),
        sa.Column("serialization_status", sa.String(), nullable=True),
        sa.Column("page_total", sa.Integer(), nullable=True),
        sa.Column("ch_total", sa.Integer(), nullable=True),
        sa.Column("ch_behind", sa.Integer(), nullable=True),
        sa.Column("release_date", sa.String(), nullable=True),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column(
            "highlight_group_order",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "media_type = 'h-comic'", name="ck_h_comic_media_type"
        ),
        sa.CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_comic_release_date_iso",
        ),
        sa.CheckConstraint(
            r"end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_comic_end_date_iso",
        ),
        # DEFERRABLE INITIALLY DEFERRED: the media row is written after the
        # detail row, because it copies public_id and a Sequence default does
        # not mint that until the INSERT runs. See app/models/media_sync.py.
        sa.ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_h_comic_media",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_h_comic_system_id"), "h_comic", ["system_id"], unique=False
    )
    op.execute(DELETE_MEDIA_FUNCTION)
    op.execute(
        "CREATE TRIGGER trg_h_comic_delete_media "
        "AFTER DELETE ON h_comic "
        "FOR EACH ROW EXECUTE FUNCTION delete_media_row()"
    )

    op.add_column(
        "user_media_list", sa.Column("page_fin", sa.Integer(), nullable=True)
    )
    op.add_column(
        "user_media_list", sa.Column("usefulness", sa.String(), nullable=True)
    )

    op.create_table(
        "person_membership",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("club_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "member_id <> club_id", name="ck_person_membership_not_self"
        ),
        sa.ForeignKeyConstraint(
            ["member_id"], ["person.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["club_id"], ["person.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("member_id", "club_id", name="uq_person_membership"),
    )
    op.create_index(
        op.f("ix_person_membership_club_id"),
        "person_membership",
        ["club_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_person_membership_member_id"),
        "person_membership",
        ["member_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_person_membership_system_id"),
        "person_membership",
        ["system_id"],
        unique=False,
    )

    # The system label, and its grant to `unrestricted` alone. Both are
    # idempotent: a database the lifespan already seeded keeps its row.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO content_label "
            "(system_id, key, label, description, sort_order, created_at, updated_at) "
            "SELECT gen_random_uuid(), :key, :label, :description, 0, now(), now() "
            "WHERE NOT EXISTS (SELECT 1 FROM content_label WHERE key = :key)"
        ),
        {"key": LABEL_KEY, "label": LABEL_NAME, "description": LABEL_DESCRIPTION},
    )
    bind.execute(
        sa.text(
            "INSERT INTO access_mode_label (system_id, mode_id, label_id, created_at) "
            "SELECT gen_random_uuid(), m.system_id, l.system_id, now() "
            "FROM access_mode m, content_label l "
            "WHERE m.key = 'unrestricted' AND l.key = :key "
            "AND NOT EXISTS (SELECT 1 FROM access_mode_label x "
            "WHERE x.mode_id = m.system_id AND x.label_id = l.system_id)"
        ),
        {"key": LABEL_KEY},
    )


def downgrade() -> None:
    """
    Take the type out whole. The h-comic entries go first, through `media`,
    so everything hanging off an entry by foreign key goes with them - list
    rows, credits, tags, sources, labels, notes, quotes, plans. The rows that
    name the type by a plain string are deleted by hand: castings, the club
    role and every scope naming h-comic, the highlights notes, and the three
    genre vocabularies.
    """
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM character_casting WHERE media_type = 'h-comic'")
    )
    bind.execute(sa.text("DELETE FROM media WHERE media_type = 'h-comic'"))
    bind.execute(
        sa.text(
            "DELETE FROM person_role WHERE role = 'club' OR scope = 'h-comic'"
        )
    )
    bind.execute(sa.text("DELETE FROM publisher_scope WHERE scope = 'h-comic'"))
    bind.execute(
        sa.text("DELETE FROM system_option_scope WHERE scope = 'h-comic'")
    )
    bind.execute(sa.text("DELETE FROM note WHERE section = 'h_comic_highlights'"))
    # The three genre vocabularies exist for h-comic alone.
    bind.execute(
        sa.text(
            "DELETE FROM system_option WHERE category IN "
            "('H Genre Plot', 'H Genre Appearance', 'H Genre Relation')"
        )
    )
    bind.execute(
        sa.text("DELETE FROM content_label WHERE key = :key"), {"key": LABEL_KEY}
    )

    op.drop_index(
        op.f("ix_person_membership_system_id"), table_name="person_membership"
    )
    op.drop_index(
        op.f("ix_person_membership_member_id"), table_name="person_membership"
    )
    op.drop_index(
        op.f("ix_person_membership_club_id"), table_name="person_membership"
    )
    op.drop_table("person_membership")

    op.drop_column("user_media_list", "usefulness")
    op.drop_column("user_media_list", "page_fin")

    op.execute("DROP TRIGGER IF EXISTS trg_h_comic_delete_media ON h_comic")
    op.drop_index(op.f("ix_h_comic_system_id"), table_name="h_comic")
    op.drop_table("h_comic")
    op.execute(DropSequence(sa.Sequence("h_comic_public_id_seq")))
