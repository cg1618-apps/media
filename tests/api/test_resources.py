"""
The Resources page: one site-wide tree of groups and items.

Reads follow the Quote page's gate (any viewer); every write needs
manage.catalog. Groups nest to any depth, and groups and items share one
order inside their parent, which PATCH /reorder rewrites - including moving a
node into another group.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models

URL = "/api/resources"


@pytest.fixture
def db(db_session):
    return db_session


def _node(db, kind, parent=None, title=None, content=None, sort_index=0.0):
    node = models.ResourceNode(
        system_id=uuid.uuid4(),
        parent_id=parent.system_id if parent is not None else None,
        kind=kind,
        title=title,
        content=content,
        sort_index=sort_index,
    )
    db.add(node)
    db.flush()
    return node


@pytest.fixture
def tree(db):
    """
    Tools (group)
      - Docs (group)
          - item: [MDN](https://developer.mozilla.org)
      - item: plain text
    Reading (group)

    Load-bearing for every refusal test below: a write refused against an
    empty table could be refused for having nothing to act on. These nodes
    exist so a refusal is the gate's doing, and the mirror tests use them to
    show the same request succeeds for a manage.catalog caller.
    """
    tools = _node(db, "group", title="Tools", sort_index=0.0)
    reading = _node(db, "group", title="Reading", sort_index=1.0)
    docs = _node(db, "group", parent=tools, title="Docs", sort_index=0.0)
    plain = _node(db, "item", parent=tools, content="plain text", sort_index=1.0)
    mdn = _node(
        db,
        "item",
        parent=docs,
        content="[MDN](https://developer.mozilla.org)",
        sort_index=0.0,
    )
    return {"tools": tools, "reading": reading, "docs": docs, "plain": plain, "mdn": mdn}


def _ids(nodes):
    return [n["system_id"] for n in nodes]


# --- Read ------------------------------------------------------------------


def test_the_page_reads_as_a_nested_tree_in_sort_order(admin_client, tree):
    r = admin_client.get(URL)
    assert r.status_code == 200
    top = r.json()
    assert _ids(top) == [str(tree["tools"].system_id), str(tree["reading"].system_id)]

    tools = top[0]
    assert set(tools) == {
        "system_id", "parent_id", "kind", "title", "content", "sort_index",
        "created_at", "updated_at", "children",
    }
    assert tools["kind"] == "group" and tools["parent_id"] is None
    # Groups and items interleave in one order inside their parent.
    assert _ids(tools["children"]) == [
        str(tree["docs"].system_id),
        str(tree["plain"].system_id),
    ]
    docs = tools["children"][0]
    assert docs["parent_id"] == str(tree["tools"].system_id)
    assert docs["children"][0]["content"] == "[MDN](https://developer.mozilla.org)"
    assert docs["children"][0]["children"] == []
    assert top[1]["children"] == []


def test_an_empty_page_reads_as_an_empty_list(client):
    assert client.get(URL).json() == []


def test_a_guest_can_read_the_page(client, tree):
    r = client.get(URL)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_a_member_without_manage_catalog_can_read_the_page(user_client, tree):
    r = user_client.get(URL)
    assert r.status_code == 200
    assert len(r.json()) == 2


# --- Create ----------------------------------------------------------------


def test_create_a_top_level_group(admin_client):
    r = admin_client.post(URL, json={"kind": "group", "title": "Links"})
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "group"
    assert body["title"] == "Links"
    assert body["parent_id"] is None
    assert body["content"] is None
    assert body["children"] == []
    assert body["sort_index"] == 0.0


def test_a_new_node_appends_after_its_siblings(admin_client, tree):
    r = admin_client.post(
        URL,
        json={
            "kind": "item",
            "parent_id": str(tree["tools"].system_id),
            "title": "Heading",
            "content": "See [here](https://example.com).",
        },
    )
    assert r.status_code == 201
    assert r.json()["sort_index"] == 2.0
    assert r.json()["title"] == "Heading"

    tools = admin_client.get(URL).json()[0]
    assert tools["children"][-1]["system_id"] == r.json()["system_id"]


def test_a_new_top_level_node_appends_after_the_top_level(admin_client, tree):
    r = admin_client.post(URL, json={"kind": "item", "content": "loose note"})
    assert r.status_code == 201
    assert r.json()["sort_index"] == 2.0


@pytest.mark.parametrize(
    "payload",
    [
        {"kind": "group"},
        {"kind": "group", "title": "   "},
        {"kind": "group", "title": "G", "content": "no body on a group"},
        {"kind": "item"},
        {"kind": "item", "content": "  "},
        {"kind": "item", "title": "heading only"},
        {"kind": "folder", "title": "not a kind"},
    ],
)
def test_create_refuses_a_malformed_node(admin_client, db, payload):
    r = admin_client.post(URL, json=payload)
    assert r.status_code == 422
    assert db.query(models.ResourceNode).count() == 0


def test_create_refuses_a_parent_that_is_an_item(admin_client, tree):
    r = admin_client.post(
        URL,
        json={
            "kind": "item",
            "parent_id": str(tree["plain"].system_id),
            "content": "x",
        },
    )
    assert r.status_code == 422


def test_create_refuses_a_parent_that_does_not_exist(admin_client):
    r = admin_client.post(
        URL, json={"kind": "item", "parent_id": str(uuid.uuid4()), "content": "x"}
    )
    assert r.status_code == 422


# --- Update ----------------------------------------------------------------


def test_patch_edits_title_and_content(admin_client, db, tree):
    node_id = tree["plain"].system_id
    r = admin_client.patch(
        f"{URL}/{node_id}", json={"title": "Heading", "content": "new body"}
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Heading"
    assert r.json()["content"] == "new body"
    assert r.json()["parent_id"] == str(tree["tools"].system_id)


def test_patch_ignores_kind_and_parent(admin_client, db, tree):
    node_id = tree["plain"].system_id
    r = admin_client.patch(
        f"{URL}/{node_id}",
        json={"kind": "group", "parent_id": None, "content": "still an item"},
    )
    assert r.status_code == 200
    db.expire_all()
    node = db.get(models.ResourceNode, node_id)
    assert node.kind == "item"
    assert node.parent_id == tree["tools"].system_id


@pytest.mark.parametrize(
    "node_key, payload",
    [
        ("tools", {"title": ""}),
        ("tools", {"title": None}),
        ("tools", {"content": "a group has no body"}),
        ("plain", {"content": ""}),
        ("plain", {"content": None}),
    ],
)
def test_patch_refuses_a_malformed_result(admin_client, tree, node_key, payload):
    r = admin_client.patch(f"{URL}/{tree[node_key].system_id}", json=payload)
    assert r.status_code == 422


def test_patch_an_unknown_node_is_404(admin_client):
    r = admin_client.patch(f"{URL}/{uuid.uuid4()}", json={"title": "x"})
    assert r.status_code == 404


# --- Delete ----------------------------------------------------------------


def test_deleting_a_group_takes_its_whole_subtree(admin_client, db, tree):
    r = admin_client.delete(f"{URL}/{tree['tools'].system_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "success"

    remaining = {
        row[0]
        for row in db.execute(text("SELECT system_id FROM resource_node")).all()
    }
    assert remaining == {tree["reading"].system_id}


def test_deleting_an_item_leaves_its_siblings(admin_client, db, tree):
    r = admin_client.delete(f"{URL}/{tree['plain'].system_id}")
    assert r.status_code == 200
    tools = admin_client.get(URL).json()[0]
    assert _ids(tools["children"]) == [str(tree["docs"].system_id)]


def test_delete_an_unknown_node_is_404(admin_client):
    assert admin_client.delete(f"{URL}/{uuid.uuid4()}").status_code == 404


# --- Reorder and move --------------------------------------------------------


def test_reorder_rewrites_sibling_order(admin_client, tree):
    tools_id = str(tree["tools"].system_id)
    new_order = [str(tree["plain"].system_id), str(tree["docs"].system_id)]
    r = admin_client.patch(
        f"{URL}/reorder", json={"parent_id": tools_id, "ordered_ids": new_order}
    )
    assert r.status_code == 200
    assert r.json() == {"status": "success", "reordered": 2}

    tools = admin_client.get(URL).json()[0]
    assert _ids(tools["children"]) == new_order
    assert [c["sort_index"] for c in tools["children"]] == [0.0, 1.0]


def test_reorder_the_top_level(admin_client, tree):
    new_order = [str(tree["reading"].system_id), str(tree["tools"].system_id)]
    r = admin_client.patch(
        f"{URL}/reorder", json={"parent_id": None, "ordered_ids": new_order}
    )
    assert r.status_code == 200
    assert _ids(admin_client.get(URL).json()) == new_order


def test_reorder_moves_a_node_into_another_group(admin_client, tree):
    """The move: the list names the target's children plus the arrival."""
    reading_id = str(tree["reading"].system_id)
    plain_id = str(tree["plain"].system_id)
    r = admin_client.patch(
        f"{URL}/reorder", json={"parent_id": reading_id, "ordered_ids": [plain_id]}
    )
    assert r.status_code == 200

    tools, reading = admin_client.get(URL).json()
    assert _ids(reading["children"]) == [plain_id]
    assert reading["children"][0]["parent_id"] == reading_id
    assert _ids(tools["children"]) == [str(tree["docs"].system_id)]


def test_reorder_moves_a_group_to_the_top_level(admin_client, tree):
    order = [
        str(tree["tools"].system_id),
        str(tree["docs"].system_id),
        str(tree["reading"].system_id),
    ]
    r = admin_client.patch(f"{URL}/reorder", json={"parent_id": None, "ordered_ids": order})
    assert r.status_code == 200
    top = admin_client.get(URL).json()
    assert _ids(top) == order
    # It moved with its own children.
    assert _ids(top[1]["children"]) == [str(tree["mdn"].system_id)]


def test_reorder_refuses_a_partial_list(admin_client, db, tree):
    tools_id = str(tree["tools"].system_id)
    r = admin_client.patch(
        f"{URL}/reorder",
        json={"parent_id": tools_id, "ordered_ids": [str(tree["plain"].system_id)]},
    )
    assert r.status_code == 422
    db.expire_all()
    # Nothing half-applied.
    assert db.get(models.ResourceNode, tree["plain"].system_id).sort_index == 1.0


def test_reorder_refuses_duplicates(admin_client, tree):
    tools_id = str(tree["tools"].system_id)
    docs_id = str(tree["docs"].system_id)
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": tools_id,
            "ordered_ids": [docs_id, docs_id, str(tree["plain"].system_id)],
        },
    )
    assert r.status_code == 422


