"""
The game choice graph: reading one game's graph, the cross-row rules a CHECK
cannot state, and the personal marks.

The graph itself is catalogue data, one shared copy per game. Saves point into
it through `note.fields["choice_node"]`, and marks hang off it per user; both
are personal, which is why the read takes the viewer's user id and returns
only their marks, and why deleting a node reaches into other users' saves.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import GameChoiceEdge, GameChoiceMark, GameChoiceNode, Note
from app.utils.note_sections import GAME_OWNERS

# The media types that own a graph: game, and h-game, which reuses game's
# notes wholesale and so its saves too.
GRAPH_OWNER_TYPES: tuple[str, ...] = GAME_OWNERS


def graph_for_game(db: Session, game_id, user_id: Optional[UUID]) -> dict:
    """
    One game's nodes and edges, each ordered by sort_index then creation, and
    the marks `user_id` holds on them. No user, no marks.
    """
    nodes = (
        db.query(GameChoiceNode)
        .filter(GameChoiceNode.game_id == game_id)
        .order_by(
            GameChoiceNode.sort_index,
            GameChoiceNode.created_at,
            GameChoiceNode.system_id,
        )
        .all()
    )
    edges = (
        db.query(GameChoiceEdge)
        .filter(GameChoiceEdge.game_id == game_id)
        .order_by(
            GameChoiceEdge.sort_index,
            GameChoiceEdge.created_at,
            GameChoiceEdge.system_id,
        )
        .all()
    )
    marks = []
    if user_id is not None:
        marks = (
            db.query(GameChoiceMark)
            .filter(
                GameChoiceMark.game_id == game_id,
                GameChoiceMark.user_id == user_id,
            )
            .order_by(GameChoiceMark.created_at, GameChoiceMark.system_id)
            .all()
        )
    return {"nodes": nodes, "edges": edges, "marks": marks}


def node_of_game(db: Session, node_id, game_id) -> Optional[GameChoiceNode]:
    """The node `node_id` names if it belongs to `game_id`, else None."""
    if node_id is None:
        return None
    return (
        db.query(GameChoiceNode)
        .filter(
            GameChoiceNode.system_id == node_id,
            GameChoiceNode.game_id == game_id,
        )
        .first()
    )


def parse_node_id(value) -> Optional[UUID]:
    """A `choice_node` value as a uuid, or None when it cannot be one."""
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        return None
    try:
        return UUID(value.strip())
    except ValueError:
        return None


def clear_save_links(db: Session, node_id) -> None:
    """
    Remove `choice_node` from every note naming this node, leaving the rest of
    each note's fields as they are. Does not commit: the node's delete commits
    both together.

    Saves are personal, so this rewrites other users' rows; that is correct,
    because the node they named no longer exists. Run before the node's delete
    is flushed, inside the same transaction.
    """
    db.execute(
        text(
            "UPDATE note SET fields = fields - 'choice_node' "
            "WHERE fields->>'choice_node' = :node_id"
        ),
        {"node_id": str(node_id)},
    )
    # The UPDATE bypassed the session, so any Note it already holds is stale.
    for obj in list(db.identity_map.values()):
        if isinstance(obj, Note):
            db.expire(obj, ["fields"])


def write_mark(
    db: Session,
    user_id: UUID,
    game_id,
    *,
    node_id=None,
    edge_id=None,
    done: bool,
    note: Optional[str],
) -> Optional[GameChoiceMark]:
    """
    Upsert the user's mark on one node or one edge, and return it.

    A mark that is not done and carries no note says nothing, so it is
    removed rather than stored, and None is returned. Does not commit.
    """
    note = (note or "").strip() or None
    query = db.query(GameChoiceMark).filter(GameChoiceMark.user_id == user_id)
    if node_id is not None:
        query = query.filter(GameChoiceMark.node_id == node_id)
    else:
        query = query.filter(GameChoiceMark.edge_id == edge_id)
    row = query.first()

    if not done and note is None:
        if row is not None:
            db.delete(row)
        return None

    if row is None:
        row = GameChoiceMark(
            user_id=user_id,
            game_id=game_id,
            node_id=node_id,
            edge_id=edge_id,
        )
        db.add(row)
    row.done = done
    row.note = note
    return row
