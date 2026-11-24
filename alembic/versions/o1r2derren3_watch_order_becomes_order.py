"""Watch orders become orders: rename the four tables and everything named after them

An order can mix watching, reading and playing, so the feature is an "order".
`watch_order_list`, `watch_order_section`, `watch_order_item` and
`watch_order_follow` become `order_list`, `order_section`, `order_item` and
`order_follow`. Their sequence, primary keys, foreign keys, check and unique
constraints and indexes are renamed to match the models, so the schema reads
the same as one built from zero.

A pure rename: no row, column or value changes, and the downgrade renames
everything back.

Revision ID: o1r2derren3
Revises: p1i2nged3
Create Date: 2026-11-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "o1r2derren3"
down_revision: Union[str, Sequence[str], None] = "p1i2nged3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("list", "section", "item", "follow")

SEQUENCES = ("watch_order_list_public_id_seq",)

# (table as named after the rename, constraint name before the rename).
CONSTRAINTS = (
    ("list", "watch_order_list_pkey"),
    ("list", "ck_watch_order_list_single_owner"),
    ("list", "uq_watch_order_list_public_id"),
    ("list", "watch_order_list_collection_id_fkey"),
    ("list", "watch_order_list_franchise_id_fkey"),
    ("list", "watch_order_list_series_id_fkey"),
    ("section", "watch_order_section_pkey"),
    ("section", "watch_order_section_list_id_fkey"),
    ("item", "watch_order_item_pkey"),
    ("item", "watch_order_item_list_id_fkey"),
    ("item", "watch_order_item_media_id_fkey"),
    ("item", "watch_order_item_section_id_fkey"),
    ("follow", "watch_order_follow_pkey"),
    ("follow", "ck_watch_order_follow_one_owner"),
    ("follow", "uq_watch_order_follow_group"),
    ("follow", "fk_watch_order_follow_collection"),
    ("follow", "fk_watch_order_follow_franchise"),
    ("follow", "fk_watch_order_follow_list"),
    ("follow", "fk_watch_order_follow_series"),
    ("follow", "fk_watch_order_follow_user"),
)

# Indexes that are not a constraint's own (a pkey or unique constraint renames
# its index with it).
INDEXES = (
    "ix_watch_order_follow_list_id",
    "ix_watch_order_follow_system_id",
    "ix_watch_order_follow_user_id",
    "ix_watch_order_item_list_id",
    "ix_watch_order_item_media_id",
    "ix_watch_order_item_section_id",
    "ix_watch_order_item_system_id",
    "ix_watch_order_list_collection_id",
    "ix_watch_order_list_franchise_id",
    "ix_watch_order_list_series_id",
    "ix_watch_order_list_system_id",
    "ix_watch_order_section_list_id",
    "ix_watch_order_section_system_id",
)


def _new(name: str) -> str:
    return name.replace("watch_order", "order")


def upgrade() -> None:
    for t in TABLES:
        op.rename_table(f"watch_order_{t}", f"order_{t}")
    for seq in SEQUENCES:
        op.execute(f'ALTER SEQUENCE "{seq}" RENAME TO "{_new(seq)}"')
    for t, name in CONSTRAINTS:
        op.execute(
            f'ALTER TABLE "order_{t}" RENAME CONSTRAINT "{name}" TO "{_new(name)}"'
        )
    for name in INDEXES:
        op.execute(f'ALTER INDEX "{name}" RENAME TO "{_new(name)}"')
    # The default names the sequence through a regclass, which follows the
    # rename; restating it keeps the stored text identical to a fresh build.
    op.execute(
        "ALTER TABLE order_list ALTER COLUMN public_id "
        "SET DEFAULT nextval('order_list_public_id_seq'::regclass)"
    )


def downgrade() -> None:
    for name in INDEXES:
        op.execute(f'ALTER INDEX "{_new(name)}" RENAME TO "{name}"')
    for t, name in CONSTRAINTS:
        op.execute(
            f'ALTER TABLE "order_{t}" RENAME CONSTRAINT "{_new(name)}" TO "{name}"'
        )
    for seq in SEQUENCES:
        op.execute(f'ALTER SEQUENCE "{_new(seq)}" RENAME TO "{seq}"')
    for t in TABLES:
        op.rename_table(f"order_{t}", f"watch_order_{t}")
    # After the sequence has its old name back, which the regclass needs.
    op.execute(
        "ALTER TABLE watch_order_list ALTER COLUMN public_id "
        "SET DEFAULT nextval('watch_order_list_public_id_seq'::regclass)"
    )
