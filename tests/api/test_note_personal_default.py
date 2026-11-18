"""
`note.personal` defaults to false on the server: a row written without naming
the column is catalogue, not personal.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

from sqlalchemy import text

from app import models


def test_a_row_written_without_the_column_is_catalogue(db_session, admin_user):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Old Game")
    db_session.add(game)
    db_session.flush()
    note_id = uuid.uuid4()
    # Raw SQL naming no `personal`, so only the server default can answer.
    db_session.execute(
        text(
            "INSERT INTO note (system_id, media_id, author_id, section, title) "
            "VALUES (:id, :media, :author, 'items', 'Flask')"
        ),
        {"id": note_id, "media": game.system_id, "author": admin_user.id},
    )
    assert db_session.execute(
        text("SELECT personal FROM note WHERE system_id = :id"), {"id": note_id}
    ).scalar_one() is False
