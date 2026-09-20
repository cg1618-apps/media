"""
The data migration that reshapes the 攻略 Guides rows for the structured shape.

The suite has no Alembic harness - tests/api/conftest.py builds its schema
with create_all and never runs Alembic - so this imports the revision by file
path and runs its OWN `reshape()` against the test session. Importing it
rather than restating the SQL is the point: a test that restated it would pass
while the shipped migration was wrong.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.schemas.note import NoteCreate, validate_note_payload

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "g2u3ides4r5_guide_sections_structured.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_guide_structured", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


def _note(db, game, author_id, section, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=game.system_id,
        author_id=author_id,
        section=section,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _reload(db, row):
    db.expire_all()
    return db.query(models.Note).filter_by(system_id=row.system_id).one()


def test_text_entries_become_the_description_and_links_become_links(
    db_session, revision, game, admin_user
):
    row = _note(
        db_session,
        game,
        admin_user.id,
        "skills",
        title="Bloodhound's Step",
        entries=[
            {"type": "text", "value": "Costs 16 FP"},
            {"type": "link", "value": "https://example.com/ash", "label": "Wiki"},
            {"type": "text", "value": "Best on a katana"},
        ],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.title == "Bloodhound's Step"
    assert row.content == "Costs 16 FP\nBest on a katana"
    assert row.links == ["https://example.com/ash"]
    # Refused by validation on the next edit if it survived - `entries` is a
    # column no structured spec claims.
    assert row.entries is None


def test_an_existing_body_keeps_its_place_above_the_entries(
    db_session, revision, game, admin_user
):
    row = _note(
        db_session,
        game,
        admin_user.id,
        "collectibles",
        title="Golden Seeds",
        content="Thirty of them.",
        entries=[{"type": "text", "value": "Two under the tree at Stormhill"}],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    assert _reload(db_session, row).content == (
        "Thirty of them.\nTwo under the tree at Stormhill"
    )


def test_a_url_is_written_into_the_body_where_the_new_spec_has_no_links(
    db_session, revision, game, admin_user
):
    # `enemies` lost its links when it was reshaped. Dropping the URL would be
    # a silent loss, so it goes into the description with its label.
    row = _note(
        db_session,
        game,
        admin_user.id,
        "enemies",
        title="Malenia",
        entries=[
            {"type": "text", "value": "Waterfowl dance"},
            {"type": "link", "value": "https://example.com/m", "label": "Phase 2"},
            {"type": "link", "value": "https://example.com/bare"},
        ],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.content == (
        "Waterfowl dance\nPhase 2: https://example.com/m\nhttps://example.com/bare"
    )
    assert row.links is None


def test_stats_links_move_into_the_description(
    db_session, revision, game, admin_user
):
    # stats_and_points was text_links, so its links are in the COLUMN rather
    # than in an entries array - a different path through the migration.
    row = _note(
        db_session,
        game,
        admin_user.id,
        "stats_and_points",
        content="Vigor to 40 first.",
        links=["https://example.com/soft-caps"],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.content == "Vigor to 40 first.\nhttps://example.com/soft-caps"
    assert row.links is None


def test_a_mod_keeps_its_type(db_session, revision, game, admin_user):
    # `kind` was the section's dropdown and is now its `type` field, on the
    # same column with the same two values - so the rows need no touching,
    # which is exactly what this asserts.
    row = _note(
        db_session,
        game,
        admin_user.id,
        "mods_and_tools",
        title="SKSE",
        kind="Tool",
        entries=[{"type": "text", "value": "Script extender"}],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.kind == "Tool"
    assert row.content == "Script extender"


def test_every_migrated_row_validates_against_its_new_spec(
    db_session, revision, game, admin_user
):
    """
    The point of the whole migration. A row the reshape leaves invalid reads
    fine until somebody edits it, and then 422s on a field they did not touch.
    """
    rows = [
        _note(
            db_session,
            game,
            admin_user.id,
            section,
            title="Something",
            entries=[
                {"type": "text", "value": "a note"},
                {"type": "link", "value": "https://example.com"},
            ],
        )
        for section in revision.ENTRY_SECTIONS
    ]
    rows.append(
        _note(
            db_session,
            game,
            admin_user.id,
            "stats_and_points",
            title="Vigor",
            content="To 40.",
            links=["https://example.com"],
        )
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    for row in rows:
        fresh = _reload(db_session, row)
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=game.system_id,
                section=fresh.section,
                locator=fresh.locator,
                kind=fresh.kind,
                status=fresh.status,
                title=fresh.title,
                content=fresh.content,
                links=fresh.links,
                entries=fresh.entries,
                fields=fresh.fields,
            )
        )


def test_the_reshape_leaves_other_sections_alone(
    db_session, revision, game, admin_user
):
    # `side_quests` is still name_entries until Story List exists to take it.
    row = _note(
        db_session,
        game,
        admin_user.id,
        "side_quests",
        title="Ranni",
        entries=[{"type": "text", "value": "Do not kill Blaidd"}],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    assert _reload(db_session, row).entries == [
        {"type": "text", "value": "Do not kill Blaidd"}
    ]
