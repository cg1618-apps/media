"""anime.ep_special becomes text

Specials are numbered like `17.5A` and `17.5B`, which a float cannot hold, so
`ep_special` becomes a VARCHAR. Each existing value is written without a
trailing `.0`: `17.0` -> `"17"`, `17.5` -> `"17.5"`, `0.0` -> `"0"`.
PostgreSQL's float-to-text cast already gives the shortest form that reads
back as the same float, which is exactly app.utils.ep_special's rule for a
number. NULL stays NULL.

Downgrade casts back to a float wherever the text is a plain number (`17`,
`17.5`) and writes NULL everywhere else, so a lettered special such as
`17.5A` is lost. Until one is written the round trip is lossless; the
downgrade is lossy rather than impossible, so the revision is not declared
irreversible.

Revision ID: e1p2special3
Revises: a1n2remake34
Create Date: 2026-11-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1p2special3"
down_revision: Union[str, Sequence[str], None] = "a1n2remake34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def to_text(conn) -> None:
    conn.execute(
        sa.text(
            "ALTER TABLE anime ALTER COLUMN ep_special TYPE VARCHAR "
            "USING ep_special::text"
        )
    )


def to_float(conn) -> None:
    conn.execute(
        sa.text(
            "ALTER TABLE anime ALTER COLUMN ep_special TYPE DOUBLE PRECISION "
            "USING CASE WHEN ep_special ~ '^\\s*\\d+(\\.\\d+)?\\s*$' "
            "THEN ep_special::double precision END"
        )
    )


def upgrade() -> None:
    to_text(op.get_bind())


def downgrade() -> None:
    to_float(op.get_bind())
