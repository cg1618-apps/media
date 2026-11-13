"""Mode ceiling and default instead of a held mode set

Adds `users.mode_ceiling` and `users.mode_default`: mode KEYS on the order
safe < normal < borderline < unrestricted, nullable together (NULL / NULL is
no mode), server default `normal` / `normal`, held to that by three CHECK
constraints. Converts each account's `user_access_mode` rows:

  * ceiling = the widest mode held; default = the `is_default` one, or the
    ceiling if none is flagged;
  * `cg1618` explicitly: ceiling `unrestricted`, default `borderline`,
    whatever it held (the owner's settled choice);
  * an account holding no mode: NULL / NULL.

An account whose held set had a gap (say `safe` and `borderline` without
`normal`) gains the gap, because a ceiling cannot express it. Every such
account is logged, so the deploy log shows them.

Re-keys `user_access_mode_denial` from the grant row onto the account: a
denial now applies in every mode the account uses, and two denials of one
item on two grants become one row. Then drops `user_access_mode`.

The order is written out here as a frozen copy rather than imported from
seed_modes.MODE_ORDER - a migration importing app code breaks the day a later
revision changes what it imports.

The downgrade recreates `user_access_mode` as one row per mode up to the
ceiling, the default flagged, and copies each denial onto every one of those
rows. Lossless for every state this revision's code can produce; what it
cannot restore is a gap the upgrade filled.

Revision ID: m1c2eiling345
Revises: n1o2tesrwk3
Create Date: 2026-11-13 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1c2eiling345"
down_revision: Union[str, Sequence[str], None] = "n1o2tesrwk3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

ORDER = ("safe", "normal", "borderline", "unrestricted")
OWNER = "cg1618"
OWNER_PAIR = ("unrestricted", "borderline")

KEYS_SQL = "('safe', 'normal', 'borderline', 'unrestricted')"
ARRAY_SQL = "ARRAY['safe', 'normal', 'borderline', 'unrestricted']::varchar[]"


def _rank(key):
    return ORDER.index(key)


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "users",
        sa.Column("mode_ceiling", sa.String(), server_default="normal", nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("mode_default", sa.String(), server_default="normal", nullable=True),
    )

    # --- the pair, from the held set ------------------------------------
    held: dict = {}
    for user_id, key, is_default in bind.execute(
        sa.text(
            "SELECT g.user_id, m.key, g.is_default FROM user_access_mode g "
            "JOIN access_mode m ON m.system_id = g.mode_id"
        )
    ):
        keys, default = held.setdefault(user_id, (set(), [None]))
        keys.add(key)
        if is_default:
            default[0] = key

    for user_id, username in bind.execute(sa.text("SELECT id, username FROM users")):
        keys, flagged = held.get(user_id, (set(), [None]))
        ranked = sorted((k for k in keys if k in ORDER), key=_rank)
        if username == OWNER:
            ceiling, default = OWNER_PAIR
        elif not ranked:
            ceiling = default = None
        else:
            ceiling = ranked[-1]
            default = flagged[0] if flagged[0] in ORDER else ceiling
        if ranked and ranked != list(ORDER[: _rank(ranked[-1]) + 1]):
            logger.warning(
                "%s: account %r held a non-contiguous mode set %s; its ceiling "
                "%r now reaches every mode below it",
                revision,
                username,
                ranked,
                ranked[-1],
            )
        unranked = sorted(keys - set(ORDER))
        if unranked:
            logger.warning(
                "%s: account %r held mode(s) %s outside the ranked four; a "
                "ceiling cannot reach them",
                revision,
                username,
                unranked,
            )
        bind.execute(
            sa.text(
                "UPDATE users SET mode_ceiling = :c, mode_default = :d WHERE id = :id"
            ),
            {"c": ceiling, "d": default, "id": user_id},
        )

    op.create_check_constraint(
        "ck_users_mode_keys",
        "users",
        f"(mode_ceiling IS NULL OR mode_ceiling IN {KEYS_SQL}) AND "
        f"(mode_default IS NULL OR mode_default IN {KEYS_SQL})",
    )
    op.create_check_constraint(
        "ck_users_mode_pair",
        "users",
        "(mode_ceiling IS NULL) = (mode_default IS NULL)",
    )
    op.create_check_constraint(
        "ck_users_mode_default_within_ceiling",
        "users",
        f"array_position({ARRAY_SQL}, mode_default) <= "
        f"array_position({ARRAY_SQL}, mode_ceiling)",
    )

    # --- denials onto the account ----------------------------------------
    op.add_column(
        "user_access_mode_denial", sa.Column("user_id", sa.UUID(), nullable=True)
    )
    bind.execute(
        sa.text(
            "UPDATE user_access_mode_denial d SET user_id = g.user_id "
            "FROM user_access_mode g WHERE g.system_id = d.user_access_mode_id"
        )
    )
    # The union: one row per (account, item), whichever grant it hung off.
    bind.execute(
        sa.text(
            "DELETE FROM user_access_mode_denial d USING user_access_mode_denial e "
            "WHERE d.user_id = e.user_id "
            "AND d.label_id IS NOT DISTINCT FROM e.label_id "
            "AND d.field_group_key IS NOT DISTINCT FROM e.field_group_key "
            "AND d.system_id > e.system_id"
        )
    )
    # Dropping the column takes its FK, its index and both unique constraints.
    op.drop_column("user_access_mode_denial", "user_access_mode_id")
    op.alter_column("user_access_mode_denial", "user_id", nullable=False)
    op.create_foreign_key(
        "user_access_mode_denial_user_id_fkey",
        "user_access_mode_denial",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_user_access_mode_denial_user_id"),
        "user_access_mode_denial",
        ["user_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_denial_label", "user_access_mode_denial", ["user_id", "label_id"]
    )
    op.create_unique_constraint(
        "uq_denial_field_group",
        "user_access_mode_denial",
        ["user_id", "field_group_key"],
    )

    op.drop_index("ix_one_default_mode_per_user", table_name="user_access_mode")
    op.drop_table("user_access_mode")


def downgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "user_access_mode",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("mode_id", sa.UUID(), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("user_id", "mode_id", name="uq_user_access_mode"),
    )
    op.create_index(
        "ix_one_default_mode_per_user",
        "user_access_mode",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    op.create_index(
        op.f("ix_user_access_mode_mode_id"), "user_access_mode", ["mode_id"]
    )
    op.create_index(
        op.f("ix_user_access_mode_system_id"), "user_access_mode", ["system_id"]
    )
    op.create_index(
        op.f("ix_user_access_mode_user_id"), "user_access_mode", ["user_id"]
    )

    # One grant per mode up to the ceiling, the default flagged.
    bind.execute(
        sa.text(
            "INSERT INTO user_access_mode (system_id, user_id, mode_id, is_default, created_at) "
            "SELECT gen_random_uuid(), u.id, m.system_id, m.key = u.mode_default, now() "
            "FROM users u JOIN access_mode m "
            f"ON array_position({ARRAY_SQL}, m.key::varchar) "
            f"<= array_position({ARRAY_SQL}, u.mode_ceiling) "
            "WHERE u.mode_ceiling IS NOT NULL"
        )
    )

    # Each denial onto every one of the account's grants.
    op.add_column(
        "user_access_mode_denial",
        sa.Column("user_access_mode_id", sa.UUID(), nullable=True),
    )
    op.drop_constraint("uq_denial_label", "user_access_mode_denial", type_="unique")
    op.drop_constraint(
        "uq_denial_field_group", "user_access_mode_denial", type_="unique"
    )
    bind.execute(
        sa.text(
            "INSERT INTO user_access_mode_denial "
            "(system_id, user_id, user_access_mode_id, label_id, field_group_key, created_at) "
            "SELECT gen_random_uuid(), d.user_id, g.system_id, d.label_id, "
            "d.field_group_key, d.created_at "
            "FROM user_access_mode_denial d "
            "JOIN user_access_mode g ON g.user_id = d.user_id "
            "WHERE d.user_access_mode_id IS NULL"
        )
    )
    bind.execute(
        sa.text(
            "DELETE FROM user_access_mode_denial WHERE user_access_mode_id IS NULL"
        )
    )
    op.drop_column("user_access_mode_denial", "user_id")
    op.alter_column("user_access_mode_denial", "user_access_mode_id", nullable=False)
    op.create_foreign_key(
        "user_access_mode_denial_user_access_mode_id_fkey",
        "user_access_mode_denial",
        "user_access_mode",
        ["user_access_mode_id"],
        ["system_id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_user_access_mode_denial_user_access_mode_id"),
        "user_access_mode_denial",
        ["user_access_mode_id"],
    )
    op.create_unique_constraint(
        "uq_denial_label",
        "user_access_mode_denial",
        ["user_access_mode_id", "label_id"],
    )
    op.create_unique_constraint(
        "uq_denial_field_group",
        "user_access_mode_denial",
        ["user_access_mode_id", "field_group_key"],
    )

    op.drop_constraint("ck_users_mode_default_within_ceiling", "users", type_="check")
    op.drop_constraint("ck_users_mode_pair", "users", type_="check")
    op.drop_constraint("ck_users_mode_keys", "users", type_="check")
    op.drop_column("users", "mode_default")
    op.drop_column("users", "mode_ceiling")
