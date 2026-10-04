"""franchise: every "Anime" franchise type becomes "ACG"

`ACG` is the one franchise type for anime and manga franchises; `Anime` is not
a franchise type. `franchise.franchise_type` is a comma-separated token list,
so the rewrite is token-wise: each token that is exactly `Anime` becomes
`ACG`, the other tokens keep their order and the separators keep their
spacing. A franchise that already carried `ACG` keeps its first `ACG` and
drops the rewritten one rather than listing it twice. `Anime Movie` is its own
token and is not touched.

`deleted_record.franchise_type` is a tombstone of what a deleted entry's
franchise was typed at the time, and is left as it was.

Revision ID: a1n2imeacg3
Revises: e4s5teggurl6
Create Date: 2026-10-04 00:00:00.000000

"""

from typing import Optional, Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1n2imeacg3"
down_revision: Union[str, Sequence[str], None] = "e4s5teggurl6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Once rewritten, nothing records which ACG tokens used to be Anime.
irreversible = True

OLD_TOKEN = "Anime"
NEW_TOKEN = "ACG"


def rewrite_value(value: Optional[str]) -> Optional[str]:
    """
    One franchise_type value with its Anime token(s) folded onto ACG.

    A copy of app.services.domain.hierarchy.normalize_franchise_type, frozen
    here so the revision does not change when the app does.
    """
    if not isinstance(value, str):
        return value
    out: list[str] = []
    seen_new = False
    for piece in value.split(","):
        token = piece.strip()
        if token == OLD_TOKEN:
            piece = piece.replace(OLD_TOKEN, NEW_TOKEN)
            token = NEW_TOKEN
        if token == NEW_TOKEN:
            if seen_new:
                continue
            seen_new = True
        out.append(piece)
    return ",".join(out)


def rewrite(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED code against the test session -
    the suite has no Alembic harness.
    """
    rows = bind.execute(
        sa.text(
            "SELECT system_id, franchise_type FROM franchise "
            "WHERE franchise_type LIKE :pattern"
        ),
        {"pattern": f"%{OLD_TOKEN}%"},
    ).all()
    for system_id, franchise_type in rows:
        rewritten = rewrite_value(franchise_type)
        if rewritten != franchise_type:
            bind.execute(
                sa.text(
                    "UPDATE franchise SET franchise_type = :value "
                    "WHERE system_id = :system_id"
                ),
                {"value": rewritten, "system_id": system_id},
            )


def upgrade() -> None:
    rewrite(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
