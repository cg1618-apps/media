"""
API integration tests for /api/game-choice - one shared choice graph per game.

A graph is blocks (start, part, ending) and the edges out of them. An edge is
a BRANCH - a `choice` the player makes or a `condition` the game decides -
which may exist before it leads anywhere and then leads to exactly one block,
or a plain `link` from one block straight to another.

Reads are gated on seeing the game, the way notes are; every write needs
manage.catalog, the way relations do. A save points into the graph through its
`choice_node` field, which the notes API validates against the save's own game.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer

ROUTE = "/api/game-choice"


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def a_game(db):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Branching Game")
    db.add(game)
    db.flush()
    return game


@pytest.fixture
def other_game(db):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Another Game")
    db.add(game)
    db.flush()
    return game


def _node(db, game, kind="part", title="A point", sort_index=0, content=None):
    node = models.GameChoiceNode(
        system_id=uuid.uuid4(),
        game_id=game.system_id,
        kind=kind,
        title=title,
        content=content,
        sort_index=sort_index,
    )
    db.add(node)
    db.flush()
    return node


def _edge(
    db, game, from_node, to_node, kind="link", title=None, content=None, sort_index=0
):
    edge = models.GameChoiceEdge(
        system_id=uuid.uuid4(),
        game_id=game.system_id,
        kind=kind,
        from_node_id=from_node.system_id,
        to_node_id=to_node.system_id if to_node is not None else None,
        title=title,
        content=content,
        sort_index=sort_index,
    )
    db.add(edge)
    db.flush()
    return edge


@pytest.fixture
def start_node(db, a_game):
    """The node every refusal test needs: a write with nothing to refuse
    would pass for the wrong reason."""
    return _node(db, a_game, kind="start", title="Prologue")


@pytest.fixture
def ending_node(db, a_game):
    return _node(db, a_game, kind="ending", title="Good End", sort_index=1)


@pytest.fixture
def an_edge(db, a_game, start_node, ending_node):
    """A choice that already leads somewhere."""
    return _edge(
        db, a_game, start_node, ending_node, kind="choice", title="Spare him"
    )


@pytest.fixture
def open_branch(db, a_game, start_node):
    """A condition that leads nowhere yet - what /next exists for."""
    return _edge(
        db, a_game, start_node, None, kind="condition", title="Affection ≥ 5",
        sort_index=1,
    )


@pytest.fixture
def a_link(db, a_game, ending_node, start_node):
    return _edge(db, a_game, ending_node, start_node, kind="link")


def _post_edge(http, game, **body):
    payload = {"game_id": str(game.system_id)}
    for key, value in body.items():
        payload[key] = str(value) if isinstance(value, uuid.UUID) else value
    return http.post(f"{ROUTE}/edges", json=payload)


# ---------------------------------------------------------------------------
# Reading the graph
# ---------------------------------------------------------------------------


def test_the_graph_returns_nodes_and_edges_in_order(
    client, db, a_game, start_node, ending_node, an_edge
):
    later = _node(db, a_game, kind="part", title="Later", sort_index=5)
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200, res.text
    body = res.json()
    assert [n["title"] for n in body["nodes"]] == ["Prologue", "Good End", "Later"]
    assert body["nodes"][0] == {
        "id": str(start_node.system_id),
        "game_id": str(a_game.system_id),
        "kind": "start",
        "title": "Prologue",
        "content": None,
        "sort_index": 0,
    }
    assert body["edges"] == [
        {
            "id": str(an_edge.system_id),
            "game_id": str(a_game.system_id),
            "kind": "choice",
            "from_node_id": str(start_node.system_id),
            "to_node_id": str(ending_node.system_id),
            "title": "Spare him",
            "content": None,
            "sort_index": 0,
        }
    ]
    assert later.system_id


def test_the_graph_carries_a_branch_that_leads_nowhere_yet(
    client, a_game, open_branch
):
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200, res.text
    (edge,) = res.json()["edges"]
    assert edge["kind"] == "condition"
    assert edge["to_node_id"] is None
    assert edge["title"] == "Affection ≥ 5"


def test_the_graph_holds_only_its_own_game(
    client, db, a_game, other_game, start_node
):
    _node(db, other_game, title="Elsewhere")
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert [n["title"] for n in res.json()["nodes"]] == ["Prologue"]


def test_an_empty_graph_is_two_empty_lists(client, a_game):
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200
    assert res.json() == {"nodes": [], "edges": [], "marks": []}


def test_a_missing_game_is_404(client):
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(uuid.uuid4())})
    assert res.status_code == 404


def test_a_hidden_game_answers_as_a_missing_one(
    db, a_game, start_node, open_branch, nsfw_label, catalog_writer
):
    db.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=a_game.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db.flush()
    writer = catalog_writer()

    res = writer.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 404
    # Writing to it answers the same way, even holding manage.catalog.
    res = writer.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(a_game.system_id), "kind": "part", "title": "X"},
    )
    assert res.status_code == 404
    res = writer.patch(f"{ROUTE}/nodes/{start_node.system_id}", json={"title": "Y"})
    assert res.status_code == 404
    res = writer.post(
        f"{ROUTE}/edges/{open_branch.system_id}/next", json={"title": "Z"}
    )
    assert res.status_code == 404
    assert db.query(models.GameChoiceNode).count() == 1


def test_the_same_writer_reaches_an_unlabelled_game(
    a_game, start_node, open_branch, catalog_writer
):
    """The mirror of the hidden case: the 404 above is the label's doing."""
    writer = catalog_writer()
    res = writer.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200
    res = writer.patch(f"{ROUTE}/nodes/{start_node.system_id}", json={"title": "Y"})
    assert res.status_code == 200, res.text
    res = writer.post(
        f"{ROUTE}/edges/{open_branch.system_id}/next", json={"title": "Z"}
    )
    assert res.status_code == 201, res.text


def test_a_non_game_entry_has_no_graph(client, admin_client, sample_anime):
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(sample_anime.system_id)})
    assert res.status_code == 422
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(sample_anime.system_id), "kind": "start", "title": "X"},
    )
    assert res.status_code == 422


