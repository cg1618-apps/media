"""Company relations across studios and publishers; person affiliations

`studio_relation` becomes `company_relation`: each end is a studio or a
publisher, as two nullable FK columns of which exactly one is set. Every
existing studio-to-studio row is copied across with its id, remark and
timestamps, then `studio_relation` is dropped.

`person_affiliation` is new: which studios a person belongs to.

The downgrade copies the studio-to-studio rows back and drops what has no
place in the old schema - relations with a publisher at either end, and
every affiliation.

Revision ID: c1o2mprel3
Revises: p1s2ocialscope3
Create Date: 2026-11-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c1o2mprel3"
down_revision: Union[str, Sequence[str], None] = "p1s2ocialscope3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _create_studio_relation() -> None:
    op.create_table(
        "studio_relation",
        sa.Column("system_id", UUID, nullable=False),
        sa.Column("studio_id", UUID, nullable=False),
        sa.Column("related_studio_id", UUID, nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "studio_id <> related_studio_id", name="ck_studio_relation_not_self"
        ),
        sa.ForeignKeyConstraint(["studio_id"], ["studio.system_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["related_studio_id"], ["studio.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("studio_id", "related_studio_id", name="uq_studio_relation"),
    )
    op.create_index(op.f("ix_studio_relation_system_id"), "studio_relation", ["system_id"])
    op.create_index(op.f("ix_studio_relation_studio_id"), "studio_relation", ["studio_id"])
    op.create_index(
        op.f("ix_studio_relation_related_studio_id"),
        "studio_relation",
        ["related_studio_id"],
    )


def upgrade() -> None:
    op.create_table(
        "company_relation",
        sa.Column("system_id", UUID, nullable=False),
        sa.Column("studio_id", UUID, nullable=True),
        sa.Column("publisher_id", UUID, nullable=True),
        sa.Column("related_studio_id", UUID, nullable=True),
        sa.Column("related_publisher_id", UUID, nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(studio_id, publisher_id) = 1",
            name="ck_company_relation_one_owner",
        ),
        sa.CheckConstraint(
            "num_nonnulls(related_studio_id, related_publisher_id) = 1",
            name="ck_company_relation_one_related",
        ),
        sa.CheckConstraint(
            "studio_id IS DISTINCT FROM related_studio_id OR studio_id IS NULL",
            name="ck_company_relation_studio_not_self",
        ),
        sa.CheckConstraint(
            "publisher_id IS DISTINCT FROM related_publisher_id OR publisher_id IS NULL",
            name="ck_company_relation_publisher_not_self",
        ),
        sa.ForeignKeyConstraint(["studio_id"], ["studio.system_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["publisher_id"], ["publisher.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["related_studio_id"], ["studio.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["related_publisher_id"], ["publisher.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "studio_id",
            "publisher_id",
            "related_studio_id",
            "related_publisher_id",
            name="uq_company_relation",
            postgresql_nulls_not_distinct=True,
        ),
    )
    for column in (
        "system_id", "studio_id", "publisher_id", "related_studio_id", "related_publisher_id"
    ):
        op.create_index(
            op.f(f"ix_company_relation_{column}"), "company_relation", [column]
        )
    op.execute(
        """
        INSERT INTO company_relation
            (system_id, studio_id, related_studio_id, remark, created_at, updated_at)
        SELECT system_id, studio_id, related_studio_id, remark, created_at, updated_at
        FROM studio_relation
        """
    )
    op.drop_table("studio_relation")

    op.create_table(
        "person_affiliation",
        sa.Column("system_id", UUID, nullable=False),
        sa.Column("person_id", UUID, nullable=False),
        sa.Column("studio_id", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["person_id"], ["person.system_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["studio_id"], ["studio.system_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("person_id", "studio_id", name="uq_person_affiliation"),
    )
    for column in ("system_id", "person_id", "studio_id"):
        op.create_index(
            op.f(f"ix_person_affiliation_{column}"), "person_affiliation", [column]
        )


def downgrade() -> None:
    op.drop_table("person_affiliation")
    _create_studio_relation()
    op.execute(
        """
        INSERT INTO studio_relation
            (system_id, studio_id, related_studio_id, remark, created_at, updated_at)
        SELECT system_id, studio_id, related_studio_id, remark, created_at, updated_at
        FROM company_relation
        WHERE studio_id IS NOT NULL AND related_studio_id IS NOT NULL
        """
    )
    op.drop_table("company_relation")
