"""Labels and modes are defined in code

The six content labels and the four access modes are fixed in code now
(app/services/rbac/labels.py, seed_modes.py), and what each mode shows is
derived from the mode order rather than stored. This revision brings a
database into line with that:

1. A `content_label` row whose key is not one of the six is deleted when
   nothing cites it - no entry, franchise or per-account denial. When
   something does, the revision RAISES and names the label and what cites it:
   deleting it would silently publish those entries, and keeping it would
   leave a label no code knows. That is a decision for a person.
2. The six labels' rows are written from the code's values: `ecchi` inserted,
   the others' name, description and display order rewritten.
3. An `access_mode` row whose key is not one of the four is deleted when no
   account holds it, and raises, naming it, when one does.
4. `access_mode_label` and `access_mode_field_group` are dropped. Nothing
   reads them; a table nothing reads is one somebody edits expecting an effect.

The values below are a frozen copy of the code's, not an import: a revision
that imports app code breaks the day a later one adds a column.

Downgrade recreates the two tables and fills them from the derived rule, which
leaves an installation showing exactly what this revision made it show. The
rows step 1 and 3 deleted, and the names step 2 rewrote, are not restored.

Revision ID: l1a2belcode3
Revises: p1r2ivatedat3
Create Date: 2026-11-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "l1a2belcode3"
down_revision: Union[str, Sequence[str], None] = "p1r2ivatedat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (key, name, description, lowest mode), in display order.
LABELS = (
    ("nsfw", "NSFW", "不適合公開場合觀看", "normal"),
    ("ecchi", "輕微色情", "含性感或福利畫面，但公共場合還是能看，也能大家一起看", "normal"),
    ("erotica", "擦邊肉番", "以性暗示或擦邊情節為主，接近但未達成人作品，建議自己私底下看", "borderline"),
    ("hentai", "Hentai", "成人動畫", "unrestricted"),
    ("h-game", "H-Game", "成人遊戲", "unrestricted"),
    ("h-comic", "H-Comic", "成人漫畫", "unrestricted"),
)
MODE_ORDER = ("safe", "normal", "borderline", "unrestricted")
# field group -> lowest mode that shows it.
FIELD_GROUPS = {"sources_restricted": "normal"}

LABEL_KEYS = tuple(key for key, _n, _d, _m in LABELS)


def _keys(name: str):
    return sa.bindparam(name, expanding=True)


def remove_unknown_labels(conn) -> None:
    """Step 1. Raises, naming the label, when an unknown one is cited."""
    unknown = conn.execute(
        sa.text(
            "SELECT system_id, key FROM content_label WHERE key NOT IN :known"
        ).bindparams(_keys("known")),
        {"known": list(LABEL_KEYS)},
    ).all()
    for label_id, key in unknown:
        cited = {
            table: conn.execute(
                sa.text(f"SELECT count(*) FROM {table} WHERE label_id = :id"),
                {"id": label_id},
            ).scalar_one()
            for table in (
                "media_content_label",
                "franchise_content_label",
                "user_access_mode_denial",
            )
        }
        if any(cited.values()):
            raise RuntimeError(
                f"content label {key!r} is not one of the labels defined in code "
                f"and is still in use ({', '.join(f'{t}: {n}' for t, n in cited.items() if n)}). "
                "Detach it, or add it to app/services/rbac/labels.py and to this "
                "revision, before upgrading."
            )
        conn.execute(
            sa.text("DELETE FROM content_label WHERE system_id = :id"), {"id": label_id}
        )


def write_labels(conn) -> None:
    """Step 2. Insert a missing label; rewrite the rest from the code."""
    for order, (key, name, description, _lowest) in enumerate(LABELS):
        conn.execute(
            sa.text(
                """
                INSERT INTO content_label (system_id, key, label, description, sort_order)
                VALUES (gen_random_uuid(), :key, :name, :description, :order)
                ON CONFLICT (key) DO UPDATE
                SET label = EXCLUDED.label,
                    description = EXCLUDED.description,
                    sort_order = EXCLUDED.sort_order
                """
            ),
            {"key": key, "name": name, "description": description, "order": order},
        )


def remove_unknown_modes(conn) -> None:
    """Step 3. Raises, naming the mode, when an unknown one is held."""
    unknown = conn.execute(
        sa.text(
            "SELECT system_id, key FROM access_mode WHERE key NOT IN :known"
        ).bindparams(_keys("known")),
        {"known": list(MODE_ORDER)},
    ).all()
    for mode_id, key in unknown:
        held = conn.execute(
            sa.text("SELECT count(*) FROM user_access_mode WHERE mode_id = :id"),
            {"id": mode_id},
        ).scalar_one()
        if held:
            raise RuntimeError(
                f"access mode {key!r} is not one of the four modes defined in code "
                f"and {held} account(s) hold it. Move them to one of "
                f"{', '.join(MODE_ORDER)} before upgrading."
            )
        conn.execute(
            sa.text("DELETE FROM access_mode WHERE system_id = :id"), {"id": mode_id}
        )


def upgrade() -> None:
    conn = op.get_bind()
    remove_unknown_labels(conn)
    write_labels(conn)
    remove_unknown_modes(conn)
    op.drop_table("access_mode_label")
    op.drop_table("access_mode_field_group")


def downgrade() -> None:
    op.create_table(
        "access_mode_field_group",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("mode_id", sa.UUID(), nullable=False),
        sa.Column("field_group_key", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "mode_id", "field_group_key", name="uq_access_mode_field_group"
        ),
    )
    op.create_index(
        op.f("ix_access_mode_field_group_mode_id"),
        "access_mode_field_group",
        ["mode_id"],
    )
    op.create_index(
        op.f("ix_access_mode_field_group_system_id"),
        "access_mode_field_group",
        ["system_id"],
    )
    op.create_table(
        "access_mode_label",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("mode_id", sa.UUID(), nullable=False),
        sa.Column("label_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("mode_id", "label_id", name="uq_access_mode_label"),
    )
    op.create_index(
        op.f("ix_access_mode_label_label_id"), "access_mode_label", ["label_id"]
    )
    op.create_index(
        op.f("ix_access_mode_label_mode_id"), "access_mode_label", ["mode_id"]
    )
    op.create_index(
        op.f("ix_access_mode_label_system_id"), "access_mode_label", ["system_id"]
    )

    conn = op.get_bind()
    rank = {key: i for i, key in enumerate(MODE_ORDER)}
    for mode_key in MODE_ORDER:
        for key, _name, _description, lowest in LABELS:
            if rank[lowest] <= rank[mode_key]:
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO access_mode_label (system_id, mode_id, label_id)
                        SELECT gen_random_uuid(), m.system_id, l.system_id
                        FROM access_mode m, content_label l
                        WHERE m.key = :mode AND l.key = :label
                        """
                    ),
                    {"mode": mode_key, "label": key},
                )
        for group, lowest in FIELD_GROUPS.items():
            if rank[lowest] <= rank[mode_key]:
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO access_mode_field_group
                            (system_id, mode_id, field_group_key)
                        SELECT gen_random_uuid(), system_id, :group
                        FROM access_mode WHERE key = :mode
                        """
                    ),
                    {"mode": mode_key, "group": group},
                )