def test_an_h_game_owns_a_graph(admin_client, db):
    entry = models.HGame(h_game_name_cn="分歧")
    db.add(entry)
    db.flush()
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(entry.system_id), "kind": "start", "title": "開始"},
    )
    assert res.status_code == 201, res.text


# ---------------------------------------------------------------------------
# Nodes (blocks)
# ---------------------------------------------------------------------------


def test_creating_a_node(admin_client, db, a_game):
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={
            "game_id": str(a_game.system_id),
            "kind": "part",
            "title": "  The fork  ",
            "content": "Chapter 3",
            "sort_index": 2,
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["title"] == "The fork"
    assert body["kind"] == "part"
    assert body["content"] == "Chapter 3"
    assert body["sort_index"] == 2
    row = db.get(models.GameChoiceNode, uuid.UUID(body["id"]))
    assert row.game_id == a_game.system_id


@pytest.mark.parametrize("kind", ["start", "part", "ending"])
def test_every_block_kind_is_accepted(admin_client, a_game, kind):
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(a_game.system_id), "kind": kind, "title": "T"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["kind"] == kind


def test_a_node_defaults_its_order_to_zero(admin_client, a_game):
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(a_game.system_id), "kind": "part", "title": "S"},
    )
    assert res.status_code == 201
    assert res.json()["sort_index"] == 0
    assert res.json()["content"] is None


@pytest.mark.parametrize("kind", ["route", "", "Start", "choice", "scene", None])
def test_an_unknown_kind_is_refused(admin_client, a_game, kind):
    """choice and scene were kinds once; both are a `part` now."""
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(a_game.system_id), "kind": kind, "title": "T"},
    )
    assert res.status_code == 422


@pytest.mark.parametrize("title", ["", "   ", None])
def test_a_node_needs_a_title(admin_client, a_game, title):
    res = admin_client.post(
        f"{ROUTE}/nodes",
        json={"game_id": str(a_game.system_id), "kind": "part", "title": title},
    )
    assert res.status_code == 422


