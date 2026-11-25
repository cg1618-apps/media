"""
An older sheet's entity remark comes back as a Remark row.

A studio, publisher, person, character or identity tab backed up before
e1n2tremark3 still carries a `remark` column. Pull drops the column (the
model has none), but the text is not lost: once the tab is in, each remark
becomes the first Remark row of its entity - unless the entity's list already
holds one.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_an_older_character_tabs_remark_becomes_a_remark_row(db_session, sheets, owner_user):
    kept, blank = uuid.uuid4(), uuid.uuid4()
    sheets({
        "Character": [
            ["system_id", "name_en", "remark"],
            [str(kept), "Hitagi", "Crab"],
            [str(blank), "Blank", ""],
        ]
    })
    result = pull.execute_pull_specific(db_session, "Character", log_action=False)
    assert result["status"] == "success"
    notes = db_session.query(models.Note).filter(models.Note.character_id.isnot(None)).all()
    assert [(n.character_id, n.section, n.content) for n in notes] == [(kept, "remark", "Crab")]

    # Pulled again, the list already holds it.
    pull.execute_pull_specific(db_session, "Character", log_action=False)
    assert db_session.query(models.Note).filter(models.Note.character_id.isnot(None)).count() == 1


def test_the_remark_header_is_not_reported_as_unexpected():
    assert pull.unexpected_headers("Studio", ["system_id", "name_en", "remark"]) == []
