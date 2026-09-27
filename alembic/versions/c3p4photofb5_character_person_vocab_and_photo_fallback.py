"""character/person: gender and my_rating vocabularies, photo_fallback_entry_id, character.role

- gender becomes a closed vocabulary (男 / 女 / 中性/無性 / 雙性混和 / 其他, or
  NULL) on both tables. Stored values are trimmed and casefolded; "male" maps
  to 男 and "female" to 女, a value already in the vocabulary is kept, and
  every other value is dropped to NULL rather than guessed at.
- my_rating is trimmed and upper-cased; a value in S / A+ / A / B / C / D / E
  / F is kept, anything else becomes NULL.
- photo_fallback_entry_id is new on both tables: the media.system_id whose
  picture stands in when photo_file is NULL. No FK, like
  franchise.cover_entry_id.
- character.role is new: what the character is to their story overall, one
  of Main / Core / Supporting / Other or NULL. Independent of
  character_casting.role, so nothing is copied into it.

The vocabularies are copied here rather than imported from app code: a
revision has to keep meaning what it meant when it ran. The Sheets Pull
applies the same folding through app/utils/entity_vocab.py.

Revision ID: c3p4photofb5
Revises: h8g9refsrc0
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3p4photofb5"
down_revision: Union[str, Sequence[str], None] = "h8g9refsrc0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("character", "person")
GENDERS = ("男", "女", "中性/無性", "雙性混和", "其他")
MY_RATINGS = ("S", "A+", "A", "B", "C", "D", "E", "F")


def normalize(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED statements against the test
    session - the suite has no Alembic harness. Idempotent: a second run
    changes nothing.
    """
    for table in TABLES:
        bind.execute(
            sa.text(
                f"""
                UPDATE "{table}" SET gender = CASE
                    WHEN btrim(gender) = ANY(CAST(:genders AS text[]))
                        THEN btrim(gender)
                    WHEN lower(btrim(gender)) = 'male' THEN '男'
                    WHEN lower(btrim(gender)) = 'female' THEN '女'
                    ELSE NULL
                END
                WHERE gender IS NOT NULL
                """
            ),
            {"genders": list(GENDERS)},
        )
        bind.execute(
            sa.text(
                f"""
                UPDATE "{table}" SET my_rating = CASE
                    WHEN upper(btrim(my_rating)) = ANY(CAST(:ratings AS text[]))
                        THEN upper(btrim(my_rating))
                    ELSE NULL
                END
                WHERE my_rating IS NOT NULL
                """
            ),
            {"ratings": list(MY_RATINGS)},
        )


def restore_english_genders(bind) -> None:
    """The downgrade's data half: 男 and 女 go back to the old spellings."""
    for table in TABLES:
        bind.execute(
            sa.text(
                f"""
                UPDATE "{table}" SET gender = CASE gender
                    WHEN '男' THEN 'Male'
                    WHEN '女' THEN 'Female'
                    ELSE gender
                END
                WHERE gender IN ('男', '女')
                """
            )
        )


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "photo_fallback_entry_id",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )
    op.add_column("character", sa.Column("role", sa.String(), nullable=True))
    normalize(op.get_bind())


def downgrade() -> None:
    # Not irreversible: the older code reads any string in either column, so
    # the folded values are valid there. What the upgrade dropped to NULL
    # stays NULL - it was unreadable free text, and nothing depends on it.
    restore_english_genders(op.get_bind())
    op.drop_column("character", "role")
    for table in TABLES:
        op.drop_column(table, "photo_fallback_entry_id")
