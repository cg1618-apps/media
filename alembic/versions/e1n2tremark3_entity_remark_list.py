"""An entity's remark becomes the first row of its Remark list

The owner's request: every entity - studio, publisher, person, character,
identity - gets the remark list and personal notes the entries have, and an
entity's single `remark` becomes an entry of that list.

So a note may now hang off an entity: five nullable owner columns, one per
entity table, each a foreign key that cascades as the tier columns do, and
ck_note_one_owner widened to all nine. Each entity's non-blank remark is then
written as a catalogue 備註 Remark row of that entity, attributed to the
installation's owner (users.is_installation_owner, else the first active
account whose role keeps personal data - user_list.installation_owner_id's
rule, frozen here as SQL), and the five `remark` columns are dropped.

Downgrade: the columns come back holding the entity's Remark rows joined in
list order, and every entity-owned note is deleted - so a personal note, and
the split between several remarks, written since the upgrade is lost.

Revision ID: e1n2tremark3
Revises: g1x2clusive3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1n2tremark3"
down_revision: Union[str, Sequence[str], None] = "g1x2clusive3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# entity table -> its note column
ENTITIES: dict[str, str] = {
    "studio": "studio_id",
    "publisher": "publisher_id",
    "person": "person_id",
    "character": "character_id",
    "character_identity": "identity_id",
}

_OLD_CHECK = "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1"
_NEW_CHECK = (
    "num_nonnulls(media_id, collection_id, franchise_id, series_id, "
    "studio_id, publisher_id, person_id, character_id, identity_id) = 1"
)

_OWNER = sa.text(
    """
    SELECT u.id FROM users u JOIN role r ON r.system_id = u.role_id
    WHERE u.is_installation_owner AND r.name <> 'admin'
    UNION ALL
    (SELECT u.id FROM users u JOIN role r ON r.system_id = u.role_id
     WHERE u.status = 'active' AND r.name NOT IN ('admin', 'guest', 'shared')
     ORDER BY u.username)
    LIMIT 1
    """
)


def remark_author(bind):
    """The installation's owner, as user_list.installation_owner_id finds it."""
    return bind.execute(_OWNER).scalar()


def move_remarks(bind) -> int:
    """Each entity's non-blank remark, as a Remark row of that entity. Returns how many."""
    total = sum(
        bind.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE coalesce(btrim(remark), '') <> ''")
        ).scalar()
        for table in ENTITIES
    )
    if not total:
        return 0
    author = remark_author(bind)
    if author is None:
        raise RuntimeError(
            f"{total} entity remark(s) to move and no account to attribute them to"
        )
    for table, column in ENTITIES.items():
        bind.execute(
            sa.text(
                f"INSERT INTO note (system_id, {column}, author_id, section, personal, "
                "content, links, sort_index, created_at, updated_at) "
                f"SELECT gen_random_uuid(), system_id, :author, 'remark', false, "
                "btrim(remark), '[]'::jsonb, 0, now(), now() "
                f"FROM {table} WHERE coalesce(btrim(remark), '') <> ''"
            ),
            {"author": author},
        )
    return total


def restore_remarks(bind) -> None:
    """Each entity's Remark rows, joined in list order, back into its column."""
    for table, column in ENTITIES.items():
        bind.execute(
            sa.text(
                f"UPDATE {table} t SET remark = ("
                "SELECT string_agg(n.content, E'\n' ORDER BY n.sort_index, n.created_at) "
                f"FROM note n WHERE n.{column} = t.system_id "
                "AND n.section = 'remark' AND n.personal = false)"
            )
        )


def upgrade() -> None:
    for table, column in ENTITIES.items():
        op.add_column("note", sa.Column(column, postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"note_{column}_fkey", "note", table, [column], ["system_id"], ondelete="CASCADE"
        )
        op.create_index(f"ix_note_{column}", "note", [column])
    op.drop_constraint("ck_note_one_owner", "note", type_="check")
    op.create_check_constraint("ck_note_one_owner", "note", _NEW_CHECK)

    move_remarks(op.get_bind())

    for table in ENTITIES:
        op.drop_column(table, "remark")


def downgrade() -> None:
    for table in ENTITIES:
        op.add_column(table, sa.Column("remark", sa.Text(), nullable=True))
    bind = op.get_bind()
    restore_remarks(bind)
    bind.execute(
        sa.text(
            "DELETE FROM note WHERE "
            + " OR ".join(f"{column} IS NOT NULL" for column in ENTITIES.values())
        )
    )
    op.drop_constraint("ck_note_one_owner", "note", type_="check")
    op.create_check_constraint("ck_note_one_owner", "note", _OLD_CHECK)
    for column in ENTITIES.values():
        op.drop_index(f"ix_note_{column}", table_name="note")
        op.drop_constraint(f"note_{column}_fkey", "note", type_="foreignkey")
        op.drop_column("note", column)
