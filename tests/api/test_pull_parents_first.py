"""
A tab whose rows reference rows of the same tab restores parents first.

games.base_game_id, h_game.base_game_id and note.parent_id are self-references
checked at once, not at COMMIT. The sheet keeps whatever order the Backup wrote
- a DLC may sit above its base game - and Pull flushes as it goes, so a child
row reaching the database before its parent failed the whole tab with
`Key (base_game_id)=(...) is not present in table "games"`.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def test_a_dlc_above_its_base_game_restores(db_session, sheet):
    base_id, dlc_id = str(uuid.uuid4()), str(uuid.uuid4())
    sheet(
        ["system_id", "game_name_en", "game_type", "base_game_id"],
        [
            # The child first, the way the sheet that failed had it.
            [dlc_id, "Zvornik DLC", "DLC", base_id],
            [base_id, "Zvornik Base", "Base Game", ""],
        ],
    )
    # Flush after every row, so the child reaches the database before its
    # parent is even read - without this the test passes on a sheet short
    # enough to restore in one flush, whatever the order.
    db_session.autoflush = True
    result = pull.execute_pull_specific(db_session, "Game", log_action=False)

    assert result["status"] == "success", result
    dlc = db_session.get(models.Game, uuid.UUID(dlc_id))
    assert dlc is not None
    assert str(dlc.base_game_id) == base_id


def test_parents_first_orders_a_chain_and_keeps_the_rest_in_place():
    headers = ["system_id", "parent_id", "title"]
    rows = [
        ["c", "b", "grandchild"],
        ["x", "", "unrelated"],
        ["b", "a", "child"],
        ["a", "", "root"],
        # A parent the sheet does not carry is not this tab's to order.
        ["y", "elsewhere", "orphan"],
    ]
    ordered = pull.parents_first(headers, rows, "parent_id")
    titles = [r[2] for r in ordered]
    assert titles.index("root") < titles.index("child") < titles.index("grandchild")
    assert sorted(titles) == sorted(r[2] for r in rows)
    # Rows with nothing to wait for keep the sheet's order.
    assert titles.index("unrelated") < titles.index("orphan")


def test_a_tab_failing_mid_flush_still_leaves_a_failed_audit_row(
    db_session, monkeypatch
):
    """A flush that fails inside a tab's loop leaves the session needing a
    rollback, and the Pull All audit row written on that session was lost with
    it - the run failed on screen and left nothing in the log."""

    def failing_tab(db, tab, **kwargs):
        db.add(
            models.Game(
                system_id=uuid.uuid4(),
                game_name_en="Zvornik Orphan DLC",
                base_game_id=uuid.uuid4(),
            )
        )
        db.flush()

    monkeypatch.setattr(pull, "TABS_IN_ORDER", ["Game"])
    monkeypatch.setattr(pull, "execute_pull_specific", failing_tab)

    with pytest.raises(IntegrityError):
        pull.execute_pull_all(db_session)

    row = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .one()
    )
    assert row.status == "Failed"
    assert "games_base_game_id_fkey" in row.error_message


def test_a_voice_citing_the_other_databases_person_uuid_restores(
    db_session, monkeypatch, anime, character
):
    """A person Pull matched by name keeps this database's uuid, so a voice
    row citing the sheet's uuid for them dangled and failed the whole tab with
    `Key (person_id)=(...) is not present in table "person"`. It is translated
    through the Person tab, as Person Role's person_id already was."""
    local = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Morikawa")
    db_session.add(local)
    db_session.flush()
    casting = models.CharacterCasting(
        character_id=character.system_id, media_type="anime", entry_id=anime.system_id
    )
    db_session.add(casting)
    db_session.flush()

    sheet_uuid = str(uuid.uuid4())
    tabs = {
        "Person": [
            ["system_id", "name_en", "name_cn", "name_jp", "name_alt"],
            [sheet_uuid, "Zvornik Morikawa", "", "", ""],
        ],
        "Character Casting Voice": [
            ["system_id", "casting_id", "media_type", "entry_id", "person_id", "position"],
            [
                str(uuid.uuid4()),
                str(casting.system_id),
                "anime",
                str(anime.system_id),
                sheet_uuid,
                "0",
            ],
        ],
    }
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    result = pull.execute_pull_specific(
        db_session, "Character Casting Voice", log_action=False
    )

    assert result["status"] == "success", result
    voice = db_session.query(models.CharacterCastingVoice).one()
    assert voice.person_id == local.system_id
