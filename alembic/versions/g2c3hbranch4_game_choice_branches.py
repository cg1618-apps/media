"""game_choice_node, game_choice_edge: blocks, branches and links

A block is a part of the story: `start`, `part` or `ending`. The old `choice`
and `scene` kinds both become `part`.

An edge out of a block is a BRANCH - a `choice` the player makes or a
`condition` the game decides - or a plain `link`. A branch has a title and an
optional shared description, may exist before it leads anywhere, and may lead
back to its own block; a link has neither text and always leads to another
block. So `option` becomes `title`, `content` is added, `to_node_id` becomes
nullable with ON DELETE SET NULL, and the no-self-loop CHECK narrows to links.
An old edge with option text becomes a `choice` titled with it; one without
becomes a `link`.

Revision ID: g2c3hbranch4
Revises: g1c2hgraph3
Create Date: 2026-10-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g2c3hbranch4"
down_revision: Union[str, Sequence[str], None] = "g1c2hgraph3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Once folded, nothing records which `part` was a `choice` and which a
# `scene`, so the platform's rollback must not run the downgrade below. It
# still works when run by hand: every part comes back as a `scene`, a
# condition as an option, a branch's description is dropped - and it refuses,
# reversing nothing, while a branch leads nowhere or back to its own block.
irreversible = True

EDGE = "game_choice_edge"
NODE = "game_choice_node"
TO_FK = "game_choice_edge_to_node_id_fkey"


def reshape(bind) -> None:
    """
    The data half of the upgrade, on the new columns: fold the node kinds,
    and give every edge its kind - `choice` where the old option text (now
    `title`) is not blank, `link` otherwise, with the blank title cleared.
    """
    bind.execute(
        sa.text(f"UPDATE {NODE} SET kind = 'part' WHERE kind IN ('choice', 'scene')")
    )
    bind.execute(
        sa.text(
            f"UPDATE {EDGE} SET "
            "kind = CASE WHEN btrim(coalesce(title, '')) <> '' "
            "THEN 'choice' ELSE 'link' END, "
            "title = CASE WHEN btrim(coalesce(title, '')) <> '' "
            "THEN title END "
            "WHERE kind IS NULL"
        )
    )


def upgrade() -> None:
    op.drop_constraint("ck_game_choice_node_kind", NODE, type_="check")
    op.drop_constraint("ck_game_choice_edge_no_self", EDGE, type_="check")
    op.drop_constraint(TO_FK, EDGE, type_="foreignkey")

    op.add_column(EDGE, sa.Column("kind", sa.String(), nullable=True))
    op.alter_column(EDGE, "option", new_column_name="title")
    op.add_column(EDGE, sa.Column("content", sa.Text(), nullable=True))
    op.alter_column(EDGE, "to_node_id", nullable=True)

    reshape(op.get_bind())

    op.alter_column(EDGE, "kind", nullable=False)
    op.create_foreign_key(
        TO_FK, EDGE, NODE, ["to_node_id"], ["system_id"], ondelete="SET NULL"
    )
    op.create_check_constraint(
        "ck_game_choice_node_kind", NODE, "kind IN ('start', 'part', 'ending')"
    )
    op.create_check_constraint(
        "ck_game_choice_edge_kind", EDGE, "kind IN ('choice', 'condition', 'link')"
    )
    op.create_check_constraint(
        "ck_game_choice_edge_link",
        EDGE,
        "kind <> 'link' OR "
        "(to_node_id IS NOT NULL AND title IS NULL AND content IS NULL)",
    )
    op.create_check_constraint(
        "ck_game_choice_edge_branch_title",
        EDGE,
        "kind = 'link' OR (title IS NOT NULL AND btrim(title) <> '')",
    )
    op.create_check_constraint(
        "ck_game_choice_edge_no_self",
        EDGE,
        "kind <> 'link' OR to_node_id <> from_node_id",
    )


def _refuse_unfit_branches(bind) -> None:
    """
    Raise, before anything is changed, when a branch has no old-shaped
    equivalent. Deleting it would lose somebody's branch to make a rollback
    succeed; the person running the downgrade decides that instead.
    """
    dangling = bind.execute(
        sa.text(f"SELECT count(*) FROM {EDGE} WHERE to_node_id IS NULL")
    ).scalar()
    looping = bind.execute(
        sa.text(f"SELECT count(*) FROM {EDGE} WHERE to_node_id = from_node_id")
    ).scalar()
    problems = []
    if dangling:
        problems.append(f"{dangling} branch(es) lead nowhere")
    if looping:
        problems.append(f"{looping} branch(es) lead back to their own block")
    if problems:
        raise RuntimeError(
            "Cannot downgrade game_choice_edge: "
            + " and ".join(problems)
            + ". The previous shape needs every edge to join two different "
            "blocks. Point or delete those branches first; nothing has been "
            "changed."
        )


def unshape(bind) -> None:
    """The data half of the downgrade: every part is a scene again."""
    bind.execute(sa.text(f"UPDATE {NODE} SET kind = 'scene' WHERE kind = 'part'"))


def downgrade() -> None:
    bind = op.get_bind()
    _refuse_unfit_branches(bind)

    op.drop_constraint("ck_game_choice_edge_no_self", EDGE, type_="check")
    op.drop_constraint("ck_game_choice_edge_branch_title", EDGE, type_="check")
    op.drop_constraint("ck_game_choice_edge_link", EDGE, type_="check")
    op.drop_constraint("ck_game_choice_edge_kind", EDGE, type_="check")
    op.drop_constraint("ck_game_choice_node_kind", NODE, type_="check")
    op.drop_constraint(TO_FK, EDGE, type_="foreignkey")

    unshape(bind)

    op.drop_column(EDGE, "content")
    op.alter_column(EDGE, "title", new_column_name="option")
    op.drop_column(EDGE, "kind")
    op.alter_column(EDGE, "to_node_id", nullable=False)

    op.create_foreign_key(
        TO_FK, EDGE, NODE, ["to_node_id"], ["system_id"], ondelete="CASCADE"
    )
    op.create_check_constraint(
        "ck_game_choice_node_kind",
        NODE,
        "kind IN ('start', 'choice', 'scene', 'ending')",
    )
    op.create_check_constraint(
        "ck_game_choice_edge_no_self", EDGE, "from_node_id <> to_node_id"
    )