def test_reorder_refuses_an_unknown_id(admin_client, tree):
    tools_id = str(tree["tools"].system_id)
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": tools_id,
            "ordered_ids": [
                str(tree["docs"].system_id),
                str(tree["plain"].system_id),
                str(uuid.uuid4()),
            ],
        },
    )
    assert r.status_code == 422


def test_reorder_refuses_a_parent_that_is_an_item(admin_client, tree):
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": str(tree["plain"].system_id),
            "ordered_ids": [str(tree["reading"].system_id)],
        },
    )
    assert r.status_code == 422


def test_reorder_refuses_a_parent_that_does_not_exist(admin_client, tree):
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": str(uuid.uuid4()),
            "ordered_ids": [str(tree["reading"].system_id)],
        },
    )
    assert r.status_code == 422


def test_reorder_refuses_moving_a_group_into_itself(admin_client, db, tree):
    tools_id = str(tree["tools"].system_id)
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": tools_id,
            "ordered_ids": [
                str(tree["docs"].system_id),
                str(tree["plain"].system_id),
                tools_id,
            ],
        },
    )
    assert r.status_code == 422
    db.expire_all()
    assert db.get(models.ResourceNode, tree["tools"].system_id).parent_id is None


def test_reorder_refuses_moving_a_group_under_its_own_descendant(
    admin_client, db, tree
):
    # Docs is a child of Tools; Tools cannot move under Docs.
    r = admin_client.patch(
        f"{URL}/reorder",
        json={
            "parent_id": str(tree["docs"].system_id),
            "ordered_ids": [str(tree["mdn"].system_id), str(tree["tools"].system_id)],
        },
    )
    assert r.status_code == 422
    db.expire_all()
    assert db.get(models.ResourceNode, tree["tools"].system_id).parent_id is None


