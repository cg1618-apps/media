"""The hentai media type and its label

An eleventh media type, `hentai`: adult anime, one entry per episode, seen in
the `unrestricted` access mode only. It gets a table of its own, gated by its
own content label the way h-comic is, with a `mal_link` / `mal_id` pair that
Tenrai fills airing status, release date and cover from.

What this revision does:

  hentai              the detail table, pinned to `media` by the composite FK
                      every media type uses, with its own public_id sequence
                      and the AFTER DELETE trigger that keeps `media` clean
  content_label       the system label `hentai`, FOUND BY KEY and created only
                      if missing - a hand-made `hentai` row already exists on
                      some databases and is adopted, not duplicated. It is
                      granted to `unrestricted`, and any grant to another mode
                      is removed: the label of a gated type reaches
                      `unrestricted` alone. The lifespan seeds the same row
                      (app/services/domain/gated_labels.py) because the API
                      tests build their schema with create_all.
  media_content_label every assignment of the `hentai` label to an entry that
                      is NOT a hentai is deleted. The label now means the
                      type; an anime that carried it by hand stops being
                      hidden behind it.

The downgrade does NOT put those label assignments or mode grants back: which
rows carried them is recorded nowhere to restore from. It also leaves the
`hentai` label row itself in place, since it may predate this revision.

A frozen copy of the label row, not an import of the seed: a migration that
imports app code breaks the day a later revision changes it.

Revision ID: h2e3n4t5a6i7
Revises: o1s2tsingle3
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateSequence, DropSequence

revision: str = "h2e3n4t5a6i7"
down_revision: Union[str, Sequence[str], None] = "o1s2tsingle3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LABEL_KEY = "hentai"
LABEL_NAME = "Hentai"
LABEL_DESCRIPTION = (
    "Adult anime. Carried by every hentai entry and every Hentai franchise; "
    "seen in the unrestricted mode only."
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
    op.execute(CreateSequence(sa.Sequence("hentai_public_id_seq")))

    op.create_table(
        "hentai",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "media_type", sa.String(), server_default="hentai", nullable=False
        ),
        sa.Column("hentai_name_en", sa.String(), nullable=True),
        sa.Column("hentai_name_cn", sa.String(), nullable=True),
        sa.Column("hentai_name_roman", sa.String(), nullable=True),
        sa.Column("hentai_name_jp", sa.String(), nullable=True),
        sa.Column("hentai_name_alt", sa.String(), nullable=True),
        sa.Column("source_material", sa.String(), nullable=True),
        sa.Column("originality", sa.String(), nullable=True),
        sa.Column("series_number", sa.Integer(), nullable=True),
        sa.Column("airing_status", sa.String(), nullable=True),
        sa.Column("release_date", sa.String(), nullable=True),
        sa.Column("mal_id", sa.Integer(), nullable=True),
        sa.Column("mal_link", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("media_type = 'hentai'", name="ck_hentai_media_type"),
        sa.CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_hentai_release_date_iso",
        ),
        # DEFERRABLE INITIALLY DEFERRED: the media row is written after the
        # detail row, because it copies public_id and a Sequence default does
        # not mint that until the INSERT runs. See app/models/media_sync.py.
        sa.ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_hentai_media",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_hentai_system_id"), "hentai", ["system_id"], unique=False
    )
    op.execute(DELETE_MEDIA_FUNCTION)
    op.execute(
        "CREATE TRIGGER trg_hentai_delete_media "
        "AFTER DELETE ON hentai "
        "FOR EACH ROW EXECUTE FUNCTION delete_media_row()"
    )

    settle_label(op.get_bind())


def settle_label(bind) -> None:
    """
    The label steps, on any connection. A function of their own so the test
    suite - which builds its schema with create_all and never runs Alembic -
    can run this revision's own SQL rather than a restatement of it
    (tests/api/test_hentai_label_migration.py).
    """
    # The system label, found by key. A database whose admin already made a
    # `hentai` label keeps that row.
    bind.execute(
        sa.text(
            "INSERT INTO content_label "
            "(system_id, key, label, description, sort_order, created_at, updated_at) "
            "SELECT gen_random_uuid(), :key, :label, :description, 0, now(), now() "
            "WHERE NOT EXISTS (SELECT 1 FROM content_label WHERE key = :key)"
        ),
        {"key": LABEL_KEY, "label": LABEL_NAME, "description": LABEL_DESCRIPTION},
    )
    # Granted to `unrestricted`, and to no other mode.
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
    bind.execute(
        sa.text(
            "DELETE FROM access_mode_label x "
            "USING access_mode m, content_label l "
            "WHERE x.mode_id = m.system_id AND x.label_id = l.system_id "
            "AND l.key = :key AND m.key <> 'unrestricted'"
        ),
        {"key": LABEL_KEY},
    )
    # The label means the type now: it leaves every entry that is not one.
    bind.execute(
        sa.text(
            "DELETE FROM media_content_label x "
            "USING content_label l, media m "
            "WHERE x.label_id = l.system_id AND l.key = :key "
            "AND x.media_id = m.system_id AND m.media_type <> 'hentai'"
        ),
        {"key": LABEL_KEY},
    )


def downgrade() -> None:
    """
    Take the type out whole. The hentai entries go first, through `media`,
    so everything hanging off an entry by foreign key goes with them - list
    rows, credits, tags, sources, label assignments, notes, quotes, plans.
    The rows that name the type by a plain string are deleted by hand: the
    relations touching a hentai, and every scope naming it.

    Not restored: the `hentai` label assignments and mode grants the upgrade
    removed. The label row itself is kept - it may predate this revision.
    """
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM media_relation "
            "WHERE from_type = 'hentai' OR to_type = 'hentai'"
        )
    )
    bind.execute(sa.text("DELETE FROM media WHERE media_type = 'hentai'"))
    bind.execute(sa.text("DELETE FROM person_role WHERE scope = 'hentai'"))
    bind.execute(sa.text("DELETE FROM publisher_scope WHERE scope = 'hentai'"))
    bind.execute(sa.text("DELETE FROM system_option_scope WHERE scope = 'hentai'"))

    op.execute("DROP TRIGGER IF EXISTS trg_hentai_delete_media ON hentai")
    op.drop_index(op.f("ix_hentai_system_id"), table_name="hentai")
    op.drop_table("hentai")
    op.execute(DropSequence(sa.Sequence("hentai_public_id_seq")))
