"""
The Game Choice Node, Edge and Mark tabs: a game's choice graph travels
through Backup and Pull like every other table.

Nodes and edges keep their uuid across databases, so a save that names a node
in `fields["choice_node"]` still resolves after the round trip. Marks are
personal and file under the installation owner on Pull, the way Game Copy
rows do.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import installation_owner_id
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES

NODE_TAB = "Game Choice Node"
EDGE_TAB = "Game Choice Edge"
MARK_TAB = "Game Choice Mark"


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


@pytest.fixture
def a_game(db):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Round Trip Game")
    db.add(game)
    db.flush()
    return game


def _backed_up(db, monkeypatch):
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db)
    return written


def test_the_three_tabs_follow_game_copy_in_order():
    at = TAB_NAMES.index("Game Copy")
    assert TAB_NAMES[at + 1 : at + 4] == [NODE_TAB, EDGE_TAB, MARK_TAB]
    assert TAB_BY_NAME[NODE_TAB].model is models.GameChoiceNode
    assert TAB_BY_NAME[EDGE_TAB].model is models.GameChoiceEdge
    assert TAB_BY_NAME[MARK_TAB].model is models.GameChoiceMark


def test_nodes_and_edges_are_plain_uuid_identity():
    assert NODE_TAB not in pull.DERIVED_IDENTITY_KEYS
    assert EDGE_TAB not in pull.DERIVED_IDENTITY_KEYS


def test_the_graph_round_trips_and_a_save_still_resolves(
    db, sheets, monkeypatch, a_game, admin_user
):
    start = models.GameChoiceNode(
        system_id=uuid.uuid4(), game_id=a_game.system_id, kind="start",
        title="Prologue", content="Read the letter", sort_index=0,
    )
    end = models.GameChoiceNode(
        system_id=uuid.uuid4(), game_id=a_game.system_id, kind="ending",
        title="Good End", sort_index=2,
    )
    db.add_all([start, end])
    db.flush()
    edge = models.GameChoiceEdge(
        system_id=uuid.uuid4(), game_id=a_game.system_id,
        from_node_id=start.system_id, to_node_id=end.system_id,
        option="Spare him", sort_index=1,
    )
    db.add(edge)
    save = models.Note(
        system_id=uuid.uuid4(), media_id=a_game.system_id,
        author_id=admin_user.id, section="saves", locator="1", kind="regular",
        fields={"choice_node": str(end.system_id)},
    )
    db.add(save)
    db.flush()

    def node_state():
        return {
            n.system_id: (n.game_id, n.kind, n.title, n.content, n.sort_index)
            for n in db.query(models.GameChoiceNode).all()
        }

    def edge_state():
        return {
            e.system_id: (e.game_id, e.from_node_id, e.to_node_id, e.option, e.sort_index)
            for e in db.query(models.GameChoiceEdge).all()
        }

    nodes_before, edges_before = node_state(), edge_state()
    written = _backed_up(db, monkeypatch)
    assert written[NODE_TAB][0] == [
        c.name for c in models.GameChoiceNode.__table__.columns
    ]
    assert len(written[NODE_TAB]) == 3
    assert len(written[EDGE_TAB]) == 2

    db.query(models.GameChoiceNode).delete()
    db.flush()
    assert db.query(models.GameChoiceEdge).count() == 0

    sheets({NODE_TAB: written[NODE_TAB], EDGE_TAB: written[EDGE_TAB]})
    for tab in (NODE_TAB, EDGE_TAB):
        result = pull.execute_pull_specific(db, tab, log_action=False)
        assert result["status"] == "success", result
        assert result["rows_added"] == len(written[tab]) - 1, result

    db.expire_all()
    assert node_state() == nodes_before
    assert edge_state() == edges_before
    linked = db.get(models.Note, save.system_id).fields["choice_node"]
    assert db.get(models.GameChoiceNode, uuid.UUID(linked)).title == "Good End"


def test_a_second_pull_updates_rather_than_duplicates(
    db, sheets, monkeypatch, a_game
):
    node = models.GameChoiceNode(
        system_id=uuid.uuid4(), game_id=a_game.system_id, kind="scene",
        title="Only", sort_index=0,
    )
    db.add(node)
    db.flush()
    written = _backed_up(db, monkeypatch)
    sheets({NODE_TAB: written[NODE_TAB]})

    result = pull.execute_pull_specific(db, NODE_TAB, log_action=False)

    assert result["rows_updated"] == 1
    assert result["rows_added"] == 0
    assert db.query(models.GameChoiceNode).count() == 1


def test_a_mark_restores_onto_the_installation_owner(
    db, sheets, monkeypatch, a_game, plain_user
):
    node = models.GameChoiceNode(
        system_id=uuid.uuid4(), game_id=a_game.system_id, kind="scene",
        title="Marked", sort_index=0,
    )
    db.add(node)
    db.flush()
    owner = installation_owner_id(db)
    headers = [c.name for c in models.GameChoiceMark.__table__.columns]
    row = {
        "system_id": str(uuid.uuid4()),
        # Names a user this database has never seen; it is not trusted.
        "user_id": str(uuid.uuid4()),
        "game_id": str(a_game.system_id),
        "node_id": str(node.system_id),
        "edge_id": "",
        "done": "TRUE",
        "note": "left door",
    }
    sheets({MARK_TAB: [headers, [row.get(h, "") for h in headers]]})

    result = pull.execute_pull_specific(db, MARK_TAB, log_action=False)

    assert result["status"] == "success", result
    mark = db.query(models.GameChoiceMark).one()
    assert mark.user_id == owner
    assert mark.node_id == node.system_id
    assert mark.edge_id is None
    assert mark.done is True
    assert mark.note == "left door"


def test_a_mark_under_a_foreign_uuid_updates_the_local_one(
    db, sheets, monkeypatch, a_game
):
    """The same person marks the same node on both machines, under two uuids.
    Inserting the sheet's would collide with the one-mark-per-node index and
    roll the whole tab back, so the natural key retargets it."""
    node = models.GameChoiceNode(
        system_id=uuid.uuid4(), game_id=a_game.system_id, kind="scene",
        title="Marked", sort_index=0,
    )
    db.add(node)
    db.flush()
    owner = installation_owner_id(db)
    local = models.GameChoiceMark(
        system_id=uuid.uuid4(), user_id=owner, game_id=a_game.system_id,
        node_id=node.system_id, done=False, note="local",
    )
    db.add(local)
    db.flush()
    local_id = local.system_id

    headers = [c.name for c in models.GameChoiceMark.__table__.columns]
    row = {
        "system_id": str(uuid.uuid4()),
        "user_id": str(owner),
        "game_id": str(a_game.system_id),
        "node_id": str(node.system_id),
        "edge_id": "",
        "done": "TRUE",
        "note": "from the sheet",
    }
    sheets({MARK_TAB: [headers, [row.get(h, "") for h in headers]]})

    result = pull.execute_pull_specific(db, MARK_TAB, log_action=False)

    assert result["status"] == "success", result
    marks = db.query(models.GameChoiceMark).all()
    assert len(marks) == 1
    assert marks[0].system_id == local_id
    assert marks[0].note == "from the sheet"
    assert marks[0].done is True