# --- Authorization -------------------------------------------------------------
#
# Each refusal runs against the `tree` fixture, so there is a node to create
# under, edit, delete and reorder, and the mirror test below sends the SAME
# requests as a manage.catalog holder and sees them succeed.


def _write_requests(tree):
    tools_id = str(tree["tools"].system_id)
    return [
        (
            "patch",
            f"{URL}/reorder",
            {
                "parent_id": tools_id,
                "ordered_ids": [
                    str(tree["plain"].system_id),
                    str(tree["docs"].system_id),
                ],
            },
        ),
        # After the reorder, which must name every child of Tools.
        ("post", URL, {"kind": "item", "parent_id": tools_id, "content": "x"}),
        ("patch", f"{URL}/{tree['plain'].system_id}", {"content": "edited"}),
        ("delete", f"{URL}/{tree['reading'].system_id}", None),
    ]


def _send(client, method, url, body):
    if body is None:
        return getattr(client, method)(url)
    return getattr(client, method)(url, json=body)


def test_a_guest_is_refused_every_write(client, db, tree):
    for method, url, body in _write_requests(tree):
        r = _send(client, method, url, body)
        assert r.status_code == 401, (method, url)
    assert db.query(models.ResourceNode).count() == 5


def test_a_member_without_manage_catalog_is_refused_every_write(
    user_client, db, tree
):
    for method, url, body in _write_requests(tree):
        r = _send(user_client, method, url, body)
        assert r.status_code == 401, (method, url)
    db.expire_all()
    assert db.query(models.ResourceNode).count() == 5
    assert db.get(models.ResourceNode, tree["plain"].system_id).content == "plain text"


@pytest.mark.parametrize("client_fixture", ["super_client", "admin_client"])
def test_a_manage_catalog_holder_may_make_every_write(
    request, db, tree, client_fixture
):
    """The mirror: the same requests succeed for super (by grant) and admin (root)."""
    writer = request.getfixturevalue(client_fixture)
    for method, url, body in _write_requests(tree):
        r = _send(writer, method, url, body)
        assert r.status_code in (200, 201), (method, url, r.text)
    db.expire_all()
    assert db.get(models.ResourceNode, tree["plain"].system_id).content == "edited"
    assert db.get(models.ResourceNode, tree["reading"].system_id) is None


# --- Database constraints ------------------------------------------------------


@pytest.mark.parametrize(
    "kind, title, content",
    [
        ("folder", "x", None),
        ("group", None, None),
        ("group", "G", "body"),
        ("item", "heading", None),
    ],
)
def test_the_table_refuses_a_malformed_row(db, kind, title, content):
    db.add(
        models.ResourceNode(
            system_id=uuid.uuid4(), kind=kind, title=title, content=content
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()
