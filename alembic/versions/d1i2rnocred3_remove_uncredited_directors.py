"""Person: delete every director who holds no director credit

A one-off cleaning the owner asked for: "remove directors without credits".

Who goes: a person holding at least one `person_role` row with
role = 'director' (in any scope) and ZERO `media_credit` rows with
role = 'director' pointing at them (on any entry, of any media type). Scope
is not compared: a person with director roles in two scopes and a director
credit in only one of them HAS a director credit, so they stay. Only the
director credit counts - credits in other roles do not save a person, and the
whole person row goes even when they hold other roles too, as the owner
chose.

What goes with them. Every foreign key into `person` is ON DELETE CASCADE,
so the database removes these with the row: `person_role`, `media_credit`
(their non-director credits), `character_casting_voice` (the castings above
stay, as when the app deletes a person), `person_membership` on both the
member and the club side, and `user_rating`. Two references carry no foreign
key and are handled here:

- `image_attachment` rows owned by the person (owner_type 'staff') are
  deleted explicitly, so the image library holds no attachment to a missing
  owner. The `image` rows they pointed at stay, and show as unused.
- `user_request` rows targeting the person are left alone on purpose: a
  request keeps its `target_label` so it still says what it was about after
  its target is deleted, which is how every deletion treats them.

The photo files on disk (`person.photo_file`, under static/covers/staff/)
cannot be removed by a migration, which runs on the database alone. They are
left where they are.

Revision ID: d1i2rnocred3
Revises: g1a2mecast3
Create Date: 2026-11-19 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d1i2rnocred3"
down_revision: Union[str, Sequence[str], None] = "g1a2mecast3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The deleted rows are gone; a downgrade has nothing to restore.
irreversible = True

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

# The one predicate: the ids of every person this revision deletes.
_UNCREDITED_DIRECTORS = """
    SELECT p.system_id FROM person p
    WHERE EXISTS (
        SELECT 1 FROM person_role r
        WHERE r.person_id = p.system_id AND r.role = 'director'
    )
    AND NOT EXISTS (
        SELECT 1 FROM media_credit c
        WHERE c.person_id = p.system_id AND c.role = 'director'
    )
"""

_DELETE_ATTACHMENTS = sa.text(
    f"""
    DELETE FROM image_attachment
    WHERE owner_type = 'staff'
      AND owner_id IN ({_UNCREDITED_DIRECTORS})
    """
)

_DELETE_PEOPLE = sa.text(
    f"DELETE FROM person WHERE system_id IN ({_UNCREDITED_DIRECTORS})"
)


def remove_uncredited_directors(bind) -> int:
    """
    The data half of the migration, against any bind; returns how many people
    went.

    Split out so tests can run the SHIPPED statements against the test session
    - the suite has no Alembic harness. The attachments go first: they are
    found through the same predicate, which needs the person still there.
    """
    attachments = bind.execute(_DELETE_ATTACHMENTS).rowcount
    deleted = bind.execute(_DELETE_PEOPLE).rowcount
    logger.info(
        "deleted %d uncredited director(s) and %d image attachment(s)",
        deleted,
        attachments,
    )
    return deleted


def upgrade() -> None:
    remove_uncredited_directors(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
