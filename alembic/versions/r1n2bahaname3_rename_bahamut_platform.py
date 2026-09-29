"""system_option: rename the Bahamut platform to 動畫瘋

The `Platform` value is renamed in place, so every `media_source` main row
citing it by `option_id` follows without being touched. Code finds the value
by name (`BAHAMUT_VALUE` in app/utils/source_fields.py and
frontend/src/lib/formatters.js), which is why this is a migration rather than
an edit on the admin Options page.

A database that already holds a `動畫瘋` Platform value is left alone: the
rename would collide on `uq_system_option_value`, and which of the two an
entry's rows cite is not something a migration can decide.

Revision ID: r1n2bahaname3
Revises: o1r2srcrestr3
Create Date: 2026-09-29 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "r1n2bahaname3"
down_revision: Union[str, Sequence[str], None] = "o1r2srcrestr3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_VALUE = "Bahamut"
NEW_VALUE = "動畫瘋"


def rename(bind, old: str, new: str) -> None:
    """
    Rename one Platform value, unless the new name is already taken.

    Split out so tests can run the SHIPPED statement against the test
    session - the suite has no Alembic harness.
    """
    bind.execute(
        sa.text(
            """
            UPDATE system_option
               SET value = :new
             WHERE category = 'Platform'
               AND value = :old
               AND NOT EXISTS (
                   SELECT 1 FROM system_option
                    WHERE category = 'Platform' AND value = :new
               )
            """
        ),
        {"old": old, "new": new},
    )


def upgrade() -> None:
    rename(op.get_bind(), OLD_VALUE, NEW_VALUE)


def downgrade() -> None:
    rename(op.get_bind(), NEW_VALUE, OLD_VALUE)
