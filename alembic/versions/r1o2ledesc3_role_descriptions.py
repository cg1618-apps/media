"""Role descriptions: two short lines and three blanks

Sets the stored `role.description` of the five fixed roles to what the
Roles page now shows:

- `shared`: "Advanced Guest: Read only with fixed access mode ceiling
  (normal or borderline)"
- `admin`: "Management only without data like entry page"
- `guest`, `user`, `super`: NULL - no description at all.

`ensure_rbac_seed` only creates a missing role and never rewrites an existing
one, so changing its text reaches a fresh database only; the rows every
existing database already holds are rewritten here. Roles do not travel
through the sheet, so nothing on a Pull brings the old text back.

The texts are frozen copies rather than imported from app code - a migration
importing app code breaks the day a later revision changes what it imports.

The downgrade writes back the seed's previous texts. A database whose rows
held something else before the upgrade (an admin's own edit, or an older
seed's wording) gets the seed's text rather than its own back; the
descriptions are display copy, so that loss is accepted rather than declared
irreversible.

Revision ID: r1o2ledesc3
Revises: u1i2dentrate3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r1o2ledesc3"
down_revision: Union[str, Sequence[str], None] = "u1i2dentrate3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_DESCRIPTIONS: dict[str, str | None] = {
    "guest": None,
    "user": None,
    "super": None,
    "shared": (
        "Advanced Guest: Read only with fixed access mode ceiling "
        "(normal or borderline)"
    ),
    "admin": "Management only without data like entry page",
}

PREVIOUS_DESCRIPTIONS: dict[str, str] = {
    "guest": "Anyone who is not logged in.",
    "user": (
        "A signed-in member. Reads the whole site, and writes their "
        "own list and their own personal notes."
    ),
    "super": (
        "Manages the catalogue and runs the pipelines. Cannot itself "
        "change roles, accounts or content labels - but running a "
        "pipeline (Pull All) can rewrite all three from the sheet, "
        "since it restores the Users and Content Label tabs and role "
        "assignments along with everything else."
    ),
    "shared": (
        "An account several people sign in to. Reads what a guest reads "
        "and files requests; its mode and its role are fixed, and only "
        "the admin sets its password."
    ),
    "admin": (
        "Runs the installation: accounts, roles, access modes, pipelines, "
        "the request inbox, announcements, options, images and resources. "
        "Reads and writes no catalogue, and keeps no list or notes."
    ),
}


def write_descriptions(conn, descriptions) -> None:
    statement = sa.text("UPDATE role SET description = :d WHERE name = :n")
    for name, description in descriptions.items():
        conn.execute(statement, {"d": description, "n": name})


def upgrade() -> None:
    write_descriptions(op.get_bind(), NEW_DESCRIPTIONS)


def downgrade() -> None:
    write_descriptions(op.get_bind(), PREVIOUS_DESCRIPTIONS)
