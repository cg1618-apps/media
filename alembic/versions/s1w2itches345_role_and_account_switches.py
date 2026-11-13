"""Per-role and per-account switches

1. `users` gains four feature switches, each Boolean NOT NULL, default false:
   `feature_quotes_memes`, `feature_favourites`, `feature_music_status` and
   `feature_mod_status`. The account `cg1618` gets all four on; every other
   account starts off - so every other member stops reading quotes and memes,
   which they read through `view.extras` until now.
2. `view.entities` becomes four permissions. Every role holding it gets
   `view.studio`, `view.publisher`, `view.person` and `view.character`, so
   nothing anybody sees changes, and the `view.entities` rows are deleted.
3. The three gated media types are reconciled to their locks: granted to
   `user` where missing, removed from `guest` and `shared`. `super` holds
   them by lock already. The boot seed enforces the same; doing it here too
   puts the release's whole grant change in one place.
4. Any of the nine ordinary media types missing from `guest`, `user`,
   `shared` or `super` is granted once. Every viewer but the admin reads the
   ordinary types; a role missing one is a seed accident, not a decision.

Root roles store no grant rows and are skipped. Every permission name is a
frozen copy rather than imported from app code - a migration importing app
code breaks the day a later revision changes what it imports.

The downgrade drops the four columns and folds the four entity permissions
back into `view.entities` for every role holding any of them. Steps 3 and 4
are not reversed: the earlier code's boot seed reconciles grants to its own
locks.

Revision ID: s1w2itches345
Revises: i1n2vitesreg3
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s1w2itches345"
down_revision: Union[str, Sequence[str], None] = "i1n2vitesreg3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FEATURE_COLUMNS = (
    "feature_quotes_memes",
    "feature_favourites",
    "feature_music_status",
    "feature_mod_status",
)
OWNER_USERNAME = "cg1618"

OLD_ENTITIES = "view.entities"
ENTITY_PERMISSIONS = ("view.studio", "view.publisher", "view.person", "view.character")

ORDINARY_TYPES = tuple(
    f"media_type.{key}"
    for key in (
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
        "game",
    )
)
GATED_TYPES = ("media_type.h-comic", "media_type.h-game", "media_type.hentai")


def _grant(conn, permission, *, holding=None, role_names=None):
    """Grant `permission` to every non-root role holding `holding`, or to the
    roles named `role_names`, skipping any that already holds it."""
    if holding is not None:
        chooser = (
            "r.system_id IN (SELECT role_id FROM role_permission WHERE permission = :holding)"
        )
        params = {"holding": holding}
    else:
        chooser = "r.name IN :names"
        params = {"names": list(role_names)}
    statement = sa.text(
        "INSERT INTO role_permission (role_id, permission) "
        "SELECT r.system_id, :permission FROM role r "
        f"WHERE NOT r.is_root AND {chooser} "
        "AND NOT EXISTS (SELECT 1 FROM role_permission x "
        "WHERE x.role_id = r.system_id AND x.permission = :permission)"
    )
    if role_names is not None:
        statement = statement.bindparams(sa.bindparam("names", expanding=True))
    conn.execute(statement, {"permission": permission, **params})


def _revoke(conn, permissions, role_names=None):
    statement = "DELETE FROM role_permission WHERE permission IN :permissions"
    params = {"permissions": list(permissions)}
    binds = [sa.bindparam("permissions", expanding=True)]
    if role_names is not None:
        statement += " AND role_id IN (SELECT system_id FROM role WHERE name IN :names)"
        params["names"] = list(role_names)
        binds.append(sa.bindparam("names", expanding=True))
    conn.execute(sa.text(statement).bindparams(*binds), params)


def upgrade() -> None:
    for column in FEATURE_COLUMNS:
        op.add_column(
            "users",
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    conn = op.get_bind()
    assignments = ", ".join(f"{column} = true" for column in FEATURE_COLUMNS)
    conn.execute(
        sa.text(f"UPDATE users SET {assignments} WHERE username = :owner"),
        {"owner": OWNER_USERNAME},
    )

    for permission in ENTITY_PERMISSIONS:
        _grant(conn, permission, holding=OLD_ENTITIES)
    _revoke(conn, [OLD_ENTITIES])

    for permission in GATED_TYPES:
        _grant(conn, permission, role_names=["user"])
    _revoke(conn, GATED_TYPES, role_names=["guest", "shared"])

    for permission in ORDINARY_TYPES:
        _grant(conn, permission, role_names=["guest", "user", "shared", "super"])


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permission (role_id, permission) "
            "SELECT DISTINCT r.system_id, :old FROM role r "
            "JOIN role_permission p ON p.role_id = r.system_id "
            "WHERE NOT r.is_root AND p.permission IN :entities "
            "AND NOT EXISTS (SELECT 1 FROM role_permission x "
            "WHERE x.role_id = r.system_id AND x.permission = :old)"
        ).bindparams(sa.bindparam("entities", expanding=True)),
        {"old": OLD_ENTITIES, "entities": list(ENTITY_PERMISSIONS)},
    )
    _revoke(conn, ENTITY_PERMISSIONS)

    for column in reversed(FEATURE_COLUMNS):
        op.drop_column("users", column)
