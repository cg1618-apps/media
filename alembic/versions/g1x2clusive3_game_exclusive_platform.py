"""A game may name the platform it is exclusive to

Anime carries an Exclusive Source, drawn from the streaming Platform
vocabulary and tied to one of its main access rows. A game names the platform
family it is exclusive to instead - Nintendo, PlayStation, Xbox, PC or Mobile
- through its own tag field, exclusive_platform, whose vocabulary is the new
"Exclusive Platform" category. The field needs no column: tags live in
media_tag. This revision seeds the five values, scoped to game alone, through
the helper the tests call.

Reversible: the downgrade deletes the five values (and with them any tag
rows naming them, through media_tag's foreign key).

Revision ID: g1x2clusive3
Revises: r1e2lcascade3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.orm import Session

from alembic import op

revision: str = "g1x2clusive3"
down_revision: Union[str, Sequence[str], None] = "r1e2lcascade3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.utils.game_vocabulary import seed_exclusive_platforms

    session = Session(bind=op.get_bind())
    seed_exclusive_platforms(session)
    session.flush()


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM system_option WHERE category = 'Exclusive Platform'")
    )