def test_patching_a_node_changes_only_what_it_names(admin_client, start_node):
    res = admin_client.patch(
        f"{ROUTE}/nodes/{start_node.system_id}",
        json={"content": "Read the letter first", "sort_index": 3},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["title"] == "Prologue"
    assert body["kind"] == "start"
    assert body["content"] == "Read the letter first"
    assert body["sort_index"] == 3


def test_patching_a_node_to_a_blank_title_or_an_old_kind_is_refused(
    admin_client, start_node
):
    res = admin_client.patch(
        f"{ROUTE}/nodes/{start_node.system_id}", json={"title": " "}
    )
    assert res.status_code == 422
    for kind in ("branch", "scene", "choice"):
        res = admin_client.patch(
            f"{ROUTE}/nodes/{start_node.system_id}", json={"kind": kind}
        )
        assert res.status_code == 422
    res = admin_client.patch(
        f"{ROUTE}/nodes/{start_node.system_id}", json={"kind": "part"}
    )
    assert res.status_code == 200, res.text


def test_patching_a_missing_node_is_404(admin_client):
    res = admin_client.patch(f"{ROUTE}/nodes/{uuid.uuid4()}", json={"title": "X"})
    assert res.status_code == 404


def test_deleting_a_node_cascades_the_edges_out_of_it(
    admin_client, db, a_game, start_node, ending_node
):
    side = _node(db, a_game, title="Side")
    out_link = _edge(db, a_game, ending_node, side)
    out_branch = _edge(db, a_game, ending_node, side, kind="choice", title="Go")
    open_out = _edge(db, a_game, ending_node, None, kind="condition", title="Roll")
    survivor = _edge(db, a_game, start_node, side)
    gone = [out_link.system_id, out_branch.system_id, open_out.system_id]
    survivor_id = survivor.system_id

    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204

    db.expire_all()
    assert db.get(models.GameChoiceNode, ending_node.system_id) is None
    for edge_id in gone:
        assert db.get(models.GameChoiceEdge, edge_id) is None
    assert db.get(models.GameChoiceEdge, survivor_id) is not None


def test_deleting_a_target_node_nulls_the_branches_and_deletes_the_links(
    admin_client, db, a_game, start_node, ending_node, an_edge
):
    """A branch outlives the block it led to and leads nowhere again; a link
    cannot lead nowhere, so it goes."""
    side = _node(db, a_game, title="Side")
    condition_in = _edge(
        db, a_game, side, ending_node, kind="condition", title="Bad roll"
    )
    link_in = _edge(db, a_game, side, ending_node)
    unrelated_link = _edge(db, a_game, start_node, side)
    branch_ids = [an_edge.system_id, condition_in.system_id]
    link_id, unrelated_id = link_in.system_id, unrelated_link.system_id

    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204, res.text

    db.expire_all()
    for edge_id in branch_ids:
        kept = db.get(models.GameChoiceEdge, edge_id)
        assert kept is not None
        assert kept.to_node_id is None
    assert db.get(models.GameChoiceEdge, an_edge.system_id).title == "Spare him"
    assert db.get(models.GameChoiceEdge, link_id) is None
    assert db.get(models.GameChoiceEdge, unrelated_id).to_node_id == side.system_id


def test_deleting_a_node_clears_the_saves_on_it_and_keeps_their_other_fields(
    admin_client, db, a_game, admin_user, start_node, ending_node
):
    on_it = models.Note(
        system_id=uuid.uuid4(),
        media_id=a_game.system_id,
        author_id=admin_user.id,
        section="saves",
        locator="3",
        kind="regular",
        fields={"based_on": "2", "choice_node": str(ending_node.system_id)},
    )
    elsewhere = models.Note(
        system_id=uuid.uuid4(),
        media_id=a_game.system_id,
        author_id=admin_user.id,
        section="saves",
        locator="4",
        kind="regular",
        fields={"choice_node": str(start_node.system_id)},
    )
    db.add_all([on_it, elsewhere])
    db.flush()

    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204

    db.expire_all()
    assert db.get(models.Note, on_it.system_id).fields == {"based_on": "2"}
    assert db.get(models.Note, on_it.system_id).locator == "3"
    assert db.get(models.Note, elsewhere.system_id).fields == {
        "choice_node": str(start_node.system_id)
    }


def test_deleting_the_game_takes_its_whole_graph(
    admin_client, db, a_game, start_node, ending_node, an_edge, open_branch
):
    """Every block goes at once here, so a link may be reached through the
    SET NULL on its target before the cascade from its own block - and a link
    may not lead nowhere. Links in both directions, a branch into a block and
    a branch leading back to its own block make that ordering bite."""
    side = _node(db, a_game, title="Side")
    _edge(db, a_game, start_node, side)
    _edge(db, a_game, side, start_node)
    _edge(db, a_game, ending_node, side)
    _edge(db, a_game, side, side, kind="choice", title="Ask again")
    game_id = a_game.system_id

    res = admin_client.delete(f"/api/game/{game_id}")
    assert res.status_code == 200, res.text

    db.expire_all()
    assert db.query(models.GameChoiceNode).filter_by(game_id=game_id).count() == 0
    assert db.query(models.GameChoiceEdge).filter_by(game_id=game_id).count() == 0


def test_deleting_a_missing_node_is_404(admin_client):
    assert admin_client.delete(f"{ROUTE}/nodes/{uuid.uuid4()}").status_code == 404


# ---------------------------------------------------------------------------
# Edges: branches (choice, condition) and links
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", ["choice", "condition"])
def test_creating_a_branch(admin_client, a_game, start_node, ending_node, kind):
    res = _post_edge(
        admin_client,
        a_game,
        kind=kind,
        from_node_id=start_node.system_id,
        to_node_id=ending_node.system_id,
        title="  Take the sword ",
        content="  Costs 3 gold ",
        sort_index=1,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["kind"] == kind
    assert body["from_node_id"] == str(start_node.system_id)
    assert body["to_node_id"] == str(ending_node.system_id)
    assert body["title"] == "Take the sword"
    assert body["content"] == "Costs 3 gold"
    assert body["sort_index"] == 1


@pytest.mark.parametrize("to_node_id", ["absent", None])
def test_a_branch_may_exist_before_it_leads_anywhere(
    admin_client, db, a_game, start_node, to_node_id
):
    body = {"kind": "choice", "from_node_id": start_node.system_id, "title": "Ask"}
    if to_node_id != "absent":
        body["to_node_id"] = to_node_id
    res = _post_edge(admin_client, a_game, **body)
    assert res.status_code == 201, res.text
    assert res.json()["to_node_id"] is None
    assert res.json()["content"] is None
    assert res.json()["sort_index"] == 0
    row = db.get(models.GameChoiceEdge, uuid.UUID(res.json()["id"]))
    assert row.to_node_id is None


def test_creating_a_link(admin_client, a_game, start_node, ending_node):
    res = _post_edge(
        admin_client,
        a_game,
        kind="link",
        from_node_id=start_node.system_id,
        to_node_id=ending_node.system_id,
        title="  ",
        content="",
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["kind"] == "link"
    assert body["title"] is None
    assert body["content"] is None
    assert body["to_node_id"] == str(ending_node.system_id)


def test_a_link_must_lead_somewhere(admin_client, db, a_game, start_node):
    for body in (
        {"kind": "link", "from_node_id": start_node.system_id},
        {"kind": "link", "from_node_id": start_node.system_id, "to_node_id": None},
    ):
        res = _post_edge(admin_client, a_game, **body)
        assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceEdge).count() == 0


@pytest.mark.parametrize("field", ["title", "content"])
def test_a_link_carries_no_text(
    admin_client, db, a_game, start_node, ending_node, field
):
    res = _post_edge(
        admin_client,
        a_game,
        kind="link",
        from_node_id=start_node.system_id,
        to_node_id=ending_node.system_id,
        **{field: "Words"},
    )
    assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceEdge).count() == 0


@pytest.mark.parametrize("kind", ["choice", "condition"])
@pytest.mark.parametrize("title", ["absent", None, "", "   "])
def test_a_branch_needs_a_title(admin_client, db, a_game, start_node, kind, title):
    body = {"kind": kind, "from_node_id": start_node.system_id}
    if title != "absent":
        body["title"] = title
    res = _post_edge(admin_client, a_game, **body)
    assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceEdge).count() == 0


@pytest.mark.parametrize("kind", ["absent", None, "", "option", "Choice"])
def test_an_unknown_edge_kind_is_refused(
    admin_client, db, a_game, start_node, ending_node, kind
):
    body = {
        "from_node_id": start_node.system_id,
        "to_node_id": ending_node.system_id,
        "title": "T",
    }
    if kind != "absent":
        body["kind"] = kind
    res = _post_edge(admin_client, a_game, **body)
    assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceEdge).count() == 0


def test_branches_may_rejoin_and_cycle(admin_client, db, a_game, start_node, ending_node):
    hub = _node(db, a_game, title="Hub")
    for kind, src, dst in (
        ("link", start_node, hub),
        ("choice", hub, ending_node),
        ("condition", ending_node, hub),
        ("link", ending_node, hub),
    ):
        res = _post_edge(
            admin_client,
            a_game,
            kind=kind,
            from_node_id=src.system_id,
            to_node_id=dst.system_id,
            title=None if kind == "link" else "Go",
        )
        assert res.status_code == 201, res.text


def test_a_link_self_loop_is_refused(admin_client, db, a_game, start_node):
    res = _post_edge(
        admin_client,
        a_game,
        kind="link",
        from_node_id=start_node.system_id,
        to_node_id=start_node.system_id,
    )
    assert res.status_code == 422
    assert db.query(models.GameChoiceEdge).count() == 0


@pytest.mark.parametrize("kind", ["choice", "condition"])
def test_a_branch_may_lead_back_to_its_own_block(
    admin_client, db, a_game, start_node, kind
):
    """"Ask again" returns the player to the block they asked from."""
    res = _post_edge(
        admin_client,
        a_game,
        kind=kind,
        from_node_id=start_node.system_id,
        to_node_id=start_node.system_id,
        title="Ask again",
    )
    assert res.status_code == 201, res.text
    assert res.json()["to_node_id"] == str(start_node.system_id)


