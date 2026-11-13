"""
The hentai revision's label steps: adopt a hand-made `hentai` label and take
it off every entry that is not a hentai.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN settle_label() against the
test session. Importing it rather than restating the SQL is the point: a test
that restated it would pass while the shipped migration was wrong.

settle_label also writes the revision's mode grant into `access_mode_label`,
a table a later revision (l1a2belcode3) drops and today's models do not
build. `historical_schema` recreates it for the test's transaction, so the
revision runs against the schema it was written for; what it did to that
table is history and is not asserted here.

The conftest seeds the label session-wide; each test here first puts the
database into the state the owner's home database was in - the label on an
anime - so every removal has something to remove.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa

from app import models
from app.services.domain.content_labels import label_keys_for_entry

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h2e3n4t5a6i7_hentai_type.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_hentai_type", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def historical_schema(db_session):
    """`access_mode_label` as it stood at the hentai revision, created inside
    the test's transaction and rolled back with it."""
    db_session.execute(
        sa.text(
            "CREATE TABLE access_mode_label ("
            "system_id uuid PRIMARY KEY, "
            "mode_id uuid NOT NULL REFERENCES access_mode(system_id) ON DELETE CASCADE, "
            "label_id uuid NOT NULL REFERENCES content_label(system_id) ON DELETE CASCADE, "
            "created_at timestamp, "
            "CONSTRAINT uq_access_mode_label UNIQUE (mode_id, label_id))"
        )
    )
    db_session.flush()


def _label(db_session):
    return db_session.query(models.ContentLabel).filter_by(key="hentai").one()


def _attach(db_session, entry, label):
    db_session.add(
        models.MediaContentLabel(media_id=entry.system_id, label_id=label.system_id, position=0)
    )
    db_session.flush()


def test_the_label_leaves_an_anime_and_stays_on_a_hentai(
    db_session, revision, historical_schema, sample_anime
):
    label = _label(db_session)
    hentai = models.Hentai(hentai_name_cn="Zvornik Kept")
    db_session.add(hentai)
    db_session.flush()
    _attach(db_session, sample_anime, label)
    _attach(db_session, hentai, label)
    # Non-empty on both sides before the step runs.
    assert label_keys_for_entry(db_session, sample_anime.system_id) == ["hentai"]
    assert label_keys_for_entry(db_session, hentai.system_id) == ["hentai"]

    revision.settle_label(db_session.connection())
    db_session.expire_all()

    assert label_keys_for_entry(db_session, sample_anime.system_id) == []
    assert label_keys_for_entry(db_session, hentai.system_id) == ["hentai"]


def test_other_labels_on_the_anime_are_left_alone(
    db_session, revision, historical_schema, sample_anime, nsfw_label
):
    _attach(db_session, sample_anime, _label(db_session))
    _attach(db_session, sample_anime, nsfw_label)
    revision.settle_label(db_session.connection())
    db_session.expire_all()
    assert label_keys_for_entry(db_session, sample_anime.system_id) == ["nsfw"]


def test_a_hand_made_label_is_adopted_not_duplicated(
    db_session, revision, historical_schema
):
    before = _label(db_session).system_id
    revision.settle_label(db_session.connection())
    rows = db_session.query(models.ContentLabel).filter_by(key="hentai").all()
    assert [r.system_id for r in rows] == [before]
