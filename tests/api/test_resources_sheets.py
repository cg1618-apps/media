"""
The Resources tab: the page travels through Backup and Pull like every other
table.

parent_id is a self-referential FK and the tab restores in one commit, so the
two things worth pinning are that the tree survives a round trip even when a
child row precedes its parent on the tab (the FK is DEFERRABLE INITIALLY
DEFERRED), and that a row Pull cannot store is skipped and reported rather
than allowed to roll back the whole page.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


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


def _backed_up_matrix(db, monkeypatch):
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db)
    return written["Resources"]


def _force_deferred_checks(db):
    """
    The test session never really commits - Pull's commit releases a
    SAVEPOINT - so a deferred FK would otherwise never be checked at all and a
    dangling parent_id would pass unseen. This makes Postgres check it now.
    """
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))


def test_the_resources_tab_is_registered():
    assert "Resources" in TAB_NAMES
    assert TAB_BY_NAME["Resources"].model is models.ResourceNode
    assert TAB_BY_NAME["Resources"].requires_authz is False


def test_the_tree_round_trips_with_children_before_parents(db, sheets, monkeypatch):
    outer = _node(db, "group", title="Outer", sort_index=0.0)
    inner = _node(db, "group", parent=outer, title="Inner", sort_index=0.0)
    leaf = _node(
        db,
        "item",
        parent=inner,
        title="Heading",
        content="See [docs](https://example.com)",
        sort_index=3.0,
    )
    loose = _node(db, "item", content="plain text", sort_index=1.0)
    expected = {
        n.system_id: (n.parent_id, n.kind, n.title, n.content, n.sort_index)
        for n in (outer, inner, leaf, loose)
    }
    depth = {
        str(outer.system_id): 0,
        str(inner.system_id): 1,
        str(leaf.system_id): 2,
        str(loose.system_id): 0,
    }

    matrix = _backed_up_matrix(db, monkeypatch)
    headers, rows = matrix[0], matrix[1:]
    assert headers == [c.name for c in models.ResourceNode.__table__.columns]
    assert len(rows) == 4

    db.query(models.ResourceNode).delete()
    db.flush()

    # Deepest first: every child row precedes its parent's row.
    rows.sort(key=lambda r: -depth[r[0]])
    sheets({"Resources": [headers] + rows})

    result = pull.execute_pull_specific(db, "Resources", log_action=False)

    assert result["status"] == "success", result
    assert result["rows_added"] == 4
    assert result["unresolved_refs"] == []
    _force_deferred_checks(db)

    restored = {
        n.system_id: (n.parent_id, n.kind, n.title, n.content, n.sort_index)
        for n in db.query(models.ResourceNode).all()
    }
    assert restored == expected


def test_a_second_pull_updates_rather_than_duplicates(db, sheets, monkeypatch):
    group = _node(db, "group", title="Only")
    matrix = _backed_up_matrix(db, monkeypatch)
    sheets({"Resources": matrix})

    result = pull.execute_pull_specific(db, "Resources", log_action=False)

    assert result["rows_updated"] == 1
    assert result["rows_added"] == 0
    assert db.query(models.ResourceNode).count() == 1
    assert db.get(models.ResourceNode, group.system_id).title == "Only"


HEADERS = [
    "system_id", "parent_id", "kind", "title", "content", "sort_index",
    "created_at", "updated_at",
]


def _row(system_id, parent_id, kind, title="", content=""):
    return [str(system_id), str(parent_id or ""), kind, title, content, "0", "", ""]


def test_rows_that_cannot_restore_are_skipped_and_reported(db, sheets):
    good_group = uuid.uuid4()
    good_item = uuid.uuid4()
    orphan = uuid.uuid4()
    orphan_child = uuid.uuid4()
    untitled = uuid.uuid4()
    under_untitled = uuid.uuid4()
    under_item = uuid.uuid4()
    sheets(
        {
            "Resources": [
                HEADERS,
                _row(good_item, good_group, "item", content="kept"),
                _row(good_group, None, "group", title="Kept"),
                # Parent on neither the tab nor here, and its child with it.
                _row(orphan, uuid.uuid4(), "group", title="Orphan"),
                _row(orphan_child, orphan, "item", content="lost with it"),
                # A group with no title breaks a CHECK; its child goes too.
                _row(untitled, None, "group"),
                _row(under_untitled, untitled, "item", content="x"),
                # An item cannot hold children.
                _row(under_item, good_item, "item", content="y"),
            ]
        }
    )

    result = pull.execute_pull_specific(db, "Resources", log_action=False)

    assert result["status"] == "success", result
    assert result["rows_added"] == 2
    assert result["rows_skipped"] == 5
    assert len(result["unresolved_refs"]) == 5
    _force_deferred_checks(db)
    assert {n.system_id for n in db.query(models.ResourceNode).all()} == {
        good_group,
        good_item,
    }


def test_a_row_may_name_a_parent_that_already_exists_here(db, sheets):
    local = _node(db, "group", title="Local")
    child = uuid.uuid4()
    sheets({"Resources": [HEADERS, _row(child, local.system_id, "item", content="z")]})

    result = pull.execute_pull_specific(db, "Resources", log_action=False)

    assert result["rows_added"] == 1
    assert db.get(models.ResourceNode, child).parent_id == local.system_id