def test_an_edge_to_another_games_node_is_refused(
    admin_client, db, a_game, other_game, start_node
):
    foreign = _node(db, other_game, title="Not here")
    for kind in ("link", "choice"):
        for from_id, to_id in (
            (start_node.system_id, foreign.system_id),
            (foreign.system_id, start_node.system_id),
        ):
            res = _post_edge(
                admin_client,
                a_game,
                kind=kind,
                from_node_id=from_id,
                to_node_id=to_id,
                title=None if kind == "link" else "Go",
            )
            assert res.status_code == 422
    # A branch with no next part still needs its block to be of this game.
    res = _post_edge(
        admin_client, a_game, kind="choice", from_node_id=foreign.system_id, title="Go"
    )
    assert res.status_code == 422
    assert db.query(models.GameChoiceEdge).count() == 0


def test_an_edge_whose_nodes_are_both_of_another_game_is_refused(
    admin_client, db, a_game, other_game
):
    """game_id is denormalised onto the edge, so it must agree with both ends
    even when the two ends agree with each other."""
    one = _node(db, other_game, title="One")
    two = _node(db, other_game, title="Two")
    res = _post_edge(
        admin_client,
        a_game,
        kind="link",
        from_node_id=one.system_id,
        to_node_id=two.system_id,
    )
    assert res.status_code == 422


def test_an_edge_to_a_missing_node_is_refused(admin_client, a_game, start_node):
    res = _post_edge(
        admin_client,
        a_game,
        kind="choice",
        from_node_id=start_node.system_id,
        to_node_id=uuid.uuid4(),
        title="Go",
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Editing an edge
# ---------------------------------------------------------------------------


def test_patching_a_branchs_text_and_order(admin_client, an_edge):
    url = f"{ROUTE}/edges/{an_edge.system_id}"
    res = admin_client.patch(url, json={"title": " Kill him ", "content": "Cold"})
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Kill him"
    assert res.json()["content"] == "Cold"
    assert res.json()["sort_index"] == 0
    res = admin_client.patch(url, json={"sort_index": 4, "content": "  "})
    assert res.json()["title"] == "Kill him"
    assert res.json()["content"] is None
    assert res.json()["sort_index"] == 4


def test_a_branch_cannot_be_patched_to_a_blank_title(admin_client, db, an_edge):
    for title in ("", "  ", None):
        res = admin_client.patch(
            f"{ROUTE}/edges/{an_edge.system_id}", json={"title": title}
        )
        assert res.status_code == 422, res.text
    db.expire_all()
    assert db.get(models.GameChoiceEdge, an_edge.system_id).title == "Spare him"


def test_a_branch_switches_between_choice_and_condition(admin_client, an_edge):
    url = f"{ROUTE}/edges/{an_edge.system_id}"
    res = admin_client.patch(url, json={"kind": "condition"})
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "condition"
    assert res.json()["title"] == "Spare him"
    res = admin_client.patch(url, json={"kind": "choice"})
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "choice"


def test_a_branch_cannot_become_a_link_nor_a_link_a_branch(
    admin_client, db, an_edge, a_link
):
    res = admin_client.patch(f"{ROUTE}/edges/{an_edge.system_id}", json={"kind": "link"})
    assert res.status_code == 422
    for kind in ("choice", "condition"):
        res = admin_client.patch(
            f"{ROUTE}/edges/{a_link.system_id}", json={"kind": kind, "title": "Now"}
        )
        assert res.status_code == 422
    res = admin_client.patch(f"{ROUTE}/edges/{an_edge.system_id}", json={"kind": "x"})
    assert res.status_code == 422
    db.expire_all()
    assert db.get(models.GameChoiceEdge, an_edge.system_id).kind == "choice"
    assert db.get(models.GameChoiceEdge, a_link.system_id).kind == "link"


def test_repointing_a_branch_and_clearing_its_next_part(
    admin_client, db, a_game, an_edge
):
    other = _node(db, a_game, title="Other")
    url = f"{ROUTE}/edges/{an_edge.system_id}"
    res = admin_client.patch(url, json={"to_node_id": str(other.system_id)})
    assert res.status_code == 200, res.text
    assert res.json()["to_node_id"] == str(other.system_id)

    res = admin_client.patch(url, json={"to_node_id": None})
    assert res.status_code == 200, res.text
    assert res.json()["to_node_id"] is None
    assert res.json()["title"] == "Spare him"


def test_repointing_a_link(admin_client, db, a_game, a_link):
    other = _node(db, a_game, title="Other")
    res = admin_client.patch(
        f"{ROUTE}/edges/{a_link.system_id}", json={"to_node_id": str(other.system_id)}
    )
    assert res.status_code == 200, res.text
    assert res.json()["to_node_id"] == str(other.system_id)


def test_a_link_cannot_be_cleared_nor_pointed_at_itself(
    admin_client, db, a_link, ending_node
):
    url = f"{ROUTE}/edges/{a_link.system_id}"
    res = admin_client.patch(url, json={"to_node_id": None})
    assert res.status_code == 422
    res = admin_client.patch(url, json={"to_node_id": str(ending_node.system_id)})
    assert res.status_code == 422
    db.expire_all()
    assert db.get(models.GameChoiceEdge, a_link.system_id).to_node_id is not None


def test_a_branch_may_be_repointed_at_its_own_block(admin_client, an_edge, start_node):
    res = admin_client.patch(
        f"{ROUTE}/edges/{an_edge.system_id}",
        json={"to_node_id": str(start_node.system_id)},
    )
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("field", ["title", "content"])
def test_a_link_cannot_be_given_text(admin_client, a_link, field):
    res = admin_client.patch(
        f"{ROUTE}/edges/{a_link.system_id}", json={field: "Words"}
    )
    assert res.status_code == 422
    # Blank is no text at all, so it is not a refusal.
    res = admin_client.patch(f"{ROUTE}/edges/{a_link.system_id}", json={field: " "})
    assert res.status_code == 200, res.text


def test_repointing_at_another_games_or_a_missing_node_is_refused(
    admin_client, db, other_game, an_edge, a_link
):
    foreign = _node(db, other_game, title="Not here")
    for edge in (an_edge, a_link):
        for target in (foreign.system_id, uuid.uuid4()):
            res = admin_client.patch(
                f"{ROUTE}/edges/{edge.system_id}", json={"to_node_id": str(target)}
            )
            assert res.status_code == 422, res.text


def test_deleting_an_edge_keeps_its_nodes(admin_client, db, an_edge, start_node):
    res = admin_client.delete(f"{ROUTE}/edges/{an_edge.system_id}")
    assert res.status_code == 204
    db.expire_all()
    assert db.get(models.GameChoiceEdge, an_edge.system_id) is None
    assert db.get(models.GameChoiceNode, start_node.system_id) is not None


def test_a_missing_edge_is_404(admin_client):
    assert admin_client.delete(f"{ROUTE}/edges/{uuid.uuid4()}").status_code == 404
    res = admin_client.patch(f"{ROUTE}/edges/{uuid.uuid4()}", json={"title": "x"})
    assert res.status_code == 404
    res = admin_client.post(f"{ROUTE}/edges/{uuid.uuid4()}/next", json={"title": "x"})
    assert res.status_code == 404
    res = admin_client.post(f"{ROUTE}/edges/not-a-uuid/next", json={"title": "x"})
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# A branch's next part, created in one step
# ---------------------------------------------------------------------------


def test_next_creates_a_block_and_points_the_branch_at_it(
    admin_client, db, a_game, start_node, ending_node, open_branch
):
    res = admin_client.post(
        f"{ROUTE}/edges/{open_branch.system_id}/next",
        json={"title": "  The confession ", "content": "Rooftop"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    node, edge = body["node"], body["edge"]
    assert node["kind"] == "part"
    assert node["title"] == "The confession"
    assert node["content"] == "Rooftop"
    assert node["game_id"] == str(a_game.system_id)
    # After every block already in the game: Prologue 0, Good End 1.
    assert node["sort_index"] == 2
    assert edge["id"] == str(open_branch.system_id)
    assert edge["to_node_id"] == node["id"]
    assert edge["kind"] == "condition"

    db.expire_all()
    assert db.get(models.GameChoiceEdge, open_branch.system_id).to_node_id == uuid.UUID(
        node["id"]
    )
    assert db.get(models.GameChoiceNode, uuid.UUID(node["id"])) is not None


def test_next_takes_a_kind(admin_client, open_branch):
    res = admin_client.post(
        f"{ROUTE}/edges/{open_branch.system_id}/next",
        json={"title": "Bad End", "kind": "ending"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["node"]["kind"] == "ending"
    assert res.json()["node"]["content"] is None


@pytest.mark.parametrize(
    "body", [{"title": ""}, {"title": "  "}, {}, {"title": "X", "kind": "scene"}]
)
def test_next_validates_the_block(admin_client, db, open_branch, body):
    res = admin_client.post(f"{ROUTE}/edges/{open_branch.system_id}/next", json=body)
    assert res.status_code == 422, res.text
    db.expire_all()
    assert db.get(models.GameChoiceEdge, open_branch.system_id).to_node_id is None
    assert db.query(models.GameChoiceNode).count() == 1


def test_next_is_409_when_the_branch_already_leads_somewhere(
    admin_client, db, an_edge, ending_node
):
    nodes_before = db.query(models.GameChoiceNode).count()
    res = admin_client.post(
        f"{ROUTE}/edges/{an_edge.system_id}/next", json={"title": "Another"}
    )
    assert res.status_code == 409, res.text
    db.expire_all()
    assert db.get(models.GameChoiceEdge, an_edge.system_id).to_node_id == (
        ending_node.system_id
    )
    assert db.query(models.GameChoiceNode).count() == nodes_before


def test_next_is_422_on_a_link(admin_client, db, a_link):
    nodes_before = db.query(models.GameChoiceNode).count()
    res = admin_client.post(
        f"{ROUTE}/edges/{a_link.system_id}/next", json={"title": "Another"}
    )
    assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceNode).count() == nodes_before


# ---------------------------------------------------------------------------
# The write gate
# ---------------------------------------------------------------------------


def _every_write(game, start_node, ending_node, edge, open_branch, link):
    """One call per write route, each naming rows that exist."""
    return [
        (
            "post",
            f"{ROUTE}/nodes",
            {"game_id": str(game.system_id), "kind": "part", "title": "New"},
        ),
        ("patch", f"{ROUTE}/nodes/{start_node.system_id}", {"title": "Renamed"}),
        (
            "post",
            f"{ROUTE}/edges",
            {
                "game_id": str(game.system_id),
                "kind": "choice",
                "from_node_id": str(ending_node.system_id),
                "title": "Again",
            },
        ),
        (
            "post",
            f"{ROUTE}/edges",
            {
                "game_id": str(game.system_id),
                "kind": "link",
                "from_node_id": str(start_node.system_id),
                "to_node_id": str(ending_node.system_id),
            },
        ),
        ("patch", f"{ROUTE}/edges/{edge.system_id}", {"title": "Changed"}),
        ("patch", f"{ROUTE}/edges/{edge.system_id}", {"kind": "condition"}),
        ("patch", f"{ROUTE}/edges/{edge.system_id}", {"to_node_id": None}),
        ("patch", f"{ROUTE}/edges/{link.system_id}", {"sort_index": 3}),
        ("post", f"{ROUTE}/edges/{open_branch.system_id}/next", {"title": "Then"}),
        ("delete", f"{ROUTE}/edges/{edge.system_id}", None),
        ("delete", f"{ROUTE}/nodes/{ending_node.system_id}", None),
    ]


EXPECTED_ALLOWED = [201, 200, 201, 201, 200, 200, 200, 200, 201, 204, 204]


def _call(http, method, url, body):
    if body is None:
        return getattr(http, method)(url)
    return getattr(http, method)(url, json=body)


@pytest.mark.parametrize("who", ["user_client", "client"])
def test_every_write_is_refused_without_manage_catalog(
    request, db, who, a_game, start_node, ending_node, an_edge, open_branch, a_link
):
    """The graph already holds two nodes, a branch that leads somewhere, one
    that does not and a link, so every refusal has something to refuse - an
    empty graph would let a broken gate pass."""
    http = request.getfixturevalue(who)
    calls = _every_write(a_game, start_node, ending_node, an_edge, open_branch, a_link)
    for method, url, body in calls:
        res = _call(http, method, url, body)
        assert res.status_code == 401, (method, url, res.status_code)

    db.expire_all()
    assert db.query(models.GameChoiceNode).filter_by(game_id=a_game.system_id).count() == 2
    assert db.query(models.GameChoiceEdge).count() == 3
    assert db.get(models.GameChoiceNode, start_node.system_id).title == "Prologue"
    edge = db.get(models.GameChoiceEdge, an_edge.system_id)
    assert (edge.title, edge.kind, edge.to_node_id) == (
        "Spare him", "choice", ending_node.system_id,
    )
    assert db.get(models.GameChoiceEdge, open_branch.system_id).to_node_id is None
    assert db.get(models.GameChoiceEdge, a_link.system_id).sort_index == 0


def test_every_write_is_allowed_with_manage_catalog(
    admin_client, db, a_game, start_node, ending_node, an_edge, open_branch, a_link
):
    """The mirror of the refusal, with the same rows."""
    calls = _every_write(a_game, start_node, ending_node, an_edge, open_branch, a_link)
    assert len(calls) == len(EXPECTED_ALLOWED)
    for (method, url, body), status in zip(calls, EXPECTED_ALLOWED):
        res = _call(admin_client, method, url, body)
        assert res.status_code == status, (method, url, res.text)


def test_a_plain_user_may_still_read_the_graph(user_client, a_game, start_node):
    res = user_client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200
    assert len(res.json()["nodes"]) == 1

# ---------------------------------------------------------------------------
# A save sits on a node
# ---------------------------------------------------------------------------


def _save(game, **fields):
    return {
        "owner_type": "game",
        "owner_id": str(game.system_id),
        "section": "saves",
        "locator": "1",
        "kind": "regular",
        "fields": fields,
    }


def test_a_save_may_name_a_node_of_its_own_game(user_client, db, a_game, start_node):
    # A plain `user`: saves are personal, and the root role holds no
    # personal rows (Viewer.has keeps the self.* family out of its
    # short-circuit).
    res = user_client.post(
        "/api/notes", json=_save(a_game, choice_node=str(start_node.system_id))
    )
    assert res.status_code == 201, res.text
    assert res.json()["fields"]["choice_node"] == str(start_node.system_id)


def test_a_save_naming_another_games_node_is_refused(
    user_client, db, a_game, other_game
):
    foreign = _node(db, other_game, title="Elsewhere")
    res = user_client.post(
        "/api/notes", json=_save(a_game, choice_node=str(foreign.system_id))
    )
    assert res.status_code == 422
    assert db.query(models.Note).filter_by(section="saves").count() == 0


@pytest.mark.parametrize("value", ["not-a-uuid", "UUID"])
def test_a_save_naming_no_node_is_refused(user_client, db, a_game, value):
    bad = str(uuid.uuid4()) if value == "UUID" else value
    res = user_client.post("/api/notes", json=_save(a_game, choice_node=bad))
    assert res.status_code == 422


def test_a_save_can_move_off_a_node_and_onto_another(
    user_client, db, a_game, other_game, start_node, ending_node
):
    res = user_client.post(
        "/api/notes", json=_save(a_game, choice_node=str(start_node.system_id))
    )
    note_id = res.json()["system_id"]

    res = user_client.patch(
        f"/api/notes/{note_id}",
        json={"fields": {"choice_node": str(ending_node.system_id)}},
    )
    assert res.status_code == 200, res.text
    assert res.json()["fields"]["choice_node"] == str(ending_node.system_id)

    foreign = _node(db, other_game, title="Elsewhere")
    res = user_client.patch(
        f"/api/notes/{note_id}",
        json={"fields": {"choice_node": str(foreign.system_id)}},
    )
    assert res.status_code == 422

    for blank in ("", None):
        res = user_client.patch(
            f"/api/notes/{note_id}", json={"fields": {"choice_node": blank}}
        )
        assert res.status_code == 200, res.text
        assert not res.json()["fields"].get("choice_node")


def test_the_saves_section_publishes_the_choice_node_field(client):
    res = client.get("/api/notes/sections", params={"owner_type": "game"})
    assert res.status_code == 200, res.text
    saves = next(s for s in res.json() if s["key"] == "saves")
    field = next(f for f in saves["fields"] if f["key"] == "choice_node")
    assert field["label"] == "At node"
    assert field["type"] == "choice_node"
    assert field["column"] is None


# ---------------------------------------------------------------------------
# Personal marks: done, and a note, per user per node or edge
# ---------------------------------------------------------------------------


def _mark(db, user, game, node=None, edge=None, done=True, note=None):
    row = models.GameChoiceMark(
        system_id=uuid.uuid4(),
        user_id=user.id,
        game_id=game.system_id,
        node_id=node.system_id if node is not None else None,
        edge_id=edge.system_id if edge is not None else None,
        done=done,
        note=note,
    )
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def no_notes_client(db, client):
    """A signed-in account holding every default permission but
    self.personal_notes - the one the mark gate asks for."""
    return make_viewer(
        db,
        client,
        "nonotes",
        default_user_permissions() - {PERM_SELF_PERSONAL_NOTES},
    )


def test_marking_a_node_done_with_a_note(user_client, db, plain_user, start_node):
    res = user_client.put(
        f"{ROUTE}/nodes/{start_node.system_id}/mark",
        json={"done": True, "note": "took the left door"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["node_id"] == str(start_node.system_id)
    assert body["edge_id"] is None
    assert body["done"] is True
    assert body["note"] == "took the left door"
    row = db.get(models.GameChoiceMark, uuid.UUID(body["id"]))
    assert row.user_id == plain_user.id


def test_marking_twice_updates_the_one_row(user_client, db, an_edge):
    url = f"{ROUTE}/edges/{an_edge.system_id}/mark"
    first = user_client.put(url, json={"done": True, "note": None})
    second = user_client.put(url, json={"done": False, "note": "maybe later"})
    assert second.status_code == 200, second.text
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["edge_id"] == str(an_edge.system_id)
    assert second.json()["node_id"] is None
    assert second.json()["done"] is False
    assert db.query(models.GameChoiceMark).count() == 1


@pytest.mark.parametrize("note", [None, "", "   "])
def test_an_empty_mark_removes_the_row(user_client, db, start_node, note):
    url = f"{ROUTE}/nodes/{start_node.system_id}/mark"
    user_client.put(url, json={"done": True, "note": "x"})
    assert db.query(models.GameChoiceMark).count() == 1
    res = user_client.put(url, json={"done": False, "note": note})
    assert res.status_code == 200, res.text
    assert res.json() == {
        "id": None,
        "node_id": str(start_node.system_id),
        "edge_id": None,
        "done": False,
        "note": None,
    }
    assert db.query(models.GameChoiceMark).count() == 0


def test_an_empty_mark_on_an_unmarked_edge_is_a_no_op(user_client, db, an_edge):
    res = user_client.put(
        f"{ROUTE}/edges/{an_edge.system_id}/mark", json={"done": False, "note": None}
    )
    assert res.status_code == 200
    assert res.json()["id"] is None
    assert res.json()["edge_id"] == str(an_edge.system_id)
    assert db.query(models.GameChoiceMark).count() == 0


def test_marking_a_missing_node_or_edge_is_404(user_client):
    body = {"done": True, "note": None}
    res = user_client.put(f"{ROUTE}/nodes/{uuid.uuid4()}/mark", json=body)
    assert res.status_code == 404
    res = user_client.put(f"{ROUTE}/edges/{uuid.uuid4()}/mark", json=body)
    assert res.status_code == 404


def test_marking_is_refused_for_a_guest(client, db, start_node, an_edge):
    body = {"done": True, "note": "x"}
    res = client.put(f"{ROUTE}/nodes/{start_node.system_id}/mark", json=body)
    assert res.status_code == 401
    res = client.put(f"{ROUTE}/edges/{an_edge.system_id}/mark", json=body)
    assert res.status_code == 401
    assert db.query(models.GameChoiceMark).count() == 0


def test_marking_is_refused_without_self_personal_notes(
    no_notes_client, db, start_node, an_edge
):
    body = {"done": True, "note": "x"}
    res = no_notes_client.put(f"{ROUTE}/nodes/{start_node.system_id}/mark", json=body)
    assert res.status_code == 401
    res = no_notes_client.put(f"{ROUTE}/edges/{an_edge.system_id}/mark", json=body)
    assert res.status_code == 401
    assert db.query(models.GameChoiceMark).count() == 0


def test_a_link_cannot_be_marked(user_client, db, a_link):
    """Marks are for blocks and branches; a link is only the arrow between
    two blocks. Holding self.personal_notes, so the 422 is the link's doing."""
    res = user_client.put(
        f"{ROUTE}/edges/{a_link.system_id}/mark", json={"done": True, "note": "x"}
    )
    assert res.status_code == 422, res.text
    assert db.query(models.GameChoiceMark).count() == 0


@pytest.mark.parametrize("fixture", ["an_edge", "open_branch"])
def test_a_branch_can_be_marked(request, user_client, db, fixture):
    """The mirror: the same viewer marks a choice that leads somewhere and a
    condition that leads nowhere yet."""
    branch = request.getfixturevalue(fixture)
    res = user_client.put(
        f"{ROUTE}/edges/{branch.system_id}/mark", json={"done": True, "note": "x"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["edge_id"] == str(branch.system_id)
    assert db.query(models.GameChoiceMark).count() == 1


def test_marking_does_not_need_manage_catalog(user_client, start_node, an_edge):
    """The mirror: a plain `user` holds self.personal_notes and not
    manage.catalog, and may mark both kinds of thing."""
    body = {"done": True, "note": None}
    res = user_client.put(f"{ROUTE}/nodes/{start_node.system_id}/mark", json=body)
    assert res.status_code == 200, res.text
    res = user_client.put(f"{ROUTE}/edges/{an_edge.system_id}/mark", json=body)
    assert res.status_code == 200, res.text


def test_marking_on_a_hidden_game_is_404(
    db, a_game, start_node, an_edge, nsfw_label, catalog_writer
):
    db.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=a_game.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db.flush()
    writer = catalog_writer(extra={PERM_SELF_PERSONAL_NOTES})
    body = {"done": True, "note": None}
    res = writer.put(f"{ROUTE}/nodes/{start_node.system_id}/mark", json=body)
    assert res.status_code == 404
    res = writer.put(f"{ROUTE}/edges/{an_edge.system_id}/mark", json=body)
    assert res.status_code == 404
    assert db.query(models.GameChoiceMark).count() == 0


def test_the_graph_carries_only_the_viewers_own_marks(
    db, a_game, plain_user, client, user_client, start_node, an_edge,
):
    # Two ordinary accounts, both holding self.personal_notes, both with
    # marks on the same graph - so "only mine" has something to leave out.
    other_client = make_viewer(db, client, "othermarker", default_user_permissions())
    other = db.query(models.User).filter_by(username="othermarker").one()
    mine = _mark(db, plain_user, a_game, node=start_node, note="mine")
    theirs = _mark(db, other, a_game, node=start_node, note="theirs")
    their_edge = _mark(db, other, a_game, edge=an_edge)
    params = {"game_id": str(a_game.system_id)}

    as_user = user_client.get(f"{ROUTE}/graph", params=params).json()["marks"]
    assert as_user == [
        {
            "id": str(mine.system_id),
            "node_id": str(start_node.system_id),
            "edge_id": None,
            "done": True,
            "note": "mine",
        }
    ]
    as_other = other_client.get(f"{ROUTE}/graph", params=params).json()["marks"]
    assert {m["id"] for m in as_other} == {
        str(theirs.system_id),
        str(their_edge.system_id),
    }


def test_a_viewer_without_personal_notes_sees_no_marks(
    db, a_game, admin_user, start_node, no_notes_client
):
    _mark(db, admin_user, a_game, node=start_node)
    res = no_notes_client.get(
        f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)}
    )
    assert res.status_code == 200
    assert res.json()["marks"] == []


def test_a_guest_sees_no_marks(db, a_game, admin_user, start_node, client):
    _mark(db, admin_user, a_game, node=start_node)
    res = client.get(f"{ROUTE}/graph", params={"game_id": str(a_game.system_id)})
    assert res.status_code == 200
    assert res.json()["marks"] == []


def test_deleting_a_node_or_an_edge_takes_its_marks(
    admin_client, db, a_game, plain_user, start_node, ending_node, an_edge
):
    on_node = _mark(db, plain_user, a_game, node=ending_node)
    on_edge = _mark(db, plain_user, a_game, edge=an_edge)
    kept = _mark(db, plain_user, a_game, node=start_node)
    node_mark, edge_mark, kept_mark = (
        on_node.system_id, on_edge.system_id, kept.system_id
    )

    res = admin_client.delete(f"{ROUTE}/edges/{an_edge.system_id}")
    assert res.status_code == 204
    db.expire_all()
    assert db.get(models.GameChoiceMark, edge_mark) is None
    assert db.get(models.GameChoiceMark, node_mark) is not None

    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204
    db.expire_all()
    assert db.get(models.GameChoiceMark, node_mark) is None
    assert db.get(models.GameChoiceMark, kept_mark) is not None


# ---------------------------------------------------------------------------
# Review fixes: canonical links, unrelated edits, and the deleted-record log
# ---------------------------------------------------------------------------


def test_a_choice_node_is_stored_canonical_and_cleared_with_its_node(
    user_client, admin_client, db, a_game, ending_node
):
    padded = f"  {str(ending_node.system_id).upper()} "
    res = user_client.post("/api/notes", json=_save(a_game, choice_node=padded))
    assert res.status_code == 201, res.text
    note_id = uuid.UUID(res.json()["system_id"])
    assert res.json()["fields"]["choice_node"] == str(ending_node.system_id)

    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204
    db.expire_all()
    assert "choice_node" not in (db.get(models.Note, note_id).fields or {})


@pytest.mark.parametrize("blank", ["", "  ", None])
def test_a_blank_choice_node_removes_the_key(user_client, a_game, start_node, blank):
    res = user_client.post(
        "/api/notes",
        json=_save(a_game, based_on="2", choice_node=str(start_node.system_id)),
    )
    note_id = res.json()["system_id"]
    res = user_client.patch(
        f"/api/notes/{note_id}",
        json={"fields": {"based_on": "2", "choice_node": blank}},
    )
    assert res.status_code == 200, res.text
    assert res.json()["fields"] == {"based_on": "2"}


def test_an_unrelated_edit_of_a_save_with_a_dangling_link_succeeds(
    user_client, db, a_game, plain_user
):
    """The node it names is missing on this machine - a Pull that brought the
    save but not the graph. Renaming the save must not 422 over it."""
    dangling = str(uuid.uuid4())
    save = models.Note(
        system_id=uuid.uuid4(),
        media_id=a_game.system_id,
        author_id=plain_user.id,
        section="saves",
        locator="1",
        kind="regular",
        fields={"choice_node": dangling},
    )
    db.add(save)
    db.flush()

    res = user_client.patch(f"/api/notes/{save.system_id}", json={"title": "Renamed"})
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Renamed"
    assert res.json()["fields"]["choice_node"] == dangling

    # Sending the same stored value back is not a change either.
    res = user_client.patch(
        f"/api/notes/{save.system_id}", json={"fields": {"choice_node": dangling}}
    )
    assert res.status_code == 200, res.text

    # Setting a dangling link is still refused.
    res = user_client.patch(
        f"/api/notes/{save.system_id}",
        json={"fields": {"choice_node": str(uuid.uuid4())}},
    )
    assert res.status_code == 422




def test_a_deleted_node_is_logged_under_its_title(admin_client, db, start_node):
    res = admin_client.delete(f"{ROUTE}/nodes/{start_node.system_id}")
    assert res.status_code == 204
    logged = db.query(models.DeletedRecord).filter_by(type="Game Choice Node").one()
    assert logged.name_cn == "Prologue"


@pytest.mark.parametrize("kind", ["choice", "condition"])
def test_a_deleted_branch_is_logged_under_its_title(
    admin_client, db, a_game, start_node, kind
):
    branch = _edge(db, a_game, start_node, None, kind=kind, title="Spare him")
    res = admin_client.delete(f"{ROUTE}/edges/{branch.system_id}")
    assert res.status_code == 204
    logged = db.query(models.DeletedRecord).filter_by(type="Game Choice Edge").one()
    assert logged.name_cn == "Spare him"
    assert logged.category == kind


def test_a_deleted_link_is_logged_by_its_two_ends(
    admin_client, db, a_game, start_node, ending_node
):
    link = _edge(db, a_game, start_node, ending_node)
    res = admin_client.delete(f"{ROUTE}/edges/{link.system_id}")
    assert res.status_code == 204
    logged = db.query(models.DeletedRecord).filter_by(type="Game Choice Edge").one()
    assert logged.name_cn == "Prologue → Good End"


def test_a_deleted_node_logs_every_edge_it_takes_and_no_other(
    admin_client, db, a_game, start_node, ending_node, an_edge
):
    """Out of the node: everything goes. Into it: the links go, the branches
    (an_edge, "Spare him") stay and lead nowhere - so they are not logged."""
    side = _node(db, a_game, title="Side")
    _edge(db, a_game, ending_node, start_node)
    _edge(db, a_game, ending_node, None, kind="condition", title="Roll high")
    _edge(db, a_game, side, ending_node)
    res = admin_client.delete(f"{ROUTE}/nodes/{ending_node.system_id}")
    assert res.status_code == 204
    names = {
        r.name_cn
        for r in db.query(models.DeletedRecord).filter_by(type="Game Choice Edge")
    }
    assert names == {"Good End → Prologue", "Roll high", "Side → Good End"}
